import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 迁移链测试：store.ts 的 persist migrate 承载真实用户数据（v2→v6 四段迁移），
// 出错等于丢订阅。用内存 localStorage 模拟老安装，动态 import 触发 rehydrate。

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

const RULE = {
  id: 'my-rule',
  name: '我的源',
  baseUrl: 'https://rule.example.com',
  list: { url: '/api/books?limit={limit}&offset={offset}', items: 'data', id: 'slug', title: 'title' },
  chapters: { url: '/api/books/{id}/chapters', items: 'data', id: 'uuid', name: 'title' },
  pages: { url: '/api/books/{mangaId}/chapters/{chapterId}/pages', items: 'data', image: 'url' },
}

function seedSettings(state: unknown, version: number, library?: unknown) {
  // zustand 5 的 persist 带 ssrSafe 包装：无 window 的环境会把 set 换成抛错桩、
  // 水合静默失败。stub 一个 window 让 persist 走正常分支。
  vi.stubGlobal('window', globalThis)
  const seed: Record<string, string> = {
    'mangastack-settings': JSON.stringify({ state, version }),
  }
  if (library) seed['mangastack-library'] = JSON.stringify(library)
  vi.stubGlobal('localStorage', makeLocalStorage(seed))
}

async function importStore() {
  // 动态导入让 persist 在 localStorage 已就绪后创建并同步 rehydrate
  const mod = await import('../store')
  return mod.useSettings.getState()
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('settings 迁移链', () => {
  it('v2 老安装：source/自定义源四字段合并为 sourceConfigs，只迁移被引用过的内置源', async () => {
    seedSettings(
      { theme: 'dark', source: 'mangadex', customSources: [RULE], mode: 'vertical', dir: 'rtl' },
      2,
      // 书架里有一条引用了另一内置源的订阅（v2 时代复合键）
      { state: { subs: { 'baozimh:abc': { manga: { key: 'baozimh:abc' } } } }, version: 2 }
    )
    const s = await importStore()
    const ids = s.sourceConfigs.map((c) => c.id).sort()
    // mangadex 来自旧 source 字段，baozimh 来自书架复合键，未被引用的内置源不迁移
    expect(ids).toEqual(['baozimh', 'mangadex', 'my-rule'])
    expect(s.sourceConfigs.find((c) => c.id === 'my-rule')).toMatchObject({ type: 'custom', baseUrl: RULE.baseUrl })
    // v5→v6：存量用户 onlineEnabled 置开；v4→v5：activeSource 丢弃
    expect(s.onlineEnabled).toBe(true)
    expect((s as unknown as Record<string, unknown>).activeSource).toBeUndefined()
    // 新字段 updateChannel 未持久化 → 落在默认值（当前为预发布版本 → 尝鲜）
    expect(['stable', 'beta']).toContain(s.updateChannel)
  })

  it('K3 v3（enabledSources）覆盖升级路径：开关与各线路字段换算为配置', async () => {
    seedSettings(
      {
        enabledSources: ['mangadex', 'my-rule'],
        source: 'copymanga',
        copyBase: 'https://line.example.com',
        bzmhBase: 'https://bz.example.com',
        customSources: [RULE],
      },
      3
    )
    const s = await importStore()
    // copymanga 未在 enabledSources → 不迁移（哪怕 source 字段引用它）
    const ids = s.sourceConfigs.map((c) => c.id).sort()
    expect(ids).toEqual(['mangadex', 'my-rule'])
    // 自定义源启用状态跟随 enabledSources
    expect(s.sourceConfigs.find((c) => c.id === 'my-rule')?.enabled).toBe(true)
    // 旧字段清理干净
    const raw = JSON.parse(localStorage.getItem('mangastack-library') ?? 'null')
    expect(raw).toBeNull()
  })

  it('v6 当前版本：原样透传，新装零源', async () => {
    seedSettings({ theme: 'light', sourceConfigs: [], onlineEnabled: false }, 6)
    const s = await importStore()
    expect(s.sourceConfigs).toEqual([])
    expect(s.theme).toBe('light')
    expect(s.onlineEnabled).toBe(false)
  })
})
