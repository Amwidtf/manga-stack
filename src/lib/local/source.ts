// 本地漫画库作为虚拟 Source 接入归一模型:不走网络、不参与发现页。

import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { getLocalManga, LOCAL_DIR } from './db'
import { LOCAL_SOURCE_ID, LOCAL_SOURCE_NAME, type LocalManga } from './model'
import {
  makeKey,
  type BrowseResult,
  type ChapterMeta,
  type NChapter,
  type NManga,
  type OrderOption,
  type Source,
} from '../sources/types'

let baseUriPromise: Promise<string> | null = null

/** local-library 目录的 file:// 基础地址(缓存)。 */
function baseUri(): Promise<string> {
  if (!baseUriPromise) {
    baseUriPromise = Filesystem.getUri({ path: LOCAL_DIR, directory: Directory.Data })
      .then((r) => r.uri.replace(/\/+$/, ''))
      .catch(() =>
        Filesystem.getUri({ path: '', directory: Directory.Data }).then(
          (r) => `${r.uri.replace(/\/+$/, '')}/${LOCAL_DIR}`,
        ),
      )
  }
  return baseUriPromise
}

async function pageUrl(relPath: string): Promise<string> {
  const base = await baseUri()
  return Capacitor.convertFileSrc(`${base}/${relPath}`)
}

function firstPage(m: LocalManga): string | null {
  for (const ch of m.chapters) {
    if (ch.pages.length > 0) return ch.pages[0]
  }
  return null
}

async function toNManga(m: LocalManga): Promise<NManga> {
  const fp = firstPage(m)
  return {
    key: makeKey(LOCAL_SOURCE_ID, m.id),
    source: LOCAL_SOURCE_ID,
    id: m.id,
    title: m.title,
    altTitles: [],
    cover: fp ? await pageUrl(fp) : null,
    author: null,
    status: null,
    statusLabel: '本地',
    year: null,
    description: '',
    tags: ['本地导入'],
    popularity: null,
    updatedAt: m.addedAt,
  }
}

function toNChapters(m: LocalManga): NChapter[] {
  // 存储为阅读顺序(0 起),接口约定 newest-first → 反转;num 仍为原序号(idx+1)
  return m.chapters
    .map((c, idx) => ({
      key: makeKey(LOCAL_SOURCE_ID, c.id),
      source: LOCAL_SOURCE_ID,
      id: c.id,
      mangaId: m.id,
      num: idx + 1,
      name: c.name,
      title: '',
      publishAt: m.addedAt,
      pages: c.pages.length,
      lang: 'zh',
      group: null,
    }))
    .reverse()
}

function parseChapterId(chapterId: string): { mangaId: string; idx: number } {
  const i = chapterId.lastIndexOf('~')
  return { mangaId: chapterId.slice(0, i), idx: Number(chapterId.slice(i + 1)) }
}

class LocalSource implements Source {
  readonly id = LOCAL_SOURCE_ID
  readonly name = LOCAL_SOURCE_NAME
  readonly orders: OrderOption[] = []
  readonly supportsTags = false
  readonly supportsStats = false

  async browse(): Promise<BrowseResult> {
    return { items: [], total: 0 }
  }

  async getManga(id: string): Promise<NManga> {
    const m = await getLocalManga(id)
    if (!m) throw new Error('本地漫画不存在')
    return toNManga(m)
  }

  async getChapters(mangaId: string): Promise<NChapter[]> {
    const m = await getLocalManga(mangaId)
    if (!m) throw new Error('本地漫画不存在')
    return toNChapters(m)
  }

  async getChapterMeta(chapterId: string, mangaId?: string): Promise<ChapterMeta> {
    const { mangaId: mid, idx } = parseChapterId(chapterId)
    const id = mangaId ?? mid
    const m = await getLocalManga(id)
    if (!m) throw new Error('本地漫画不存在')
    const c = m.chapters[idx]
    if (!c) throw new Error('章节不存在')
    const fp = firstPage(m)
    return {
      chapter: {
        key: makeKey(LOCAL_SOURCE_ID, c.id),
        source: LOCAL_SOURCE_ID,
        id: c.id,
        mangaId: m.id,
        num: idx + 1,
        name: c.name,
        title: '',
        publishAt: m.addedAt,
        pages: c.pages.length,
        lang: 'zh',
        group: null,
      },
      mangaId: m.id,
      mangaTitle: m.title,
      cover: fp ? await pageUrl(fp) : null,
    }
  }

  async getPages(ch: NChapter): Promise<string[]> {
    const { mangaId, idx } = parseChapterId(ch.id)
    const m = await getLocalManga(mangaId)
    if (!m) throw new Error('本地漫画不存在')
    const c = m.chapters[idx]
    if (!c) throw new Error('章节不存在')
    return Promise.all(c.pages.map((p) => pageUrl(p)))
  }
}

let instance: LocalSource | null = null

export function getLocalSource(): LocalSource {
  if (!instance) instance = new LocalSource()
  return instance
}
