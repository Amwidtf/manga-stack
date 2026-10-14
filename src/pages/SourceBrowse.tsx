import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Search, X, Loader2, Flame, Clock, Star, ListFilter, Database } from 'lucide-react'
import { getSource, type NManga } from '@/lib/sources'
import { getTags, type Tag } from '@/lib/mangadex'
import { useSettings } from '@/lib/store'
import { MangaCard } from '@/components/MangaCard'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const ORDER_ICONS = [Flame, Clock, Star] as const
const PAGE = 24

export default function SourceBrowseRoute() {
  const { sid = '' } = useParams<{ sid: string }>()
  // sid 变化时整体重挂载，保证筛选状态从 URL 重新初始化
  return <SourceBrowsePage key={sid} sid={sid} />
}

function SourceBrowsePage({ sid }: { sid: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const cfg = useSettings((s) => s.sourceConfigs.find((c) => c.id === sid))
  // 源被删除或停用时拿不到实例，渲染空态而不是白屏
  const source = cfg?.enabled ? getSource(sid) : undefined
  const { ratings, langs, onlyAvailable } = useSettings()

  // 筛选条件与地址栏双向同步：进入时从 URL 读，修改时 replace 写入（不污染返回栈）
  const [input, setInput] = useState(() => searchParams.get('q') ?? '')
  const [q, setQ] = useState(() => (searchParams.get('q') ?? '').trim())
  const [order, setOrder] = useState(() => {
    const o = searchParams.get('order')
    return source && o && source.orders.some((x) => x.key === o) ? o : (source?.orders[0].key ?? '')
  })
  const [tagId, setTagId] = useState<string | null>(() => searchParams.get('tag'))
  const [tags, setTags] = useState<Tag[]>([])
  const [items, setItems] = useState<NManga[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [appendError, setAppendError] = useState(false)
  const seq = useRef(0)

  const syncUrl = (patch: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v)
          else p.delete(k)
        }
        return p
      },
      { replace: true }
    )
  }

  // 搜索输入防抖后生效
  useEffect(() => {
    const t = setTimeout(() => {
      const v = input.trim()
      setQ((prev) => {
        if (prev === v) return prev
        syncUrl({ q: v || null })
        return v
      })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])

  useEffect(() => {
    if (!source?.supportsTags) return
    getTags()
      .then((all) => setTags(all.filter((t) => t.group === 'genre' || t.group === 'theme')))
      .catch(() => {})
  }, [source])

  // URL 只存标签 id，标签列表拉到后再还原显示名
  const tag = useMemo(() => tags.find((t) => t.id === tagId) ?? null, [tags, tagId])
  const popularTags = useMemo(() => tags.slice(0, 60), [tags])

  const load = async (offset: number, append: boolean) => {
    if (!source) return
    const mySeq = ++seq.current
    if (append) {
      setLoadingMore(true)
      setAppendError(false)
    } else {
      setLoading(true)
      setError('')
    }
    try {
      const r = await source.browse({
        q: q || undefined,
        order,
        offset,
        limit: PAGE,
        ratings,
        langs,
        onlyAvailable,
        tagId: tagId ?? undefined,
      })
      // 条件已变化，废弃这次在途请求的结果
      if (mySeq !== seq.current) return
      // 追加时按 key 去重：部分源排序抖动会把边缘条目重复返回
      setItems((prev) => {
        if (!append) return r.items
        const seen = new Set(prev.map((p) => p.key))
        return [...prev, ...r.items.filter((i) => !seen.has(i.key))]
      })
      setTotal(r.total)
      // 分页终结以本页实际返回数为准：部分源的 total 缺失或不准
      setHasMore(r.items.length >= PAGE)
    } catch (e) {
      if (mySeq !== seq.current) return
      // 首屏失败整页报错；追加失败保留已加载列表，底部内联提示
      if (append) setAppendError(true)
      else setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      if (mySeq === seq.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    // 推迟到宏任务，避免在 effect 体内同步 setState
    const t = setTimeout(() => void load(0, false), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, order, tagId, ratings, langs, onlyAvailable, source])

  if (!source)
    return (
      <div className="mt-24 flex flex-col items-center px-8 text-center">
        <Database className="h-10 w-10 text-muted-foreground/40" />
        <p className="mt-4 font-medium">该源未启用或已被删除</p>
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground/70">
          到设置页重新启用或导入配置后，即可继续浏览
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="rounded-full" onClick={() => navigate(-1)}>
            返回
          </Button>
          <Link to="/settings">
            <Button className="rounded-full">前往设置</Button>
          </Link>
        </div>
      </div>
    )

  return (
    <div className="fade-in mx-auto max-w-6xl px-4 pt-4 lg:px-8 lg:pt-8">
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            const idx = (window.history.state as { idx?: number } | null)?.idx ?? 1
            if (idx > 0) navigate(-1)
            else navigate('/browse', { replace: true })
          }}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 truncate text-xl font-bold tracking-tight lg:text-3xl">{source.name}</h1>
      </div>

      {/* 搜索：条件同步到地址栏，返回/分享可还原 */}
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`在「${source.name}」中搜索…`}
          className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-11 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
        />
        {input && (
          <button
            onClick={() => setInput('')}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            aria-label="清空"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 排序 / 分类筛选 */}
      <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {!q &&
          source.orders.map(({ key, label }, i) => {
            const Icon = ORDER_ICONS[Math.min(i, ORDER_ICONS.length - 1)]
            return (
              <button
                key={key}
                onClick={() => {
                  setOrder(key)
                  syncUrl({ order: key === source.orders[0].key ? null : key })
                }}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition-colors',
                  order === key && !tagId
                    ? 'bg-foreground font-semibold text-background'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          })}
        {source.supportsTags && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition-colors',
                  tagId
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                <ListFilter className="h-3.5 w-3.5" />
                {tag ? tag.name : tagId ? '已选分类' : '分类'}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    setTagId(null)
                    syncUrl({ tag: null })
                  }}
                  className={cn('h-8 rounded-full px-3 text-xs', !tagId ? 'bg-foreground font-semibold text-background' : 'bg-secondary')}
                >
                  全部
                </button>
                {popularTags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTagId(t.id)
                      syncUrl({ tag: t.id })
                    }}
                    className={cn(
                      'h-8 rounded-full px-3 text-xs transition-colors',
                      tagId === t.id ? 'bg-primary font-semibold text-primary-foreground' : 'bg-secondary hover:bg-accent'
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
        {q && <span className="shrink-0 text-sm text-muted-foreground">「{q}」的搜索结果</span>}
      </div>

      {/* 结果网格 */}
      {loading ? (
        <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-x-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-secondary" />
              <div className="mt-2.5 h-3.5 w-4/5 animate-pulse rounded bg-secondary" />
              <div className="mt-1.5 h-3 w-3/5 animate-pulse rounded bg-secondary" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => load(0, false)}>
            重新加载
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-20 text-center text-muted-foreground">
          <p>没有找到相关漫画</p>
          <p className="mt-1 text-sm">换个关键词或分类试试</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-x-4">
            {items.map((m) => (
              <MangaCard key={m.key} manga={m} subtitle={m.author ?? undefined} />
            ))}
          </div>
          {appendError && (
            <div className="mt-8 flex items-center justify-center gap-3 rounded-xl border border-dashed border-border py-4 text-sm text-muted-foreground">
              加载更多失败
              <button onClick={() => load(items.length, true)} className="font-medium text-primary">
                点击重试
              </button>
            </div>
          )}
          {!appendError && hasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => load(items.length, true)}
                className="h-11 rounded-full px-8"
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                加载更多（已加载 {items.length}
                {total > 0 ? ` / 约 ${Math.min(total, 10000)}` : ''}）
              </Button>
            </div>
          )}
          {!hasMore && items.length > PAGE && (
            <p className="mt-8 text-center text-xs text-muted-foreground/60">已加载全部 {items.length} 部</p>
          )}
        </>
      )}
    </div>
  )
}
