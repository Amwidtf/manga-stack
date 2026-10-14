// App version metadata — keep in sync with android/app/build.gradle
// 版本号双处同步：android/app/build.gradle 的 versionCode/versionName 与本文件一起改
export const APP_VERSION = '0.0.1-alpha.1'
export const APP_BUILD = 12

// 内置更新检查使用的 GitHub releases 地址（latest 接口只返回正式版；
// 列表接口供尝鲜频道使用、含预发布；仓库尚无 release 时静默失败）
export const UPDATE_REPO = 'Amwidtf/manga-stack'
export const UPDATE_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
export const UPDATE_API_LIST = `https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=20`

/** 更新频道：稳定版只看正式发布；尝鲜版额外包含 alpha/beta/rc 预发布 */
export type UpdateChannel = 'stable' | 'beta'

/** 预发布安装（版本号含 -alpha/-beta/-rc 后缀）默认订阅尝鲜版 */
export function defaultUpdateChannel(): UpdateChannel {
  return /-(?:alpha|beta|rc)(?:[.\d]*)?/i.test(APP_VERSION) ? 'beta' : 'stable'
}

/** 比较两个 semver 串（含预发布后缀）：a 较新返回 >0，较旧返回 <0，相等返回 0 */
export function compareSemver(a: string, b: string): number {
  const [mainA, ...preAParts] = a.replace(/^v/, '').split('-')
  const [mainB, ...preBParts] = b.replace(/^v/, '').split('-')
  const pa = mainA.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = mainB.split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  // 主版本相同：无预发布 > 有预发布（1.0.0 > 1.0.0-alpha）
  const preA = preAParts.join('-')
  const preB = preBParts.join('-')
  if (!preA && !preB) return 0
  if (!preA) return 1
  if (!preB) return -1
  // 都有预发布：逐段比较，数字段数值比、数字 < 字母、字母按 ASCII；前缀相同则段数多者大
  const idsA = preA.split('.')
  const idsB = preB.split('.')
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    const xa = idsA[i]
    const xb = idsB[i]
    if (xa === undefined) return -1
    if (xb === undefined) return 1
    const na = /^\d+$/.test(xa) ? Number(xa) : null
    const nb = /^\d+$/.test(xb) ? Number(xb) : null
    if (na !== null && nb !== null) {
      if (na !== nb) return na - nb
    } else if (na !== null) {
      return -1
    } else if (nb !== null) {
      return 1
    } else if (xa !== xb) {
      return xa < xb ? -1 : 1
    }
  }
  return 0
}
