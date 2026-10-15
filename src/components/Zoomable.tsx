import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Transform {
  scale: number
  x: number
  y: number
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 }
const MIN_SCALE = 1

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
 * - single taps are reported via onTap immediately (double-tap zoom was
 *   removed: the disambiguation delay made taps feel sluggish on phones;
 *   zoom is pinch-only now)
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
  maxScale = 5,
}: {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  /** change to snap back to 1x (e.g. page index / chapter key) */
  resetKey?: string | number
  /** genuine single tap (fires immediately), clientX for zone math */
  onTap?: (clientX: number) => void
  onZoomChange?: (zoomed: boolean) => void
  onPinchChange?: (pinching: boolean) => void
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
  const lastTouchEndRef = useRef(0)
  // callbacks live in a ref: unstable inline props must never force
  // setT/effect identity changes (that would reset the zoom on every
  // parent re-render). Refs may only be written in effects (react-hooks/refs).
  const cbRef = useRef({ onTap, onZoomChange, onPinchChange })
  useEffect(() => {
    cbRef.current = { onTap, onZoomChange, onPinchChange }
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

  /** 点按立即上报——双击缩放已移除，不再有判定延迟 */
  const fireTap = (clientX: number) => {
    cbRef.current.onTap?.(clientX)
  }

  const localPoint = (clientX: number, clientY: number) => {
    const r = rootRef.current!.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // a new gesture means the previous gesture's synthetic-click window has
    // passed — drop any stale suppression so it can't eat a genuine tap
    suppressClickRef.current = false
    if (e.touches.length === 2) {
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
        fireTap(g.lastClientX)
      } else if (tRef.current.scale < 1.02) {
        setT(IDENTITY)
      }
    }
  }

  // desktop: click = tap (double-click has no zoom meaning now; its second
  // click is swallowed by e.detail !== 1)
  const onClick = (e: React.MouseEvent) => {
    if (e.detail !== 1) return
    if (Date.now() - lastTouchEndRef.current < 500) return // synthetic click after touch
    if (suppressClickRef.current) return
    fireTap(e.clientX)
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
