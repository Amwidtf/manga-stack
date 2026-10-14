// Generic rule-driven comic source. A CustomRule describes a JSON-API comic
// site declaratively (URL templates + field paths), and this module turns the
// rule into a full Source implementation. Inspired by the "图源规则" approach
// of reader apps: add a source without shipping a new app version.

import type { BrowseQuery, BrowseResult, ChapterMeta, NChapter, NManga, Source } from './types'
import { makeKey } from './types'
import { httpGetText } from '../http'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FieldMap {
  url: string
  items?: string
  root?: string
  id?: string
  title?: string
  cover?: string
  author?: string
  description?: string
  status?: string
  updated?: string
  name?: string
  date?: string
  size?: string
  image?: string
  order?: string
  imageTemplate?: string
}

export interface CustomRule {
  id: string // sanitized slug, no ':'
  name: string
  baseUrl: string
  headers?: Record<string, string>
  list: FieldMap // url supports {limit} {offset} {base}
  search?: FieldMap // url additionally supports {keyword}; field paths fall back to list
  detail?: FieldMap // url supports {id}; falls back to cached list record on failure
  chapters: FieldMap // url supports {id} {limit} {offset}
  pages: FieldMap // url supports {mangaId} {chapterId}
  ascending?: boolean // chapters arrive oldest-first
}

/* ---------- tiny path extractor ----------
   Supports: "a.b.c", "a.list[0]", "a.author[].name" (map over arrays). */

function extractEach(objs: any[], path?: string): any[] {
  if (!path) return []
  let cur = objs
  for (const seg of path.split('.')) {
    const m = seg.match(/^([^[\]]*)(\[(\d*)\])?$/)
    if (!m) return []
    const [, key, , idx] = m
    const next: any[] = []
    for (const item of cur) {
      const v = key ? item?.[key] : item
      if (idx !== undefined) {
        if (!Array.isArray(v)) continue
        if (idx === '') next.push(...v)
        else if (v[+idx] !== undefined) next.push(v[+idx])
      } else if (v !== undefined && v !== null) next.push(v)
    }
    cur = next
  }
  return cur
}

function extractOne(obj: any, path?: string): any {
  const r = extractEach([obj], path)
  return r.length ? r[0] : undefined
}

function extractList(obj: any, path?: string): any[] {
  if (!path) return []
  // try direct: path resolves to an array
  const segs = path.split('.')
  const lastMap = segs[segs.length - 1].endsWith('[]')
  const got = extractEach([obj], path)
  if (lastMap) return got
  const one = extractOne(obj, path)
  if (Array.isArray(one)) return one
  return got
}

function asText(v: any): string | null {
  if (v === undefined || v === null) return null
  if (Array.isArray(v)) return v.filter(Boolean).join('、') || null
  return String(v)
}

/* ---------- url templating ---------- */

function tpl(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k]
    if (v === undefined) return ''
    return k === 'base' ? String(v) : encodeURIComponent(String(v))
  })
}

/** image url composition: {value}=extracted item, {base}=rule base, {json.path}=field from the pages response */
function fillImageTemplate(t: string, value: string, json: any, base: string): string {
  return t.replace(/\{([\w.[\]]+)\}/g, (_, k) => {
    if (k === 'value') return encodeURI(value)
    if (k === 'base') return base
    if (k.startsWith('json.')) return String(extractOne(json, k.slice(5)) ?? '')
    return ''
  })
}

function abs(base: string, u: any): string | null {
  if (!u) return null
  const s = String(u)
  if (/^https?:\/\//.test(s)) return s
  return base.replace(/\/+$/, '') + (s.startsWith('/') ? s : `/${s}`)
}

/* ---------- validation (used by Settings UI) ---------- */

export function validateRule(raw: any): { ok: boolean; errors: string[]; rule?: CustomRule } {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['不是合法的 JSON 对象'] }
  if (!raw.name || typeof raw.name !== 'string') errors.push('缺少 name（源名称）')
  if (!raw.baseUrl || !/^https?:\/\//.test(raw.baseUrl)) errors.push('baseUrl 必须是 http(s) 地址')
  if (!raw.list?.url) errors.push('缺少 list.url（列表接口模板）')
  if (!raw.list?.items) errors.push('缺少 list.items（列表数组路径）')
  if (!raw.list?.id) errors.push('缺少 list.id（漫画 ID 字段）')
  if (!raw.list?.title) errors.push('缺少 list.title（标题字段）')
  if (!raw.chapters?.url) errors.push('缺少 chapters.url（章节接口模板，需含 {id}）')
  if (!raw.chapters?.items) errors.push('缺少 chapters.items（章节数组路径）')
  if (!raw.pages?.url) errors.push('缺少 pages.url（图片接口模板，需含 {chapterId}）')
  if (!raw.pages?.items) errors.push('缺少 pages.items（图片数组路径）')
  if (errors.length) return { ok: false, errors }
  const id = String(raw.id || raw.name)
    .toLowerCase()
    .replace(/[^a-z0-9一-龥-]+/g, '-')
    .replace(/[:]/g, '-')
    .slice(0, 24)
  const rule: CustomRule = {
    ...raw,
    id: `c-${id}-${Date.now().toString(36)}`,
    baseUrl: String(raw.baseUrl).replace(/\/+$/, ''),
  }
  return { ok: true, errors: [], rule }
}

/* ---------- example rule shipped in the Settings UI ----------
   中性占位示例：域名是假的，仅演示字段形状；导入后需替换为真实站点。 */

export const EXAMPLE_RULE = {
  name: '示例·JSON API 站点',
  baseUrl: 'https://api.example.com',
  headers: { accept: 'application/json' },
  list: {
    url: '/api/books?limit={limit}&offset={offset}',
    items: 'data.items',
    id: 'slug',
    title: 'title',
    cover: 'cover',
    author: 'authors[].name',
    description: 'brief',
    updated: 'updated_at',
  },
  search: {
    url: '/api/books?limit={limit}&offset={offset}&q={keyword}',
  },
  detail: { url: '/api/books/{id}', root: 'data' },
  chapters: {
    url: '/api/books/{id}/chapters?limit=500&offset={offset}',
    items: 'data.items',
    id: 'uuid',
    name: 'title',
    date: 'created_at',
    size: 'page_count',
  },
  pages: {
    url: '/api/books/{mangaId}/chapters/{chapterId}/pages',
    items: 'data.pages',
    image: 'url',
    order: 'data.words',
  },
}

/* ---------- the engine ---------- */

function parseNum(name: string): number {
  const m = name.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : -1
}

export function makeCustomSource(rule: CustomRule): Source {
  const sid = rule.id
  const mangaCache = new Map<string, NManga>()
  const chapterCache = new Map<string, NChapter>()

  async function api(path: string, vars: Record<string, string | number>): Promise<any> {
    const url = rule.baseUrl + tpl(path, { ...vars })
    let lastErr: Error | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800))
      try {
        // 统一走 http.ts 双通道：APK 内经原生通道请求，不受 WebView CORS 限制
        const { text } = await httpGetText(url, rule.headers ?? {})
        if (!text.startsWith('{') && !text.startsWith('[')) {
          throw new Error(`${rule.name} 响应异常（返回的不是接口数据）`)
        }
        return JSON.parse(text)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
    throw lastErr ?? new Error(`${rule.name} 请求失败`)
  }

  function normManga(c: any, fm: FieldMap): NManga {
    return {
      key: makeKey(sid, String(extractOne(c, fm.id))),
      source: sid,
      id: String(extractOne(c, fm.id)),
      title: asText(extractOne(c, fm.title)) ?? '未命名',
      altTitles: [],
      cover: abs(rule.baseUrl, extractOne(c, fm.cover)),
      author: asText(extractEach([c], fm.author ?? '')),
      status: null,
      statusLabel: asText(extractOne(c, fm.status)),
      year: null,
      description: asText(extractOne(c, fm.description)) ?? '',
      tags: [],
      popularity: null,
      updatedAt: asText(extractOne(c, fm.updated)),
    }
  }

  function normChapter(c: any, mangaId: string): NChapter {
    const fm = rule.chapters
    const name = asText(extractOne(c, fm.name)) ?? '单篇'
    return {
      key: makeKey(sid, String(extractOne(c, fm.id))),
      source: sid,
      id: String(extractOne(c, fm.id)),
      mangaId,
      num: parseNum(name),
      name,
      title: '',
      publishAt: asText(extractOne(c, fm.date)) ?? '',
      pages: Number(extractOne(c, fm.size)) || 0,
      lang: 'zh',
      group: null,
    }
  }

  async function listItems(fm: FieldMap, vars: Record<string, string | number>): Promise<{ raw: any[]; total: number }> {
    const json = await api(fm.url, vars)
    const root = fm.root ? extractOne(json, fm.root) ?? json : json
    const raw = extractList(root ?? json, fm.items) // items path may be absolute from root json
    const items = raw.length ? raw : extractList(json, fm.items)
    const total = Number(extractOne(json, 'results.total')) || items.length
    return { raw: items, total }
  }

  return {
    id: sid,
    name: rule.name,
    orders: [{ key: 'default', label: '默认' }],
    supportsTags: false,
    supportsStats: false,

    async browse(q: BrowseQuery): Promise<BrowseResult> {
      const useSearch = !!q.q && !!rule.search?.url
      const fm: FieldMap = { ...rule.list, ...(useSearch ? rule.search : {}) }
      const { raw, total } = await listItems(fm, {
        limit: q.limit,
        offset: q.offset,
        keyword: q.q ?? '',
      })
      let items = raw.map((c) => normManga(c, fm)).filter((m) => m.id && m.id !== 'undefined')
      // client-side filter when the site has no search endpoint
      if (q.q && !rule.search?.url) {
        const k = q.q.toLowerCase()
        items = items.filter((m) => m.title.toLowerCase().includes(k))
      }
      items.forEach((m) => mangaCache.set(m.id, m))
      return { items, total }
    },

    async getManga(id: string): Promise<NManga> {
      if (rule.detail?.url) {
        try {
          const json = await api(rule.detail.url, { id })
          const root = rule.detail.root ? extractOne(json, rule.detail.root) ?? json : json
          const fm: FieldMap = { ...rule.list, ...rule.detail }
          const m = normManga({ ...mangaCache.get(id), ...root }, fm)
          mangaCache.set(id, m)
          return m
        } catch {
          /* detail blocked/failed → cached record below */
        }
      }
      const cached = mangaCache.get(id)
      if (cached) return cached
      return normManga({ [rule.list.id ?? 'id']: id, [rule.list.title ?? 'title']: id }, rule.list)
    },

    async getChapters(mangaId: string): Promise<NChapter[]> {
      const all: NChapter[] = []
      const limit = Number(rule.chapters.url.match(/limit=(\d+)/)?.[1]) || 500
      for (let offset = 0; offset < 4000; offset += limit) {
        const json = await api(rule.chapters.url, { id: mangaId, limit, offset })
        const raw = extractList(json, rule.chapters.items)
        const list = raw.map((c) => normChapter(c, mangaId)).filter((c) => c.id && c.id !== 'undefined')
        all.push(...list)
        if (list.length < limit || !rule.chapters.url.includes('{offset}')) break
      }
      all.forEach((c) => chapterCache.set(c.id, c))
      return all.sort((a, b) => {
        const d = b.num - a.num
        return d !== 0 ? d : b.publishAt.localeCompare(a.publishAt)
      })
    },

    async getChapterMeta(chapterId: string, mangaId?: string): Promise<ChapterMeta> {
      if (!mangaId) throw new Error('缺少漫画标识')
      let ch = chapterCache.get(chapterId)
      if (!ch) {
        await this.getChapters(mangaId)
        ch = chapterCache.get(chapterId)
      }
      if (!ch) throw new Error('未找到该章节')
      let manga = mangaCache.get(mangaId)
      if (!manga) manga = await this.getManga(mangaId)
      return { chapter: ch, mangaId, mangaTitle: manga.title, cover: manga.cover }
    },

    async getPages(ch: NChapter): Promise<string[]> {
      const json = await api(rule.pages.url, { mangaId: ch.mangaId, chapterId: ch.id })
      const contents = extractList(json, rule.pages.items)
      if (!contents.length) throw new Error('该章节暂无可读页面')
      const t = rule.pages.imageTemplate
      const urls = contents
        .map((c) => {
          const v = rule.pages.image ? extractOne(c, rule.pages.image) : c
          if (v === undefined || v === null) return null
          return t ? fillImageTemplate(t, String(v), json, rule.baseUrl) : abs(rule.baseUrl, v)
        })
        .filter(Boolean) as string[]
      const order = rule.pages.order ? extractList(json, rule.pages.order).map(Number) : []
      if (order.length === urls.length && order.every((n) => Number.isFinite(n))) {
        const ordered = new Array(urls.length)
        urls.forEach((u, i) => {
          ordered[order[i]] = u
        })
        return ordered.filter(Boolean)
      }
      return urls
    },
  }
}
