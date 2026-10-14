// 本地漫画导入对话框:支持 ZIP/CBZ 文件与整个文件夹两种方式。

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileArchive, FolderOpen, X } from 'lucide-react'
import { toast } from 'sonner'
import { isNative } from '@/lib/native'
import { importLocalFolder, importLocalZip } from '@/lib/local/importer'
import type { LocalManga } from '@/lib/local/model'
import { cn } from '@/lib/utils'

export function LocalImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (m: LocalManga) => void | Promise<void>
}) {
  const zipRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const native = isNative()

  const close = () => {
    if (!busy) onClose()
  }

  const runZip = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    try {
      for (const file of files) {
        const id = `import-zip-${Date.now()}`
        toast.loading(`正在导入「${file.name}」…`, { id })
        try {
          const m = await importLocalZip(file, (done, total) => {
            toast.loading(`正在导入「${m0(file.name)}」… ${done}/${total}`, { id })
          })
          toast.success(`已导入「${m.title}」(${m.chapters.length} 章)`, { id })
          await onImported(m)
        } catch (e) {
          toast.error(e instanceof Error ? e.message : '导入失败', { id })
        }
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const runFolder = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    const id = `import-dir-${Date.now()}`
    toast.loading('正在导入文件夹…', { id })
    try {
      const m = await importLocalFolder(files, (done, total) => {
        toast.loading(`正在导入文件夹… ${done}/${total}`, { id })
      })
      toast.success(`已导入「${m.title}」(${m.chapters.length} 章)`, { id })
      await onImported(m)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导入失败', { id })
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      role="dialog"
      aria-modal="true"
    >
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} aria-label="取消" />
      <div className="fade-in relative w-full max-w-sm rounded-2xl border border-border/70 bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">导入本地漫画</h3>
          <button
            onClick={close}
            disabled={busy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!native && (
          <p className="mt-3 rounded-xl bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            本地导入需要访问设备文件系统，请在 Android APP 中使用。
          </p>
        )}

        <div className="mt-4 space-y-2.5">
          <button
            onClick={() => zipRef.current?.click()}
            disabled={busy || !native}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border border-border/70 px-4 py-3.5 text-left transition-colors',
              busy || !native ? 'opacity-50' : 'hover:bg-accent'
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <FileArchive className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">ZIP / CBZ 文件</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">每个文件导入为一部漫画，可多选</span>
            </span>
          </button>
          <button
            onClick={() => dirRef.current?.click()}
            disabled={busy || !native}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border border-border/70 px-4 py-3.5 text-left transition-colors',
              busy || !native ? 'opacity-50' : 'hover:bg-accent'
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <FolderOpen className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">文件夹</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">文件夹名作为标题，子文件夹按章节分组</span>
            </span>
          </button>
        </div>

        <input
          ref={zipRef}
          type="file"
          accept=".zip,.cbz"
          multiple
          className="hidden"
          onChange={(e) => {
            // 先复制再清空:Chromium 中重置 input.value 会顺带清空已取出的 FileList
            const fs = Array.from(e.target.files ?? [])
            e.target.value = ''
            void runZip(fs)
          }}
        />
        <input
          ref={dirRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={(e) => {
            // 先复制再清空:Chromium 中重置 input.value 会顺带清空已取出的 FileList
            const fs = Array.from(e.target.files ?? [])
            e.target.value = ''
            void runFolder(fs)
          }}
        />
      </div>
    </div>,
    document.body
  )
}

function m0(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}
