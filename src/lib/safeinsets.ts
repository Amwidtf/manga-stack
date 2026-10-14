// Android edge-to-edge 安全区桥：原生侧把系统栏真实 insets 存在
// window.MangaStackInsets（addJavascriptInterface，跨页面导航存活），这里在
// 启动与窗口变化时拉取，写入 CSS 变量 --safe-top/right/bottom/left。
// Web 预览 / iOS 等无此接口时变量保持未设，CSS 侧 var(--safe-*, 0px) 回退为 0。
// 原生侧也会在 insets 变化时调用 window.__setSafeInsets 主动推送（旋转等场景）。

function apply(top: number, right: number, bottom: number, left: number): void {
  const s = document.documentElement.style
  s.setProperty('--safe-top', `${top}px`)
  s.setProperty('--safe-right', `${right}px`)
  s.setProperty('--safe-bottom', `${bottom}px`)
  s.setProperty('--safe-left', `${left}px`)
}

declare global {
  interface Window {
    MangaStackInsets?: { top(): number; right(): number; bottom(): number; left(): number }
    __setSafeInsets?: (t: number, r: number, b: number, l: number) => void
  }
}

export function initSafeInsets(): void {
  const pull = () => {
    const b = window.MangaStackInsets
    if (!b) return
    try {
      apply(b.top(), b.right(), b.bottom(), b.left())
    } catch {
      /* 桥未就绪时静默，下次事件再拉 */
    }
  }
  // 原生推送回调（insets 变化时原生 evaluateJavascript 调用）
  window.__setSafeInsets = apply
  pull()
  window.addEventListener('resize', pull)
  window.addEventListener('orientationchange', pull)
}
