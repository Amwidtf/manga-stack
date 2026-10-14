// 内置更新：查 GitHub releases 最新版本号；有更新时由原生下载器拉 APK
//（原生层不受 WebView CORS 限制），再交给系统安装器。Web 端、或仓库
// 尚无 release 时，全部静默失败（fail soft）。
// 双频道：稳定版走 /releases/latest（GitHub 只返回正式版，预发布被
// pre-release 标记挡住）；尝鲜版走 /releases 列表，含 alpha/beta/rc。

import { Capacitor } from '@capacitor/core'
import { httpGetText } from './http'
import { APP_BUILD, APP_VERSION, UPDATE_API, UPDATE_API_LIST, compareSemver } from './appmeta'
import type { UpdateChannel } from './appmeta'
import { downloadApk, installApk, isNative } from './native'

export interface UpdateInfo {
  version: string
  name: string
  notes: string
  apkUrl: string
  size: number
  publishedAt: string
}

type CheckResult =
  | { kind: 'update'; info: UpdateInfo }
  | { kind: 'latest' }
  | { kind: 'error'; reason: string }

interface RawRelease {
  tag_name?: string
  name?: string
  body?: string
  published_at?: string
  draft?: boolean
  prerelease?: boolean
  assets?: { name: string; browser_download_url: string; size: number }[]
}

function normalizeRelease(rel: RawRelease): CheckResult {
  const tag = rel.tag_name ?? ''
  const apk = rel.assets?.find((a) => a.name.endsWith('.apk'))
  if (!tag || !apk) return { kind: 'error', reason: '发布中没有可下载的安装包' }
  if (compareSemver(tag, APP_VERSION) <= 0) return { kind: 'latest' }
  return {
    kind: 'update',
    info: {
      version: tag.replace(/^v/, ''),
      name: rel.name || tag,
      notes: (rel.body ?? '').trim(),
      apkUrl: apk.browser_download_url,
      size: apk.size,
      publishedAt: rel.published_at ?? '',
    },
  }
}

export async function checkUpdate(channel: UpdateChannel = 'stable'): Promise<CheckResult> {
  try {
    if (channel === 'beta') {
      const { text } = await httpGetText(UPDATE_API_LIST)
      const list = JSON.parse(text) as RawRelease[]
      // 列表按发布时间倒序，取第一个非 draft 即最新可安装版本（含预发布）
      const rel = list.find((r) => !r.draft)
      if (!rel) return { kind: 'error', reason: '仓库还没有任何发布版本' }
      return normalizeRelease(rel)
    }
    const { text } = await httpGetText(UPDATE_API)
    return normalizeRelease(JSON.parse(text) as RawRelease)
  } catch (e) {
    // /releases/latest 对「尚无正式发布」的仓库返回 404,与网络故障区分开
    const noRelease = e instanceof Error && e.message.includes('404')
    return { kind: 'error', reason: noRelease ? '仓库还没有正式发布版本（可切到尝鲜频道）' : '暂时连不上更新服务器，稍后再试' }
  }
}

export interface DownloadProgress {
  received: number
  total: number
}

/** 下载更新 APK 并唤起系统安装器（仅原生端） */
export async function downloadAndInstall(
  info: UpdateInfo,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  if (!isNative()) throw new Error('网页版请直接下载 APK 文件安装')
  const name = `mangastack-${info.version}.apk`
  await downloadApk(info.apkUrl, name, onProgress)
  await installApk(name)
}

export function currentVersionLabel(): string {
  return `v${APP_VERSION}（构建 ${APP_BUILD}）`
}

export { Capacitor }
