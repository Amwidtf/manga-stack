import { describe, expect, it } from 'vitest'
import { APP_VERSION, compareSemver, defaultUpdateChannel } from '../appmeta'

// semver 比较是内置更新链路的判断依据（含预发布段），错了会导致漏更新或重复提示
describe('compareSemver', () => {
  it('主版本段数值比较', () => {
    expect(compareSemver('0.0.2', '0.0.1')).toBeGreaterThan(0)
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareSemver('0.0.1', '0.0.1')).toBe(0)
    expect(compareSemver('2.0.0', '10.0.0')).toBeLessThan(0)
  })

  it('容忍 v 前缀', () => {
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('v0.0.1-alpha.2', 'v0.0.1-alpha.1')).toBeGreaterThan(0)
  })

  it('正式版 > 预发布版', () => {
    expect(compareSemver('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '1.0.0-alpha.99')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBeLessThan(0)
  })

  it('预发布计数递增（内部构建命名 0.0.x-alpha.N 的关键序）', () => {
    expect(compareSemver('0.0.1-alpha.1', '0.0.1-alpha')).toBeGreaterThan(0)
    expect(compareSemver('0.0.1-alpha.2', '0.0.1-alpha.1')).toBeGreaterThan(0)
    expect(compareSemver('0.0.1-alpha.10', '0.0.1-alpha.9')).toBeGreaterThan(0)
  })

  it('预发布字母段按 ASCII，数字段小于字母段（SemVer 规范）', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBeLessThan(0)
  })

  it('补丁版本提升大于任何预发布差异', () => {
    expect(compareSemver('0.0.2-alpha.1', '0.0.1')).toBeGreaterThan(0)
  })
})

describe('defaultUpdateChannel', () => {
  it('预发布安装默认尝鲜版，正式版默认稳定版', () => {
    expect(defaultUpdateChannel()).toBe(/-(?:alpha|beta|rc)/i.test(APP_VERSION) ? 'beta' : 'stable')
    // 当前版本带预发布后缀 → 默认必须是尝鲜版（否则查 /latest 会 404）
    if (/-alpha|-beta|-rc/i.test(APP_VERSION)) expect(defaultUpdateChannel()).toBe('beta')
  })
})
