import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Confirm({
  open,
  title,
  desc,
  confirmText = '确认清除',
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  desc?: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null
  // portal + z-[100]: must float above the bottom nav / reader chrome (z-50),
  // centered on every screen, clear of the gesture/nav safe area
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ paddingBottom: 'calc(1.5rem + max(env(safe-area-inset-bottom), var(--safe-bottom, 0px)))' }}
      role="dialog"
      aria-modal="true"
    >
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-label="取消" />
      <div className="fade-in relative w-full max-w-sm rounded-2xl border border-border/70 bg-card p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', danger ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary')}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold">{title}</h3>
            {desc && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>}
          </div>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="h-11 flex-1 rounded-full border border-border text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'h-11 flex-1 rounded-full text-sm font-semibold transition-colors',
              danger ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-foreground text-background'
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
