// 本地漫画导入编排:ZIP/CBZ(走 Worker 解压)与文件夹(直接落盘)。

import { Directory, Filesystem } from '@capacitor/filesystem'
import { LOCAL_DIR, deleteLocalMangaMeta, getLocalManga, putLocalManga, removeMangaFiles, renameLocalManga } from './db'
import { extOf, groupChapters, isImagePath, newUuid, type LocalManga } from './model'
import type { WorkerIn, WorkerOut } from './unzip.worker'

export type ImportProgress = (done: number, total: number) => void

function u8ToBase64(data: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < data.length; i += CHUNK) {
    bin += String.fromCharCode(...data.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

async function writePage(relPath: string, data: Uint8Array): Promise<void> {
  await Filesystem.writeFile({
    path: `${LOCAL_DIR}/${relPath}`,
    data: u8ToBase64(data),
    directory: Directory.Data,
    recursive: true,
  })
}

function titleFromFilename(name: string): string {
  const t = name.replace(/\.[^.]+$/, '').trim()
  return t || '未命名'
}

function buildManga(
  id: string,
  title: string,
  chapters: { name: string; pages: string[] }[],
  bytes: number,
): LocalManga {
  return {
    id,
    title,
    chapters: chapters.map((c, idx) => ({ id: `${id}~${idx}`, name: c.name, pages: c.pages })),
    addedAt: new Date().toISOString(),
    bytes,
  }
}

/** 导入单个 ZIP/CBZ 文件。 */
export function importLocalZip(file: File, onProgress?: ImportProgress): Promise<LocalManga> {
  const mangaId = newUuid()
  const title = titleFromFilename(file.name)
  return new Promise<LocalManga>((resolve, reject) => {
    const worker = new Worker(new URL('./unzip.worker.ts', import.meta.url), { type: 'module' })
    let total = 0
    let done = 0
    let settled = false
    // 落盘任务串行队列:并发 writeFile 会打满原生桥导致丢失/卡死,
    // 且 done 必须等全部 entry 写完才能收尾,否则元数据先于文件落盘。
    let queue = Promise.resolve()

    const fail = async (message: string) => {
      if (settled) return
      settled = true
      worker.terminate()
      await removeMangaFiles(mangaId).catch(() => {})
      reject(new Error(message))
    }

    const enqueue = (task: () => Promise<void>) => {
      queue = queue
        .then(() => (settled ? undefined : task()))
        .catch((err) => fail(err instanceof Error ? err.message : String(err)))
    }

    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data
      if (msg.type === 'total') {
        total = msg.count
        onProgress?.(0, total)
      } else if (msg.type === 'entry') {
        enqueue(async () => {
          await writePage(msg.path, msg.data)
          done++
          onProgress?.(done, total)
        })
      } else if (msg.type === 'done') {
        enqueue(async () => {
          worker.terminate()
          const manga = buildManga(mangaId, title, msg.chapters, msg.bytes)
          await putLocalManga(manga)
          settled = true
          resolve(manga)
        })
      } else if (msg.type === 'error') {
        enqueue(() => fail(msg.message))
      }
    }
    worker.onerror = (e) => {
      void fail(e.message || '解压 Worker 异常')
    }

    file
      .arrayBuffer()
      .then((buffer) => {
        const msg: WorkerIn = { buffer, mangaId }
        worker.postMessage(msg, [buffer])
      })
      .catch((err) => void fail(err instanceof Error ? err.message : String(err)))
  })
}

/** 导入文件夹(webkitdirectory 选择的 FileList)。首段目录名为漫画标题。 */
export async function importLocalFolder(
  files: FileList | File[],
  onProgress?: ImportProgress,
): Promise<LocalManga> {
  const list = Array.from(files)
  const entries: { rel: string; file: File }[] = []
  for (const f of list) {
    const wp = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    const norm = wp.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!norm || norm.split('/').some((s) => s === '..')) continue
    if (norm.includes('__MACOSX/')) continue
    if (!isImagePath(norm)) continue
    entries.push({ rel: norm, file: f })
  }
  if (entries.length === 0) throw new Error('所选文件夹内没有可识别的图片')
  if (entries.length > 5000) throw new Error('图片数量超过上限 5000 张')

  const firstSeg = entries[0].rel.split('/')[0]
  const allShareFirst = entries.every((e) => e.rel.startsWith(firstSeg + '/'))
  const title = allShareFirst ? firstSeg : '未命名'
  const stripped = entries.map((e) => (allShareFirst ? e.rel.slice(firstSeg.length + 1) : e.rel))
  const grouped = groupChapters(stripped)

  // 建立 原相对路径 → File 的映射
  const fileByRel = new Map(entries.map((e) => [e.rel, e.file]))

  const mangaId = newUuid()
  const total = stripped.length
  let done = 0
  let bytes = 0
  onProgress?.(0, total)
  try {
    const chapters: { name: string; pages: string[] }[] = []
    for (let chIdx = 0; chIdx < grouped.length; chIdx++) {
      const g = grouped[chIdx]
      const pages: string[] = []
      for (let pIdx = 0; pIdx < g.files.length; pIdx++) {
        const strippedPath = g.files[pIdx]
        const origRel = allShareFirst ? `${firstSeg}/${strippedPath}` : strippedPath
        const f = fileByRel.get(origRel)
        if (!f) continue
        const buf = new Uint8Array(await f.arrayBuffer())
        bytes += buf.byteLength
        if (bytes > 1.5 * 1024 * 1024 * 1024) throw new Error('总量超过 1.5GB 上限')
        const out = `${mangaId}/${String(chIdx).padStart(3, '0')}/${String(pIdx).padStart(4, '0')}.${extOf(f.name)}`
        await writePage(out, buf)
        pages.push(out)
        done++
        onProgress?.(done, total)
      }
      chapters.push({ name: g.name, pages })
    }
    const manga = buildManga(mangaId, title, chapters, bytes)
    await putLocalManga(manga)
    return manga
  } catch (err) {
    await removeMangaFiles(mangaId).catch(() => {})
    throw err
  }
}

/** 删除本地漫画:元数据 + 图片文件。 */
export async function deleteLocalManga(id: string): Promise<void> {
  await deleteLocalMangaMeta(id)
  await removeMangaFiles(id)
}

export { getLocalManga, renameLocalManga }
