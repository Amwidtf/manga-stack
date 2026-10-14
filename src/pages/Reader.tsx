import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Loader2, ScrollText, BookOpen,
  ArrowRightToLine, ArrowLeftToLine, ListOrdered, AlertCircle, ArrowUpDown, Crosshair,
} from 'lucide-react'
import { getSource, parseKey, makeKey, chapterLabel, type NChapter } from '@/lib/sources'
import { noteCachedPage, trackChapterPages } from '@/lib/cache'
import { LOCAL_SOURCE_ID } from '@/lib/local/model'
import { useHistory, useLibrary, useSettings } from '@/lib/store'
import { Zoomable } from '@/components/Zoomable'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export default function ReaderPage() {
  const { mkey = '', ckey = '' } = useParams<{ mkey: string; ckey: string }>()
  const { source: sourceId, id: chapterId } = parseKey(ckey)
  const { id: mangaIdParam } = parseKey(mkey)
  const source = getSource(sourceId) // 源可能已被删除/停用，加载前必须判空
  const navigate = useNavigate()
  const { mode, dir, setMode, setDir, langs } = useSettings()
  const { markRead } = useLibrary()
  const pushHistory = useHistory((s) => s.push)

  const [mangaKey, setMangaKey] = useState(mkey)
  const [mangaTitle, setMangaTitle] = useState('')
  const [chapter, setChapter] = useState<NChapter | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [feed, setFeed] = useState<NChapter[]>([])
  const [ui, setUi] = useState(true)
  // 章末「下一章」浮层：仅在末页继续向后翻（点按/滑动）时出现，任意点击收起
  const [endPrompt, setEndPrompt] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const recorded = useRef(false)
  // 弹层出现时刻:触发它的那次点按的 click 会在弹层渲染后落到背景层上,
  // 时间窗内的点击不视为关闭指令(幽灵点击防护)
  const endPromptAt = useRef(0)

  // 上一章/下一章切换时组件不重挂载，渲染期间同步重置，避免旧章节页面闪现
  const [prevCkey, setPrevCkey] = useState(ckey)
  const pageEpoch = useRef(0)
  // 页码状态携带章节纪元戳:并发调度下旧章节的翻页更新(手势/滑杆)可能迟到甚至
  // 被重放,拦截写入防不住;改为写入时盖章、读回时校验,纪元不匹配一律按第 0 页
  const [pageState, setPageState] = useState({ epoch: 0, page: 0 })
  if (prevCkey !== ckey) {
    setPrevCkey(ckey)
    pageEpoch.current++
    setLoading(true)
    setError('')
    setPages([])
    setPageState({ epoch: pageEpoch.current, page: 0 })
    setEndPrompt(false)
  }
  const epoch = pageEpoch.current
  const page = pageState.epoch === epoch ? pageState.page : 0

  /* ---------- load chapter ---------- */
  useEffect(() => {
    // 源被移除时不发起请求；错误文案由渲染层的 sourceMissing 派生
    if (!ckey || !source) return
    // 快速连点上一章/下一章时旧章节的请求必须作废：alive 置 false 后不再写
    // state、不记历史与阅读进度，避免慢速旧请求覆盖新章节的数据
    let alive = true
    recorded.current = false
    scrollRef.current?.scrollTo({ top: 0 })

    source
      .getChapterMeta(chapterId, mangaIdParam || undefined)
      .then(async (meta) => {
        if (!alive) return
        const mk = makeKey(meta.chapter.source, meta.mangaId)
        setMangaKey(mk)
        setMangaTitle(meta.mangaTitle)
        setChapter(meta.chapter)
        const [pg, fd] = await Promise.all([
          source.getPages(meta.chapter),
          meta.mangaId
            ? source.getChapters(meta.mangaId, sourceId === 'mangadex' ? langs : undefined).catch(() => [] as NChapter[])
            : Promise.resolve([] as NChapter[]),
        ])
        if (!alive) return
        setPages(pg)
        setFeed(fd)
        // 加载完成短暂显示 chrome，随后由下方定时器自动隐藏
        setUi(true)
        // track ownership so detail page can show / clear this chapter's cache,
        // then passively cache every page in the background for offline re-reads
        // (本地漫画的页就在磁盘上，不需要离线缓存记账)
        if (sourceId !== LOCAL_SOURCE_ID) {
          trackChapterPages(mk, meta.mangaTitle, meta.cover, meta.chapter, pg)
          for (const u of pg.slice(0, 60)) void noteCachedPage(meta.chapter.key, u)
        }
        if (!recorded.current) {
          recorded.current = true
          markRead(mk, meta.chapter, 0)
          pushHistory({
            mangaKey: mk,
            mangaTitle: meta.mangaTitle,
            cover: meta.cover,
            chapterKey: meta.chapter.key,
            chapterLabel: chapterLabel(meta.chapter),
            page: 0,
          })
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : '章节加载失败，请检查网络')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ckey])

  /* ---------- chapter nav ---------- */
  const { prevChapter, nextChapter } = useMemo(() => {
    const asc = [...feed].reverse()
    const idx = asc.findIndex((c) => c.key === ckey)
    return { prevChapter: idx > 0 ? asc[idx - 1] : null, nextChapter: idx >= 0 && idx < asc.length - 1 ? asc[idx + 1] : null }
  }, [feed, ckey])

  /* ---------- toc ---------- */
  // 已读置灰:书架订阅的 readChapterKeys 为主;未订阅的漫画 markRead 不落书架,
  // 用阅读历史里该漫画的章节兜底,否则目录里「已读」恒为 0
  const libReadKeys = useLibrary((s) => s.subs[mangaKey]?.readChapterKeys)
  const histItems = useHistory((s) => s.items)
  const readSet = useMemo(
    () => new Set([...(libReadKeys ?? []), ...histItems.filter((i) => i.mangaKey === mangaKey).map((i) => i.chapterKey)]),
    [libReadKeys, histItems, mangaKey]
  )
  const curTocRef = useRef<HTMLAnchorElement | null>(null)
  const [tocAsc, setTocAsc] = useState(false)
  const tocList = useMemo(() => (tocAsc ? [...feed].reverse() : feed), [feed, tocAsc])
  useEffect(() => {
    if (tocOpen) curTocRef.current?.scrollIntoView({ block: 'center' })
  }, [tocOpen, feed, tocAsc])

  /** 统一的页码写入口:调用时盖章,执行时复验——迟到/重放的旧章节更新整体丢弃 */
  const updatePage = useCallback((next: (p: number) => number) => {
    const stamp = pageEpoch.current
    setPageState((s) => {
      if (stamp !== pageEpoch.current) return s
      return { epoch: stamp, page: next(s.epoch === stamp ? s.page : 0) }
    })
  }, [])

  const goPage = useCallback(
    (delta: number) => {
      updatePage((p) => {
        if (pages.length === 0) return p
        const n = Math.min(Math.max(p + delta, 0), pages.length - 1)
        if (chapter && mangaKey) markRead(mangaKey, chapter, n)
        // 已在末页仍向后翻（点按/滑动）→ 浮出「下一章」提示；向前翻回则收起。
        // 副作用幂等，StrictMode 双调用安全
        if (pages.length && p === pages.length - 1) {
          if (delta > 0) {
            endPromptAt.current = Date.now()
            setEndPrompt(true)
            setUi(false)
          } else if (delta < 0) setEndPrompt(false)
        }
        return n
      })
    },
    [updatePage, pages.length, chapter, mangaKey, markRead]
  )

  /* ---------- keyboard ---------- */
  useEffect(() => {
    if (mode !== 'paged') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goPage(dir === 'rtl' ? -1 : 1)
      if (e.key === 'ArrowLeft') goPage(dir === 'rtl' ? 1 : -1)
      if (e.key === ' ') {
        e.preventDefault()
        goPage(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, dir, goPage])

  /* ---------- preload ---------- */
  useEffect(() => {
    for (let i = page + 1; i <= Math.min(page + 3, pages.length - 1); i++) {
      const img = new Image()
      img.src = pages[i]
    }
  }, [page, pages])

  /* ---------- vertical scroll progress ---------- */
  useEffect(() => {
    if (mode !== 'vertical' || !pages.length) return
    const el = scrollRef.current
    if (!el) return
    const imgs = Array.from(el.querySelectorAll<HTMLElement>('[data-page]'))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.page)
            updatePage((p) => {
              if (idx !== p && chapter && mangaKey) markRead(mangaKey, chapter, idx)
              return Math.max(idx, 0)
            })
          }
        }
      },
      { root: el, rootMargin: '-40% 0px -40% 0px' }
    )
    imgs.forEach((i) => io.observe(i))
    return () => io.disconnect()
  }, [mode, pages, chapter, mangaKey, markRead, updatePage])

  /* ---------- swipe for paged (disabled while an image is zoomed) ---------- */
  const touch = useRef<{ x: number; y: number } | null>(null)
  const zoomedRef = useRef(false)
  const pinchGuardUntil = useRef(0)
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      touch.current = null
      return
    }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current || mode !== 'paged') return
    if (zoomedRef.current || Date.now() < pinchGuardUntil.current) {
      touch.current = null
      return
    }
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const forward = dir === 'rtl' ? dx > 0 : dx < 0
      goPage(forward ? 1 : -1)
    }
  }

  // single tap from Zoomable (double-tap already filtered out for zooming)
  const handleTap = (x: number) => {
    if (mode === 'vertical' || zoomedRef.current) {
      setUi((v) => !v)
      return
    }
    const w = window.innerWidth
    if (x < w * 0.3) goPage(dir === 'rtl' ? 1 : -1)
    else if (x > w * 0.7) goPage(dir === 'rtl' ? -1 : 1)
    else setUi((v) => !v)
  }

  const zoomProps = {
    onTap: handleTap,
    // 翻页模式：左右各 30% 的翻页热区不参与双击缩放——那里的快速点按
    // 零延迟直接翻页，也绝不会误触发缩放；仅中间 40%（UI 开关区）保留
    // 双击缩放。条漫模式全区域允许双击缩放。
    doubleTapEnabled: (x: number) => {
      if (mode !== 'paged') return true
      const w = window.innerWidth
      return x >= w * 0.3 && x <= w * 0.7
    },
    onZoomChange: (z: boolean) => {
      zoomedRef.current = z
    },
    onPinchChange: (p: boolean) => {
      pinchGuardUntil.current = p ? Number.MAX_SAFE_INTEGER : Date.now() + 300
    },
  }

  // 出错时 chrome 常显由渲染层 uiVisible 派生；此处仅负责加载完成后的自动隐藏
  useEffect(() => {
    if (loading || error || !pages.length) return
    const t = setTimeout(() => setUi(false), 2600)
    return () => clearTimeout(t)
  }, [loading, error, pages.length, ckey])

  const sourceMissing = !source
  // 出错或源被移除时 chrome 常显，保证返回出口始终可见
  const uiVisible = ui || !!error || sourceMissing
  const progress = pages.length ? (page + 1) / pages.length : 0
  const cLabel = chapter ? chapterLabel(chapter) : ''

  return (
    <div className="safe-t safe-b fixed inset-0 z-50 flex flex-col bg-background">
      {/* 容器带安全区内边距：图片等流式内容从状态栏下方开始；
          工具栏/进度条是绝对定位，不受容器 padding 影响，各自用 safe-t 避让 */}
      {/* top progress hairline：外层 safe-t 让进度条避开状态栏，3px 本体不与安全区
          padding 冲突 */}
      <div className="safe-t absolute inset-x-0 top-0 z-30">
        <div className="h-[3px] bg-foreground/5">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {/* top bar */}
      <header
        className={cn(
          'glass safe-t absolute inset-x-0 top-0 z-20 flex min-h-14 items-center gap-2 border-b border-border/40 px-2 transition-transform duration-300',
          !uiVisible && '-translate-y-full'
        )}
      >
        <button
          onClick={() => (mangaKey ? navigate(`/manga/${mangaKey}`, { replace: true }) : navigate('/', { replace: true }))}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent"
          aria-label="返回详情"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{mangaTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{cLabel}{chapter?.title ? ` · ${chapter.title}` : ''}</p>
        </div>
        <button
          onClick={() => setTocOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent"
          aria-label="目录"
        >
          <ListOrdered className="h-5 w-5" />
        </button>
      </header>

      {/* body */}
      {loading && !sourceMissing ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm">章节加载中…</p>
        </div>
      ) : error || sourceMissing ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">{error || '该章节的源已被移除，无法加载内容'}</p>
          {nextChapter && (
            <Link
              replace
                  to={`/read/${mangaKey}/${nextChapter.key}`}
              className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              直接看下一章
            </Link>
          )}
        </div>
      ) : mode === 'vertical' ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
          <Zoomable resetKey={ckey} innerClassName="mx-auto w-full max-w-[760px]" {...zoomProps}>
            {pages.map((src, i) => (
              <div key={src} data-page={i} className="bg-secondary/30">
                <img
                  src={src}
                  alt={`第 ${i + 1} 页`}
                  loading={i < 4 ? 'eager' : 'lazy'}
                  referrerPolicy="no-referrer"
                  className="w-full select-none"
                  draggable={false}
                />
              </div>
            ))}
            {/* end card */}
            <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
              <p className="text-sm text-muted-foreground">
                {cLabel} 读完啦 · 共 {pages.length} 页
              </p>
              {nextChapter ? (
                <Link
                  replace
                  to={`/read/${mangaKey}/${nextChapter.key}`}
                  className="rounded-full bg-primary px-8 py-3 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/25"
                >
                  下一章：{chapterLabel(nextChapter)}
                </Link>
              ) : (
                <Link
                  to={mangaKey ? `/manga/${mangaKey}` : '/'}
                  className="rounded-full bg-secondary px-8 py-3 text-[15px] font-semibold"
                >
                  已是最新，返回详情
                </Link>
              )}
            </div>
          </Zoomable>
        </div>
      ) : (
        <div
          className="relative flex flex-1 touch-none items-center justify-center overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <Zoomable
            className="absolute inset-0"
            innerClassName="flex h-full w-full items-center justify-center"
            resetKey={`${ckey}:${page}`}
            {...zoomProps}
          >
            <img
              key={pages[page]}
              src={pages[page]}
              alt={`第 ${page + 1} 页`}
              referrerPolicy="no-referrer"
              className="fade-in max-h-full max-w-full select-none object-contain"
              draggable={false}
            />
          </Zoomable>
          {/* 章末浮层：仅在末页仍向后翻（点按/滑动）时出现，任意点击收起。
              到达末页本身不打扰——最后一页保持完整可见 */}
          {endPrompt && (
            <>
              <div
                className="absolute inset-0 z-20"
                onClick={() => {
                  if (Date.now() - endPromptAt.current > 400) setEndPrompt(false)
                }}
                onTouchEnd={(e) => e.stopPropagation()}
              />
              <div
                className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 bg-gradient-to-t from-background via-background/85 to-transparent px-6 pt-16"
                style={{ paddingBottom: 'calc(2.5rem + max(env(safe-area-inset-bottom), var(--safe-bottom, 0px)))' }}
                onTouchEnd={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm text-muted-foreground">本章完 · 共 {pages.length} 页</p>
                {nextChapter ? (
                  <Link
                    replace
                    to={`/read/${mangaKey}/${nextChapter.key}`}
                    className="rounded-full bg-primary px-8 py-3 text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/25"
                  >
                    下一章
                  </Link>
                ) : (
                  <Link
                    to={mangaKey ? `/manga/${mangaKey}` : '/'}
                    className="rounded-full bg-secondary px-8 py-3 text-[15px] font-semibold"
                  >
                    已是最新，返回详情
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* bottom bar */}
      <footer
        className={cn(
          'glass absolute inset-x-0 bottom-0 z-20 border-t border-border/40 px-3 pt-2 transition-transform duration-300',
          !uiVisible && 'translate-y-full'
        )}
        style={{ paddingBottom: 'calc(0.5rem + max(env(safe-area-inset-bottom), var(--safe-bottom, 0px)))' }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-1">
          <ChapterBtn mangaKey={mangaKey} chapter={prevChapter} label="上一章" icon={<ChevronLeft className="h-5 w-5" />} disabled={!prevChapter} />
          <div className="flex items-center gap-1">
            <ToolBtn
              active={mode === 'vertical'}
              onClick={() => setMode(mode === 'vertical' ? 'paged' : 'vertical')}
              label={mode === 'vertical' ? '条漫' : '翻页'}
              icon={mode === 'vertical' ? <ScrollText className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
            />
            {/* 翻页方向只在翻页模式有意义；条漫上下滚动时显示只会误导 */}
            {mode === 'paged' && (
              <ToolBtn
                active={dir === 'rtl'}
                onClick={() => setDir(dir === 'rtl' ? 'ltr' : 'rtl')}
                label={dir === 'rtl' ? '从右' : '从左'}
                icon={dir === 'rtl' ? <ArrowLeftToLine className="h-5 w-5" /> : <ArrowRightToLine className="h-5 w-5" />}
              />
            )}
          </div>
          <ChapterBtn mangaKey={mangaKey} chapter={nextChapter} label="下一章" icon={<ChevronRight className="h-5 w-5" />} disabled={!nextChapter} right />
        </div>
        {mode === 'paged' && pages.length > 0 && (
          <div className="mx-auto flex max-w-2xl items-center gap-3 pb-1 pt-2">
            <span className="font-display text-xs font-semibold tabular-nums text-muted-foreground">{page + 1}</span>
            <input
              type="range"
              min={0}
              max={pages.length - 1}
              value={page}
              onChange={(e) => goPage(Number(e.target.value) - page)}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
            />
            <span className="font-display text-xs font-semibold tabular-nums text-muted-foreground">{pages.length}</span>
          </div>
        )}
      </footer>

      {/* 页码指示已移除：沉浸阅读时悬浮胶囊遮挡画面，页码信息由底部工具栏提供 */}

      {/* chapter toc:列表来自已加载的 feed(getChapters),无需额外源请求 */}
      <Sheet open={tocOpen} onOpenChange={setTocOpen}>
        <SheetContent side="right" className="flex w-[85vw] max-w-sm flex-col p-0">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle className="truncate text-sm">{mangaTitle || '目录'}</SheetTitle>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {feed.length > 0 ? `共 ${feed.length} 章 · 已读 ${readSet.size} 章` : '目录未加载'}
              </p>
              {feed.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setTocAsc((v) => !v)}
                    className="flex h-7 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={tocAsc ? '切换为倒序' : '切换为正序'}
                  >
                    <ArrowUpDown className="h-3 w-3" />
                    {tocAsc ? '正序' : '倒序'}
                  </button>
                  <button
                    onClick={() => curTocRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    className="flex h-7 items-center gap-1 rounded-full bg-secondary px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="定位到当前章"
                  >
                    <Crosshair className="h-3 w-3" />
                    定位
                  </button>
                </div>
              )}
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain p-2">
            {feed.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                章节列表加载失败或为空{sourceMissing ? '(源不可用)' : ''}
              </p>
            ) : (
              tocList.map((c) => {
                const cur = c.key === ckey
                return (
                  <Link
                    key={c.key}
                    replace
                    to={`/read/${mangaKey}/${c.key}`}
                    onClick={() => setTocOpen(false)}
                    ref={cur ? curTocRef : undefined}
                    className={cn(
                      'block rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent/60',
                      cur ? 'bg-accent font-semibold text-foreground' : readSet.has(c.key) ? 'text-muted-foreground/70' : 'text-foreground/90'
                    )}
                  >
                    {chapterLabel(c)}
                  </Link>
                )
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ChapterBtn({
  mangaKey, chapter, label, icon, disabled, right,
}: {
  mangaKey: string
  chapter: NChapter | null
  label: string
  icon: React.ReactNode
  disabled: boolean
  right?: boolean
}) {
  if (disabled || !chapter)
    return (
      <span className="flex h-11 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground/40">
        {!right && icon}
        {label}
        {right && icon}
      </span>
    )
  return (
    <Link
      replace
        to={`/read/${mangaKey}/${chapter.key}`}
      className="flex h-11 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors hover:bg-accent"
    >
      {!right && icon}
      {label}
      {right && icon}
    </Link>
  )
}

function ToolBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors',
        active ? 'bg-accent font-semibold' : 'text-muted-foreground hover:bg-accent/60'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
