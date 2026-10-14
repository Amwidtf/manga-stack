import { beforeEach, describe, expect, it, vi } from 'vitest'

// patchMangaCover 回填测试：历史页封面自愈写回依赖它——只补空值、不动已有封面、
// 无可补条目时不产生多余写入。沿用 ssrSafe 说明：先 stub window 再动态 import。

function makeLocalStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

const ROW = (mangaKey: string, cover: string | null, chapterKey: string, at: number) => ({
  mangaKey,
  mangaTitle: mangaKey.slice(2),
  cover,
  chapterKey,
  chapterLabel: '第1话',
  page: 0,
  at,
})

async function importStore(items: unknown[]) {
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal(
    'localStorage',
    makeLocalStorage({ 'mangastack-history': JSON.stringify({ state: { items }, version: 2 }) })
  )
  return import('@/lib/store')
}

describe('useHistory patchMangaCover', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('只回填空封面并持久化', async () => {
    const mod = await importStore([
      ROW('s:a', null, 's:a:1', 1),
      ROW('s:a', 'old.png', 's:a:2', 2),
      ROW('s:b', 'b.png', 's:b:1', 3),
    ])
    const { useHistory } = mod
    useHistory.getState().patchMangaCover('s:a', 'new.png')
    const items = useHistory.getState().items
    expect(items.find((i) => i.chapterKey === 's:a:1')?.cover).toBe('new.png')
    expect(items.find((i) => i.chapterKey === 's:a:2')?.cover).toBe('old.png') // 已有封面不覆盖
    expect(items.find((i) => i.chapterKey === 's:b:1')?.cover).toBe('b.png') // 其他漫画不受影响
    const saved = JSON.parse(globalThis.localStorage.getItem('mangastack-history')!)
    expect(saved.state.items.find((i: { chapterKey: string }) => i.chapterKey === 's:a:1').cover).toBe('new.png')
  })

  it('无可补条目时不产生写入', async () => {
    const mod = await importStore([ROW('s:b', 'b.png', 's:b:1', 1)])
    const { useHistory } = mod
    const before = useHistory.getState().items
    useHistory.getState().patchMangaCover('s:b', 'x.png')
    expect(useHistory.getState().items).toBe(before) // 引用不变，persist 不落盘
  })
})
