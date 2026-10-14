import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  // 绝对路径:BrowserRouter 二级路由(/read/:k/:c 等)下相对 base 会让
  // index.html 的 ./assets/* 解析进子目录而 404 白屏;Capacitor 从
  // https://localhost 根加载,绝对路径同样成立
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
