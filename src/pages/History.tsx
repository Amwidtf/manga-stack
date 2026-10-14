import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  History as HistoryIcon, Trash2, ChevronDown, X,
  LayoutGrid, List, CheckCircle2, Circle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useHistory, useLibrary, useSettings, type HistoryItem } from '@/lib/store'
import { parseKey, sourceName, getSource } from '@/lib/sources'
import { fmtRelative } from '@/lib/mangadex'
import { LOCAL_SOURCE_ID } from '@/lib/local/model'
import { CoverImg } from '@/components/CoverImg'
import { Button } from '@/components/ui/button'
import { Confirm } from '@/components/Confirm'
import { cn } from '@/lib/utils'

// 历史按章存储(200 条上限),展示层按漫画分组:默认网格(每部一卡,点击续读),
// 可切列表(逐章展开);「管理」进入多选,按漫画批量删除。

interface MangaGroup {
  mangaKey: string
  title: string
  cover: string | null
  items: HistoryItem[] // 按时间倒序,items[0] 为最新
}

export default function HistoryPage() {
  const { items: allItems, clear, remove, removeManga, patchMangaCover } = useHistory()
  const onlineEnabled = useSettings((s) => s.onlineEnabled)
  const subs = useLibrary((s) => s.subs)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deletingOne, setDeletingOne] = useState<MangaGroup | null>(null)
  const [deletingMany, setDeletingMany] = useState<MangaGroup[] | null>(null)

  const groups = useMemo(() => {
    const items = onlineEnabled ? allItems : allItems.filter((i) => i.mangaKey.startsWith(`${LOCAL_SOURCE_ID}:`))
    // 书架订阅里存有封面，旧历史记录缺封面字段时兜底
    const subCover = new Map<string, string>()
    for (const s of Object.values(subs)) if (s.manga.cover) subCover.set(s.manga.key, s.manga.cover)
    const map = new Map<string, MangaGroup>()
    for (const it of items) {
      let g = map.get(it.mangaKey)
      if (!g) {
        g = { mangaKey: it.mangaKey, title: it.mangaTitle, cover: it.cover ?? subCover.get(it.mangaKey) ?? null, items: [] }
        map.set(it.mangaKey, g)
      }
      // 组内取第一个非空封面：最新一条可能是补齐封面字段之前的旧记录
      if (!g.cover && it.cover) g.cover = it.cover
      g.items.push(it)
    }
    return [...map.values()]
  }, [allItems, onlineEnabled, subs])

  // 封面自愈：本地（历史条目/书架）都查不到封面时，若源可用则后台拉详情补齐；
  // 部分源详情端点与列表端点可用性不同（详情被掐、搜索还在），详情失败再退回
  // 按标题搜索并按 id 匹配。成功写回历史记录持久化（只补空值）；失败静默，
  // 下次进页再试。每部每次会话只试一次。
  const coverTried = useRef(new Set<string>())
  useEffect(() => {
    for (const g of groups) {
      if (g.cover || coverTried.current.has(g.mangaKey)) continue
      coverTried.current.add(g.mangaKey)
      const { source: sourceId, id } = parseKey(g.mangaKey)
      const source = getSource(sourceId)
      if (!source) continue
      void source
        .getManga(id)
        .catch(() => null)
        .then((m) => {
          if (m?.cover) {
            patchMangaCover(g.mangaKey, m.cover)
            return
          }
          // 详情端点不可用时,部分源(如拷贝漫画)的 getManga 会回退成无封面存根
          // 而不是报错,这里统一按「没拿到封面」处理:退回按标题搜索,按 id 匹配
          void source
            .browse({ q: g.title, limit: 10, offset: 0, order: source.orders[0].key })
            .then((r) => {
              const hit = r.items.find((mm) => mm.key === g.mangaKey || mm.id === id)
              if (hit?.cover) patchMangaCover(g.mangaKey, hit.cover)
            })
            .catch(() => {})
        })
    }
  }, [groups, patchMangaCover])

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  const selectedGroups = groups.filter((g) => selected.has(g.mangaKey))

  return (
    <div className="fade-in mx-auto max-w-4xl px-4 pt-5 lg:px-8 lg:pt-8">
      <div className="mb-5 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">阅读历史</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {groups.length ? `最近读过 ${groups.length} 部漫画` : '看过的章节会记录在这里'}
          </p>
        </div>
        {groups.length > 0 && !selecting && (
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex rounded-full border border-border/70 p-0.5">
              {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-label={v === 'grid' ? '网格视图' : '列表视图'}
                  aria-pressed={view === v}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                    view === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              className="h-9 text-muted-foreground"
              onClick={() => {
                setSelecting(true)
                setSelected(new Set())
              }}
            >
              管理
            </Button>
            <Button
              variant="ghost"
              className="h-9 text-muted-foreground hover:text-destructive"
              onClick={() => {
                clear()
                toast('历史已清空')
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              清空
            </Button>
          </div>
        )}
      </div>

      {selecting && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/40 px-3 py-2">
          <button
            onClick={() => setSelected(selected.size === groups.length ? new Set() : new Set(groups.map((g) => g.mangaKey)))}
            className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {selected.size === groups.length ? '取消全选' : '全选'}
          </button>
          <span className="text-xs tabular-nums text-muted-foreground">已选 {selected.size} 部</span>
          <div className="flex-1" />
          <button
            disabled={!selected.size}
            onClick={() => setDeletingMany(selectedGroups)}
            className="flex h-8 items-center gap-1 rounded-full border border-destructive/30 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
          <button
            onClick={exitSelecting}
            className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            完成
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rise-in mt-16 flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary">
            <HistoryIcon className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="mt-5 text-sm text-muted-foreground">还没有阅读记录</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:gap-x-4">
          {groups.map((g) => {
            const latest = g.items[0]
            const sel = selected.has(g.mangaKey)
            const card = (
              <>
                <div className="relative">
                  <CoverImg
                    src={g.cover}
                    title={g.title}
                    className={cn(
                      'aspect-[2/3] w-full rounded-xl ring-1 ring-foreground/5 transition-transform duration-300',
                      !selecting && 'group-hover:scale-[1.03]',
                      selecting && sel && 'ring-2 ring-primary'
                    )}
                  />
                  <span className="absolute bottom-1.5 left-1.5 max-w-[85%] truncate rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
                    {sourceName(parseKey(g.mangaKey).source)}
                  </span>
                  {selecting && (
                    <span className="absolute right-1.5 top-1.5">
                      {sel ? (
                        <CheckCircle2 className="h-5 w-5 text-primary drop-shadow" />
                      ) : (
                        <Circle className="h-5 w-5 text-white/70 drop-shadow" />
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug">{g.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">续读 {latest.chapterLabel}</p>
                <p className="line-clamp-1 text-[11px] text-muted-foreground/60">
                  {fmtRelative(new Date(latest.at).toISOString())}
                </p>
              </>
            )
            return selecting ? (
              <button key={g.mangaKey} onClick={() => toggleSelect(g.mangaKey)} className="group text-left">
                {card}
              </button>
            ) : (
              <Link key={g.mangaKey} to={`/read/${g.mangaKey}/${latest.chapterKey}`} className="group block">
                {card}
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => {
            const latest = g.items[0]
            const open = expanded === g.mangaKey
            return (
              <div key={g.mangaKey} className="overflow-hidden rounded-2xl border border-border/70 bg-card/50">
                <div className="flex items-center gap-2 px-2.5 py-2.5">
                  {selecting ? (
                    <button
                      onClick={() => toggleSelect(g.mangaKey)}
                      className="flex min-w-0 flex-1 items-center gap-3.5 rounded-xl py-1 pr-2 transition-colors hover:bg-accent/40"
                    >
                      <CoverImg src={g.cover} title={g.title} className="aspect-[2/3] w-11 shrink-0 rounded-md ring-1 ring-foreground/5" />
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium">{g.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          续读 {latest.chapterLabel} · {fmtRelative(new Date(latest.at).toISOString())}
                        </p>
                      </div>
                      {selected.has(g.mangaKey) && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                    </button>
                  ) : (
                    <>
                      <Link
                        to={`/read/${g.mangaKey}/${latest.chapterKey}`}
                        className="flex min-w-0 flex-1 items-center gap-3.5 rounded-xl py-1 pr-2 transition-colors hover:bg-accent/40"
                      >
                        <CoverImg src={g.cover} title={g.title} className="aspect-[2/3] w-11 shrink-0 rounded-md ring-1 ring-foreground/5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{g.title}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {sourceName(parseKey(g.mangaKey).source)}
                            </span>
                            <span className="truncate">
                              续读 {latest.chapterLabel} · {fmtRelative(new Date(latest.at).toISOString())}
                            </span>
                          </p>
                        </div>
                      </Link>
                      {g.items.length > 1 && (
                        <button
                          onClick={() => setExpanded(open ? null : g.mangaKey)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground"
                          aria-label={open ? '收起章节记录' : `展开 ${g.items.length} 条章节记录`}
                        >
                          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                        </button>
                      )}
                      <button
                        onClick={() => setDeletingOne(g)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="删除该漫画的阅读记录"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
                {open && !selecting && (
                  <ul className="divide-y divide-border/50 border-t border-border/60 bg-background/40">
                    {g.items.map((h) => (
                      <li key={h.chapterKey} className="flex items-center gap-2 py-1.5 pl-[76px] pr-3.5 text-xs transition-colors hover:bg-accent/40">
                        <Link to={`/read/${h.mangaKey}/${h.chapterKey}`} className="min-w-0 flex-1 truncate">
                          {h.chapterLabel}
                          <span className="ml-1.5 text-muted-foreground/60">{fmtRelative(new Date(h.at).toISOString())}</span>
                        </Link>
                        <button
                          onClick={() => remove(h.chapterKey)}
                          className="shrink-0 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="删除该条记录"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Confirm
        open={!!deletingOne}
        title={`删除「${deletingOne?.title ?? ''}」的阅读记录`}
        desc={`将删除该漫画的 ${deletingOne?.items.length ?? 0} 条阅读记录，不影响书架订阅与离线缓存。`}
        confirmText="删除"
        onCancel={() => setDeletingOne(null)}
        onConfirm={() => {
          if (deletingOne) removeManga(deletingOne.mangaKey)
          setDeletingOne(null)
        }}
      />
      <Confirm
        open={!!deletingMany}
        title={`删除 ${deletingMany?.length ?? 0} 部漫画的阅读记录`}
        desc={`将删除所选漫画共 ${deletingMany?.reduce((a, g) => a + g.items.length, 0) ?? 0} 条阅读记录，不影响书架订阅与离线缓存。`}
        confirmText="删除"
        onCancel={() => setDeletingMany(null)}
        onConfirm={() => {
          deletingMany?.forEach((g) => removeManga(g.mangaKey))
          toast(`已删除 ${deletingMany?.length ?? 0} 部漫画的阅读记录`)
          setDeletingMany(null)
          exitSelecting()
        }}
      />
    </div>
  )
}
