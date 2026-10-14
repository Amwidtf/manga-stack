// Normalized source abstraction: every comic source (MangaDex, 拷贝漫画, …)
// implements this interface so the UI never talks to a vendor API directly.

export interface NManga {
  key: string // `${source}:${id}` — globally unique, used in routes and storage
  source: string
  id: string
  title: string
  altTitles: string[]
  cover: string | null // absolute URL
  author: string | null
  status: string | null // raw status string
  statusLabel: string | null
  year: number | null
  description: string
  tags: string[]
  popularity: number | null
  updatedAt: string | null // ISO-ish date
}

export interface NChapter {
  key: string
  source: string
  id: string
  mangaId: string
  num: number // parsed number, -1 when unknown
  name: string // display label, e.g. 第146话
  title: string // optional sub-title
  publishAt: string // ISO
  pages: number
  lang: string
  group: string | null
}

export interface BrowseQuery {
  q?: string
  order: string // source-specific ordering key
  offset: number
  limit: number
  tagId?: string
  ratings?: string[]
  langs?: string[]
  onlyAvailable?: boolean
}

export interface BrowseResult {
  items: NManga[]
  total: number
}

export interface OrderOption {
  key: string
  label: string
}

export interface ChapterMeta {
  chapter: NChapter
  mangaId: string
  mangaTitle: string
  cover: string | null
}

export interface Source {
  id: string
  name: string
  orders: OrderOption[]
  supportsTags: boolean
  supportsStats: boolean
  browse(q: BrowseQuery): Promise<BrowseResult>
  getManga(id: string): Promise<NManga>
  getChapters(mangaId: string, langs?: string[]): Promise<NChapter[]> // sorted newest first
  getChapterMeta(chapterId: string, mangaId?: string): Promise<ChapterMeta>
  getPages(ch: NChapter): Promise<string[]>
  getStats?(id: string): Promise<{ rating: number | null; follows: number | null }>
}

export function makeKey(source: string, id: string): string {
  return `${source}:${id}`
}

export function parseKey(key: string): { source: string; id: string } {
  const i = key.indexOf(':')
  return { source: key.slice(0, i), id: key.slice(i + 1) }
}

export function chapterLabel(c: NChapter): string {
  return c.name || (c.num >= 0 ? `第 ${c.num} 话` : c.title || '单篇')
}
