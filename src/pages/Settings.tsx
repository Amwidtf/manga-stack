import { useEffect, useRef, useState } from 'react'
import {
  Moon, Sun, Trash2, Info, Database, Sparkles, Zap, Loader2, FileJson, Copy,
  Download, RefreshCw, FileText, ChevronRight,
  BookOpen, FolderInput,
} from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useHistory, useLibrary, useSettings } from '@/lib/store'
import { LANG_LABELS } from '@/lib/mangadex'
import { clearAllCache, fmtBytes, getCacheStats } from '@/lib/cache'
import { formatPurgeStats, hasSourceData, purgeSourceData, sourceDataStats } from '@/lib/purge'
import { makeKey } from '@/lib/sources/types'
import { listLocalManga, wipeLocalLibrary } from '@/lib/local/db'
import { deleteLocalManga } from '@/lib/local/importer'
import { getLocalSource } from '@/lib/local/source'
import { LOCAL_SOURCE_ID, type LocalManga } from '@/lib/local/model'
import { LocalImportDialog } from '@/components/LocalImportDialog'
import {
  BZMH_CANDIDATES, COPY_CANDIDATES, DEFAULT_COPY_BASE, EXAMPLE_RULE,
  exportSourcePayload, parseSourcePayload, probeBzmh, probeCopyApi,
  type SourceConfig,
} from '@/lib/sources'
import { APP_VERSION, APP_BUILD } from '@/lib/appmeta'
import { checkUpdate, downloadAndInstall, type UpdateInfo } from '@/lib/update'
import { clearApks, isNative } from '@/lib/native'
import { Switch } from '@/components/ui/switch'
import { Confirm } from '@/components/Confirm'
import { HiddenConsole } from '@/components/HiddenConsole'
import { cn } from '@/lib/utils'

const LANGS = ['zh', 'zh-hk', 'en', 'ja', 'ko'] as const
const RATINGS = [
  { key: 'safe', label: '全年龄' },
  { key: 'suggestive', label: '轻口味' },
  { key: 'erotica', label: '限制级' },
] as const

export default function SettingsPage() {
  const s = useSettings()
  const clearLibrary = useLibrary((st) => st.clearAll)
  const clearHistory = useHistory((st) => st.clear)
  const [confirm, setConfirm] = useState<'history' | 'library' | 'wipe' | null>(null)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const tapCount = useRef(0)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // MangaDex 专属设置（语言偏好 / 内容分级）只在存在已启用的 MangaDex 驱动配置时出现
  const hasMangadex = s.onlineEnabled && s.sourceConfigs.some((c) => c.type === 'mangadex' && c.enabled)

  const onVersionTap = () => {
    tapCount.current += 1
    if (tapTimer.current) clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => (tapCount.current = 0), 2000)
    const n = tapCount.current
    if (n >= 9) {
      tapCount.current = 0
      setConsoleOpen(true)
    } else if (n >= 5) {
      toast(`再点击 ${9 - n} 次进入开发者控制台`, { duration: 700 })
    }
  }

  const toggleLang = (l: string) => {
    const next = s.langs.includes(l) ? s.langs.filter((x) => x !== l) : [...s.langs, l]
    s.setLangs(next)
  }
  const toggleRating = (r: string) => {
    const next = s.ratings.includes(r) ? s.ratings.filter((x) => x !== r) : [...s.ratings, r]
    if (!next.length) return toast.error('至少保留一个内容分级')
    s.setRatings(next)
  }

  // 恢复出厂：清缓存 + 清本地漫画库 + 清安装包 + 删全部 mangastack* localStorage，然后重启到首页
  const wipeAll = async () => {
    await clearAllCache()
    await wipeLocalLibrary().catch(() => {})
    if (isNative()) await clearApks().catch(() => {})
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('mangastack')) localStorage.removeItem(k)
    }
    toast.success('已清除全部应用数据，即将重启')
    setTimeout(() => window.location.replace('/'), 600)
  }

  return (
    <div className="fade-in mx-auto max-w-2xl px-4 pb-10 pt-5 lg:px-8 lg:pt-8">
      <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">设置</h1>

      {s.onlineEnabled && (
        <Section title="漫画源" desc="本应用默认不启用任何内容源，是一个纯粹的订阅式阅读器；按需开启后，发现页会按源分组同时展示多个源的内容">
          <SourceManager />
        </Section>
      )}

      <LocalLibrarySection />

      <Section title="外观">
        <div className="flex gap-2">
          {(
            [
              { k: 'dark', label: '深色', icon: Moon },
              { k: 'light', label: '浅色', icon: Sun },
            ] as const
          ).map(({ k, label, icon: Icon }) => (
            <button
              key={k}
              onClick={() => s.setTheme(k)}
              className={cn(
                'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors',
                s.theme === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      {hasMangadex && (
        <>
          <Section title="章节语言偏好" desc="章节列表优先显示这些语言；没有时自动回退到全部语言">
            <div className="flex flex-wrap gap-2">
              {LANGS.map((l) => (
                <Chip key={l} active={s.langs.includes(l)} onClick={() => toggleLang(l)}>
                  {LANG_LABELS[l]}
                </Chip>
              ))}
            </div>
            <label className="mt-4 flex min-h-11 items-center justify-between gap-4">
              <span className="text-sm">
                发现页只显示有偏好语言章节的漫画
                <span className="mt-0.5 block text-xs text-muted-foreground/70">
                  开启后部分热门作品可能被隐藏；关闭则没有偏好语言章节时自动回退其他语言
                </span>
              </span>
              <Switch checked={s.onlyAvailable} onCheckedChange={s.setOnlyAvailable} />
            </label>
          </Section>

          <Section title="内容分级" desc="控制 MangaDex 在发现页与搜索结果中出现的漫画（仅对 MangaDex 生效）">
            <div className="flex flex-wrap gap-2">
              {RATINGS.map((r) => (
                <Chip key={r.key} active={s.ratings.includes(r.key)} onClick={() => toggleRating(r.key)}>
                  {r.label}
                </Chip>
              ))}
            </div>
          </Section>
        </>
      )}

      <Section title="阅读器默认">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">阅读模式</p>
            <div className="flex gap-2">
              <Chip active={s.mode === 'vertical'} onClick={() => s.setMode('vertical')} big>
                条漫（纵向滚动）
              </Chip>
              <Chip active={s.mode === 'paged'} onClick={() => s.setMode('paged')} big>
                翻页（单页）
              </Chip>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">翻页方向</p>
            <div className="flex gap-2">
              <Chip active={s.dir === 'rtl'} onClick={() => s.setDir('rtl')} big>
                从右到左（日漫）
              </Chip>
              <Chip active={s.dir === 'ltr'} onClick={() => s.setDir('ltr')} big>
                从左到右
              </Chip>
            </div>
          </div>
        </div>
      </Section>

      <Section title="下载管理" desc="漫画离线缓存与更新安装包在独立页面集中管理">
        {(() => {
          const stat = getCacheStats()
          return (
            <Link
              to="/downloads"
              className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-border/70 bg-secondary/30 px-3.5 py-3 transition-colors hover:bg-accent/50"
            >
              <Download className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-left text-sm font-medium text-foreground">下载内容</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {stat.chapters > 0 ? `${stat.chapters} 章 · ${fmtBytes(stat.bytes)}` : '暂无缓存'}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            </Link>
          )
        })()}
      </Section>

      <Section title="数据与隐私">
        <div className="space-y-1">
          <button
            onClick={() => setConfirm('history')}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" />
            清空阅读历史
          </button>
          <button
            onClick={() => setConfirm('library')}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            清空书架订阅
          </button>
          <button
            onClick={() => setConfirm('wipe')}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="text-left">清除全部应用数据（恢复初始状态）</span>
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground/70">
          订阅、进度、设置、下载与缓存只保存在本机的应用私有存储中，不会上传。卸载 APP 时系统会连同私有目录一并删除全部数据；也可以在上方手动逐项清除，或使用「清除全部应用数据」一键恢复初始状态。
        </p>
      </Section>

      <Section title="关于">
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <span className="flex items-center gap-2 font-medium text-foreground">
              <img src="./favicon.png" alt="" className="h-6 w-6 rounded-md" />
              漫栈 MangaStack
            </span>
            <button
              onClick={onVersionTap}
              className="select-none rounded px-1.5 py-0.5 font-display text-xs tabular-nums transition-colors active:bg-accent"
            >
              v{APP_VERSION}（构建 {APP_BUILD}）
            </button>
          </div>

          <UpdateCard />

          <Link
            to="/about"
            className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              权限、声明与开源信息
            </span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </Section>

      <HiddenConsole open={consoleOpen} onClose={() => setConsoleOpen(false)} />

      <Confirm
        open={confirm === 'history'}
        title="清空阅读历史"
        desc="将删除所有阅读记录，不影响书架订阅和下载缓存。"
        confirmText="清空"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          clearHistory()
          toast('历史已清空')
        }}
      />
      <Confirm
        open={confirm === 'library'}
        title="清空书架订阅"
        desc="将删除全部订阅、阅读进度和未读标记，此操作不可恢复。"
        confirmText="清空"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          clearLibrary()
          toast('书架已清空')
        }}
      />
      <Confirm
        open={confirm === 'wipe'}
        title="清除全部应用数据"
        desc="将删除订阅、历史、设置、下载缓存与已下载的安装包，恢复到刚安装时的状态。此操作不可恢复。"
        confirmText="全部清除"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null)
          void wipeAll()
        }}
      />
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {desc && <p className="mt-1 text-xs text-muted-foreground/70">{desc}</p>}
      <div className="mt-3 rounded-2xl border border-border/70 bg-card/50 p-4">{children}</div>
    </section>
  )
}

function Chip({ active, onClick, children, big }: { active: boolean; onClick: () => void; children: React.ReactNode; big?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full font-medium transition-colors',
        big ? 'h-11 px-5 text-sm' : 'h-9 px-4 text-sm',
        active ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

/* ---------- 本地漫画库 ---------- */

function LocalLibrarySection() {
  const subs = useLibrary((st) => st.subs)
  const subscribe = useLibrary((st) => st.subscribe)
  const unsubscribe = useLibrary((st) => st.unsubscribe)
  const removeHistoryManga = useHistory((st) => st.removeManga)
  const [items, setItems] = useState<LocalManga[] | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [deleting, setDeleting] = useState<LocalManga | null>(null)

  const refresh = () => listLocalManga().then(setItems).catch(() => setItems([]))
  // IndexedDB 读取是异步的，不在 effect 里同步 setState
  useEffect(() => {
    void refresh()
  }, [])

  const native = isNative()
  const totalBytes = (items ?? []).reduce((a, b) => a + b.bytes, 0)

  const doDelete = async (m: LocalManga) => {
    setDeleting(null)
    await deleteLocalManga(m.id).catch(() => {})
    const key = makeKey(LOCAL_SOURCE_ID, m.id)
    if (subs[key]) unsubscribe(key)
    removeHistoryManga(key)
    toast.success(`已删除「${m.title}」及其全部本地文件`)
    void refresh()
  }

  return (
    <Section title="本地漫画库" desc="导入设备上的 ZIP/CBZ 文件或图片文件夹，转为书架上的本地漫画；文件保存在应用私有目录，卸载即删除">
      <div className="rounded-xl border border-border/70 bg-secondary/30 p-3.5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            本地漫画
          </p>
          <span className="text-xs text-muted-foreground">
            {items === null ? '读取中…' : items.length > 0 ? `${items.length} 部 · ${fmtBytes(totalBytes)}` : '暂无本地漫画'}
          </span>
        </div>
        {items && items.length > 0 && (
          <ul className="mt-2.5 space-y-1">
            {items.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs hover:bg-accent/60">
                <Link
                  to={`/manga/${makeKey(LOCAL_SOURCE_ID, m.id)}`}
                  className="min-w-0 flex-1 truncate text-muted-foreground hover:text-foreground"
                >
                  {m.title}
                </Link>
                <span className="shrink-0 text-muted-foreground/60">
                  {m.chapters.length} 章 · {fmtBytes(m.bytes)}
                </span>
                <button
                  onClick={() => setDeleting(m)}
                  className="shrink-0 rounded-full p-1 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                  aria-label="删除该本地漫画"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={() => setImportOpen(true)}
          disabled={!native}
          className="mt-2.5 flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          <FolderInput className="h-3.5 w-3.5" />
          导入本地漫画
        </button>
        {!native && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/60">
            网页端无法访问设备文件，导入与阅读本地漫画请在 Android APP 中进行。
          </p>
        )}
      </div>

      <LocalImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async (m) => {
          subscribe(await getLocalSource().getManga(m.id))
          void refresh()
        }}
      />
      <Confirm
        open={!!deleting}
        title={`删除「${deleting?.title ?? ''}」`}
        desc="将删除该漫画的全部本地图片文件，并同步移除其书架订阅与阅读历史。此操作不可恢复。"
        confirmText="删除"
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && void doDelete(deleting)}
      />
    </Section>
  )
}

/* ---------- 内置更新 ---------- */

type UpdState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'error'; reason: string }
  | { kind: 'update'; info: UpdateInfo }

function UpdateCard() {
  const [state, setState] = useState<UpdState>({ kind: 'idle' })
  const [dl, setDl] = useState<{ received: number; total: number } | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const channel = useSettings((s) => s.updateChannel)
  const setUpdateChannel = useSettings((s) => s.setUpdateChannel)

  const runCheck = async () => {
    setState({ kind: 'checking' })
    const r = await checkUpdate(channel)
    if (r.kind === 'update') {
      setState({ kind: 'update', info: r.info })
    } else if (r.kind === 'latest') {
      setState({ kind: 'latest' })
      toast.success('已是最新版本')
    } else {
      setState({ kind: 'error', reason: r.reason })
      toast.error(r.reason)
    }
  }

  const startUpdate = async (info: UpdateInfo) => {
    setDl({ received: 0, total: info.size })
    try {
      await downloadAndInstall(info, setDl)
      toast.success('下载完成，已调起系统安装器')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '下载失败，请稍后再试')
    } finally {
      setDl(null)
    }
  }

  const pct = dl && dl.total > 0 ? Math.min(100, Math.round((dl.received / dl.total) * 100)) : null

  return (
    <div className="rounded-xl border border-border/70 bg-secondary/30 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <RefreshCw className={cn('h-4 w-4', state.kind === 'checking' && 'animate-spin')} />
          版本更新
        </p>
        <button
          onClick={runCheck}
          disabled={state.kind === 'checking' || !!dl}
          className="h-9 rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-50"
        >
          {state.kind === 'checking' ? '检查中…' : '检查更新'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-muted-foreground">
        <span className="text-xs">更新频道</span>
        {(['stable', 'beta'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setUpdateChannel(c)}
            disabled={!!dl}
            className={cn(
              'h-7 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-50',
              channel === c ? 'bg-foreground text-background' : 'bg-secondary text-foreground/70'
            )}
          >
            {c === 'stable' ? '稳定版' : '尝鲜版'}
          </button>
        ))}
        <span className="text-xs">{channel === 'beta' ? '含预发布版本' : '只看正式发布'}</span>
      </div>

      {state.kind === 'update' && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-semibold text-foreground">
            发现新版本 v{state.info.version}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{fmtBytes(state.info.size)}</span>
          </p>
          {state.info.notes && (
            <>
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary"
              >
                <FileText className="h-3.5 w-3.5" />
                {showNotes ? '收起更新日志' : '查看更新日志'}
              </button>
              {showNotes && (
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-background/60 p-2.5 text-xs leading-relaxed text-muted-foreground">
                  {state.info.notes}
                </pre>
              )}
            </>
          )}
          {dl ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct ?? 0}%` }} />
              </div>
              <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                {pct !== null ? `${pct}% · ` : ''}{fmtBytes(dl.received)} / {dl.total > 0 ? fmtBytes(dl.total) : '…'}
              </p>
            </div>
          ) : isNative() ? (
            <button
              onClick={() => startUpdate(state.info)}
              className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            >
              <Download className="h-4 w-4" />
              下载并安装
            </button>
          ) : (
            <a
              href={state.info.apkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            >
              <Download className="h-4 w-4" />
              下载 APK
            </a>
          )}
        </div>
      )}
      {state.kind === 'error' && <p className="mt-2 text-xs text-muted-foreground/70">{state.reason}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground/60">更新通过软件发布页分发；APP 端下载完成后由系统安装器完成升级，数据自动保留。</p>
    </div>
  )
}

/* ---------- 源管理：列表 + 导入/导出 ---------- */

// 类型徽标：内置三驱动与自定义规则引擎都以配置形式接入，区分的是驱动类型而非来源
const TYPE_BADGE: Record<SourceConfig['type'], string> = {
  mangadex: '官方驱动',
  copymanga: '官方驱动',
  baozimh: '官方驱动',
  custom: '自定义规则',
}

function configSubtitle(cfg: SourceConfig): string {
  if (cfg.type === 'mangadex') return 'api.mangadex.org · 多语言'
  if (cfg.type === 'copymanga') return cfg.baseUrl || DEFAULT_COPY_BASE
  if (cfg.type === 'baozimh') return cfg.baseUrl || BZMH_CANDIDATES[0].base
  return cfg.baseUrl ?? cfg.rule?.baseUrl ?? ''
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* 部分 WebView 拒绝异步剪贴板，退化到选中复制 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

function SourceManager() {
  const s = useSettings()
  const [importText, setImportText] = useState('')
  const [deleting, setDeleting] = useState<SourceConfig | null>(null)
  const [probing, setProbing] = useState<string | null>(null)
  const deleteStats = deleting ? sourceDataStats(deleting.id) : null

  const doImport = () => {
    const { configs, errors } = parseSourcePayload(importText)
    errors.slice(0, 5).forEach((e) => toast.error(e))
    if (errors.length > 5) toast.error(`……共 ${errors.length} 条校验未通过`)
    if (!configs.length) {
      if (!errors.length) toast.error('没有识别到有效的源配置')
      return
    }
    // 与 payload 解析同一策略：同 id 覆盖（upsert），对应「导出 → 修改 → 导回」的更新路径
    const merged = [...s.sourceConfigs]
    for (const c of configs) {
      const i = merged.findIndex((m) => m.id === c.id)
      if (i >= 0) merged[i] = c
      else merged.push(c)
    }
    s.setSourceConfigs(merged)
    toast.success(`已导入 ${configs.length} 个源配置${errors.length ? `（${errors.length} 条无效已跳过）` : ''}`)
    setImportText('')
  }

  const doExport = async (kind: 'json' | 'base64') => {
    const { json, base64 } = exportSourcePayload(s.sourceConfigs)
    const ok = await copyText(kind === 'json' ? json : base64)
    if (ok) toast.success(kind === 'json' ? `已复制 JSON（${s.sourceConfigs.length} 个源）` : '已复制 Base64 字符串，可直接分享')
    else toast.error('复制失败，请检查剪贴板权限')
  }

  // 镜像类源一键测活：探测全部候选线路，切到最快可用的一条并持久化 baseUrl
  const probeAndSwitch = async (cfg: SourceConfig) => {
    const probe = cfg.type === 'copymanga' ? probeCopyApi : probeBzmh
    const candidates = cfg.type === 'copymanga' ? COPY_CANDIDATES : BZMH_CANDIDATES
    const all = [...new Set([cfg.baseUrl ?? '', ...candidates.map((c) => c.base)].filter(Boolean))]
    setProbing(cfg.id)
    try {
      const rs = await Promise.all(all.map(async (b) => ({ base: b, ...(await probe(b)) })))
      const best = rs.filter((r) => r.ok).sort((x, y) => x.ms - y.ms)[0]
      if (best) {
        s.updateSourceBase(cfg.id, best.base)
        toast.success(`已切换到可用线路：${best.base}（${best.ms}ms）`)
      } else {
        toast.error('所有线路都不可用，请重新导入带新地址的配置')
      }
    } finally {
      setProbing(null)
    }
  }

  return (
    <div className="space-y-2">
      {s.sourceConfigs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium">尚未配置任何漫画源</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            漫栈自身不带漫画源。从可信渠道获取源配置（JSON 或 Base64 文本）粘贴到下方导入即可；配置只保存在本机，可随时导出备份或分享。
          </p>
        </div>
      )}

      {s.sourceConfigs.map((cfg) => (
        <div
          key={cfg.id}
          className={cn(
            'flex min-h-14 items-center gap-3 rounded-xl border border-border px-4 transition-colors',
            !cfg.enabled && 'opacity-55'
          )}
        >
          <Database className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="truncate">{cfg.name}</span>
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {TYPE_BADGE[cfg.type]}
              </span>
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{configSubtitle(cfg)}</p>
          </div>
          {(cfg.type === 'copymanga' || cfg.type === 'baozimh') && (
            <button
              onClick={() => probeAndSwitch(cfg)}
              disabled={probing !== null}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              aria-label="一键测活"
              title="一键测活（自动切换到最快可用线路）"
            >
              {probing === cfg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            </button>
          )}
          <Switch checked={cfg.enabled} onCheckedChange={() => s.toggleSourceConfig(cfg.id)} aria-label="启用或停用该源" />
          <button
            onClick={() => setDeleting(cfg)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="删除该源"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* 导入 */}
      <div className="mt-2 rounded-xl border border-border/70 bg-secondary/40 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">导入源配置</p>
          <button
            onClick={() => setImportText(JSON.stringify(EXAMPLE_RULE, null, 2))}
            className="flex items-center gap-1 text-xs font-medium text-primary"
          >
            <Sparkles className="h-3.5 w-3.5" />
            填入规则示例
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          支持 JSON 文本或 Base64 字符串（自动识别）；可以是单个配置、配置数组，或单条自定义规则。
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='[{"id":"mangadex","name":"MangaDex","type":"mangadex","enabled":true}]'
          rows={6}
          className="mt-2.5 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary/60"
        />
        <button
          onClick={doImport}
          disabled={!importText.trim()}
          className="mt-2.5 h-11 w-full rounded-lg bg-foreground text-sm font-semibold text-background transition-opacity disabled:opacity-50"
        >
          导入
        </button>
      </div>

      {/* 导出 */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => doExport('json')}
          disabled={!s.sourceConfigs.length}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <FileJson className="h-4 w-4" />
          复制 JSON
        </button>
        <button
          onClick={() => doExport('base64')}
          disabled={!s.sourceConfigs.length}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Copy className="h-4 w-4" />
          复制 Base64
        </button>
      </div>

      <Confirm
        open={!!deleting}
        title={`删除「${deleting?.name ?? ''}」`}
        desc={
          deleteStats && hasSourceData(deleteStats)
            ? `将同步删除该源的 ${formatPurgeStats(deleteStats)}，此操作不可恢复。`
            : '该源没有订阅、历史或离线缓存数据，仅删除源配置。'
        }
        confirmText="删除"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            const stats = sourceDataStats(deleting.id)
            s.removeSourceConfig(deleting.id)
            void purgeSourceData(deleting.id)
            toast(hasSourceData(stats) ? `已删除「${deleting.name}」及 ${formatPurgeStats(stats)}` : `已删除「${deleting.name}」`)
          }
          setDeleting(null)
        }}
      />
    </div>
  )
}
