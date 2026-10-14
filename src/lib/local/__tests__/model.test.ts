import { describe, expect, it } from 'vitest'
import { extOf, groupChapters, isImagePath, naturalCompare } from '../model'

// 自然序决定章节排序，错了会出现 10 排在 2 前面、章节乱序
describe('naturalCompare', () => {
  it('数字段按数值比较', () => {
    expect(naturalCompare('第2话', '第10话')).toBeLessThan(0)
    expect(naturalCompare('ch10', 'ch9')).toBeGreaterThan(0)
    expect(naturalCompare('第1话', '第1话')).toBe(0)
  })

  it('非数字段按字典序（zh-Hans 排序）', () => {
    expect(naturalCompare('abc', 'abd')).toBeLessThan(0)
  })

  it('等值数字不同位数时短前缀在前（稳定）', () => {
    expect(naturalCompare('1', '001')).toBeLessThan(0)
  })
})

describe('isImagePath / extOf', () => {
  it('按扩展名识别图片', () => {
    expect(isImagePath('a/b/001.jpg')).toBe(true)
    expect(isImagePath('a/b/001.WEBP')).toBe(true)
    expect(isImagePath('a/b/notes.txt')).toBe(false)
    expect(extOf('001.png')).toBe('png')
    expect(extOf('noext')).toBe('jpg')
  })
})

// 分卷分组决定导入漫画的章节结构
describe('groupChapters', () => {
  it('无子目录 → 整包一章「全一卷」', () => {
    const r = groupChapters(['001.jpg', '010.jpg', '002.jpg'])
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ name: '全一卷', files: ['001.jpg', '002.jpg', '010.jpg'] })
  })

  it('剥掉唯一公共顶层目录后再分组', () => {
    const r = groupChapters(['漫画X/v1/001.jpg', '漫画X/v2/001.jpg'])
    expect(r.map((c) => c.name)).toEqual(['v1', 'v2'])
  })

  it('一级子目录各成一章（自然序），根部散图归「未分卷」垫后', () => {
    const r = groupChapters(['封面.png', 'v10/001.jpg', 'v2/001.jpg', 'v2/002.jpg'])
    expect(r.map((c) => c.name)).toEqual(['v2', 'v10', '未分卷'])
    expect(r[1].files).toEqual(['v10/001.jpg'])
    expect(r[2].files).toEqual(['封面.png'])
  })

  it('多个顶层目录时不剥（各成一章）', () => {
    const r = groupChapters(['a/001.jpg', 'b/001.jpg'])
    expect(r.map((c) => c.name)).toEqual(['a', 'b'])
  })
})
