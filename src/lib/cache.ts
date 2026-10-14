// Offline page cache backed by CacheStorage. The reader passively caches every
// image it successfully loads; detail pages can pre-cache a chapter for
// offline reading; settings offers one-tap cleanup. Works in web and WebView.

import type { NChapter } from './sources'

const CACHE_NAME = 'mangastack-pages-v1'
const META_KEY = 'mangastack-cache-meta'

function supported(): boolean {
  return typeof caches !== 'undefined'
}

/** 从 SW 图片缓存中删除单个 URL。封面/页面加载失败时调用：跨域图片经 SW
    缓存后是不透明响应（状态码不可见），错误页会被当成图片一直命中，删掉
    才能让下一次请求重新走网络。fail soft，CacheStorage 不可用则跳过。 */
export async function evictCachedImage(url: string): Promise<void> {
  if (!supported() || !url) return
  try {
    const c = await caches.open(CACHE_NAME)
    await c.delete(url)
  } catch {
    /* ignore */
  }
}

interface ChapterMeta {
  mangaKey: string
  mangaTitle: string
  chapterLabel: string
  cover?: string | null // 漫画封面，下载管理网格视图展示（旧元数据可能缺失，展示占位图）
  urls: string[]
  bytes: number
  done: number // pages actually written to CacheStorage
  at: number
}

type MetaMap = Record<string, ChapterMeta> // key = chapterKey (composite, unique)

function readMeta(): MetaMap {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeMeta(m: MetaMap) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m))
  } catch {
    /* quota exceeded — drop oldest half */
    const entries = Object.entries(m).sort((a, b) => a[1].at - b[1].at)
    writeMeta(Object.fromEntries(entries.slice(Math.ceil(entries.length / 2))))
  }
}

/* ---------- passive cache from the reader ---------- */

/** called by the reader for every successfully loaded page. With the service
    worker (public/sw.js) active the SW has already stored the image, so this
    mostly keeps the per-chapter meta counters accurate; without a SW it falls
    back to fetching + caching here. Image CDNs rarely send CORS headers, so
    we use no-cors (opaque response) — display works, bytes unknown */
export async function noteCachedPage(chapterKey: string, url: string): Promise<boolean> {
  if (!supported()) return false
  try {
    const cache = await caches.open(CACHE_NAME)
    if (!(await cache.match(url))) {
      const res = await fetch(url, { mode: 'no-cors', referrerPolicy: 'no-referrer' })
      // opaque (status 0) or ok — both are fine for <img>
      if (res.type === 'error') return false
      await cache.put(url, res)
    }
    // 计数对「SW 已缓存」与「此处补写」两种来源都成立;done 封顶 urls.length,
    // bytes 按 done 推导(估算 ~150KB/页),重读同一章不会重复累计
    const meta = readMeta()
    const m = meta[chapterKey]
    if (m && m.done < m.urls.length) {
      m.done++
      m.bytes = m.done * 153600
      writeMeta(meta)
    }
    return true
  } catch {
    return false
  }
}

/** reader has the full page list; record ownership so cleanup knows what a chapter holds */
export function trackChapterPages(
  mangaKey: string,
  mangaTitle: string,
  cover: string | null,
  ch: NChapter,
  urls: string[]
): void {
  const meta = readMeta()
  const prev = meta[ch.key]
  meta[ch.key] = {
    mangaKey,
    mangaTitle,
    cover: cover ?? null,
    chapterLabel: ch.name,
    urls,
    bytes: prev?.bytes ?? 0,
    done: prev?.done ?? 0,
    at: prev?.at ?? Date.now(),
  }
  writeMeta(meta)
}

/* ---------- explicit pre-cache from the detail page ---------- */

export async function cacheChapter(
  mangaKey: string,
  mangaTitle: string,
  cover: string | null,
  ch: NChapter,
  getPages: (c: NChapter) => Promise<string[]>
): Promise<number> {
  if (!supported()) throw new Error('当前环境不支持离线缓存')
  const urls = await getPages(ch)
  const cache = await caches.open(CACHE_NAME)
  let done = 0
  for (const url of urls) {
    try {
      const hit = await cache.match(url)
      if (hit) {
        done++
        continue
      }
      const res = await fetch(url, { mode: 'no-cors', referrerPolicy: 'no-referrer' })
      if (res.type === 'error') continue
      await cache.put(url, res)
      done++
    } catch {
      /* skip failed page */
    }
  }
  // estimate ~150KB/page when bytes are unreadable (opaque responses)
  const meta = readMeta()
  meta[ch.key] = { mangaKey, mangaTitle, cover: cover ?? null, chapterLabel: ch.name, urls, bytes: done * 153600, done, at: Date.now() }
  writeMeta(meta)
  return done
}

/* ---------- queries ---------- */

export function isCached(chapterKey: string): boolean {
  const m = readMeta()[chapterKey]
  return !!m && m.done > 0 && m.done >= m.urls.length
}

export interface CachedChapterInfo {
  chapterKey: string
  mangaKey: string
  mangaTitle: string
  cover: string | null
  chapterLabel: string
  pages: number
  bytes: number
  at: number
}

export function listCachedChapters(): CachedChapterInfo[] {
  return Object.entries(readMeta())
    .map(([chapterKey, m]) => ({
      chapterKey,
      mangaKey: m.mangaKey,
      mangaTitle: m.mangaTitle,
      cover: m.cover ?? null,
      chapterLabel: m.chapterLabel,
      pages: m.done || m.urls.length,
      bytes: m.bytes,
      at: m.at,
    }))
    .sort((a, b) => b.at - a.at)
}

/** chapterKeys cached for one manga, with aggregate bytes */
export function cachedInfoForManga(mangaKey: string): { keys: string[]; bytes: number; chapters: number } {
  const entries = Object.entries(readMeta()).filter(([, m]) => m.mangaKey === mangaKey && m.done > 0)
  return {
    keys: entries.map(([k]) => k),
    chapters: entries.length,
    bytes: entries.reduce((a, [, m]) => a + m.bytes, 0),
  }
}

export interface CacheStats {
  chapters: number
  pages: number
  bytes: number
}

export function getCacheStats(): CacheStats {
  const all = listCachedChapters()
  return {
    chapters: all.length,
    pages: all.reduce((a, b) => a + b.pages, 0),
    bytes: all.reduce((a, b) => a + b.bytes, 0),
  }
}

/* ---------- cleanup ---------- */

export async function clearChapterCache(chapterKey: string): Promise<void> {
  if (!supported()) return
  const meta = readMeta()
  const entry = meta[chapterKey]
  if (!entry) return
  try {
    const cache = await caches.open(CACHE_NAME)
    for (const url of entry.urls) await cache.delete(url)
  } catch {
    /* best-effort */
  }
  delete meta[chapterKey]
  writeMeta(meta)
}

export async function clearAllCache(): Promise<void> {
  localStorage.removeItem(META_KEY)
  if (supported()) {
    try {
      await caches.delete(CACHE_NAME)
    } catch {
      /* ignore */
    }
  }
}

/** 某源的缓存统计（chapterKey 复合键前缀匹配） */
export function cacheStatsForSource(sourceId: string): { chapters: number; bytes: number } {
  const prefix = `${sourceId}:`
  const entries = Object.entries(readMeta()).filter(([k]) => k.startsWith(prefix))
  return { chapters: entries.length, bytes: entries.reduce((a, [, m]) => a + m.bytes, 0) }
}

/** 删除某源的全部章节缓存（CacheStorage 逐页删除 + 元数据移除），返回删除量 */
export async function clearCacheForSource(sourceId: string): Promise<{ chapters: number; bytes: number }> {
  const prefix = `${sourceId}:`
  const targets = Object.entries(readMeta()).filter(([k]) => k.startsWith(prefix))
  if (!targets.length) return { chapters: 0, bytes: 0 }
  let cache: Cache | null = null
  if (supported()) {
    try {
      cache = await caches.open(CACHE_NAME)
    } catch {
      cache = null
    }
  }
  const meta = readMeta()
  for (const [key, entry] of targets) {
    if (cache) {
      try {
        for (const url of entry.urls) await cache.delete(url)
      } catch {
        /* best-effort */
      }
    }
    delete meta[key]
  }
  writeMeta(meta)
  return { chapters: targets.length, bytes: targets.reduce((a, [, m]) => a + m.bytes, 0) }
}

/** 删除某部漫画的全部章节缓存（CacheStorage 逐页删除 + 元数据移除），返回删除量（下载管理整部删除） */
export async function clearCacheForManga(mangaKey: string): Promise<{ chapters: number; bytes: number }> {
  const targets = Object.entries(readMeta()).filter(([, m]) => m.mangaKey === mangaKey)
  if (!targets.length) return { chapters: 0, bytes: 0 }
  let cache: Cache | null = null
  if (supported()) {
    try {
      cache = await caches.open(CACHE_NAME)
    } catch {
      cache = null
    }
  }
  const meta = readMeta()
  for (const [key, entry] of targets) {
    if (cache) {
      try {
        for (const url of entry.urls) await cache.delete(url)
      } catch {
        /* best-effort */
      }
    }
    delete meta[key]
  }
  writeMeta(meta)
  return { chapters: targets.length, bytes: targets.reduce((a, [, m]) => a + m.bytes, 0) }
}

export function fmtBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)} GB`
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(0)} KB`
  return `${n} B`
}
