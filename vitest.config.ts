import path from 'node:path'
import { defineConfig } from 'vitest/config'

// 独立于 vite.config.ts（不加载 react/inspect 插件），单测跑在 node 环境
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
