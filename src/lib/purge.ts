// 删除源时的级联清理：订阅、历史与离线缓存都是该源的派生数据，
// 源被移除后永远无法再更新或打开，随源一并删除；入口先展示数量再执行。

import { useHistory, useLibrary } from './store'
import { cacheStatsForSource, clearCacheForSource, fmtBytes } from './cache'

export interface SourcePurgeStats {
  subs: number
  history: number
  chapters: number
  bytes: number
}

export function sourceDataStats(sourceId: string): SourcePurgeStats {
  const prefix = `${sourceId}:`
  return {
    subs: Object.keys(useLibrary.getState().subs).filter((k) => k.startsWith(prefix)).length,
    history: useHistory.getState().items.filter((i) => i.mangaKey.startsWith(prefix)).length,
    ...cacheStatsForSource(sourceId),
  }
}

export function hasSourceData(s: SourcePurgeStats): boolean {
  return s.subs + s.history + s.chapters > 0
}

export function formatPurgeStats(s: SourcePurgeStats): string {
  const parts: string[] = []
  if (s.subs) parts.push(`${s.subs} 条订阅`)
  if (s.history) parts.push(`${s.history} 条历史`)
  if (s.chapters) parts.push(`${s.chapters} 章离线缓存${s.bytes > 0 ? `（${fmtBytes(s.bytes)}）` : ''}`)
  return parts.join('、')
}

export async function purgeSourceData(sourceId: string): Promise<SourcePurgeStats> {
  const subs = useLibrary.getState().removeSource(sourceId)
  const history = useHistory.getState().removeSource(sourceId)
  const { chapters, bytes } = await clearCacheForSource(sourceId)
  return { subs, history, chapters, bytes }
}
