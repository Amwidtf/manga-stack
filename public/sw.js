// 漫栈离线图片缓存 Service Worker。
// 应用自身没有 Service Worker 时 <img> 不会查询 CacheStorage——阅读器/详情页
// 写入的离线缓存必须由本 SW 在 fetch 层拦截图片请求做 cache-first 才真正可读。
// 与 src/lib/cache.ts 共用同一个缓存名 mangastack-pages-v1。

const CACHE = 'mangastack-pages-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || req.destination !== 'image') return

  let u
  try {
    u = new URL(req.url)
  } catch {
    return
  }
  // 应用自身资源与本地漫画(_capacitor_file_ 文件服务)不入缓存:
  // 前者无离线价值,后者本来就在磁盘上
  if (u.origin === self.location.origin) return
  if (u.pathname.startsWith('/_capacitor_file_/')) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(req)
      if (hit) return hit
      try {
        const res = await fetch(req)
        // 跨域图床普遍无 CORS 头 → opaque 响应(status 0);opaque 与 ok 都可入缓存、可供 <img> 显示
        if (res.type === 'opaque' || res.ok) await cache.put(req, res.clone())
        return res
      } catch {
        // 离线且无缓存:返回缓存兜底(可能为 undefined)或错误响应,让 <img> 走自身失败展示
        return hit ?? Response.error()
      }
    })()
  )
})
