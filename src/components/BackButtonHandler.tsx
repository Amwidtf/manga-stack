// Android hardware back button: navigate in-app instead of killing the app.
//
// Navigation model (mirrors native comic apps like Mihon):
// - reader (/read/…): back lands on the manga detail — popped to when it is
//   the previous logical page, otherwise reached by replacing the reader
//   entry; the stack can never ping-pong reader <-> detail nor accumulate
//   invisible duplicate detail entries
// - top-level tabs: double-tap to exit (single press just shows a toast and
//   returns to the shelf)
// - everything else: pop one entry; if the stack is already at its root,
//   replace with the shelf instead of doing nothing (which used to look like
//   "back quits the app")
import { useEffect } from 'react'
import { matchPath, useLocation, useNavigate, useNavigationType } from 'react-router'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { toast } from 'sonner'

let lastExitTap = 0
const TOP_LEVEL = ['/', '/browse', '/history', '/settings']

// 逻辑页面栈：与浏览器历史解耦地记录“上一页是什么”。REPLACE 替换栈顶、POP 截断到命中项，
// 避免 replace 语义在浏览器历史里留下同页重复条目、导致详情页按一次返回毫无反应的“死返回”
const pathStack: string[] = []

function historyIdx(): number {
  const st = window.history.state as { idx?: number } | null
  return typeof st?.idx === 'number' ? st.idx : 1
}

export default function BackButtonHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()

  useEffect(() => {
    if (navType === 'POP') {
      const i = pathStack.lastIndexOf(location.pathname)
      if (i >= 0) pathStack.length = i + 1
      else pathStack.push(location.pathname)
    } else if (navType === 'REPLACE') {
      if (pathStack.length > 0) pathStack[pathStack.length - 1] = location.pathname
      else pathStack.push(location.pathname)
    } else {
      pathStack.push(location.pathname)
    }
  }, [location.pathname, navType])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const sub = CapApp.addListener('backButton', () => {
      // 弹层优先：有弹窗/浮层开着时，返回键只负责关弹层而不是翻页。
      // Confirm 挂在 window 的 Escape 监听、Radix 浮层挂在 document 的 Escape 监听，
      // 从 document 派发的冒泡事件两者都能收到
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [data-state="open"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return
      }

      const path = location.pathname

      const readerMatch = matchPath('/read/:mkey/:ckey', path)
      if (readerMatch?.params.mkey) {
        const detail = `/manga/${readerMatch.params.mkey}`
        if (pathStack[pathStack.length - 2] === detail && historyIdx() > 0) navigate(-1)
        else navigate(detail, { replace: true })
        return
      }

      if (TOP_LEVEL.includes(path)) {
        const now = Date.now()
        if (now - lastExitTap < 2000) {
          CapApp.exitApp()
        } else {
          lastExitTap = now
          toast('再按一次返回键退出')
          if (path !== '/') navigate('/')
        }
        return
      }

      if (historyIdx() > 0) navigate(-1)
      else navigate('/', { replace: true })
    })
    return () => {
      sub.then((h) => h.remove())
    }
  }, [navigate, location.pathname])

  return null
}
