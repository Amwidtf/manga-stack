import type { Source } from './types'
import type { SourceConfig } from './config'
import { makeMangadex } from './mangadex'
import { makeCopymanga } from './copymanga'
import { makeBaozimh } from './baozimh'
import { makeCustomSource } from './custom'
import { getLocalSource } from '../local/source'
import { LOCAL_SOURCE_ID, LOCAL_SOURCE_NAME } from '../local/model'

/* 运行时注册表：完全由 SourceConfig 驱动，App 不内置任何源。
   applySourceConfigs 必须保持「渲染前同步调用 + 指纹幂等」——内容相同则
   保留活实例及其缓存（重复注册会丢内存缓存，这是 v1.1 时代修过的坑）。 */
const registry = new Map<string, Source>()
let registeredFingerprint = ''

/** 镜像类源断线自动换线成功的通知：外层（App.tsx）借此把新 baseUrl 持久化回配置 */
let autoSwitchHandler: ((sourceId: string, newBase: string) => void) | null = null
export function onSourceAutoSwitch(cb: (sourceId: string, newBase: string) => void): void {
  autoSwitchHandler = cb
}

function buildSource(cfg: SourceConfig): Source | null {
  switch (cfg.type) {
    case 'mangadex':
      return makeMangadex()
    case 'copymanga':
      return makeCopymanga({ baseUrl: cfg.baseUrl, onAutoSwitch: (b) => autoSwitchHandler?.(cfg.id, b) })
    case 'baozimh':
      return makeBaozimh({ baseUrl: cfg.baseUrl, onAutoSwitch: (b) => autoSwitchHandler?.(cfg.id, b) })
    case 'custom':
      return cfg.rule ? makeCustomSource(cfg.rule) : null
  }
}

export function applySourceConfigs(configs: SourceConfig[]): void {
  const fp = JSON.stringify(configs)
  if (fp === registeredFingerprint) return
  registeredFingerprint = fp
  registry.clear()
  for (const cfg of configs) {
    if (!cfg.enabled) continue
    try {
      const src = buildSource(cfg)
      // 内置驱动实例的 id 恒等于驱动名（payload 校验与迁移已归一化，这里再兜底）
      if (src) registry.set(cfg.type === 'custom' ? cfg.id : cfg.type, src)
    } catch {
      /* 单条配置损坏不能拖垮整个注册表 */
    }
  }
}

let onlineGateOpen = true
export function _setOnlineGate(v: boolean): void {
  onlineGateOpen = v
}

/** 源可能未注册（零源 / 已删除 / 未启用），调用方必须自行兜底。
 *  本地库(local)是虚拟源：不走注册表，永可用。 */
export function getSource(id: string): Source | undefined {
  if (id === LOCAL_SOURCE_ID) return getLocalSource()
  if (!onlineGateOpen) return undefined
  return registry.get(id)
}

/** 展示名；源已删除时回退为原始 id（书架/历史里的旧数据仍能显示出处） */
export function sourceName(id: string): string {
  if (id === LOCAL_SOURCE_ID) return LOCAL_SOURCE_NAME
  return registry.get(id)?.name ?? id
}

export { COPY_CANDIDATES, DEFAULT_COPY_BASE, probeCopyApi } from './copymanga'
export { BZMH_CANDIDATES, probeBzmh } from './baozimh'
export { EXAMPLE_RULE, validateRule, makeCustomSource } from './custom'
export type { CustomRule } from './custom'
export { BUILTIN_SOURCE_NAMES, BUILTIN_TYPES } from './config'
export type { BuiltinType, SourceConfig, SourceType } from './config'
export { parseSourcePayload, exportSourcePayload } from './payload'
export type { NManga, NChapter, Source, BrowseQuery } from './types'
export { makeKey, parseKey, chapterLabel } from './types'
