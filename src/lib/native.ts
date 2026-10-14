// 与 App 自有原生插件（com.mangastack.app.MangaStackPlugin）的桥接：
// 插件用 HttpURLConnection 把 APK 流式下载到应用私有 files 目录，并通过
// FileProvider 唤起系统安装器。Web 端每次调用都会 reject——调用方必须先
// 用 isNative() 把关。

import { Capacitor, registerPlugin } from '@capacitor/core'

export interface ApkFile {
  name: string
  size: number
  at: number
}

interface MangaStackNative {
  downloadApk(opts: { url: string; name: string }): Promise<{ name: string; size: number }>
  installApk(opts: { name: string }): Promise<void>
  listApks(): Promise<{ files: ApkFile[] }>
  deleteApk(opts: { name: string }): Promise<void>
  clearApks(): Promise<void>
  addListener(
    event: 'downloadProgress',
    cb: (p: { name: string; received: number; total: number }) => void
  ): Promise<{ remove: () => void }>
}

const Native = registerPlugin<MangaStackNative>('MangaStack')

export const isNative = () => Capacitor.isNativePlatform()

export async function downloadApk(
  url: string,
  name: string,
  onProgress?: (p: { received: number; total: number }) => void
): Promise<ApkFile> {
  const sub = onProgress
    ? await Native.addListener('downloadProgress', (p) => {
        if (p.name === name) onProgress({ received: p.received, total: p.total })
      })
    : null
  try {
    const r = await Native.downloadApk({ url, name })
    return { name: r.name, size: r.size, at: Date.now() }
  } finally {
    await sub?.remove()
  }
}

export const installApk = (name: string) => Native.installApk({ name })
export const listApks = () => Native.listApks().then((r) => r.files)
export const deleteApk = (name: string) => Native.deleteApk({ name })
export const clearApks = () => Native.clearApks()
