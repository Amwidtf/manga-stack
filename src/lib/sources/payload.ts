// 源配置的导入/导出：JSON 文本与 Base64 字符串两种形态，自动识别。
// 兼容旧版「纯规则数组」导出（无 type 字段、带 list/chapters/pages 的对象按自定义源处理）。

import { BUILTIN_SOURCE_NAMES, BUILTIN_TYPES, type BuiltinType, type SourceConfig, type SourceType } from './config'
import { validateRule, type CustomRule } from './custom'
import { LOCAL_SOURCE_ID } from '../local/model'

const SOURCE_TYPES: SourceType[] = [...BUILTIN_TYPES, 'custom']

export function parseSourcePayload(text: string): { configs: SourceConfig[]; errors: string[] } {
  const errors: string[] = []
  const trimmed = text.trim()
  if (!trimmed) return { configs: [], errors: ['内容为空'] }

  const raw = trimmed.startsWith('{') || trimmed.startsWith('[') ? tryJson(trimmed, errors) : tryBase64Json(trimmed, errors)
  if (raw === undefined) return { configs: [], errors }

  const items = Array.isArray(raw) ? raw : [raw]
  // id 冲突策略：同一份配置内后者覆盖前者；导入到设置时同样按 id 覆盖已有配置，
  // 对应「导出 → 改线路 → 导回」的更新路径
  const byId = new Map<string, SourceConfig>()
  items.forEach((item, i) => {
    const r = toConfig(item, i)
    errors.push(...r.errors)
    if (r.cfg) byId.set(r.cfg.id, r.cfg)
  })
  return { configs: [...byId.values()], errors }
}

function tryJson(text: string, errors: string[]): unknown {
  try {
    return JSON.parse(text)
  } catch {
    errors.push('JSON 解析失败：检查括号、引号是否完整')
    return undefined
  }
}

function tryBase64Json(text: string, errors: string[]): unknown {
  try {
    // 容忍 URL-safe 变体与排版时带入的空白换行；缺 padding 时补齐
    let b64 = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '='.repeat(4 - pad)
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    errors.push('无法识别：既不是合法 JSON，也不是可解码的 Base64 配置')
    return undefined
  }
}

function toConfig(item: unknown, index: number): { cfg?: SourceConfig; errors: string[] } {
  const tag = `第 ${index + 1} 条`
  if (!item || typeof item !== 'object' || Array.isArray(item)) return { errors: [`${tag}：不是合法的配置对象`] }
  const o = item as Record<string, unknown>

  // 旧版导出的是纯 CustomRule（无 type，有 list/chapters/pages），按自定义源兼容导入
  if (o.type === undefined && o.list && o.chapters && o.pages) return customConfig(o, tag)

  if (typeof o.type !== 'string' || !SOURCE_TYPES.includes(o.type as SourceType)) {
    return { errors: [`${tag}：type 必须是 ${SOURCE_TYPES.join(' / ')} 之一`] }
  }
  if (o.name !== undefined && (typeof o.name !== 'string' || !o.name.trim())) {
    return { errors: [`${tag}：name 不能为空`] }
  }

  if (o.type === 'custom') return customConfig((o.rule ?? o) as Record<string, unknown>, tag, o)

  // 内置驱动：id 归一为驱动名——书架/历史的复合键直接引用它，不允许自定义；
  // baseUrl 可选，缺省时驱动内部走默认线路
  const type = o.type as BuiltinType
  const name = typeof o.name === 'string' ? o.name.trim() : BUILTIN_SOURCE_NAMES[type]
  const baseUrl = o.baseUrl
  if (baseUrl !== undefined && (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl))) {
    return { errors: [`${tag}（${name}）：baseUrl 必须是 http(s) 地址`] }
  }
  return {
    cfg: {
      id: type,
      name,
      type,
      enabled: o.enabled !== false,
      ...(typeof baseUrl === 'string' && baseUrl ? { baseUrl: baseUrl.replace(/\/+$/, '') } : {}),
    },
    errors: [],
  }
}

function customConfig(
  rawRule: Record<string, unknown>,
  tag: string,
  wrapper?: Record<string, unknown>
): { cfg?: SourceConfig; errors: string[] } {
  const v = validateRule(rawRule)
  if (!v.ok || !v.rule) return { errors: v.errors.map((e) => `${tag}：${e}`) }
  const rule: CustomRule = v.rule
  // 尽量保留规则原有 id：订阅/历史的复合键引用它，换新 id 等于让旧数据失锚
  const oldId = typeof rawRule.id === 'string' ? rawRule.id : ''
  if (oldId && !oldId.includes(':') && oldId.length <= 64) rule.id = oldId
  // 'local' 是本地漫画库的保留命名空间，自定义源不得占用
  if (rule.id === LOCAL_SOURCE_ID) return { errors: [`${tag}：id「${LOCAL_SOURCE_ID}」为保留字，请更换`] }
  const name = typeof wrapper?.name === 'string' && wrapper.name.trim() ? wrapper.name.trim() : rule.name
  return {
    cfg: { id: rule.id, name, type: 'custom', enabled: wrapper?.enabled !== false, baseUrl: rule.baseUrl, rule },
    errors: [],
  }
}

export function exportSourcePayload(configs: SourceConfig[]): { json: string; base64: string } {
  const json = JSON.stringify(configs, null, 2)
  // unescape/encodeURIComponent 组合处理中文等多字节字符
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(configs))))
  return { json, base64 }
}
