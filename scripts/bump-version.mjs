#!/usr/bin/env node
// Sync the version across the places that carry it:
//   package.json → version（package-lock.json 顶部两处根版本一并同步）
//   src/lib/appmeta.ts → APP_VERSION / APP_BUILD
//   android/app/build.gradle → versionName / versionCode
//
// Usage: node scripts/bump-version.mjs <x.y.z[-prerelease[.N]]> [versionCode]
//        node scripts/bump-version.mjs pre [versionCode]   ← 预发布计数自动 +1
//          0.0.1-alpha → 0.0.1-alpha.1 → 0.0.1-alpha.2 …
// versionCode defaults to current + 1. 发版流程详见 docs/RELEASE.md。

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let [versionArg, codeArg] = process.argv.slice(2)

// 先读当前版本，处理 `pre` 关键字（同一 x.y.z 内预发布计数递增）
const curVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
if (versionArg === 'pre') {
  const m = curVersion.match(/^(\d+\.\d+\.\d+)(?:-([0-9A-Za-z-]+?)(?:\.(\d+))?)?$/)
  if (!m) {
    console.error(`无法基于当前版本 ${curVersion} 递增预发布号，请显式指定版本号`)
    process.exit(1)
  }
  const [, base, tag = 'alpha', n] = m
  versionArg = `${base}-${tag}.${(n ? Number(n) : 0) + 1}`
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(versionArg ?? '')) {
  console.error('用法: node scripts/bump-version.mjs <x.y.z[-prerelease[.N]] | pre> [versionCode]')
  process.exit(1)
}
const version = versionArg

const gradlePath = join(root, 'android/app/build.gradle')
const gradle = readFileSync(gradlePath, 'utf8')
const curCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0)
const code = codeArg ? Number(codeArg) : curCode + 1
if (!Number.isInteger(code) || code <= curCode) {
  console.error(`versionCode 必须大于当前值 ${curCode}`)
  process.exit(1)
}

// package.json
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

// package-lock.json —— 只改文件头部的根版本区块（根 "version" 与 packages."" 的
// "version"），依赖条目的同名版本字符串不受影响
const lockPath = join(root, 'package-lock.json')
let lock = readFileSync(lockPath, 'utf8')
const HEAD = 1200
const head = lock.slice(0, HEAD).split(`"version": "${curVersion}"`).join(`"version": "${version}"`)
lock = head + lock.slice(HEAD)
writeFileSync(lockPath, lock)
if (curVersion !== version && !lock.slice(0, HEAD).includes(`"version": "${version}"`)) {
  console.warn('警告: package-lock.json 头部未匹配到旧版本号，请手动检查顶部两处 version')
}

// appmeta.ts
const metaPath = join(root, 'src/lib/appmeta.ts')
let meta = readFileSync(metaPath, 'utf8')
meta = meta
  .replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${version}'`)
  .replace(/APP_BUILD = \d+/, `APP_BUILD = ${code}`)
writeFileSync(metaPath, meta)

// build.gradle
writeFileSync(
  gradlePath,
  gradle
    .replace(/versionCode\s+\d+/, `versionCode ${code}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`)
)

console.log(`v${version} (versionCode ${code}) 已写入 package.json / package-lock.json / appmeta.ts / build.gradle`)
console.log('别忘了更新 CHANGELOG.md 双语条目，然后 git tag v' + version + '（流程见 docs/RELEASE.md）')
