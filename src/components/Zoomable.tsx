import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Transform {
  scale: number
  x: number
  y: number
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 }
const MIN_SCALE = 1
const DOUBLE_TAP_MS = 320

interface Gesture {
  kind: 'pan' | 'pinch'
  contentPt: { x: number; y: number } // content-space anchor under the pinch midpoint
  startDist: number
  startScale: number
  lastPos: { x: number; y: number } // container-space
  lastClientX: number
  moved: boolean
}

/**
 * App-style image zoom for the reader (page-level zoom is disabled globally,
 * so manga pages zoom here instead):
 * - two-finger pinch zooms around the midpoint
 * - one-finger drag pans while zoomed
 * - double-tap toggles 1x <-> doubleTapScale at the tap point
 * - single taps are reported via onTap after a short delay, so the first half
 *   of a double-tap never triggers page turns
 * - pans/pinches never leak clicks into nested links/buttons
 */
export function Zoomable({
  children,
  className,
  innerClassName,
  resetKey,
  onTap,
  onZoomChange,
  onPinchChange,
  doubleTapEnabled,
  doubleTapScale = 2.4,
  maxScale = 5,
}: {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  /** change to snap back to 1x (e.g. page index / chapter key) */
  resetKey?: string | number
  /** genuine single tap (already distinguished from double-tap), clientX for zone math */
  onTap?: (clientX: number) => void
  onZoomChange?: (zoomed: boolean) => void
  onPinchChange?: (pinching: boolean) => void
  /** 该 clientX 处的点按是否允许参与双击缩放。为 false 时点按立即触发
      （无双击判定延迟）且永不缩放——翻页阅读借此让两侧翻页热区的快速
      点按零延迟翻页，也绝不会误触发缩放 */
  doubleTapEnabled?: (clientX: number) => boolean
  doubleTapScale?: number
  maxScale?: number
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [t, setTState] = useState<Transform>(IDENTITY)
  const [gesturing, setGesturing] = useState(false)
  const tRef = useRef(IDENTITY)
  const gestureRef = useRef<Gesture | null>(null)
  const zoomedRef = useRef(false)
  const suppressClickRef = useRef(false)
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tapPosRef = useRef<{ x: number; y: number } | null>(null) // 待结算的第一次点按位置
  const tapClientXRef = useRef(0) // 待结算的第一次点按 clientX（立即结算用）
  const lastTouchEndRef = useRef(0)
  // callbacks live in a ref: unstable inline props must never force
  // setT/effect identity changes (that would reset the zoom on every
  // parent re-render). Refs may only be written in effects (react-hooks/refs).
  const cbRef = useRef({ onTap, onZoomChange, onPinchChange, doubleTapEnabled })
  useEffect(() => {
    cbRef.current = { onTap, onZoomChange, onPinchChange, doubleTapEnabled }
  })

  const setT = useCallback((next: Transform) => {
    tRef.current = next
    setTState(next)
    const zoomed = next.scale > 1.02
    if (zoomed !== zoomedRef.current) {
      zoomedRef.current = zoomed
      cbRef.current.onZoomChange?.(zoomed)
    }
  }, [])

  // resetKey（换页/换章）变化时同步复位缩放与手势——有意的受控重置，
  // 新规则的 set-state-in-effect 在此为预期行为，故局部豁免。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setT(IDENTITY)
    gestureRef.current = null
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
  }, [resetKey, setT])
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Bounds use the *scroll container* (parent) as the viewport: in vertical
   * mode this component's root is the tall strip content itself, so the
   * visible window is the parent's client area shifted by its scrollTop.
   */
  const clampT = useCallback((tr: Transform): Transform => {
    const root = rootRef.current
    const inner = innerRef.current
    if (!root || !inner) return tr
    const view = root.parentElement
    const vw = view ? view.clientWidth : root.clientWidth
    const vh = view ? view.clientHeight : root.clientHeight
    const scrollTop = view ? view.scrollTop : 0
    const cw = inner.offsetWidth
    const ch = inner.scrollHeight
    const w = cw * tr.scale
    const h = ch * tr.scale
    return {
      scale: tr.scale,
      x: w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tr.x)),
      y: h <= vh ? scrollTop + (vh - h) / 2 : Math.min(scrollTop, Math.max(vh + scrollTop - h, tr.y)),
    }
  }, [])

  const zoomAt = useCallback(
    (point: { x: number; y: number }, targetScale: number) => {
      const cur = tRef.current
      const s = Math.min(maxScale, Math.max(MIN_SCALE, targetScale))
      // keep the content point under `point` stationary across the scale change
      const cx = (point.x - cur.x) / cur.scale
      const cy = (point.y - cur.y) / cur.scale
      setT(clampT({ scale: s, x: point.x - cx * s, y: point.y - cy * s }))
    },
    [clampT, maxScale, setT]
  )

  const cancelPendingTap = () => {
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current)
      tapTimerRef.current = null
    }
    tapPosRef.current = null
  }

  const scheduleTap = (clientX: number, pos: { x: number; y: number }) => {
    cancelPendingTap()
    tapPosRef.current = pos
    tapClientXRef.current = clientX
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null
      tapPosRef.current = null
      cbRef.current.onTap?.(clientX)
    }, DOUBLE_TAP_MS)
  }

  /** 立即结算点按——用于不参与双击缩放的区域（翻页零延迟） */
  const fireTapNow = (clientX: number) => {
    cancelPendingTap()
    cbRef.current.onTap?.(clientX)
  }

  const mayDoubleTap = (clientX: number) => cbRef.current.doubleTapEnabled?.(clientX) ?? true

  const localPoint = (clientX: number, clientY: number) => {
    const r = rootRef.current!.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // a new gesture means the previous gesture's synthetic-click window has
    // passed — drop any stale suppression so it can't eat a genuine tap
    suppressClickRef.current = false
    if (e.touches.length === 2) {
      cancelPendingTap()
      const [a, b] = [e.touches[0], e.touches[1]]
      const pa = localPoint(a.clientX, a.clientY)
      const pb = localPoint(b.clientX, b.clientY)
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
      const cur = tRef.current
      gestureRef.current = {
        kind: 'pinch',
        startDist: Math.hypot(pa.x - pb.x, pa.y - pb.y),
        startScale: cur.scale,
        contentPt: { x: (mid.x - cur.x) / cur.scale, y: (mid.y - cur.y) / cur.scale },
        lastPos: mid,
        lastClientX: mid.x,
        moved: false,
      }
      suppressClickRef.current = true
      setGesturing(true)
      cbRef.current.onPinchChange?.(true)
    } else if (e.touches.length === 1) {
      const p = localPoint(e.touches[0].clientX, e.touches[0].clientY)
      gestureRef.current = {
        kind: 'pan',
        contentPt: { x: 0, y: 0 },
        startDist: 0,
        startScale: tRef.current.scale,
        lastPos: p,
        lastClientX: e.touches[0].clientX,
        moved: false,
      }
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g) return
    if (g.kind === 'pinch' && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const pa = localPoint(a.clientX, a.clientY)
      const pb = localPoint(b.clientX, b.clientY)
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
      const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y)
      const s = Math.min(maxScale, Math.max(MIN_SCALE, (g.startScale * dist) / g.startDist))
      setT(clampT({ scale: s, x: mid.x - g.contentPt.x * s, y: mid.y - g.contentPt.y * s }))
      g.moved = true
    } else if (e.touches.length === 1 && tRef.current.scale > 1.01) {
      const p = localPoint(e.touches[0].clientX, e.touches[0].clientY)
      const dx = p.x - g.lastPos.x
      const dy = p.y - g.lastPos.y
      const cur = tRef.current
      setT(clampT({ ...cur, x: cur.x + dx, y: cur.y + dy }))
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        g.moved = true
        suppressClickRef.current = true
      }
      g.lastPos = p
      g.lastClientX = e.touches[0].clientX
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g) return
    if (g.kind === 'pinch') {
      if (e.touches.length === 1) {
        // one finger stays down: seamlessly continue as a pan
        const p = localPoint(e.touches[0].clientX, e.touches[0].clientY)
        gestureRef.current = { ...g, kind: 'pan', lastPos: p }
        cbRef.current.onPinchChange?.(false)
      } else {
        gestureRef.current = null
        setGesturing(false)
        cbRef.current.onPinchChange?.(false)
        if (tRef.current.scale < 1.02) setT(IDENTITY)
      }
      suppressClickRef.current = true
      lastTouchEndRef.current = Date.now()
      return
    }
    // pan / tap ended
    if (e.touches.length === 0) {
      gestureRef.current = null
      lastTouchEndRef.current = Date.now()
      if (!g.moved) {
        if (!mayDoubleTap(g.lastClientX)) {
          // 翻页热区：此处没有缩放语义，点按立即结算——零延迟翻页，
          // 快速连点也绝不会误判成双击缩放
          fireTapNow(g.lastClientX)
        } else {
          const first = tapPosRef.current
          const near = first && Math.hypot(g.lastPos.x - first.x, g.lastPos.y - first.y) < 60
          if (tapTimerRef.current && near) {
            // 窗口期内的第二次点按且落点接近第一次 → 双击缩放，吞掉点按
            cancelPendingTap()
            suppressClickRef.current = true
            zoomAt(g.lastPos, tRef.current.scale > 1.02 ? 1 : doubleTapScale)
          } else {
            // 落点相距超过阈值的第二次点按不算双击：先把挂起的第一次点按
            // 立即结算（翻页手感零延迟），再为本次点按重新武装计时器
            if (tapTimerRef.current) {
              const cb = cbRef.current.onTap
              const x = tapClientXRef.current
              cancelPendingTap()
              cb?.(x)
            }
            scheduleTap(g.lastClientX, g.lastPos)
          }
        }
      } else if (tRef.current.scale < 1.02) {
        setT(IDENTITY)
      }
    }
  }

  // desktop: click = tap (with the same double-click disambiguation)
  const onClick = (e: React.MouseEvent) => {
    if (e.detail !== 1) return
    if (Date.now() - lastTouchEndRef.current < 500) return // synthetic click after touch
    if (suppressClickRef.current) return
    if (!mayDoubleTap(e.clientX)) {
      fireTapNow(e.clientX)
      return
    }
    scheduleTap(e.clientX, localPoint(e.clientX, e.clientY))
  }
  const onDoubleClick = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchEndRef.current < 500) return
    if (!mayDoubleTap(e.clientX)) return
    // the click halves of this double-click already ran; nothing left to suppress
    cancelPendingTap()
    zoomAt(localPoint(e.clientX, e.clientY), tRef.current.scale > 1.02 ? 1 : doubleTapScale)
  }

  const onClickCapture = (e: React.MouseEvent) => {
    // a pan/pinch/double-tap ending on top of a nested link or button
    // must not activate it
    if (suppressClickRef.current) {
      e.stopPropagation()
      e.preventDefault()
      suppressClickRef.current = false
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn('overflow-hidden', className)}
      style={{ touchAction: t.scale > 1.02 || gesturing ? 'none' : undefined }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onClickCapture={onClickCapture}
    >
      <div
        ref={innerRef}
        className={innerClassName}
        style={{
          transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`,
          transformOrigin: '0 0',
          transition: gesturing ? 'none' : 'transform 0.18s ease-out',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  )
}
