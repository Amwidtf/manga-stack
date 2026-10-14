import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { useSettings } from '@/lib/store'
import { applySourceConfigs } from '@/lib/sources'
import { initSafeInsets } from '@/lib/safeinsets'

// 源注册表必须在首帧渲染前构建——zustand persist 同步 rehydrate，此处 store 已就绪；
// applySourceConfigs 指纹幂等，重复调用不会丢弃活实例的缓存
applySourceConfigs(useSettings.getState().sourceConfigs)

// Android edge-to-edge 安全区：首帧前写入 --safe-* CSS 变量，头部/工具栏布局依赖它
initSafeInsets()

// 离线图片缓存 Service Worker(仅生产构建):对图片请求 cache-first,
// 命中 mangastack-pages-v1 直接返回——见 public/sw.js,与 src/lib/cache.ts 共用缓存名
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => {
      /* fail soft:注册失败时阅读器仍走 noteCachedPage 旧路径写入 */
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
