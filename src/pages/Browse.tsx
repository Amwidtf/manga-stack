import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search, X, ChevronRight, ListFilter, Check, Database, Compass, Settings as SettingsIcon } from 'lucide-react'
import { getSource, type NManga, type Source } from '@/lib/sources'
import { useSettings } from '@/lib/store'
import { useUiSession } from '@/lib/uiSession'
import { MangaCard } from '@/components/MangaCard'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// 多源分区模式下每个源横向展示的条目数
const SECTION_ITEMS = 24

export default function BrowsePage() {
  const sourceConfigs = useSettings((s) => s.sourceConfigs)
  // 启用的配置逐个取源实例；配置损坏构建不出实例的跳过（设置页可修复）
  const enabled = useMemo(
    () =>
      sourceConfigs
        .filter((c) => c.enabled)
        .map((c) => getSource(c.id))
        .filter((x): x is Source => !!x),
    [sourceConfigs]
  )
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const scope = useUiSession((s) => s.browseScope)
  const setScope = useUiSession((s) => s.setBrowseScope)

  const toggleScope = (id: string) => {
    // 从「全部」进入时以全集为基础勾选
    const next = new Set(scope ?? enabled.map((s) => s.id))
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // 与全集等同或一个不剩时回到「全部」
    setScope(next.size === 0 || next.size === enabled.length ? null : next)
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  const visible = useMemo(() => (scope ? enabled.filter((s) => scope.has(s.id)) : enabled), [enabled, scope])

  // 分区加载状态汇总：范围内所有源都失败时，给出统一的「全部重试」入口，
  // 免得用户对着一排失败分区逐个去点
  const [sectionStates, setSectionStates] = useState<Record<string, 'loading' | 'error' | 'done'>>({})
  const [retryAll, setRetryAll] = useState(0)
  const reportState = useCallback((id: string, st: 'loading' | 'error' | 'done') => {
    setSectionStates((prev) => (prev[id] === st ? prev : { ...prev, [id]: st }))
  }, [])
  const allFailed = visible.length > 1 && visible.every((s) => sectionStates[s.id] === 'error')

  return (
    <div className="fade-in mx-auto max-w-6xl px-4 pt-5 lg:px-8 lg:pt-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">发现</h1>
        {enabled.length > 0 && (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
            {enabled.length === 1 ? enabled[0].name : `${enabled.length} 个源`}
          </span>
        )}
      </div>

      {sourceConfigs.length === 0 ? (
        // 零配置：App 不内置源，引导用户先去设置页导入配置
        <div className="rise-in mt-16 flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary">
            <Compass className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 text-lg font-semibold">尚未配置漫画源</h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
            漫栈不内置漫画源，请先在设置中导入源配置（支持 JSON / Base64 文本）
          </p>
          <Link to="/settings">
            <Button className="mt-6 h-11 rounded-full px-6">
              <SettingsIcon className="mr-2 h-4 w-4" />
              前往设置
            </Button>
          </Link>
        </div>
      ) : enabled.length === 0 ? (
        // 有配置但全部停用（或全部构建失败）：引导去设置页开启
        <div className="mt-24 flex flex-col items-center text-center">
          <Database className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 font-medium">还没有启用任何漫画源</p>
          <p className="mt-1.5 max-w-72 text-sm leading-relaxed text-muted-foreground">
            漫栈默认是一个纯粹的订阅式阅读器，不内置可用内容。到设置中开启源或导入新配置后，这里会按源分组展示内容。
          </p>
          <Link to="/settings">
            <Button className="mt-5 rounded-full px-6">去设置开启</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* 搜索：同时搜索范围内的已启用源；范围仅本次会话有效 */}
          <div className="mt-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={scope ? '搜索所选源…' : enabled.length > 1 ? '同时搜索所有已启用的源…' : '搜索漫画名、作者…'}
                className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-11 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                  aria-label="清空"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {enabled.length > 1 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground',
                      scope && 'border-primary/50 text-primary'
                    )}
                    aria-label="源范围"
                  >
                    <ListFilter className="h-[18px] w-[18px]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2">
                  <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">源范围 · 本次会话有效</p>
                  <button
                    onClick={() => setScope(null)}
                    className={cn(
                      'flex h-9 w-full items-center justify-between rounded-lg px-2 text-sm transition-colors',
                      !scope ? 'font-semibold' : 'text-muted-foreground hover:bg-accent'
                    )}
                  >
                    全部启用源
                    {!scope && <Check className="h-4 w-4 text-primary" />}
                  </button>
                  {enabled.map((s) => {
                    const on = scope?.has(s.id) ?? false
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleScope(s.id)}
                        className={cn(
                          'flex h-9 w-full items-center justify-between rounded-lg px-2 text-sm transition-colors',
                          on ? 'font-semibold' : 'text-muted-foreground hover:bg-accent'
                        )}
                      >
                        <span className="truncate">{s.name}</span>
                        {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </PopoverContent>
              </Popover>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="mt-24 text-center">
              <p className="text-muted-foreground">所选范围内没有启用的源</p>
              <Button variant="outline" className="mt-4 rounded-full" onClick={() => setScope(null)}>
                恢复为全部源
              </Button>
            </div>
          ) : (
            // 每个源一个分区；点「更多」进入该源的完整浏览页（排序/分类/分页）
            <>
              {allFailed && (
                <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-dashed border-destructive/40 px-4 py-3">
                  <p className="text-sm text-muted-foreground">{visible.length} 个源都加载失败了</p>
                  <Button variant="outline" size="sm" className="shrink-0 rounded-full" onClick={() => setRetryAll((v) => v + 1)}>
                    全部重试
                  </Button>
                </div>
              )}
              <div className="mt-6 space-y-8">
                {visible.map((src) => (
                  <SourceSection key={src.id} source={src} query={debounced} retryAll={retryAll} onState={reportState} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ---------- 每个源一个横向滚动分区 ---------- */

function SourceSection({
  source,
  query,
  retryAll,
  onState,
}: {
  source: Source
  query: string
  // 父级「全部重试」信号：值一变就重新加载
  retryAll: number
  onState: (id: string, st: 'loading' | 'error' | 'done') => void
}) {
  const { ratings, langs, onlyAvailable } = useSettings()
  const [items, setItems] = useState<NManga[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'done'>('loading')
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setState('loading')
      onState(source.id, 'loading')
      try {
        const r = await source.browse({
          q: query || undefined,
          order: source.orders[0].key,
          offset: 0,
          limit: SECTION_ITEMS,
          ratings,
          langs,
          onlyAvailable,
        })
        if (!alive) return
        setItems(r.items)
        setState('done')
        onState(source.id, 'done')
      } catch {
        if (!alive) return
        setState('error')
        onState(source.id, 'error')
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [source, query, ratings, langs, onlyAvailable, retryTick, retryAll, onState])

  // 搜索模式下没有结果的源整个折叠不显示
  if (state === 'done' && query && items.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-bold tracking-tight">
          <span className="truncate">{source.name}</span>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {query ? '搜索结果' : source.orders[0].label}
          </span>
        </h2>
        <div className="flex shrink-0 items-baseline gap-3">
          {state === 'done' && items.length > 0 && (
            <span className="text-xs text-muted-foreground/70">{items.length} 部</span>
          )}
          <Link
            to={`/browse/source/${source.id}${query ? `?q=${encodeURIComponent(query)}` : ''}`}
            className="-my-2 flex items-center gap-0.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            更多
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {state === 'loading' ? (
        <div className="mt-3 flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-28 shrink-0">
              <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-secondary" />
              <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-secondary" />
            </div>
          ))}
        </div>
      ) : state === 'done' && items.length === 0 && !query ? (
        // 源返回空但不报错(如 HTML 解析型源在 Web 端受 CORS 限制)时,给出可感知的空态
        <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
          该源暂未返回内容——部分源仅支持在 APP 内使用
        </p>
      ) : state === 'error' ? (
        <button
          onClick={() => setRetryTick((v) => v + 1)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-sm text-muted-foreground hover:bg-accent"
        >
          加载失败，点击重试
        </button>
      ) : items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          暂时没有内容
        </p>
      ) : (
        <div className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          {items.map((m) => (
            <MangaCard key={m.key} manga={m} className="w-28 shrink-0 snap-start" />
          ))}
        </div>
      )}
    </section>
  )
}
