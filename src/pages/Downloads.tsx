// 下载管理独立页:漫画离线缓存(默认网格带封面,可切列表;支持多选整部删除)+
// 更新安装包。从设置页迁出,设置页只留一个带统计摘要的入口行。

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ChevronDown, LayoutGrid, List, Package, Trash2,
  CheckCircle2, Circle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  clearAllCache,
  clearChapterCache,
  clearCacheForManga,
  fmtBytes,
  getCacheStats,
  listCachedChapters,
  type CachedChapterInfo,
} from '@/lib/cache'
import { clearApks, deleteApk, isNative, listApks, type ApkFile } from '@/lib/native'
import { useHistory, useLibrary } from '@/lib/store'
import { Confirm } from '@/components/Confirm'
import { CoverImg } from '@/components/CoverImg'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface MangaGroup {
  mangaKey: string
  title: string
  cover: string | null
  chapters: CachedChapterInfo[] // 按缓存时间倒序
  bytes: number
}

function groupByManga(list: CachedChapterInfo[], coverFallback: Map<string, string | null>): MangaGroup[] {
  const map = new Map<string, MangaGroup>()
  for (const c of list) {
    let g = map.get(c.mangaKey)
    if (!g) {
      // 旧元数据没有 cover 字段(字段后加),用历史/书架里的封面兜底
      g = {
        mangaKey: c.mangaKey,
        title: c.mangaTitle,
        cover: c.cover ?? coverFallback.get(c.mangaKey) ?? null,
        chapters: [],
        bytes: 0,
      }
      map.set(c.mangaKey, g)
    }
    g.chapters.push(c)
    g.bytes += c.bytes
  }
  return [...map.values()]
}

export default function DownloadsPage() {
  const [list, setList] = useState(listCachedChapters)
  const [stat, setStat] = useState(getCacheStats)
  const [apks, setApks] = useState<ApkFile[] | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<'all' | 'apk' | null>(null)
  const [deletingMany, setDeletingMany] = useState<MangaGroup[] | null>(null)

  const refresh = () => {
    setList(listCachedChapters())
    setStat(getCacheStats())
    if (isNative()) listApks().then(setApks).catch(() => setApks([]))
  }
  // 挂载时只异步拉安装包列表;缓存统计由 useState 惰性初始化覆盖,
  // 不在 effect 里同步 setState(react-hooks v7 set-state-in-effect)
  useEffect(() => {
    if (isNative()) listApks().then(setApks).catch(() => setApks([]))
  }, [])

  // 封面兜底:历史条目与书架订阅里都存有封面(取最新)
  const histItems = useHistory((s) => s.items)
  const subs = useLibrary((s) => s.subs)
  const coverFallback = new Map<string, string | null>()
  for (const it of histItems) if (!coverFallback.has(it.mangaKey)) coverFallback.set(it.mangaKey, it.cover)
  for (const sub of Object.values(subs)) if (!coverFallback.has(sub.manga.key)) coverFallback.set(sub.manga.key, sub.manga.cover)

  const groups = groupByManga(list, coverFallback)
  const apkBytes = (apks ?? []).reduce((a, b) => a + b.size, 0)
  const selectedGroups = groups.filter((g) => selected.has(g.mangaKey))

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

  return (
    <div className="fade-in mx-auto max-w-4xl px-4 pb-10 pt-5 lg:px-8 lg:pt-8">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">下载管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            漫画缓存是阅读时自动离线保存的章节图片；安装包是内置更新下载的 APK。两者都在应用私有目录，卸载即删除。
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
            <button
              onClick={() => {
                setSelecting(true)
                setSelected(new Set())
              }}
              className="h-9 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              管理
            </button>
          </div>
        )}
      </div>

      <Tabs defaultValue="comics" className="mt-5">
        <TabsList className="w-full">
          <TabsTrigger value="comics" className="flex-1">
            漫画缓存{stat.chapters > 0 ? ` · ${stat.chapters}` : ''}
          </TabsTrigger>
          <TabsTrigger value="apks" className="flex-1">
            安装包{apks && apks.length > 0 ? ` · ${apks.length}` : ''}
          </TabsTrigger>
        </TabsList>
      <TabsContent value="comics" className="mt-4">
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

        <div className="mb-4 flex items-center justify-between rounded-xl border border-border/70 bg-secondary/30 px-3.5 py-3 text-xs text-muted-foreground">
          <span>
            {stat.chapters > 0
              ? `${groups.length} 部漫画 · ${stat.chapters} 章 · ${stat.pages} 页 · ${fmtBytes(stat.bytes)}`
              : '暂无离线缓存,阅读时自动保存'}
          </span>
          {stat.chapters > 0 && !selecting && (
            <button
              onClick={() => setConfirm('all')}
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-destructive/30 px-2.5 text-destructive/80 transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空
            </button>
          )}
        </div>

        {groups.length === 0 ? null : view === 'grid' ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:gap-x-4">
            {groups.map((g) => {
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
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {g.chapters.length} 章 · {fmtBytes(g.bytes)}
                  </p>
                </>
              )
              return selecting ? (
                <button key={g.mangaKey} onClick={() => toggleSelect(g.mangaKey)} className="group text-left">
                  {card}
                </button>
              ) : (
                <button
                  key={g.mangaKey}
                  onClick={() => {
                    setView('list')
                    setExpanded(g.mangaKey)
                  }}
                  className="group text-left"
                  aria-label={`查看 ${g.title} 的缓存章节`}
                >
                  {card}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const open = expanded === g.mangaKey
              return (
                <div key={g.mangaKey} className="overflow-hidden rounded-xl border border-border/70 bg-card/50">
                  <div className="flex items-center gap-1.5 px-3 py-2.5">
                    {selecting ? (
                      <button
                        onClick={() => toggleSelect(g.mangaKey)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 pr-1 text-left transition-colors hover:bg-accent/40"
                      >
                        <CoverImg src={g.cover} title={g.title} className="aspect-[2/3] w-10 shrink-0 rounded-md ring-1 ring-foreground/5" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{g.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {g.chapters.length} 章 · {fmtBytes(g.bytes)}
                          </span>
                        </span>
                        {selected.has(g.mangaKey) && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setExpanded(open ? null : g.mangaKey)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 pr-1 text-left transition-colors hover:bg-accent/40"
                          aria-label={open ? '收起章节' : `展开 ${g.chapters.length} 个章节`}
                        >
                          <CoverImg src={g.cover} title={g.title} className="aspect-[2/3] w-10 shrink-0 rounded-md ring-1 ring-foreground/5" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{g.title}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {g.chapters.length} 章 · {fmtBytes(g.bytes)}
                            </span>
                          </span>
                          {g.chapters.length > 1 && (
                            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform', open && 'rotate-180')} />
                          )}
                        </button>
                        <button
                          onClick={async () => {
                            const r = await clearCacheForManga(g.mangaKey)
                            refresh()
                            toast(`已删除「${g.title}」${r.chapters} 章缓存`)
                          }}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="删除该漫画的全部缓存"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                  {open && !selecting && (
                    <ul className="divide-y divide-border/50 border-t border-border/60 bg-background/40">
                      {g.chapters.map((c) => (
                        <li key={c.chapterKey} className="flex items-center gap-2 py-1.5 pl-[60px] pr-3 text-xs transition-colors hover:bg-accent/40">
                          <Link to={`/read/${c.mangaKey}/${c.chapterKey}`} className="min-w-0 flex-1 truncate">
                            {c.chapterLabel}
                            <span className="ml-1.5 text-muted-foreground/60">
                              {c.pages}P · {fmtBytes(c.bytes)}
                            </span>
                          </Link>
                          <button
                            onClick={async () => {
                              await clearChapterCache(c.chapterKey)
                              refresh()
                              toast(`已删除「${c.chapterLabel}」的缓存`)
                            }}
                            className="shrink-0 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="删除该章节缓存"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      </TabsContent>
      <TabsContent value="apks" className="mt-4">
        <div className="rounded-xl border border-border/70 bg-secondary/30 p-3.5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Package className="h-4 w-4 text-muted-foreground" />
              更新安装包
            </p>
            <span className="text-xs text-muted-foreground">
              {apks === null ? '仅 APP 端可用' : apks.length > 0 ? `${apks.length} 个 · ${fmtBytes(apkBytes)}` : '暂无安装包'}
            </span>
          </div>
          {apks && apks.length > 0 && (
            <>
              <ul className="mt-2.5 space-y-1">
                {apks.map((a) => (
                  <li key={a.name} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs hover:bg-accent/60">
                    <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{a.name}</span>
                    <span className="shrink-0 text-muted-foreground/60">{fmtBytes(a.size)}</span>
                    <button
                      onClick={async () => {
                        await deleteApk(a.name)
                        refresh()
                      }}
                      className="shrink-0 rounded-full p-1 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                      aria-label="删除该安装包"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setConfirm('apk')}
                className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-destructive/30 text-xs text-destructive/80 transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清除全部安装包
              </button>
            </>
          )}
          {apks === null && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/60">
              网页版不托管安装包；APP 端通过「设置 → 版本更新」下载的更新包会出现在这里。
            </p>
          )}
        </div>
      </TabsContent>
      </Tabs>

      <Confirm
        open={confirm === 'all'}
        title="清除全部漫画缓存"
        desc={`将删除 ${stat.chapters} 章共 ${fmtBytes(stat.bytes)} 的离线图片，不影响订阅和阅读进度。`}
        confirmText="清除"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null)
          await clearAllCache()
          refresh()
          toast('漫画缓存已清除')
        }}
      />
      <Confirm
        open={confirm === 'apk'}
        title="清除全部安装包"
        desc={`将删除 ${apks?.length ?? 0} 个共 ${fmtBytes(apkBytes)} 的更新安装包，不影响应用本身。`}
        confirmText="清除"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null)
          await clearApks()
          refresh()
          toast('安装包已清除')
        }}
      />
      <Confirm
        open={!!deletingMany}
        title={`删除 ${deletingMany?.length ?? 0} 部漫画的缓存`}
        desc={`将删除所选漫画共 ${deletingMany?.length ?? 0} 部的离线图片（${fmtBytes(deletingMany?.reduce((a, g) => a + g.bytes, 0) ?? 0)}），不影响订阅和阅读进度。`}
        confirmText="删除"
        onCancel={() => setDeletingMany(null)}
        onConfirm={async () => {
          if (deletingMany) {
            for (const g of deletingMany) await clearCacheForManga(g.mangaKey)
            toast(`已删除 ${deletingMany.length} 部漫画的缓存`)
          }
          setDeletingMany(null)
          exitSelecting()
          refresh()
        }}
      />
    </div>
  )
}
