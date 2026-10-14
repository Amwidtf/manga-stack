// HTML 解析型站点驱动。
//
// The site serves plain HTML (Vue SSR), so everything is parsed with
// DOMParser — no JSON API needed. The brand runs on a family of rotating
// mirror domains; we ship several candidates, let the user probe them from
// settings, and auto-hop to a working mirror when the current one dies
// mid-session.
//
// 已工厂化：每个 SourceConfig 实例持有自己的 baseUrl / 详情缓存 / 换线状态，
// 断线自动换线成功后通过 onAutoSwitch 通知外层把新地址持久化回配置。
//
// URL anatomy (verified 2026-10):
//   list   / (hot sections)  ·  /list/new (latest)  ·  /search?q=
//   detail /comic/{slug}                — may 302 to a suffixed slug
//   chapters listed inline: /user/page_direct?comic_id={slug}&section_slot={s}&chapter_slot={c}
//   reader /comic/chapter/{slug}/{s}_{c}.html  — long chapters split into
//          parts {s}_{c}_{part}.html; images live on a separate CDN domain (parse, never guess)

import { httpGetText, parseHtml } from '../http'
import { makeKey, type NChapter, type NManga, type Source, type BrowseQuery, type BrowseResult, type ChapterMeta } from './types'
import { decodeBase64 } from './codec'

export const BZMH_CANDIDATES = [
  { base: decodeBase64('aHR0cHM6Ly9jbi53ZWJtb3RhLmNvbQ=='), label: '大陆线路（默认）' },
  { base: decodeBase64('aHR0cHM6Ly9tLmJhb3ppbWgub25l'), label: '备用线路' },
  { base: decodeBase64('aHR0cHM6Ly93d3cuYmFvemltaC5jb20='), label: '国际线路' },
]

export async function probeBzmh(b: string): Promise<{ ok: boolean; ms: number; reason?: string }> {
  const t0 = Date.now()
  try {
    const r = await httpGetText(`${b}/list/new`, {}, 10000)
    return { ok: r.text.includes('comics-card') || r.status === 200, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, reason: e instanceof Error ? e.message : '连接失败' }
  }
}

export interface BaozimhOptions {
  baseUrl?: string
  onAutoSwitch?: (newBase: string) => void
}

/* ---------- parsing helpers ---------- */

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function slugFromUrl(u: string): string {
  const m = u.match(/\/comic\/([^/?#]+)/)
  return m ? m[1] : ''
}

interface Card {
  slug: string
  title: string
  author: string
  cover: string
  latest: string
}

function parseCards(doc: Document): Card[] {
  const out: Card[] = []
  const seen = new Set<string>()
  doc.querySelectorAll('.comics-card').forEach((card) => {
    const a = card.querySelector('a.comics-card__poster')
    const href = a?.getAttribute('href') ?? ''
    const slug = slugFromUrl(href)
    if (!slug || seen.has(slug)) return
    seen.add(slug)
    const img = card.querySelector('amp-img')
    const cover = (img?.getAttribute('src') ?? '').replace(/&amp;/g, '&')
    out.push({
      slug,
      title: text(card.querySelector('.comics-card__title')),
      author: text(card.querySelector('small.tags')),
      cover: cover.includes('default_cover') ? '' : cover,
      latest: text(card.querySelector('.chapter')),
    })
  })
  return out
}

function cardToManga(c: Card): NManga {
  return {
    key: makeKey('baozimh', c.slug),
    source: 'baozimh',
    id: c.slug,
    title: c.title,
    altTitles: [],
    cover: c.cover || null,
    author: c.author || null,
    status: null,
    statusLabel: null,
    year: null,
    description: '',
    tags: [],
    popularity: null,
    updatedAt: null,
  }
}

interface DetailCache {
  manga: NManga
  chapters: NChapter[]
  at: number
}

const STATUS_MAP: [RegExp, string][] = [
  [/完结|已完/, 'completed'],
  [/连载/, 'ongoing'],
  [/休刊/, 'hiatus'],
]

interface HttpTextLike {
  text: string
  url: string
}

export function makeBaozimh(opts: BaozimhOptions = {}): Source {
  let base = (opts.baseUrl || BZMH_CANDIDATES[0].base).replace(/\/+$/, '')
  const detailCache = new Map<string, DetailCache>()

  // one auto-switch flight at a time
  let switching: Promise<void> | null = null
  async function tryAutoSwitch(failedBase: string): Promise<void> {
    if (!switching) {
      switching = (async () => {
        for (const c of BZMH_CANDIDATES) {
          if (c.base === failedBase) continue
          const p = await probeBzmh(c.base)
          if (p.ok) {
            base = c.base
            opts.onAutoSwitch?.(c.base)
            return
          }
        }
        throw new Error('所有包子漫画线路都连不上，请稍后再试或手动切换线路')
      })().finally(() => {
        switching = null
      })
    }
    return switching
  }

  /** fetch with one retry, then one mirror hop */
  async function api(path: string): Promise<HttpTextLike> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await httpGetText(`${base}${path}`)
      } catch {
        await new Promise((r) => setTimeout(r, 700))
      }
    }
    await tryAutoSwitch(base)
    return httpGetText(`${base}${path}`)
  }

  async function loadDetail(slug: string): Promise<DetailCache> {
    const hit = detailCache.get(slug)
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit

    const r = await api(`/comic/${slug}`)
    const doc = parseHtml(r.text)
    // the server may 302 to a versioned slug — keep the real one, reader URLs need it
    const realSlug = slugFromUrl(r.url) || slug

    const title = text(doc.querySelector('.comics-detail__title'))
    if (!title) throw new Error('详情解析失败，该源页面结构可能已变更')
    const author = text(doc.querySelector('.comics-detail__author'))
    const desc = text(doc.querySelector('.comics-detail__desc'))
    const coverEl = doc.querySelector('.de-info amp-img, .comics-detail amp-img, amp-img')
    let cover = (coverEl?.getAttribute('src') ?? '').replace(/&amp;/g, '&')
    if (cover.includes('default_cover')) cover = ''
    const tags = [...doc.querySelectorAll('.tag-list span, .tag-list a, .comics-detail .tag')]
      .map((t) => text(t))
      .filter(Boolean)
    const statusLabel = tags.find((t) => STATUS_MAP.some(([re]) => re.test(t))) ?? null
    const status = statusLabel ? STATUS_MAP.find(([re]) => re.test(statusLabel))![1] : null
    const updated = r.text.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] ?? null

    const manga: NManga = {
      key: makeKey('baozimh', realSlug),
      source: 'baozimh',
      id: realSlug,
      title,
      altTitles: [],
      cover: cover || null,
      author: author || null,
      status,
      statusLabel,
      year: null,
      description: desc,
      tags: tags.filter((t) => t !== statusLabel).slice(0, 12),
      popularity: null,
      updatedAt: updated,
    }

    const chapters: NChapter[] = []
    doc.querySelectorAll('#chapter-items a.comics-chapters__item, a.comics-chapters__item').forEach((a) => {
      const href = a.getAttribute('href') ?? ''
      const s = href.match(/section_slot=(\d+)/)?.[1] ?? '0'
      const c = href.match(/chapter_slot=(\d+)/)?.[1]
      if (c == null) return
      const name = text(a)
      const num = Number(name.match(/第\s*([\d.]+)\s*[话話章回]/)?.[1] ?? Number(c))
      chapters.push({
        key: makeKey('baozimh', `${realSlug}__${s}_${c}`),
        source: 'baozimh',
        id: `${realSlug}__${s}_${c}`,
        mangaId: realSlug,
        num: Number.isFinite(num) ? num : -1,
        name,
        title: '',
        publishAt: updated ?? '',
        pages: 0,
        lang: 'zh',
        group: null,
      })
    })
    // page lists ascending — the app expects newest first
    chapters.reverse()

    const entry = { manga, chapters, at: Date.now() }
    detailCache.set(realSlug, entry)
    if (realSlug !== slug) detailCache.set(slug, entry)
    return entry
  }

  return {
    id: 'baozimh',
    name: '包子漫画',
    orders: [
      { key: 'hot', label: '人气热门' },
      { key: 'new', label: '最新上架' },
    ],
    supportsTags: false,
    supportsStats: false,

    async browse(q: BrowseQuery): Promise<BrowseResult> {
      if (q.offset > 0) return { items: [], total: 0 }
      let path: string
      if (q.q) path = `/search?q=${encodeURIComponent(q.q)}`
      else if (q.order === 'new') path = '/list/new'
      else path = '/'
      const r = await api(path)
      const items = parseCards(parseHtml(r.text)).map(cardToManga).slice(0, 60)
      return { items, total: items.length }
    },

    async getManga(id: string): Promise<NManga> {
      return (await loadDetail(id)).manga
    },

    async getChapters(mangaId: string): Promise<NChapter[]> {
      return (await loadDetail(mangaId)).chapters
    },

    async getChapterMeta(chapterId: string, mangaId?: string): Promise<ChapterMeta> {
      const slug = chapterId.includes('__') ? chapterId.split('__')[0] : mangaId
      if (!slug) throw new Error('缺少漫画标识，无法定位章节')
      const d = await loadDetail(slug)
      const chapter = d.chapters.find((c) => c.id === chapterId || c.id.endsWith(`__${chapterId}`))
      if (!chapter) throw new Error('章节不存在或已下线')
      return { chapter, mangaId: d.manga.id, mangaTitle: d.manga.title, cover: d.manga.cover }
    },

    async getPages(ch: NChapter): Promise<string[]> {
      const slug = ch.mangaId
      const pair = ch.id.split('__')[1] ?? ch.id
      const imgs: string[] = []
      const seen = new Set<string>()
      let path = `/comic/chapter/${slug}/${pair}.html`
      // long chapters are split across {s}_{c}_{part}.html pages — walk the chain
      for (let part = 0; part < 12; part++) {
        const r = await api(path)
        const doc = parseHtml(r.text)
        let added = 0
        doc.querySelectorAll('amp-img, img').forEach((im) => {
          const src = (im.getAttribute('src') ?? '').replace(/&amp;/g, '&')
          if (!src || !new RegExp(decodeBase64('YnpjZG5cLm5ldHxiYW96aW1ofHdlYm1vdGF8Y3ptYW5nYQ=='), 'i').test(src)) return
          if (!/scomic|\/comic\//i.test(src)) return
          if (seen.has(src)) return
          seen.add(src)
          imgs.push(src)
          added++
        })
        if (!added && part === 0 && imgs.length === 0) throw new Error('没有解析到图片，该源页面结构可能已变更')
        const nextHref = [...doc.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href') ?? '')
          .find((h) => new RegExp(`/comic/chapter/[^/]+/${pair}_${part + 2}\\.html`).test(h))
        if (!nextHref) break
        path = nextHref.startsWith('http') ? nextHref.replace(/^https?:\/\/[^/]+/, '') : nextHref
      }
      if (!imgs.length) throw new Error('没有解析到图片')
      return imgs
    },
  }
}
