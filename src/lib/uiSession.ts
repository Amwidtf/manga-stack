import { create } from 'zustand'

// 会话级 UI 状态：不持久化，刷新/重启后自动归零
interface UiSessionState {
  // 发现页源范围：null = 全部启用源
  browseScope: Set<string> | null
  setBrowseScope: (v: Set<string> | null) => void
}

export const useUiSession = create<UiSessionState>()((set) => ({
  browseScope: null,
  setBrowseScope: (v) => set({ browseScope: v }),
}))
