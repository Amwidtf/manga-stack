import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXAMPLE_RULE, validateRule } from '../custom'

const RULE = {
  name: '测试源',
  baseUrl: 'https://api.test.example.com',
  list: { url: '/api/books?limit={limit}&offset={offset}', items: 'data', id: 'slug', title: 'title' },
  chapters: { url: '/api/books/{id}/chapters', items: 'data', id: 'uuid', name: 'title' },
  pages: { url: '/api/books/{mangaId}/chapters/{chapterId}/pages', items: 'data', image: 'url' },
}

describe('validateRule', () => {
  it('缺关键字段时报中文错误清单', () => {
    const v = validateRule({ name: 'x', baseUrl: 'ftp://bad' })
    expect(v.ok).toBe(false)
    expect(v.errors.some((e) => e.includes('baseUrl'))).toBe(true)
    expect(v.errors.some((e) => e.includes('list.url'))).toBe(true)
  })

  it('合法规则通过并生成 c- 前缀 id', () => {
    const v = validateRule(RULE)
    expect(v.ok).toBe(true)
    expect(v.rule!.id).toMatch(/^c-/)
    expect(v.rule!.baseUrl.endsWith('/')).toBe(false)
  })

  it('内置示例规则本身合法（保证设置页示例可用）', () => {
    const v = validateRule(EXAMPLE_RULE)
    expect(v.ok).toBe(true)
  })
})

// 引擎端到端：stub fetch（node 环境下 http.ts 走 fetch 回退分支），
// 覆盖字段路径提取、URL 模板、图片顺序重排
describe('makeCustomSource 引擎', () => {
  afterEach(() => vi.unstubAllGlobals())

  const rule = {
    ...RULE,
    list: {
      url: '/api/books?limit={limit}&offset={offset}',
      items: 'data.items',
      id: 'slug',
      title: 'title',
      cover: 'cover',
      author: 'authors[].name',
    },
    chapters: {
      url: '/api/books/{id}/chapters?limit=500&offset={offset}',
      items: 'data',
      id: 'uuid',
      name: 'title',
      date: 'created_at',
      size: 'page_count',
    },
    pages: {
      url: '/api/books/{mangaId}/chapters/{chapterId}/pages',
      items: 'data.pages',
      image: 'url',
      order: 'data.words',
    },
  }

  it('browse 映射字段、拼接封面绝对地址', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toContain('limit=24&offset=0')
        return new Response(
          JSON.stringify({
            data: { items: [{ slug: 'a', title: '书A', cover: '/img/a.jpg', authors: [{ name: '作者1' }, { name: '作者2' }] }] },
          })
        )
      })
    )
    const { makeCustomSource } = await import('../custom')
    const src = makeCustomSource(rule as never)
    const r = await src.browse({ offset: 0, limit: 24, order: 'default' })
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ id: 'a', title: '书A', author: '作者1、作者2' })
    expect(r.items[0].cover).toBe('https://api.test.example.com/img/a.jpg')
  })

  it('getPages 按 order 数组重排乱序图片', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: { pages: [{ url: '/p1.jpg' }, { url: '/p2.jpg' }, { url: '/p3.jpg' }], words: [2, 0, 1] } })
          )
      )
    )
    const { makeCustomSource } = await import('../custom')
    const src = makeCustomSource(rule as never)
    const pages = await src.getPages({ mangaId: 'a', id: 'ch1' } as never)
    expect(pages).toEqual([
      'https://api.test.example.com/p2.jpg',
      'https://api.test.example.com/p3.jpg',
      'https://api.test.example.com/p1.jpg',
    ])
  })
})
