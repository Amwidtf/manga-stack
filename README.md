# 漫栈 MangaStack

**English**: [README.en.md](README.en.md)

[![CI](https://github.com/Amwidtf/manga-stack/actions/workflows/ci.yml/badge.svg)](https://github.com/Amwidtf/manga-stack/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

聚合式漫画订阅阅读器 —— App 不带内容、不预置任何源：导入源配置（JSON 或 Base64）启用站点驱动或通用规则引擎，再订阅、追更、阅读。交互对标 Mihon / Tachiyomi，同时也是一个完整的本地漫画阅读器。

- 形态：Android APK（Capacitor WebView 壳），可在卓易通（鸿蒙兼容层）安装；同一套代码也可作为 Web 应用运行
- 当前版本：v0.0.1-alpha（versionCode 11），appId `com.mangastack.app`
- 数据全部存储在本机（localStorage + CacheStorage），无账号、无后端

## 功能

- **本地阅读**：导入设备上的 ZIP/CBZ 漫画压缩包或图片文件夹，离线阅读、自动进书架；不导入任何源配置时就是一个纯本地漫画阅读器
- **书架（订阅）**：订阅后自动追更，新章节未读徽标，手动检查更新，三种排序；订阅可混合来源，封面角标标注来源，支持按来源筛选
- **发现**：多源并行 —— 按源横向分区展示、跨源搜索全部已启用源；中文搜索、人气/最新/评分榜单、题材筛选、无限加载
- **详情**：封面/评分/标签/简介，章节按语言分组（简繁优先、自动回退），已读置灰，正/倒序切换，列表/网格切换
- **阅读器**：条漫（纵向滚动）+ 翻页两种模式；RTL/LTR；双指捏合/双击缩放；键盘方向键、滑动翻页、图片预载、章节目录抽屉（定位当前章、正倒序）、读完一键下一章；工具栏自动隐藏
- **历史**：按漫画分组、自动记录进度，一键续读；网格/列表切换，管理模式多选删除
- **离线缓存**：Service Worker 缓存章节图片，重读零流量，可按章/整部清理
- **下载管理**：独立页面管理漫画缓存与更新安装包——封面网格/列表、逐章或整部删除、多选批量清理
- **内置更新**：对接 GitHub Releases，稳定/尝鲜双频道检查更新，应用内下载 APK（原生插件 + 进度条）并调起系统安装器
- **设置**：深/浅主题、章节语言偏好、内容分级、阅读器默认值、源线路测活、一键恢复出厂
- **源体系**：配置驱动，App 不预置任何源；站点驱动与通用 JSON 规则引擎都要导入配置后才能使用（JSON 文本或 Base64 字符串，可分享/备份）

## 技术栈

React 19 · TypeScript · Vite 7 · Tailwind 3.4 · shadcn/ui · zustand(persist) · react-router 7 · Capacitor 7.6 · Gradle 8.11 · AGP 8.7 · Android SDK 35

## 目录结构

```
src/pages/            书架/发现/单源浏览/详情/阅读器/历史/下载管理/设置/关于
src/lib/sources/      源体系：SourceConfig 配置驱动的注册表，官方驱动 + 自定义规则引擎 + JSON/Base64 导入导出
src/lib/store.ts      全局状态（zustand persist）
android/              原生 Android 工程（克隆后需先 npm run build && npx cap sync android）
docs/                 开发交接 / 发版流程 / 仓库治理 / 代码规范
apk/                  历次发布 APK（gitignore，对外发布用 GitHub Releases）
```

## 快速开始

环境要求：Node 20、JDK 17+（建议 21）、Android SDK 35。

```bash
npm ci
npm run dev        # Web 开发调试
npm run build      # 产出 dist/
npx cap sync android
cd android && ./gradlew assembleRelease   # 打 release APK
```

### 签名配置（首次打包必读）

release 签名凭据从 `android/key.properties` 读取（已 gitignore）。模板：

```properties
storePassword=<你的密钥库密码>
keyAlias=mangastack
keyPassword=<你的密钥密码>
```

密钥库文件位于 `keystore/mangastack.keystore`（已 gitignore）。**密钥库与密码务必本地妥善保管，丢失则无法以同一签名覆盖安装/更新应用。** 没有 `key.properties` 时 release 构建会退化为 debug 签名，便于协作者本地出包。

## 文档

- [CHANGELOG.md](CHANGELOG.md)：版本历史（中文，[英文版](CHANGELOG.en.md)）
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)：完整开发交接 —— 需求演进、关键 bug 根因、遗留问题
- [docs/RELEASE.md](docs/RELEASE.md)：发版流程、版本命名与回滚策略
- [docs/CODE_STYLE.md](docs/CODE_STYLE.md)：代码规范（双语）
- [AGENTS.md](AGENTS.md)：人机共读的工程约定（AI 助手与本仓库协作前必读）
- [CONTRIBUTING.md](CONTRIBUTING.md)（[中文](CONTRIBUTING.zh-CN.md)） · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [SECURITY.md](SECURITY.md)

## 致谢与开发说明

本项目以 AI 协作方式开发：基础功能由 Kimi K3（月之暗面）经 Kimi Code 主导设计与实现；GLM（智谱）+ Z Code、Codex、MiniMax 作为辅助编码与评审工具参与。所有 AI 产出的改动均经维护者人工审查、测试并整合后才合入。

## 许可证

代码以 [MIT](LICENSE) 开源。漫画内容的版权归属各原站与版权方，本项目仅提供阅读工具，App 内附内容来源与免责声明。
