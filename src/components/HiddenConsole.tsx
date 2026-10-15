import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useSettings } from '@/lib/store'
import { formatPurgeStats, hasSourceData, purgeSourceData, sourceDataStats } from '@/lib/purge'
import { BUILTIN_SOURCE_NAMES, BUILTIN_TYPES, sourceName, type BuiltinType } from '@/lib/sources'
import { APP_BUILD, APP_VERSION } from '@/lib/appmeta'

interface Line {
  kind: 'in' | 'out' | 'ok' | 'err' | 'sys'
  text: string
}

const BANNER: Line[] = [
  { kind: 'sys', text: `MangaStack shell — v${APP_VERSION} (build ${APP_BUILD})` },
  { kind: 'sys', text: '输入 help 查看可用命令。' },
]

const HELP = `可用命令：
  help                            显示本帮助
  version                         显示版本信息
  clear                           清空终端输出
  exit                            关闭控制台`

const HELP_SYS = `ms — 源管理命令：
  ms list          列出全部源配置及启用状态（别名 ms ls）
  ms add <id>      添加并启用源；ms add all 一键添加全部官方驱动
  ms on <id>       启用已有源
  ms off <id>      停用（配置保留）
  ms rm <id>       移除配置并同步删除其订阅/历史/缓存（有数据时需输入两次确认）
  ms online [on|off]  在线订阅总开关（缺省显示当前状态）
  clear            清空终端输出
  exit;            退出系统调用模式
官方驱动 id：copymanga（copy）、mangadex（md）、baozimh（baozi / bzmh）
自定义规则源请在设置页导入`

export function HiddenConsole({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>(BANNER)
  const [input, setInput] = useState('')
  const [sysMode, setSysMode] = useState(false)
  const [pendingRm, setPendingRm] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 键盘避让：部分 Android WebView（兼容层）不支持 interactive-widget=resizes-content，
  // 布局视口不随软键盘收缩，底部弹层会被输入法盖住。这里把遮罩钉在 visualViewport
  // （可视视口）上，面板随之抬到键盘上方；支持 resizes-content 的环境两视口一致，
  // 数值自然归零，不会二次抬高
  const [vvBox, setVvBox] = useState<{ h: number; top: number } | null>(() =>
    window.visualViewport ? { h: window.visualViewport.height, top: window.visualViewport.offsetTop } : null
  )
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => setVvBox({ h: vv.height, top: vv.offsetTop })
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setLines(BANNER)
      setInput('')
      setSysMode(false)
      setPendingRm(null)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  if (!open) return null

  const print = (...ls: Line[]) => setLines((prev) => [...prev, ...ls])

  const run = (raw: string) => {
    const cmd = raw.trim()
    if (!cmd) return
    print({ kind: 'in', text: `${sysMode ? 'sys>' : '$'} ${cmd}` })
    const st = useSettings.getState()
    const low = cmd.toLowerCase()

    if (!/^ms\s+rm\s+/.test(low)) setPendingRm(null)

    const ALIASES: Record<string, string> = {
      copy: 'copymanga',
      baozi: 'baozimh',
      bzmh: 'baozimh',
      md: 'mangadex',
    }
    const knownIds = (): string[] => [
      ...new Set([...useSettings.getState().sourceConfigs.map((c) => c.id), ...BUILTIN_TYPES]),
    ]
    const resolveSource = (name: string): string | null => {
      const ids = knownIds()
      if (ids.includes(name)) return name
      if (ALIASES[name] && ids.includes(ALIASES[name])) return ALIASES[name]
      const pref = ids.find((id) => id.startsWith(name))
      return pref ?? null
    }
    const displayName = (id: string): string =>
      useSettings.getState().sourceConfigs.find((c) => c.id === id)?.name ?? sourceName(id)

    const isBuiltin = (id: string): id is BuiltinType => (BUILTIN_TYPES as readonly string[]).includes(id)

    const add = (name: string): string | null => {
      const id = resolveSource(name)
      if (!id) return null
      const cur = useSettings.getState().sourceConfigs.find((c) => c.id === id)
      if (cur) {
        if (!cur.enabled) st.upsertSourceConfig({ ...cur, enabled: true })
      } else if (isBuiltin(id)) {
        st.upsertSourceConfig({ id, name: BUILTIN_SOURCE_NAMES[id], type: id, enabled: true })
      } else {
        return null
      }
      return id
    }

    const setOn = (name: string, on: boolean): string | 'nocfg' | null => {
      const id = resolveSource(name)
      const cur = id ? useSettings.getState().sourceConfigs.find((c) => c.id === id) : null
      if (!id) return null
      if (!cur) return 'nocfg'
      if (cur.enabled !== on) st.upsertSourceConfig({ ...cur, enabled: on })
      return id
    }

    const listSources = (): void => {
      const cfgs = useSettings.getState().sourceConfigs
      if (cfgs.length === 0) print({ kind: 'out', text: '（当前没有任何源配置）' })
      print(
        ...cfgs.map((c): Line => ({
          kind: c.enabled ? 'ok' : 'out',
          text: `${c.enabled ? '[on] ' : '[off]'} ${c.id} — ${c.name}`,
        }))
      )
      const missing = BUILTIN_TYPES.filter((t) => !cfgs.some((c) => c.id === t))
      print(
        ...missing.map((t): Line => ({
          kind: 'sys',
          text: `[--] ${t} — ${BUILTIN_SOURCE_NAMES[t]}（未添加，ms add ${t} 可快捷添加）`,
        }))
      )
    }

    if (/^system\s+call\s*;$/.test(low)) {
      if (sysMode) {
        print({ kind: 'sys', text: '已在系统调用模式（exit; 退出）' })
      } else {
        setSysMode(true)
        print({ kind: 'sys', text: 'system call mode — ms help 查看命令，exit; 退出' })
      }
      return
    }

    const addAll = (): void => {
      for (const t of BUILTIN_TYPES) {
        const cur = useSettings.getState().sourceConfigs.find((c) => c.id === t)
        st.upsertSourceConfig(
          cur ? { ...cur, enabled: true } : { id: t, name: BUILTIN_SOURCE_NAMES[t], type: t, enabled: true }
        )
      }
      print({ kind: 'ok', text: `OK · 已添加并启用全部 ${BUILTIN_TYPES.length} 个官方驱动源` })
    }

    if (sysMode) {
      if (low === 'exit;' || low === 'exit' || low === 'quit;' || low === 'quit') {
        setSysMode(false)
        setPendingRm(null)
        print({ kind: 'sys', text: 'exit system call mode' })
        return
      }
      if (low === 'help' || low === '?' || low === 'ms' || low === 'ms help') {
        print({ kind: 'out', text: HELP_SYS })
        return
      }
      if (low === 'clear') {
        setLines([])
        return
      }
      const msCmd = low.match(/^ms\s+(list|ls|add|on|off|rm|online)(?:\s+([\w-]+))?$/)
      if (msCmd) {
        const sub = msCmd[1]
        const arg = msCmd[2]
        if (sub === 'list' || sub === 'ls') {
          listSources()
          return
        }
        if (sub === 'add' && arg === 'all') {
          addAll()
          return
        }
        if (sub === 'online') {
          if (!arg) {
            print({ kind: 'out', text: `online: ${useSettings.getState().onlineEnabled ? 'on' : 'off'}` })
            return
          }
          if (arg === 'on' || arg === 'off') {
            st.setOnlineEnabled(arg === 'on')
            print({ kind: 'ok', text: `OK · online ${arg}` })
            if (arg === 'on') print({ kind: 'sys', text: 'ms add all 一键添加官方驱动源；自定义规则源在设置页导入' })
            return
          }
          print({ kind: 'err', text: '用法：ms online [on|off]' })
          return
        }
        if (!arg) {
          print({ kind: 'err', text: `用法：ms ${sub} <id>（ms list 查看可用 id）` })
          return
        }
        if (sub === 'add') {
          const id = add(arg)
          if (id) print({ kind: 'ok', text: `OK · 「${displayName(id)}」已添加并启用` })
          else print({ kind: 'err', text: `unknown source: ${arg}（自定义规则源请在设置页导入；ms list 查看可用 id）` })
          return
        }
        if (sub === 'rm') {
          const id = resolveSource(arg)
          if (!id) {
            print({ kind: 'err', text: `unknown source: ${arg}（ms list 查看可用 id）` })
            return
          }
          if (!useSettings.getState().sourceConfigs.some((c) => c.id === id)) {
            print({ kind: 'err', text: `${arg} 没有配置，无需移除` })
            return
          }
          const name = displayName(id)
          const stats = sourceDataStats(id)
          if (hasSourceData(stats) && pendingRm !== id) {
            setPendingRm(id)
            print({ kind: 'err', text: `警告：「${name}」在本机有 ${formatPurgeStats(stats)}` })
            print({ kind: 'sys', text: `删除源将同步删除以上数据且不可恢复 —— 再次输入 ms rm ${arg} 确认` })
            return
          }
          setPendingRm(null)
          st.removeSourceConfig(id)
          void purgeSourceData(id)
          print({
            kind: 'ok',
            text: hasSourceData(stats)
              ? `OK · 「${name}」已移除，同步删除 ${formatPurgeStats(stats)}`
              : `OK · 「${name}」配置已移除（无相关数据）`,
          })
          return
        }
        const r = setOn(arg, sub === 'on')
        if (r === null) print({ kind: 'err', text: `unknown source: ${arg}（ms list 查看可用 id）` })
        else if (r === 'nocfg') print({ kind: 'err', text: `${arg} 未添加配置（用 ms add ${arg} 快捷添加）` })
        else print({ kind: 'ok', text: `OK · 「${displayName(r)}」已${sub === 'on' ? '启用' : '停用'}` })
        return
      }
      print({ kind: 'err', text: `command not found: ${cmd}（ms help 查看命令）` })
      return
    }

    if (low === 'help' || low === '?') return print({ kind: 'out', text: HELP })
    if (low === 'version') return print({ kind: 'out', text: `MangaStack v${APP_VERSION} (build ${APP_BUILD})` })
    if (low === 'clear') return setLines([])
    if (low === 'exit' || low === 'quit') return onClose()

    print({ kind: 'err', text: `command not found: ${cmd}（help 查看命令）` })
  }

  return createPortal(
    // 不再贴底：部分设备的 WebView 对键盘完全无感（布局/可视视口都不收缩、
    // 原生 insets 也不可靠），底边锚定必被输入法盖住。改为整体上移的居中布局，
    // 面板落在键盘上方的安全区；输入行在面板底部也保持在屏幕中段
    <div
      className="fixed inset-x-0 top-0 z-[110] flex items-center justify-center bg-black/70 px-4 pb-[35vh] backdrop-blur-sm sm:p-6 sm:pb-6"
      style={vvBox ? { height: `${vvBox.h}px`, transform: `translateY(${vvBox.top}px)` } : undefined}
      onClick={onClose}
    >
      <div
        className="flex max-h-[46vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#0a0f0a] shadow-2xl shadow-emerald-500/10"
        style={{ maxHeight: vvBox ? `${Math.round(vvBox.h * 0.46)}px` : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-emerald-500/20 px-4 py-3">
          <p className="font-mono text-xs tracking-wider text-emerald-400/80">mangastack — developer console</p>
          <button onClick={onClose} className="rounded-full p-1.5 text-emerald-400/60 hover:bg-emerald-500/10" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div ref={scrollRef} className="min-h-56 flex-1 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
          {lines.map((l, i) => (
            <pre
              key={i}
              className={
                l.kind === 'in'
                  ? 'whitespace-pre-wrap text-emerald-300'
                  : l.kind === 'ok'
                    ? 'whitespace-pre-wrap text-emerald-400'
                    : l.kind === 'err'
                      ? 'whitespace-pre-wrap text-red-400'
                      : l.kind === 'sys'
                        ? 'whitespace-pre-wrap text-emerald-600'
                        : 'whitespace-pre-wrap text-emerald-100/80'
              }
            >
              {l.text}
            </pre>
          ))}
        </div>
        <form
          className="flex items-center gap-2 border-t border-emerald-500/20 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            run(input)
            setInput('')
          }}
        >
          <span className="font-mono text-sm text-emerald-500">{sysMode ? 'sys>' : '$'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sysMode ? 'ms list' : 'help'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 bg-transparent font-mono text-sm text-emerald-200 outline-none placeholder:text-emerald-800"
          />
        </form>
      </div>
    </div>,
    document.body
  )
}
