import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomRule, NChapter, NManga, SourceConfig } from './sources'
import { _setOnlineGate, applySourceConfigs, BUILTIN_SOURCE_NAMES, BUILTIN_TYPES, chapterLabel, getSource } from './sources'
import { coverUrl } from './mangadex'
import { LOCAL_SOURCE_ID } from './local/model'
import { defaultUpdateChannel, type UpdateChannel } from './appmeta'

/* ---------- Settings ---------- */

export type ThemeName = 'dark' | 'light'
export type ReaderMode = 'vertical' | 'paged'
export type ReaderDir = 'ltr' | 'rtl'

interface SettingsState {
  theme: ThemeName
  sourceConfigs: SourceConfig[]
  langs: string[]
  ratings: string[]
  mode: ReaderMode
  dir: ReaderDir
  onlyAvailable: boolean
  onlineEnabled: boolean
  updateChannel: UpdateChannel
  setTheme: (t: ThemeName) => void
  setSourceConfigs: (cfgs: SourceConfig[]) => void
  upsertSourceConfig: (cfg: SourceConfig) => void
  removeSourceConfig: (id: string) => void
  toggleSourceConfig: (id: string) => void
  updateSourceBase: (id: string, baseUrl: string) => void
  setLangs: (l: string[]) => void
  setRatings: (r: string[]) => void
  setMode: (m: ReaderMode) => void
  setDir: (d: ReaderDir) => void
  setOnlyAvailable: (v: boolean) => void
  setOnlineEnabled: (v: boolean) => void
  setUpdateChannel: (c: UpdateChannel) => void
}

/** 从其他 persist 仓库的原始数据里收集被引用过的源 id。
    设置在模块内最先创建，迁移时书架/历史可能尚未 rehydrate，故直接读 localStorage。 */
function collectReferencedSources(): Set<string> {
  const out = new Set<string>()
  const sourceOf = (key: unknown) => {
    if (typeof key !== 'string' || !key) return
    const i = key.indexOf(':')
    // 书架 v1 的裸 id 键全部来自 mangadex（当时只有它一个源）
    out.add(i > 0 ? key.slice(0, i) : 'mangadex')
  }
  try {
    const lib = JSON.parse(localStorage.getItem('mangastack-library') ?? 'null') as {
      state?: { subs?: Record<string, unknown> }
    } | null
    for (const k of Object.keys(lib?.state?.subs ?? {})) sourceOf(k)
    const his = JSON.parse(localStorage.getItem('mangastack-history') ?? 'null') as {
      state?: { items?: { mangaKey?: unknown; chapterKey?: unknown }[] }
    } | null
    for (const it of his?.state?.items ?? []) {
      sourceOf(it?.mangaKey)
      sourceOf(it?.chapterKey)
    }
  } catch {
    /* 存储损坏时按无引用处理，不阻断迁移 */
  }
  return out
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sourceConfigs: [],
      langs: ['zh', 'zh-hk'],
      ratings: ['safe', 'suggestive'],
      mode: 'vertical',
      dir: 'rtl',
      onlyAvailable: false,
      onlineEnabled: false,
      // 预发布安装默认尝鲜版（存量用户持久化值优先，persist 浅合并保住该默认）
      updateChannel: defaultUpdateChannel(),
      setTheme: (theme) => set({ theme }),
      // 注册表与 store 同源：先重建注册表再落盘，二者永不脱节
      //（与 main.tsx 的渲染前注册共用 applySourceConfigs，指纹幂等）
      setSourceConfigs: (cfgs) => {
        applySourceConfigs(cfgs)
        set({ sourceConfigs: cfgs })
      },
      upsertSourceConfig: (cfg) => {
        const old = get().sourceConfigs
        const i = old.findIndex((c) => c.id === cfg.id)
        const cfgs = i >= 0 ? old.map((c) => (c.id === cfg.id ? cfg : c)) : [...old, cfg]
        applySourceConfigs(cfgs)
        set({ sourceConfigs: cfgs })
      },
      removeSourceConfig: (id) => {
        const cfgs = get().sourceConfigs.filter((c) => c.id !== id)
        applySourceConfigs(cfgs)
        set({ sourceConfigs: cfgs })
      },
      toggleSourceConfig: (id) => {
        const cfgs = get().sourceConfigs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
        applySourceConfigs(cfgs)
        set({ sourceConfigs: cfgs })
      },
      updateSourceBase: (id, baseUrl) => {
        const cfgs = get().sourceConfigs.map((c) => (c.id === id ? { ...c, baseUrl } : c))
        applySourceConfigs(cfgs)
        set({ sourceConfigs: cfgs })
      },
      setLangs: (langs) => set({ langs }),
      setRatings: (ratings) => set({ ratings }),
      setMode: (mode) => set({ mode }),
      setDir: (dir) => set({ dir }),
      setOnlyAvailable: (onlyAvailable) => set({ onlyAvailable }),
      setOnlineEnabled: (onlineEnabled) => set({ onlineEnabled }),
      setUpdateChannel: (updateChannel) => set({ updateChannel }),
    }),
    {
      name: 'mangastack-settings',
      version: 6,
      migrate: (old: unknown, version: number) => {
        if (!old || typeof old !== 'object') return old
        let cur = old as Record<string, unknown>
        if (version < 4) {
          const o = cur as Record<string, unknown> & {
            source?: string
            copyBase?: string
            bzmhBase?: string
            customSources?: CustomRule[]
            enabledSources?: unknown
          }
          if (Array.isArray(o.enabledSources)) {
            // K3 v1.7 的 v3 → v4：enabledSources + source/copyBase/bzmhBase/customSources
            // 换算成 sourceConfigs。用户可能装着 K3 的 APK 直接覆盖升级，这条路径必须做。
            const enabled = o.enabledSources.filter((x): x is string => typeof x === 'string')
            const configs: SourceConfig[] = []
            for (const t of BUILTIN_TYPES) {
              if (!enabled.includes(t)) continue
              const savedBase = t === 'copymanga' ? o.copyBase : t === 'baozimh' ? o.bzmhBase : ''
              // baseUrl 缺省时驱动内部走默认线路
              configs.push({ id: t, name: BUILTIN_SOURCE_NAMES[t], type: t, enabled: true, ...(savedBase ? { baseUrl: savedBase } : {}) })
            }
            for (const r of Array.isArray(o.customSources) ? o.customSources : []) {
              if (!r || typeof r !== 'object' || !r.id || !r.name) continue
              // 自定义源保留原 id（复合键引用它），启用状态跟随旧 enabledSources
              configs.push({ id: r.id, name: r.name, type: 'custom', enabled: enabled.includes(r.id), baseUrl: r.baseUrl, rule: r })
            }
            const next: Record<string, unknown> = { ...o, sourceConfigs: configs }
            delete next.source
            delete next.copyBase
            delete next.bzmhBase
            delete next.customSources
            delete next.enabledSources
            cur = next
          } else if (!Array.isArray(o.sourceConfigs)) {
            // v2 及以下 → v4：四字段（source/copyBase/bzmhBase/customSources）合并为
            // sourceConfigs。只迁移「实际被引用过」的内置源（订阅/历史
            // 的复合键 + 旧当前源字段）；全新安装没有持久化数据，不触发迁移，天然零源。
            const referenced = collectReferencedSources()
            if (typeof o.source === 'string' && o.source) referenced.add(o.source)
            const configs: SourceConfig[] = []
            for (const t of BUILTIN_TYPES) {
              if (!referenced.has(t)) continue
              const savedBase = t === 'copymanga' ? o.copyBase : t === 'baozimh' ? o.bzmhBase : ''
              // baseUrl 缺省时驱动内部走默认线路
              configs.push({ id: t, name: BUILTIN_SOURCE_NAMES[t], type: t, enabled: true, ...(savedBase ? { baseUrl: savedBase } : {}) })
            }
            for (const r of Array.isArray(o.customSources) ? o.customSources : []) {
              if (!r || typeof r !== 'object' || !r.id || !r.name) continue
              // 自定义源保留原 id：复合键引用它
              configs.push({ id: r.id, name: r.name, type: 'custom', enabled: true, baseUrl: r.baseUrl, rule: r })
            }
            const next: Record<string, unknown> = { ...o, sourceConfigs: configs }
            delete next.source
            delete next.copyBase
            delete next.bzmhBase
            delete next.customSources
            cur = next
          }
          // 目标仓库 v3：已是 sourceConfigs schema，原样进入下一步
        }
        // v4 → v5：activeSource 概念已删除，丢弃该字段即可（无数据损失）
        delete cur.activeSource
        // v5 → v6：新增 onlineEnabled，存量用户置为开启以保持现状
        if (version < 6) cur.onlineEnabled = true
        return cur
      },
    }
  )
)

_setOnlineGate(useSettings.getState().onlineEnabled)
useSettings.subscribe((s) => _setOnlineGate(s.onlineEnabled))

/* ---------- Library (subscriptions) ----------

Unread model: `seenPublishAt` = publish time of the newest chapter the user
has READ. `unread` = count of feed chapters published after that timestamp.
All entities are keyed by composite key `${source}:${id}`. */

export interface Subscription {
  manga: NManga
  addedAt: number
  readChapterKeys: string[]
  lastReadChapterKey: string | null
  lastReadChapterName: string | null
  lastPage: number
  lastReadAt: number | null
  seenPublishAt: string | null
  latestLabel: string | null
  latestPublishAt: string | null
  unread: number
  checking?: boolean
}

function computeUnread(feed: NChapter[], seenPublishAt: string | null, readKeys: string[]): number {
  if (!seenPublishAt) return 0
  let n = 0
  for (const c of feed) {
    if (c.publishAt > seenPublishAt && !readKeys.includes(c.key)) n++
    if (c.publishAt <= seenPublishAt) break
  }
  return Math.min(n, 99)
}

interface LibraryState {
  subs: Record<string, Subscription>
  lastChecked: number
  subscribe: (m: NManga) => void
  unsubscribe: (key: string) => void
  removeSource: (sourceId: string) => number
  markRead: (mangaKey: string, ch: NChapter, page: number) => void
  syncFeed: (mangaKey: string, feed: NChapter[]) => void
  checkUpdates: (langs: string[]) => Promise<number>
  updateMangaSnapshot: (key: string, patch: Partial<NManga>) => void
  clearAll: () => void
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      subs: {},
      lastChecked: 0,
      subscribe: (m) =>
        set((s) => ({
          subs: {
            ...s.subs,
            [m.key]: {
              manga: m,
              addedAt: Date.now(),
              readChapterKeys: [],
              lastReadChapterKey: null,
              lastReadChapterName: null,
              lastPage: 0,
              lastReadAt: null,
              seenPublishAt: null,
              latestLabel: null,
              latestPublishAt: null,
              unread: 0,
            },
          },
        })),
      unsubscribe: (key) =>
        set((s) => {
          const subs = { ...s.subs }
          delete subs[key]
          return { subs }
        }),
      // 删源级联：复合键前缀匹配，返回删除条数
      removeSource: (sourceId) => {
        const prefix = `${sourceId}:`
        const keys = Object.keys(get().subs).filter((k) => k.startsWith(prefix))
        if (keys.length) {
          set((s) => ({
            subs: Object.fromEntries(Object.entries(s.subs).filter(([k]) => !k.startsWith(prefix))),
          }))
        }
        return keys.length
      },
      markRead: (mangaKey, ch, page) =>
        set((s) => {
          const sub = s.subs[mangaKey]
          if (!sub) return s
          const readChapterKeys = sub.readChapterKeys.includes(ch.key)
            ? sub.readChapterKeys
            : [...sub.readChapterKeys.slice(-400), ch.key]
          const seenPublishAt =
            !sub.seenPublishAt || ch.publishAt > sub.seenPublishAt ? ch.publishAt : sub.seenPublishAt
          return {
            subs: {
              ...s.subs,
              [mangaKey]: {
                ...sub,
                readChapterKeys,
                lastReadChapterKey: ch.key,
                lastReadChapterName: ch.name,
                lastPage: page,
                lastReadAt: Date.now(),
                seenPublishAt,
                unread: Math.max(0, sub.unread - (sub.readChapterKeys.includes(ch.key) ? 0 : 1)),
              },
            },
          }
        }),
      syncFeed: (mangaKey, feed) =>
        set((s) => {
          const sub = s.subs[mangaKey]
          if (!sub || !feed.length) return s
          const newest = feed[0]
          return {
            subs: {
              ...s.subs,
              [mangaKey]: {
                ...sub,
                latestLabel: chapterLabel(newest),
                latestPublishAt: newest.publishAt,
                unread: computeUnread(feed, sub.seenPublishAt, sub.readChapterKeys),
              },
            },
          }
        }),
      checkUpdates: async (langs) => {
        const { subs } = get()
        const keys = Object.keys(subs)
        if (!keys.length) return 0
        set((s) => ({
          subs: Object.fromEntries(Object.entries(s.subs).map(([k, v]) => [k, { ...v, checking: true }])),
        }))
        let totalNew = 0
        const results = await Promise.allSettled(
          keys.map((k) => {
            // 本地漫画不联网检查更新：直接返回空，下方统一复位 checking
            if (subs[k].manga.source === LOCAL_SOURCE_ID) return Promise.resolve([])
            const src = getSource(subs[k].manga.source)
            // 源已被删除/停用：跳过该条目（下方统一复位 checking）
            return src ? src.getChapters(subs[k].manga.id, langs) : Promise.reject(new Error('源已被移除'))
          })
        )
        set((s) => {
          const next = { ...s.subs }
          results.forEach((r, i) => {
            const k = keys[i]
            const sub = next[k]
            if (!sub) return
            if (r.status === 'fulfilled' && r.value.length) {
              const feed = r.value
              const unread = computeUnread(feed, sub.seenPublishAt, sub.readChapterKeys)
              totalNew += unread
              next[k] = {
                ...sub,
                checking: false,
                unread,
                latestLabel: chapterLabel(feed[0]),
                latestPublishAt: feed[0].publishAt,
              }
            } else {
              next[k] = { ...sub, checking: false }
            }
          })
          return { subs: next, lastChecked: Date.now() }
        })
        return totalNew
      },
      updateMangaSnapshot: (key, patch) =>
        set((s) => {
          const sub = s.subs[key]
          if (!sub) return s
          return { subs: { ...s.subs, [key]: { ...sub, manga: { ...sub.manga, ...patch } } } }
        }),
      clearAll: () => set({ subs: {}, lastChecked: 0 }),
    }),
    {
      name: 'mangastack-library',
      version: 2,
      migrate: (old: unknown, version: number) => {
        // v1 → v2: single-source keys become composite `mangadex:` keys
        if (version < 2 && old && typeof old === 'object') {
          const o = old as { subs?: Record<string, unknown>; lastChecked?: number }
          const subs: Record<string, unknown> = {}
          for (const [id, raw] of Object.entries(o.subs ?? {})) {
            const sub = raw as Record<string, never> & {
              manga: { id: string; coverFile: string | null; contentRating?: string } & Record<string, unknown>
              readChapterIds?: string[]
              lastReadChapterId?: string | null
              lastReadChapterNum?: string | null
            }
            const key = `mangadex:${id}`
            subs[key] = {
              ...sub,
              manga: {
                ...sub.manga,
                key,
                source: 'mangadex',
                cover: coverUrl(id, sub.manga.coverFile, 256),
                statusLabel: null,
                popularity: null,
                updatedAt: null,
              },
              readChapterKeys: (sub.readChapterIds ?? []).map((c) => `mangadex:${c}`),
              lastReadChapterKey: sub.lastReadChapterId ? `mangadex:${sub.lastReadChapterId}` : null,
              lastReadChapterName: sub.lastReadChapterNum ? `第 ${sub.lastReadChapterNum} 话` : null,
            }
          }
          return { subs, lastChecked: o.lastChecked ?? 0 }
        }
        return old
      },
    }
  )
)

/* ---------- History ---------- */

export interface HistoryItem {
  mangaKey: string
  mangaTitle: string
  cover: string | null
  chapterKey: string
  chapterLabel: string
  page: number
  at: number
}

interface HistoryState {
  items: HistoryItem[]
  push: (item: Omit<HistoryItem, 'at'>) => void
  remove: (chapterKey: string) => void
  removeSource: (sourceId: string) => number
  removeManga: (mangaKey: string) => void
  renameManga: (mangaKey: string, title: string) => void
  patchMangaCover: (mangaKey: string, cover: string) => void
  clear: () => void
}

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      push: (item) =>
        set((s) => ({
          items: [{ ...item, at: Date.now() }, ...s.items.filter((i) => i.chapterKey !== item.chapterKey)].slice(0, 200),
        })),
      remove: (chapterKey) => set((s) => ({ items: s.items.filter((i) => i.chapterKey !== chapterKey) })),
      // 删源级联：按 mangaKey 前缀匹配，返回删除条数
      removeSource: (sourceId) => {
        const prefix = `${sourceId}:`
        const n = get().items.filter((i) => i.mangaKey.startsWith(prefix)).length
        if (n) set((s) => ({ items: s.items.filter((i) => !i.mangaKey.startsWith(prefix)) }))
        return n
      },
      // 单部漫画级联：删除/重命名本地漫画时使用
      removeManga: (mangaKey) => set((s) => ({ items: s.items.filter((i) => i.mangaKey !== mangaKey) })),
      renameManga: (mangaKey, title) =>
        set((s) => ({ items: s.items.map((i) => (i.mangaKey === mangaKey ? { ...i, mangaTitle: title } : i)) })),
      // 旧记录写入时还没有封面字段：封面拿到后按漫画回填（只补空值，一次性自愈）
      patchMangaCover: (mangaKey, cover) =>
        set((s) =>
          s.items.some((i) => i.mangaKey === mangaKey && !i.cover)
            ? { items: s.items.map((i) => (i.mangaKey === mangaKey && !i.cover ? { ...i, cover } : i)) }
            : s
        ),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'mangastack-history',
      version: 2,
      migrate: (old: unknown, version: number) => {
        if (version < 2 && old && typeof old === 'object') {
          const o = old as { items?: Array<Record<string, unknown> & { mangaId: string; coverFile: string | null; chapterId: string }> }
          return {
            items: (o.items ?? []).map((i) => ({
              mangaKey: `mangadex:${i.mangaId}`,
              mangaTitle: i.mangaTitle,
              cover: coverUrl(i.mangaId, i.coverFile, 256),
              chapterKey: `mangadex:${i.chapterId}`,
              chapterLabel: i.chapterLabel,
              page: i.page,
              at: i.at,
            })),
          }
        }
        return old
      },
    }
  )
)
