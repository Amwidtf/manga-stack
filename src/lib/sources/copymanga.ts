// 站点驱动 —— 域名轮换频繁，baseUrl 由 SourceConfig 注入。
// API 契约逆向自官方 App：自定义请求头 `platform`/`version` + `?platform=1` 查询参数。
//
// 已工厂化：每个 SourceConfig 实例持有自己的 baseUrl / 缓存 / 换线状态，
// 断线自动换线成功后通过 onAutoSwitch 通知外层把新地址持久化回配置。

import type { BrowseQuery, BrowseResult, ChapterMeta, NChapter, NManga, Source } from './types'
import { makeKey } from './types'
import { decodeBase64 } from './codec'

const SOURCE = 'copymanga'
export const DEFAULT_COPY_BASE = decodeBase64('aHR0cHM6Ly9hcGkuY29weTQwMDAuY29t')

/** 已知 API 线路——4000（api.* 域名）是大陆可达线路，默认即它；
    www 域名走海外，作为备选。线路标签只作元数据，切换逻辑按探测结果为准 */
export const COPY_CANDIDATES: { base: string; label: string }[] = [
  { base: decodeBase64('aHR0cHM6Ly9hcGkuY29weTQwMDAuY29t'), label: '大陆线路（默认）' },
  { base: decodeBase64('aHR0cHM6Ly93d3cuY29weTIwLmNvbQ=='), label: '国际线路' },
]

/** probe one endpoint: real request against the list API */
export async function probeCopyApi(b: string): Promise<{ ok: boolean; ms: number; reason?: string }> {
  const t0 = Date.now()
  try {
    const res = await fetch(`${b}/api/v3/comics?limit=1&platform=1`, {
      headers: { platform: '1', version: VERSION },
    })
    const text = await res.text()
    if (!text.startsWith('{')) return { ok: false, ms: Date.now() - t0, reason: '返回的不是接口数据' }
    const j = JSON.parse(text)
    if (j.code === 210) return { ok: false, ms: Date.now() - t0, reason: '该网络被限制访问' }
    if (j.code !== 200) return { ok: false, ms: Date.now() - t0, reason: `接口错误 ${j.code}` }
    return { ok: true, ms: Date.now() - t0 }
  } catch {
    return { ok: false, ms: Date.now() - t0, reason: '连不上（被运营商拦截或域名已失效）' }
  }
}

export interface CopymangaOptions {
  baseUrl?: string
  onAutoSwitch?: (newBase: string) => void
}

const UA = 'COPY/2.3.9'
const VERSION = '2.3.9'

function parseNum(name: string): number {
  const m = name.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : -1
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normManga(c: any): NManga {
  return {
    key: makeKey(SOURCE, c.path_word),
    source: SOURCE,
    id: c.path_word,
    title: c.name,
    altTitles: [],
    cover: c.cover ?? null,
    author: (c.author || []).map((a: any) => a.name).join('、') || null,
    status: null,
    statusLabel: c.status?.display ?? null,
    year: null,
    description: c.brief ?? '',
    tags: (c.theme || []).map((t: any) => t?.name ?? t).filter(Boolean),
    popularity: c.popular ?? null,
    updatedAt: c.datetime_updated ? `${c.datetime_updated}T00:00:00Z` : null,
  }
}

function normChapter(c: any, mangaId: string): NChapter {
  return {
    key: makeKey(SOURCE, c.uuid),
    source: SOURCE,
    id: c.uuid,
    mangaId,
    num: parseNum(c.name || ''),
    name: c.name || '单篇',
    title: '',
    publishAt: c.datetime_created ? `${c.datetime_created}T00:00:00Z` : '',
    pages: c.size ?? 0,
    lang: 'zh',
    group: null,
  }
}

export function makeCopymanga(opts: CopymangaOptions = {}): Source {
  let base = (opts.baseUrl || DEFAULT_COPY_BASE).replace(/\/+$/, '')

  /** auto-failover: when the active base dies mid-session, probe the other known
      endpoints and hop to a working one, persisting via the options callback */
  let switching: Promise<boolean> | null = null
  async function tryAutoSwitch(failedBase: string): Promise<boolean> {
    if (!switching) {
      switching = (async () => {
        const candidates = [...COPY_CANDIDATES.map((c) => c.base), DEFAULT_COPY_BASE].filter((b) => b !== failedBase)
        for (const cand of candidates) {
          const r = await probeCopyApi(cand)
          if (r.ok) {
            base = cand
            opts.onAutoSwitch?.(cand)
            return true
          }
        }
        return false
      })().finally(() => {
        switching = null
      })
    }
    return switching
  }

  async function api<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    // the upstream occasionally drops/throttles requests; retry, then fail over
    // to another known endpoint if this network blocks the active one entirely
    let lastErr: Error | null = null
    let switched = false
    for (let round = 0; round < 2; round++) {
      const url = new URL(base + path)
      url.searchParams.set('platform', '1')
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 800))
        try {
          const res = await fetch(url.toString(), {
            headers: { platform: '1', version: VERSION, 'User-Agent': UA },
          })
          const text = await res.text()
          // blocked clients get an HTML "服務器升級中" page instead of JSON
          if (!res.ok || !text.startsWith('{')) throw new Error(`拷贝漫画源响应异常 (${res.status})`)
          const json = JSON.parse(text)
          if (json.code === 210) throw new Error('拷贝漫画提示：该网络被限制访问，请更换网络或稍后再试')
          if (json.code !== 200) throw new Error(json.message || `拷贝漫画源错误 (${json.code})`)
          return json.results as T
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e))
          // explicit "network restricted" blocks won't heal by retrying
          if (lastErr.message.includes('被限制访问')) break
        }
      }
      // whole endpoint unreachable → hop to the mainland line / another mirror once
      if (!switched && (await tryAutoSwitch(base))) {
        switched = true
        continue
      }
      break
    }
    throw lastErr ?? new Error('拷贝漫画源请求失败')
  }

  // in-memory cache: list/search results seed detail pages, so the app works
  // even when the detail endpoint is region-blocked for this network
  const mangaCache = new Map<string, NManga>()

  return {
    id: SOURCE,
    name: '拷贝漫画',
    orders: [
      { key: '-popular', label: '人气' },
      { key: '-datetime_updated', label: '最新' },
    ],
    supportsTags: false,
    supportsStats: false,

    async browse(q: BrowseQuery): Promise<BrowseResult> {
      if (q.q) {
        const r = await api<any>('/api/v3/search/comic', { limit: q.limit, offset: q.offset, q: q.q, q_type: '' })
        const items = (r.list || []).map(normManga)
        items.forEach((m: NManga) => mangaCache.set(m.id, m))
        return { items, total: r.total ?? 0 }
      }
      const r = await api<any>('/api/v3/comics', { limit: q.limit, offset: q.offset, ordering: q.order })
      const items = (r.list || []).map(normManga)
      items.forEach((m: NManga) => mangaCache.set(m.id, m))
      return { items, total: r.total ?? 0 }
    },

    async getManga(id: string): Promise<NManga> {
      try {
        const r = await api<any>(`/api/v3/comic/${id}`)
        const c = r.comic || r
        const m = normManga({ ...mangaCache.get(id), ...c })
        mangaCache.set(id, m)
        return m
      } catch {
        // detail endpoint is occasionally region-blocked; fall back to the cached
        // list record so chapters remain readable
        const cached = mangaCache.get(id)
        if (cached) return cached
        return normManga({ path_word: id, name: id })
      }
    },

    async getChapters(mangaId: string): Promise<NChapter[]> {
      const all: NChapter[] = []
      const limit = 500
      for (let offset = 0; offset < 4000; offset += limit) {
        const r = await api<any>(`/api/v3/comic/${mangaId}/group/default/chapters`, { limit, offset })
        const list = (r.list || []).map((c: any) => normChapter(c, mangaId))
        all.push(...list)
        if (list.length < limit) break
      }
      return all.sort((a, b) => {
        const d = b.num - a.num
        return d !== 0 ? d : b.publishAt.localeCompare(a.publishAt)
      })
    },

    async getChapterMeta(chapterId: string, mangaId?: string): Promise<ChapterMeta> {
      if (!mangaId) throw new Error('缺少漫画标识')
      const r = await api<any>(`/api/v3/comic/${mangaId}/chapter/${chapterId}`)
      const ch = r.chapter
      const comic = r.comic
      return {
        chapter: normChapter(ch, comic.path_word),
        mangaId: comic.path_word,
        mangaTitle: comic.name,
        cover: mangaCache.get(comic.path_word)?.cover ?? null,
      }
    },

    async getPages(ch: NChapter): Promise<string[]> {
      const r = await api<any>(`/api/v3/comic/${ch.mangaId}/chapter/${ch.id}`)
      if (r.is_lock) throw new Error('该章节已上锁，需要在拷贝漫画官方 App 内解锁')
      const contents: any[] = r.chapter?.contents || []
      const words: number[] = r.chapter?.words || []
      if (!contents.length) throw new Error('该章节暂无可读页面')
      if (words.length === contents.length) {
        const ordered = new Array(contents.length)
        contents.forEach((c: any, i: number) => {
          ordered[words[i]] = c.url
        })
        return ordered.filter(Boolean)
      }
      return contents.map((c: any) => c.url).filter(Boolean)
    },
  }
}
