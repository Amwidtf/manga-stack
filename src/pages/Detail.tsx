import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { BookmarkPlus, BookmarkCheck, Play, Star, Users, ChevronDown, ArrowLeft, ArrowUpDown, HardDrive, HardDriveDownload, Loader2, List, LayoutGrid, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getSource, parseKey, chapterLabel, type NChapter, type NManga } from '@/lib/sources'
import { cleanDescription, fmtCount, fmtRelative, langLabel } from '@/lib/mangadex'
import { cacheChapter, clearChapterCache, cachedInfoForManga, fmtBytes } from '@/lib/cache'
import { useHistory, useLibrary, useSettings } from '@/lib/store'
import { LOCAL_SOURCE_ID } from '@/lib/local/model'
import { deleteLocalManga, renameLocalManga } from '@/lib/local/importer'
import { CoverImg } from '@/components/CoverImg'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/Confirm'
import { cn } from '@/lib/utils'

type ChapterLayout = 'list' | 'grid'

const STATUS_LABEL: Record<string, string> = {
  ongoing: '连载中',
  completed: '已完结',
  hiatus: '休刊中',
  cancelled: '已停载',
}

export default function DetailPage() {
  const { key = '' } = useParams<{ key: string }>()
  const { source: sourceId, id } = parseKey(key)
  const source = getSource(sourceId) // 源可能已被删除/停用，渲染前必须判空
  const navigate = useNavigate()
  const { subs, subscribe, unsubscribe, syncFeed, updateMangaSnapshot } = useLibrary()
  const renameHistoryManga = useHistory((s) => s.renameManga)
  const removeHistoryManga = useHistory((s) => s.removeManga)
  const langs = useSettings((s) => s.langs)
  const isLocal = sourceId === LOCAL_SOURCE_ID

  const [manga, setManga] = useState<NManga | null>(null)
  const [stats, setStats] = useState<{ rating: number | null; follows: number | null }>({ rating: null, follows: null })
  const [feed, setFeed] = useState<NChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedLoading, setFeedLoading] = useState(true)
  const [feedError, setFeedError] = useState('')
  const [descOpen, setDescOpen] = useState(false)
  const [langFilter, setLangFilter] = useState<string>('all')
  const [showAll, setShowAll] = useState(false)
  const [ascOrder, setAscOrder] = useState(false)
  const [layout, setLayout] = useState<ChapterLayout>('list')
  const [cacheVer, setCacheVer] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const [caching, setCaching] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // 缓存操作完成后调用，bump 版本号触发下方 useMemo 复算
  const refreshCacheState = () => setCacheVer((v) => v + 1)
  const { keys: cachedKeys, bytes: cacheBytes } = useMemo(
    () => cachedInfoForManga(key),
    // feed.length 保留原刷新时机：章节列表到达后复算一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, cacheVer, feed.length]
  )

  // 路由参数 key 变化时组件不重挂载，渲染期间同步重置加载态，避免闪现上一部漫画的旧数据
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    setLoading(true)
    setError('')
    setManga(null)
    setFeed([])
    setFeedError('')
  }

  const sub = subs[key]

  const doRename = async (value: string) => {
    setRenameOpen(false)
    const t = value.trim()
    if (!t || !manga || t === manga.title) return
    const m = await renameLocalManga(id, t)
    if (!m) {
      toast.error('重命名失败')
      return
    }
    setManga({ ...manga, title: t })
    updateMangaSnapshot(key, { title: t })
    renameHistoryManga(key, t)
    toast.success('已重命名')
  }

  const doDelete = async () => {
    setConfirmDelete(false)
    try {
      await deleteLocalManga(id)
      if (sub) unsubscribe(key)
      removeHistoryManga(key)
      toast('已删除本地漫画及其文件')
      navigate('/', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  const loadFeed = (mangaKey?: string) => {
    if (!source) return
    setFeedLoading(true)
    setFeedError('')
    source
      .getChapters(id, sourceId === 'mangadex' ? langs : undefined)
      .then((f) => {
        setFeed(f)
        syncFeed(mangaKey ?? key, f)
      })
      .catch((e) => setFeedError(e instanceof Error ? e.message : '章节加载失败'))
      .finally(() => setFeedLoading(false))
  }

  useEffect(() => {
    // 源已被移除时不发起请求；渲染层对 !source 有空态分支兜底
    if (!key || !source) return
    // manga info and chapter list load independently: a flaky chapter endpoint
    // must not blank the whole page (copymanga detail is region-blocked sometimes)
    Promise.all([
      source.getManga(id),
      source.getStats ? source.getStats(id) : Promise.resolve({ rating: null, follows: null }),
    ])
      .then(([m, s]) => {
        setManga(m)
        setStats(s)
        loadFeed(m.key)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '加载失败')
        setFeedLoading(false)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, langs, sourceId])

  const availableLangs = useMemo(() => [...new Set(feed.map((c) => c.lang))], [feed])
  const showLangFilter = availableLangs.length > 1
  const filtered = useMemo(
    () => (langFilter === 'all' ? feed : feed.filter((c) => c.lang === langFilter)),
    [feed, langFilter]
  )
  const ordered = useMemo(() => (ascOrder ? [...filtered].reverse() : filtered), [filtered, ascOrder])
  const visible = showAll ? ordered : ordered.slice(0, layout === 'grid' ? 120 : 40)

  const continueChapter = useMemo(() => {
    if (!feed.length) return null
    const asc = [...feed].reverse()
    if (sub?.lastReadChapterKey) {
      const idx = asc.findIndex((c) => c.key === sub.lastReadChapterKey)
      if (idx >= 0) return asc[idx + 1] ?? asc[idx]
      return asc.find((c) => !sub.readChapterKeys.includes(c.key)) ?? feed[0]
    }
    return asc[0]
  }, [feed, sub])

  if (!source)
    return (
      <div className="mt-24 flex flex-col items-center px-8 text-center">
        <p className="text-muted-foreground">该漫画的源未启用或已被删除</p>
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground/70">
          若只是停用了源，重新启用即可继续阅读；源被删除时，其订阅与历史会一并清除
        </p>
        <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate(-1)}>
          返回
        </Button>
      </div>
    )

  if (loading)
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )

  if (error || !manga)
    return (
      <div className="mt-24 text-center">
        <p className="text-muted-foreground">{error || '加载失败'}</p>
        <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate(-1)}>
          返回
        </Button>
      </div>
    )

  const statusText = manga.statusLabel ?? STATUS_LABEL[manga.status ?? ''] ?? null

  return (
    <div className="fade-in">
      {/* backdrop */}
      <div className="relative">
        {manga.cover && (
          <div className="absolute inset-0 overflow-hidden">
            <img src={manga.cover} alt="" referrerPolicy="no-referrer" className="h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
          </div>
        )}
        <div className="relative mx-auto max-w-5xl px-4 pt-4 lg:px-8 lg:pt-8">
          <button
            onClick={() => {
              const idx = (window.history.state as { idx?: number } | null)?.idx ?? 1
              if (idx > 0) navigate(-1)
              else navigate('/', { replace: true })
            }}
            className="mb-4 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-5 lg:gap-8">
            <CoverImg
              src={manga.cover}
              title={manga.title}
              eager
              className="aspect-[2/3] w-32 shrink-0 rounded-2xl cover-shadow ring-1 ring-foreground/10 sm:w-40 lg:w-48"
            />
            <div className="min-w-0 flex-1 pt-1 lg:pt-4">
              <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl lg:text-4xl">{manga.title}</h1>
              {manga.altTitles.length > 0 && (
                <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground lg:text-sm">{manga.altTitles.join(' · ')}</p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                {[manga.author, manga.year, statusText].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-3 flex items-center gap-4 text-sm">
                {stats.rating != null && (
                  <span className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="font-display font-bold">{stats.rating.toFixed(1)}</span>
                  </span>
                )}
                {stats.follows != null && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {fmtCount(stats.follows)} 关注
                  </span>
                )}
                {manga.popularity != null && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    人气 {fmtCount(manga.popularity)}
                  </span>
                )}
              </div>
              {/* desktop actions */}
              <div className="mt-6 hidden gap-3 lg:flex">
                <ActionButtons
                  sub={!!sub}
                  onSubscribe={() => {
                    if (sub) {
                      unsubscribe(key)
                      toast('已取消订阅')
                    } else {
                      subscribe(manga)
                      toast.success('已加入书架，更新时会提醒你')
                    }
                  }}
                  continueKey={continueChapter?.key}
                  continueLabel={sub?.lastReadChapterKey ? '继续阅读' : '开始阅读'}
                />
              </div>
            </div>
          </div>

          {/* mobile actions */}
          <div className="mt-5 lg:hidden">
            <ActionButtons
              sub={!!sub}
              onSubscribe={() => {
                if (sub) {
                  unsubscribe(key)
                  toast('已取消订阅')
                } else {
                  subscribe(manga)
                  toast.success('已加入书架，更新时会提醒你')
                }
              }}
              continueKey={continueChapter?.key}
              continueLabel={sub?.lastReadChapterKey ? '继续阅读' : '开始阅读'}
            />
          </div>

          {isLocal && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setRenameOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
                重命名
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-xs font-medium text-destructive/80 transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除本漫画
              </button>
            </div>
          )}

          {manga.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {manga.tags.slice(0, 12).map((t) => (
                <span key={t} className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground/80">
                  {t}
                </span>
              ))}
            </div>
          )}

          {manga.description && (
            <div className="mt-4 max-w-3xl">
              <p className={cn('whitespace-pre-line text-sm leading-relaxed text-muted-foreground', !descOpen && 'line-clamp-3')}>
                {cleanDescription(manga.description)}
              </p>
              {manga.description.length > 120 && (
                <button
                  onClick={() => setDescOpen(!descOpen)}
                  className="mt-1 flex items-center gap-1 text-xs font-medium text-primary"
                >
                  {descOpen ? '收起' : '展开'}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', descOpen && 'rotate-180')} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* chapters */}
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6 lg:px-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-bold">
            章节 <span className="font-display text-sm font-medium text-muted-foreground">{filtered.length}</span>
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => setAscOrder(!ascOrder)}
              className="flex h-8 items-center gap-1 rounded-full bg-secondary px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label="切换章节排序"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {ascOrder ? '正序' : '倒序'}
            </button>
            <button
              onClick={() => setLayout(layout === 'list' ? 'grid' : 'list')}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              aria-label="切换章节显示"
            >
              {layout === 'list' ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {showLangFilter && (
          <div className="mb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            <FilterChip active={langFilter === 'all'} onClick={() => setLangFilter('all')}>
              全部
            </FilterChip>
            {availableLangs.map((l) => (
              <FilterChip key={l} active={langFilter === l} onClick={() => setLangFilter(l)}>
                {langLabel(l)}
              </FilterChip>
            ))}
          </div>
        )}

        {!isLocal && cachedKeys.length > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-3.5 py-2 text-xs text-muted-foreground">
            <span>已缓存 {cachedKeys.length} 章 · {fmtBytes(cacheBytes)}</span>
            <button onClick={() => setConfirmClear(true)} className="font-medium text-destructive/80 hover:text-destructive">
              清理本漫缓存
            </button>
          </div>
        )}

        {feedLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : feedError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">{feedError}</p>
            <Button variant="outline" className="mt-4 rounded-full" onClick={() => loadFeed()}>
              重试
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">暂无章节</p>
        ) : layout === 'grid' ? (
          <>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {visible.map((c) => {
                const read = sub?.readChapterKeys.includes(c.key)
                const isNew = sub?.seenPublishAt != null && c.publishAt > sub.seenPublishAt
                return (
                  <li key={c.key}>
                    <Link
                      to={`/read/${key}/${c.key}`}
                      title={`${chapterLabel(c)}${c.title ? ` · ${c.title}` : ''}`}
                      className={cn(
                        'relative flex h-11 items-center justify-center rounded-lg border border-border/70 bg-card/50 px-1 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary',
                        read && 'opacity-45',
                        isNew && 'border-primary/50 text-primary'
                      )}
                    >
                      <span className="truncate">{chapterLabel(c)}</span>
                      {!isLocal && cachedKeys.includes(c.key) && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500" title="已缓存" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
            {ordered.length > 120 && (
              <Button variant="outline" onClick={() => setShowAll(!showAll)} className="mt-4 h-11 w-full rounded-full">
                {showAll ? '收起' : `显示全部 ${ordered.length} 章`}
              </Button>
            )}
          </>
        ) : (
          <>
            <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card/50">
              {visible.map((c) => {
                const read = sub?.readChapterKeys.includes(c.key)
                const isLast = sub?.lastReadChapterKey === c.key
                const isNew = sub?.seenPublishAt != null && c.publishAt > sub.seenPublishAt
                return (
                  <li key={c.key}>
                    <Link
                      to={`/read/${key}/${c.key}`}
                      className={cn(
                        'flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50',
                        read && 'opacity-45'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {chapterLabel(c)}
                          {c.title && <span className="ml-2 font-normal text-muted-foreground">{c.title}</span>}
                          {isNew && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">新</span>}
                          {isLast && <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">读到这</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {langLabel(c.lang)}
                          {c.group ? ` · ${c.group}` : ''}
                          {c.publishAt ? ` · ${fmtRelative(c.publishAt)}` : ''}
                          {!isLocal && cachedKeys.includes(c.key) && <span className="ml-1.5 text-emerald-500">· 已缓存</span>}
                        </p>
                      </div>
                      {!isLocal && (
                        <CacheButton
                          cached={cachedKeys.includes(c.key)}
                          loading={caching}
                          onCache={async () => {
                            setCaching(true)
                            try {
                              const n = await cacheChapter(manga.key, manga.title, manga.cover, c, (cc) => source.getPages(cc))
                              refreshCacheState()
                              toast.success(`已缓存 ${n} 页，离线可读`)
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : '缓存失败')
                            } finally {
                              setCaching(false)
                            }
                          }}
                          onClear={async () => {
                            await clearChapterCache(c.key)
                            refreshCacheState()
                            toast('已清除该章缓存')
                          }}
                        />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
            {ordered.length > 40 && (
              <Button variant="outline" onClick={() => setShowAll(!showAll)} className="mt-4 h-11 w-full rounded-full">
                {showAll ? '收起' : `显示全部 ${ordered.length} 章`}
              </Button>
            )}
          </>
        )}
      </div>

      <Confirm
        open={confirmClear}
        title="清理本漫缓存"
        desc={`将删除「${manga.title}」已缓存的 ${cachedKeys.length} 章离线图片，不影响订阅和阅读进度。`}
        confirmText="清理"
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          setConfirmClear(false)
          for (const ck of cachedKeys) await clearChapterCache(ck)
          refreshCacheState()
          toast('本漫缓存已清理')
        }}
      />

      <RenameDialog
        open={renameOpen}
        initial={manga.title}
        onCancel={() => setRenameOpen(false)}
        onConfirm={(v) => void doRename(v)}
      />

      <Confirm
        open={confirmDelete}
        title="删除本漫画"
        desc={`将删除「${manga.title}」的全部本地图片文件，并同步移除其书架订阅与阅读历史。此操作不可恢复。`}
        confirmText="删除"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
      />
    </div>
  )
}

function RenameDialog({
  open,
  initial,
  onCancel,
  onConfirm,
}: {
  open: boolean
  initial: string
  onCancel: () => void
  onConfirm: (value: string) => void
}) {
  if (!open) return null
  // 每次打开重新挂载，输入框状态自动以 initial 初始化（避免 effect 里同步 setState）
  return <RenameDialogInner initial={initial} onCancel={onCancel} onConfirm={onConfirm} />
}

function RenameDialogInner({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: string
  onCancel: () => void
  onConfirm: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ paddingBottom: 'calc(1.5rem + max(env(safe-area-inset-bottom), var(--safe-bottom, 0px)))' }}
      role="dialog"
      aria-modal="true"
    >
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-label="取消" />
      <div className="fade-in relative w-full max-w-sm rounded-2xl border border-border/70 bg-card p-5 shadow-2xl">
        <h3 className="text-[15px] font-bold">重命名</h3>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm(value)
          }}
          maxLength={80}
          className="mt-4 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none transition-colors focus:border-primary/60"
        />
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="h-11 flex-1 rounded-full border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(value)}
            disabled={!value.trim()}
            className="h-11 flex-1 rounded-full bg-foreground text-sm font-semibold text-background transition-colors disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function CacheButton({ cached, loading, onCache, onClear }: { cached: boolean; loading: boolean; onCache: () => void; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (cached) setConfirming(true)
          else onCache()
        }}
        disabled={loading}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
          cached ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-muted-foreground/50 hover:bg-accent hover:text-foreground'
        )}
        aria-label={cached ? '清除该章缓存' : '离线缓存该章'}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : cached ? <HardDriveDownload className="h-3.5 w-3.5" /> : <HardDrive className="h-3.5 w-3.5" />}
      </button>
      {confirming && (
        <div onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
          <Confirm
            open
            title="清除该章缓存"
            desc="仅删除离线图片，不影响阅读进度。"
            confirmText="清除"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false)
              onClear()
            }}
          />
        </div>
      )}
    </>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-8 shrink-0 rounded-full px-3 text-xs transition-colors',
        active ? 'bg-foreground font-semibold text-background' : 'bg-secondary text-muted-foreground'
      )}
    >
      {children}
    </button>
  )
}

function ActionButtons({
  sub,
  onSubscribe,
  continueKey,
  continueLabel,
}: {
  sub: boolean
  onSubscribe: () => void
  continueKey?: string
  continueLabel: string
}) {
  const { key = '' } = useParams<{ key: string }>()
  return (
    <div className="flex gap-3">
      {continueKey && (
        <Link to={`/read/${key}/${continueKey}`} className="flex-1 lg:flex-none">
          <Button className="h-12 w-full rounded-full px-7 text-[15px] font-semibold shadow-lg shadow-primary/25 lg:w-auto">
            <Play className="mr-1.5 h-4 w-4 fill-current" />
            {continueLabel}
          </Button>
        </Link>
      )}
      <Button
        variant={sub ? 'secondary' : 'outline'}
        onClick={onSubscribe}
        className={cn('h-12 flex-1 rounded-full px-6 text-[15px] font-semibold lg:flex-none', sub && 'text-primary')}
      >
        {sub ? (
          <>
            <BookmarkCheck className="mr-1.5 h-4 w-4" />
            已订阅
          </>
        ) : (
          <>
            <BookmarkPlus className="mr-1.5 h-4 w-4" />
            订阅
          </>
        )}
      </Button>
    </div>
  )
}
