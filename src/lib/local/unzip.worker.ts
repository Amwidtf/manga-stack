// ZIP/CBZ 解压 Worker:在主线程外逐张解出图片并回传,避免阻塞 UI。
// 注意:tsconfig lib 未含 WebWorker,这里用类型别名代替 self,避免与 DOM lib 冲突。

import JSZip from 'jszip'
import { extOf, groupChapters, isImagePath } from './model'

export interface WorkerIn {
  buffer: ArrayBuffer
  mangaId: string
}

export type WorkerOut =
  | { type: 'total'; count: number }
  | { type: 'entry'; chIdx: number; pIdx: number; path: string; data: Uint8Array }
  | { type: 'done'; chapters: { name: string; pages: string[] }[]; bytes: number }
  | { type: 'error'; message: string }

const MAX_ENTRIES = 5000
const MAX_BYTES = 1.5 * 1024 * 1024 * 1024

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null
  postMessage(message: WorkerOut, transfer?: Transferable[]): void
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0')
}

async function run(input: WorkerIn): Promise<void> {
  const zip = await JSZip.loadAsync(input.buffer)

  // 过滤:目录条目、越界路径、macOS 元数据、非图片
  const valid: string[] = []
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const norm = name.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!norm || norm.split('/').some((s) => s === '..')) continue
    if (norm.includes('__MACOSX/') || norm.startsWith('__MACOSX')) continue
    if (!isImagePath(norm)) continue
    valid.push(norm)
    if (valid.length > MAX_ENTRIES) throw new Error(`图片数量超过上限 ${MAX_ENTRIES} 张`)
  }
  if (valid.length === 0) throw new Error('压缩包内没有可识别的图片')

  const grouped = groupChapters(valid)
  const total = grouped.reduce((n, g) => n + g.files.length, 0)
  ctx.postMessage({ type: 'total', count: total })

  const chapters: { name: string; pages: string[] }[] = []
  let bytes = 0
  for (let chIdx = 0; chIdx < grouped.length; chIdx++) {
    const g = grouped[chIdx]
    const pages: string[] = []
    for (let pIdx = 0; pIdx < g.files.length; pIdx++) {
      const orig = g.files[pIdx]
      const file = zip.file(orig)
      if (!file) continue
      const data = await file.async('uint8array')
      bytes += data.byteLength
      if (bytes > MAX_BYTES) throw new Error('解压总量超过 1.5GB 上限')
      const out = `${input.mangaId}/${pad(chIdx, 3)}/${pad(pIdx, 4)}.${extOf(orig)}`
      pages.push(out)
      ctx.postMessage({ type: 'entry', chIdx, pIdx, path: out, data }, [data.buffer])
    }
    chapters.push({ name: g.name, pages })
  }
  ctx.postMessage({ type: 'done', chapters, bytes })
}

ctx.onmessage = (e) => {
  run(e.data).catch((err) => {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  })
}

export {}
