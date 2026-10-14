// 源配置模型：App 不内置任何源，运行时注册表完全由用户持有的 SourceConfig 驱动。
// 内置驱动的配置 id 恒等于驱动名（mangadex/copymanga/baozimh）——书架与历史的
// 复合键 `${source}:${id}` 直接引用它，id 一旦漂移，旧数据就全部失锚。

import type { CustomRule } from './custom'

export type SourceType = 'mangadex' | 'copymanga' | 'baozimh' | 'custom'

export interface SourceConfig {
  id: string
  name: string
  type: SourceType
  enabled: boolean
  baseUrl?: string // copymanga/baozimh/custom 用；缺省时驱动内部走默认线路
  rule?: CustomRule // type==='custom' 时必填
}

export const BUILTIN_TYPES = ['mangadex', 'copymanga', 'baozimh'] as const

export type BuiltinType = (typeof BUILTIN_TYPES)[number]

export const BUILTIN_SOURCE_NAMES: Record<BuiltinType, string> = {
  mangadex: 'MangaDex',
  copymanga: '拷贝漫画',
  baozimh: '包子漫画',
}
