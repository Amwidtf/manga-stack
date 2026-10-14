import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router'
import { Toaster, toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import AppShell from '@/components/AppShell'
import BackButtonHandler from '@/components/BackButtonHandler'
import LibraryPage from '@/pages/Library'
import { useSettings } from '@/lib/store'
import { onSourceAutoSwitch, sourceName } from '@/lib/sources'
import { checkUpdate } from '@/lib/update'
import { isNative } from '@/lib/native'

// 书架是首屏路由保持同步加载，其余页面按路由分包，控制首包体积
const BrowsePage = lazy(() => import('@/pages/Browse'))
const SourceBrowsePage = lazy(() => import('@/pages/SourceBrowse'))
const DetailPage = lazy(() => import('@/pages/Detail'))
const ReaderPage = lazy(() => import('@/pages/Reader'))
const HistoryPage = lazy(() => import('@/pages/History'))
const SettingsPage = lazy(() => import('@/pages/Settings'))
const AboutPage = lazy(() => import('@/pages/About'))
const DownloadsPage = lazy(() => import('@/pages/Downloads'))

const pageFallback = (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
  </div>
)

export default function App() {
  const theme = useSettings((s) => s.theme)
  const onlineEnabled = useSettings((s) => s.onlineEnabled)

  // 源注册表在 main.tsx 渲染前同步构建、在 store 的源 actions 里同步重建，
  // 这里不需要 effect——重复构建只会丢弃活实例的内存缓存

  // 镜像类源断线自动换线成功后，把新地址持久化回对应的源配置
  useEffect(() => {
    onSourceAutoSwitch((sourceId, newBase) => {
      useSettings.getState().updateSourceBase(sourceId, newBase)
      toast.success(`「${sourceName(sourceId)}」线路已自动切换到 ${newBase}`)
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0b0b0c' : '#f8f8f6')
  }, [theme])

  // 内置更新静默检查：仅原生端，每 6 小时最多查一次；有更新才 toast 提示，
  // 检查失败/已最新均静默（localStorage 记录上次检查时间）
  useEffect(() => {
    if (!isNative()) return
    const KEY = 'mangastack-update-check'
    if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < 6 * 3600 * 1000) return
    localStorage.setItem(KEY, String(Date.now()))
    void checkUpdate(useSettings.getState().updateChannel).then((r) => {
      if (r.kind === 'update') {
        toast.info(`发现新版本 v${r.info.version}`, {
          description: '到 设置 → 关于 → 版本更新 下载安装',
          duration: 8000,
        })
      }
    })
  }, [])

  return (
    <>
      <BackButtonHandler />
      <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/read/:mkey/:ckey" element={<ReaderPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/browse" element={onlineEnabled ? <BrowsePage /> : <Navigate to="/" replace />} />
            <Route path="/browse/source/:sid" element={onlineEnabled ? <SourceBrowsePage /> : <Navigate to="/" replace />} />
            <Route path="/manga/:key" element={<DetailPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Route>
        </Routes>
      </Suspense>
      <Toaster position="top-center" richColors theme={theme} />
    </>
  )
}
