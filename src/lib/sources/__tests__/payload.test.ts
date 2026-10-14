import { describe, expect, it } from 'vitest'
import { exportSourcePayload, parseSourcePayload } from '../payload'
import { EXAMPLE_RULE } from '../custom'

const RULE = {
  name: '测试源',
  baseUrl: 'https://api.test.example.com',
  list: { url: '/api/books?limit={limit}&offset={offset}', items: 'data', id: 'slug', title: 'title' },
  chapters: { url: '/api/books/{id}/chapters', items: 'data', id: 'uuid', name: 'title' },
  pages: { url: '/api/books/{mangaId}/chapters/{chapterId}/pages', items: 'data', image: 'url' },
}

describe('parseSourcePayload', () => {
  it('内置驱动配置：id 归一为驱动名，可带可选 baseUrl', () => {
    const r = parseSourcePayload(
      JSON.stringify([{ type: 'mangadex', name: '自定义名', baseUrl: 'https://line.example.com/' }])
    )
    expect(r.errors).toEqual([])
    expect(r.configs[0]).toMatchObject({ id: 'mangadex', type: 'mangadex', enabled: true, name: '自定义名', baseUrl: 'https://line.example.com' })
  })

  it('type 非法时报错并列出合法值', () => {
    const r = parseSourcePayload(JSON.stringify({ type: 'nope' }))
    expect(r.configs).toHaveLength(0)
    expect(r.errors[0]).toContain('type')
  })

  it('Base64 形态（含 URL-safe 变体与换行）可解析', () => {
    const { base64 } = exportSourcePayload([{ id: 'mangadex', name: 'MangaDex', type: 'mangadex', enabled: true }])
    const urlSafe = base64.replaceAll('+', '-').replaceAll('/', '_')
    const r = parseSourcePayload(urlSafe.replace(/(.{20})/g, '$1\n'))
    expect(r.errors).toEqual([])
    expect(r.configs[0].id).toBe('mangadex')
  })

  it('自定义源保留规则内原 id（旧订阅不失锚），保留字 local 被拒绝', () => {
    const custom = { type: 'custom', rule: { ...RULE, id: 'my-rule' } }
    const r = parseSourcePayload(JSON.stringify(custom))
    expect(r.errors).toEqual([])
    expect(r.configs[0]).toMatchObject({ id: 'my-rule', type: 'custom', baseUrl: RULE.baseUrl })

    const bad = parseSourcePayload(JSON.stringify({ type: 'custom', rule: { ...RULE, id: 'local' } }))
    expect(bad.configs).toHaveLength(0)
    expect(bad.errors[0]).toContain('保留字')
  })

  it('旧版「纯规则数组」（无 type 字段）按自定义源兼容导入', () => {
    const r = parseSourcePayload(JSON.stringify([RULE]))
    expect(r.errors).toEqual([])
    expect(r.configs[0].type).toBe('custom')
    expect(r.configs[0].name).toBe('测试源')
  })

  it('同 id 后者覆盖前者', () => {
    const r = parseSourcePayload(
      JSON.stringify([
        { type: 'mangadex', baseUrl: 'https://a.example.com' },
        { type: 'mangadex', baseUrl: 'https://b.example.com' },
      ])
    )
    expect(r.configs).toHaveLength(1)
    expect(r.configs[0].baseUrl).toBe('https://b.example.com')
  })
})

// 回归守卫：内置示例必须是中性占位（假域名），不得复用内置驱动的真实域名
describe('EXAMPLE_RULE 中性占位', () => {
  it('域名是假占位，不指向任何真实站点', () => {
    expect(EXAMPLE_RULE.baseUrl).toBe('https://api.example.com')
    expect(JSON.stringify(EXAMPLE_RULE)).not.toMatch(/copymanga|baozimh|copy4000/i)
  })
})
