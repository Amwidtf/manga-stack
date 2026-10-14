import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { RefreshCw, Compass, BookOpen, FolderInput } from 'lucide-react'
import { toast } from 'sonner'
import { useLibrary, useSettings } from '@/lib/store'
import { sourceName } from '@/lib/sources'
import { fmtRelative } from '@/lib/mangadex'
import { MangaCard } from '@/components/MangaCard'
import { LocalImportDialog } from '@/components/LocalImportDialog'
import { getLocalSource } from '@/lib/local/source'
import { LOCAL_SOURCE_ID, type LocalManga } from '@/lib/local/model'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SortKey = 'unread' | 'recent' | 'added'

export default function LibraryPage() {
  const { subs, checkUpdates, lastChecked, subscribe } = useLibrary()
  const langs = useSettings((s) => s.langs)
  const onlineEnabled = useSettings((s) => s.onlineEnabled)
  const [checking, setChecking] = useState(false)
  const [sort, setSort] = useState<SortKey>('unread')
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const onImported = async (m: LocalManga) => {
    subscribe(await getLocalSource().getManga(m.id))
  }

  const runCheck = async (silent = false) => {
    if (checking) return
    setChecking(true)
    try {
      const n = await checkUpdates(langs)
      if (!silent) toast.success(n > 0 ? `发现 ${n} 个新章节` : '已全部是最新')
    } catch {
      if (!silent) toast.error('检查更新失败，请稍后重试')
    } finally {
      setChecking(false)
    }
  }

  // auto check once per 5 minutes
  useEffect(() => {
    if (!onlineEnabled) return
    if (!Object.keys(subs).length || Date.now() - lastChecked <= 5 * 60 * 1000) return
    // 推迟到宏任务，避免在 effect 体内同步 setState
    const t = setTimeout(() => void runCheck(true), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 订阅列表里出现过的去重源 id（来源筛选 chips）
  const sourceIds = useMemo(
    () => [...new Set(Object.values(subs).map((s) => s.manga.source))].filter((id) => onlineEnabled || id === LOCAL_SOURCE_ID),
    [subs, onlineEnabled]
  )

  const list = useMemo(() => {
    let arr = onlineEnabled ? Object.values(subs) : Object.values(subs).filter((s) => s.manga.source === LOCAL_SOURCE_ID)
    if (sourceFilter) arr = arr.filter((s) => s.manga.source === sourceFilter)
    switch (sort) {
      case 'unread':
        return arr.sort((a, b) => b.unread - a.unread || (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
      case 'recent':
        return arr.sort((a, b) => (b.latestPublishAt ?? '').localeCompare(a.latestPublishAt ?? ''))
      case 'added':
        return arr.sort((a, b) => b.addedAt - a.addedAt)
    }
  }, [subs, sort, sourceFilter, onlineEnabled])

  const totalUnread = list.reduce((a, b) => a + b.unread, 0)

  return (
    <div className="fade-in mx-auto max-w-6xl px-4 pt-5 lg:px-8 lg:pt-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            我的书架
            {totalUnread > 0 && <span className="ml-2 align-middle text-base font-semibold text-primary">{totalUnread} 话更新</span>}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {list.length > 0
              ? `${list.length} 部订阅${lastChecked ? ` · ${fmtRelative(new Date(lastChecked).toISOString())}检查过` : ''}`
              : '订阅的漫画会出现在这里'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="h-11 rounded-full px-4"
          >
            <FolderInput className="mr-2 h-4 w-4" />
            导入
          </Button>
          {onlineEnabled && list.length > 0 && (
            <Button
              variant="outline"
              onClick={() => runCheck()}
              disabled={checking}
              className="h-11 rounded-full px-4"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', checking && 'animate-spin')} />
              检查更新
            </Button>
          )}
        </div>
      </div>

      {list.length > 0 && (
        <div className="mb-5 space-y-2.5">
          <div className="flex gap-2">
            {(
              [
                ['unread', '有更新优先'],
                ['recent', '最近更新'],
                ['added', '最近添加'],
              ] as [SortKey, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={cn(
                  'h-9 rounded-full px-4 text-sm transition-colors',
                  sort === k
                    ? 'bg-foreground text-background font-semibold'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {sourceIds.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
              <button
                onClick={() => setSourceFilter(null)}
                className={cn(
                  'h-8 shrink-0 rounded-full px-3.5 text-xs transition-colors',
                  sourceFilter === null
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                )}
              >
                全部来源
              </button>
              {sourceIds.map((id) => (
                <button
                  key={id}
                  onClick={() => setSourceFilter(sourceFilter === id ? null : id)}
                  className={cn(
                    'h-8 shrink-0 rounded-full px-3.5 text-xs transition-colors',
                    sourceFilter === id
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  )}
                >
                  {sourceName(id)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <div className="rise-in mt-16 flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary">
            <BookOpen className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="mt-5 text-lg font-semibold">书架还是空的</h2>
          <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {onlineEnabled ? '去发现页找到喜欢的漫画，点「订阅」加入书架，更新时会提醒你' : '导入设备上的 ZIP/CBZ 文件或图片文件夹，转为书架上的本地漫画'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {onlineEnabled && (
              <Link to="/browse">
                <Button className="h-11 rounded-full px-6">
                  <Compass className="mr-2 h-4 w-4" />
                  去发现漫画
                </Button>
              </Link>
            )}
            <Button variant={onlineEnabled ? 'outline' : 'default'} className="h-11 rounded-full px-6" onClick={() => setImportOpen(true)}>
              <FolderInput className="mr-2 h-4 w-4" />
              导入本地漫画
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-x-4">
          {list.map((sub) => (
            <MangaCard
              key={sub.manga.id}
              manga={sub.manga}
              badge={sub.unread}
              subtitle={
                sub.checking
                  ? '检查中…'
                  : sub.latestPublishAt
                    ? `${sub.latestLabel ?? ''} · ${fmtRelative(sub.latestPublishAt)}`
                    : sub.manga.author ?? ''
              }
            />
          ))}
        </div>
      )}
      <LocalImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={onImported} />
    </div>
  )
}
