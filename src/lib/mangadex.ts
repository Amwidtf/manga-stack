// MangaDex API client — public, free, CORS-enabled manga data source.
// Docs: https://api.mangadex.org/docs/

const API = 'https://api.mangadex.org'
const COVERS = 'https://uploads.mangadex.org/covers'

export interface MangaSummary {
  id: string
  title: string
  altTitles: string[]
  coverFile: string | null
  author: string | null
  status: string | null
  year: number | null
  description: string
  tags: string[]
  contentRating: string
  lastChapter: string | null
}

export interface Chapter {
  id: string
  chapter: string | null
  volume: string | null
  title: string
  publishAt: string
  pages: number
  lang: string
  group: string | null
  external: boolean
}

export interface Tag {
  id: string
  name: string
  group: string
}

async function api<T>(path: string, params: Record<string, string | string[] | number | undefined> = {}): Promise<T> {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x))
    else url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`MangaDex ${res.status}`)
  return res.json() as Promise<T>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function pickTitle(t: Record<string, string>): string {
  if (!t) return '未命名'
  return t['zh-ro'] || t['zh'] || t['zh-hk'] || t.en || t.ja || Object.values(t)[0] || '未命名'
}

function flattenAlts(alts: any[] = []): string[] {
  const out: string[] = []
  for (const a of alts) {
    for (const v of Object.values(a as Record<string, string>)) {
      if (typeof v === 'string' && !out.includes(v)) out.push(v)
    }
  }
  return out
}

function parseManga(m: any): MangaSummary {
  const rel = m.relationships || []
  const cover = rel.find((r: any) => r.type === 'cover_art')
  const author = rel.find((r: any) => r.type === 'author')
  const a = m.attributes
  return {
    id: m.id,
    title: pickTitle(a.title),
    altTitles: flattenAlts(a.altTitles).slice(0, 6),
    coverFile: cover?.attributes?.fileName ?? null,
    author: author?.attributes?.name ?? null,
    status: a.status ?? null,
    year: a.year ?? null,
    description: a.description?.zh || a.description?.en || a.description?.ja || Object.values(a.description || {})[0] || '',
    tags: (a.tags || []).map((t: any) => t.attributes?.name?.en).filter(Boolean),
    contentRating: a.contentRating ?? 'safe',
    lastChapter: a.lastChapter || null,
  }
}

export function coverUrl(mangaId: string, file: string | null, size: 256 | 512 = 256): string | null {
  if (!file) return null
  return `${COVERS}/${mangaId}/${file}.${size}.jpg`
}

export interface BrowseParams {
  title?: string
  order?: string
  offset?: number
  limit?: number
  ratings?: string[]
  langs?: string[]
  onlyAvailable?: boolean
  includedTags?: string[]
}

export async function browseManga(p: BrowseParams): Promise<{ items: MangaSummary[]; total: number }> {
  const params: Record<string, string | string[] | number> = {
    limit: p.limit ?? 24,
    offset: p.offset ?? 0,
    'includes[]': ['cover_art', 'author'],
    'contentRating[]': p.ratings && p.ratings.length ? p.ratings : ['safe', 'suggestive'],
    hasAvailableChapters: 'true',
  }
  if (p.title) params.title = p.title
  if (p.order) params[p.order] = 'desc'
  else params['order[followedCount]'] = 'desc'
  if (p.onlyAvailable && p.langs?.length) params['availableTranslatedLanguage[]'] = p.langs
  if (p.includedTags?.length) params['includedTags[]'] = p.includedTags
  const d = await api<any>('/manga', params)
  return { items: (d.data || []).map(parseManga), total: d.total ?? 0 }
}

export async function getManga(id: string): Promise<MangaSummary> {
  const d = await api<any>(`/manga/${id}`, { 'includes[]': ['cover_art', 'author', 'artist'] })
  return parseManga(d.data)
}

export async function getMangaStats(id: string): Promise<{ rating: number | null; follows: number | null }> {
  try {
    const d = await api<any>(`/statistics/manga/${id}`)
    const s = d.statistics?.[id]
    return { rating: s?.rating?.average ?? null, follows: s?.follows ?? null }
  } catch {
    return { rating: null, follows: null }
  }
}

function parseChapter(c: any): Chapter {
  const a = c.attributes
  return {
    id: c.id,
    chapter: a.chapter ?? null,
    volume: a.volume ?? null,
    title: a.title || '',
    publishAt: a.publishAt,
    pages: a.pages ?? 0,
    lang: a.translatedLanguage ?? 'en',
    group: (c.relationships || []).find((r: any) => r.type === 'scanlation_group')?.attributes?.name ?? null,
    external: !!a.externalUrl,
  }
}

export function chapterNum(c: Chapter): number {
  const n = parseFloat(c.chapter ?? '')
  return Number.isFinite(n) ? n : -1
}

export async function getFeed(mangaId: string, langs: string[]): Promise<Chapter[]> {
  const base: Record<string, string | string[] | number> = {
    limit: 500,
    'order[volume]': 'desc',
    'order[chapter]': 'desc',
    'includes[]': ['scanlation_group'],
    'contentRating[]': ['safe', 'suggestive', 'erotica', 'pornographic'],
  }
  let d = await api<any>(`/manga/${mangaId}/feed`, langs.length ? { ...base, 'translatedLanguage[]': langs } : base)
  let list: any[] = d.data || []
  // fallback: no chapters in preferred languages → take any language
  if (list.length === 0 && langs.length) {
    d = await api<any>(`/manga/${mangaId}/feed`, base)
    list = d.data || []
  }
  const chapters = list.map(parseChapter).filter((c) => !c.external && c.pages > 0)
  // dedupe same chapter+language from multiple groups, keep the one with most pages
  const seen = new Map<string, Chapter>()
  for (const c of chapters) {
    const key = `${c.lang}:${c.chapter ?? 'oneshot'}:${c.title.slice(0, 12)}`
    const prev = seen.get(key)
    if (!prev || c.pages > prev.pages) seen.set(key, c)
  }
  return [...seen.values()].sort((a, b) => {
    const d = chapterNum(b) - chapterNum(a)
    return d !== 0 ? d : b.publishAt.localeCompare(a.publishAt)
  })
}

export async function getChapter(id: string): Promise<Chapter & { mangaId: string; mangaTitle: string }> {
  const d = await api<any>(`/chapter/${id}`, { 'includes[]': ['scanlation_group', 'manga'] })
  const c = parseChapter(d.data)
  const manga = (d.data.relationships || []).find((r: any) => r.type === 'manga')
  return {
    ...c,
    mangaId: manga?.id ?? '',
    mangaTitle: pickTitle(manga?.attributes?.title || {}),
  }
}

export async function getChapterPages(chapterId: string, saver = false): Promise<string[]> {
  const d = await api<any>(`/at-home/server/${chapterId}`)
  const { baseUrl, chapter } = d
  const files = saver ? chapter.dataSaver : chapter.data
  const mode = saver ? 'data-saver' : 'data'
  return (files || []).map((f: string) => `${baseUrl}/${mode}/${chapter.hash}/${f}`)
}

export async function getTags(): Promise<Tag[]> {
  const d = await api<any>('/manga/tag')
  return (d.data || [])
    .map((t: any) => ({ id: t.id, name: t.attributes?.name?.en ?? '', group: t.attributes?.group ?? '' }))
    .filter((t: Tag) => t.name)
}

export const LANG_LABELS: Record<string, string> = {
  zh: '简体',
  'zh-hk': '繁体',
  en: 'English',
  ja: '日文',
  ko: '韩文',
  es: '西语',
  fr: '法语',
}

export function langLabel(l: string): string {
  return LANG_LABELS[l] || l.toUpperCase()
}

export function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`
  if (s < 86400 * 365) return `${Math.floor(s / 86400 / 30)} 个月前`
  return `${Math.floor(s / 86400 / 365)} 年前`
}

export function cleanDescription(d: string): string {
  return d
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/^\s*_{3,}\s*$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .trim()
}

export function fmtCount(n: number | null): string {
  if (n == null) return '—'
  // 3484.0万 → 3484万;12.3万 保留一位
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}
