// 本地漫画库的数据模型与纯函数工具。

export const LOCAL_SOURCE_ID = 'local'
export const LOCAL_SOURCE_NAME = '本地'

export interface LocalChapter {
  id: string // `${mangaId}~${idx}`(分隔符不能是 # 或 :,会与 URL fragment、parseKey 冲突)
  name: string
  pages: string[] // 相对 local-library/ 根的路径
}

export interface LocalManga {
  id: string // uuid
  title: string
  chapters: LocalChapter[]
  addedAt: string // ISO
  bytes: number
}

export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'] as const

export function isImagePath(p: string): boolean {
  const m = /\.([a-z0-9]+)$/i.exec(p)
  return !!m && (IMAGE_EXTS as readonly string[]).includes(m[1].toLowerCase())
}

/** 自然序比较：字符串中的数字段按数值比较(1, 2, 10),其余按字典序。 */
export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g
  const pa = a.match(re) ?? []
  const pb = b.match(re) ?? []
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const xa = pa[i]
    const xb = pb[i]
    if (xa === undefined) return -1
    if (xb === undefined) return 1
    const na = /^\d+$/.test(xa) ? Number(xa) : NaN
    const nb = /^\d+$/.test(xb) ? Number(xb) : NaN
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na - nb
      if (xa.length !== xb.length) return xa.length - xb.length // 001 排在 1 后,稳定
      continue
    }
    const c = xa.localeCompare(xb, 'zh-Hans-CN')
    if (c !== 0) return c
  }
  return 0
}

export function extOf(p: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(p)
  return m ? m[1].toLowerCase() : 'jpg'
}

/**
 * 把归档内相对路径列表分组为章节。
 * - 剥掉所有条目共享的唯一顶层目录;
 * - 有子目录 → 每个一级子目录一章(自然序),根部散图归「未分卷」放最后;
 * - 无子目录 → 整本单章「全一卷」。
 * 返回章节名 + 每章内的原始相对路径(已按自然序排序)。
 */
export function groupChapters(paths: string[]): { name: string; files: string[] }[] {
  let rest = paths
  // 剥公共顶层目录:所有路径首段相同且都至少有 2 段
  const firstSegs = new Set(rest.map((p) => p.split('/')[0]))
  if (firstSegs.size === 1 && rest.every((p) => p.includes('/'))) {
    rest = rest.map((p) => p.slice(p.indexOf('/') + 1))
  }

  const byDir = new Map<string, string[]>()
  const rootFiles: string[] = []
  for (const p of rest) {
    const i = p.indexOf('/')
    if (i < 0) rootFiles.push(p)
    else {
      const dir = p.slice(0, i)
      const arr = byDir.get(dir) ?? []
      arr.push(p)
      byDir.set(dir, arr)
    }
  }

  const chapters: { name: string; files: string[] }[] = []
  if (byDir.size > 0) {
    const dirs = [...byDir.keys()].sort(naturalCompare)
    for (const d of dirs) {
      chapters.push({ name: d, files: byDir.get(d)!.sort(naturalCompare) })
    }
    if (rootFiles.length > 0) {
      chapters.push({ name: '未分卷', files: rootFiles.sort(naturalCompare) })
    }
  } else {
    chapters.push({ name: '全一卷', files: rootFiles.sort(naturalCompare) })
  }
  return chapters
}

export function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
