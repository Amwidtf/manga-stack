// MangaDex source adapter — wraps the raw client in the normalized Source API.

import {
  browseManga, getManga as mdGetManga, getFeed, getChapter as mdGetChapter,
  getChapterPages, getMangaStats, coverUrl, chapterNum,
  type MangaSummary, type Chapter,
} from '../mangadex'
import type { BrowseQuery, BrowseResult, ChapterMeta, NChapter, NManga, Source } from './types'
import { makeKey } from './types'

const SOURCE = 'mangadex'

function normManga(m: MangaSummary): NManga {
  return {
    key: makeKey(SOURCE, m.id),
    source: SOURCE,
    id: m.id,
    title: m.title,
    altTitles: m.altTitles,
    cover: coverUrl(m.id, m.coverFile, 256),
    author: m.author,
    status: m.status,
    statusLabel: null,
    year: m.year,
    description: m.description,
    tags: m.tags,
    popularity: null,
    updatedAt: null,
  }
}

function normChapter(c: Chapter, mangaId: string): NChapter {
  return {
    key: makeKey(SOURCE, c.id),
    source: SOURCE,
    id: c.id,
    mangaId,
    num: chapterNum(c),
    name: c.chapter ? `第 ${c.chapter} 话` : '单篇',
    title: c.title,
    publishAt: c.publishAt,
    pages: c.pages,
    lang: c.lang,
    group: c.group,
  }
}

// MangaDex 官方 API 域名固定，配置里的 baseUrl 对该驱动无意义；
// 保留 cfg 形参只是让三个内置驱动的工厂签名一致，注册表可无差别调用。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeMangadex(_cfg: { baseUrl?: string } = {}): Source {
  return {
    id: SOURCE,
    name: 'MangaDex',
    orders: [
      { key: 'order[followedCount]', label: '人气' },
      { key: 'order[latestUploadedChapter]', label: '最新' },
      { key: 'order[rating]', label: '评分' },
    ],
    supportsTags: true,
    supportsStats: true,

    async browse(q: BrowseQuery): Promise<BrowseResult> {
      const r = await browseManga({
        title: q.q,
        order: q.q ? 'order[relevance]' : q.order,
        offset: q.offset,
        limit: q.limit,
        ratings: q.ratings,
        langs: q.langs,
        onlyAvailable: q.onlyAvailable,
        includedTags: q.tagId ? [q.tagId] : undefined,
      })
      return { items: r.items.map(normManga), total: r.total }
    },

    async getManga(id: string): Promise<NManga> {
      return normManga(await mdGetManga(id))
    },

    async getChapters(mangaId: string, langs: string[] = []): Promise<NChapter[]> {
      const feed = await getFeed(mangaId, langs)
      return feed.map((c) => normChapter(c, mangaId))
    },

    async getChapterMeta(chapterId: string): Promise<ChapterMeta> {
      const c = await mdGetChapter(chapterId)
      let cover: string | null = null
      if (c.mangaId) {
        try {
          const m = await mdGetManga(c.mangaId)
          cover = coverUrl(m.id, m.coverFile, 256)
        } catch {
          /* cover is optional */
        }
      }
      return {
        chapter: normChapter(c, c.mangaId),
        mangaId: c.mangaId,
        mangaTitle: c.mangaTitle,
        cover,
      }
    },

    async getPages(ch: NChapter): Promise<string[]> {
      return getChapterPages(ch.id)
    },

    async getStats(id: string) {
      return getMangaStats(id)
    },
  }
}
