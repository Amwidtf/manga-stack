# AGENTS.md — 智能体协作指南 / Agent Guide

> AI 编码助手（Kimi Code / Claude Code / Cursor 等）在本仓库工作时，先读本文件，再读 `docs/DEVELOPMENT.md`。
>
> **English quick brief**: MangaStack is an aggregated manga reader (React SPA packaged to Android via Capacitor, all data on-device). Commands below work from the repo root. Hard rules: keep version numbers in sync across `package.json` + `src/lib/appmeta.ts` + `android/app/build.gradle` (use `node scripts/bump-version.mjs`); never commit `*.keystore` / `android/key.properties` / `apk/`; commits in English (Conventional Commits); code comments in Chinese; docs are bilingual CN-primary/EN pairs (README/CHANGELOG Chinese-first with `.en` companions, CONTRIBUTING English-first with `.zh-CN` companion) and must stay in sync; run `npm test && npm run lint && npm run build` before every commit. Details below are in Chinese — translate as needed.

## 项目一句话

漫栈 MangaStack：聚合式漫画订阅阅读器。React SPA + Capacitor 打包 Android APK，数据全部存本机（localStorage + CacheStorage），无后端。

## 语言与文案约定（公开仓库规范）

| 对象 | 语言 | 说明 |
|---|---|---|
| 提交信息 | **英文** | Conventional Commits：`type(scope): summary`，type ∈ `feat` `fix` `refactor` `perf` `docs` `style` `test` `build` `ci` `chore` `revert` |
| PR 标题 / issue 标题 | 英文优先 | 正文可中文；模板已内置自查清单 |
| 代码注释 | 中文 | 目标协作者以中文为主；标识符一律英文 |
| 用户界面文案 | 中文 | 目标用户为中文漫画读者 |
| 文档 | **中英双语** | 见下「双语文档同步规则」 |

### 双语文档同步规则（改动文档时必须遵守）

- 成对维护：`README.md`(CN，主文档) ↔ `README.en.md`(EN)；`CONTRIBUTING.md`(EN) ↔ `CONTRIBUTING.zh-CN.md`(CN)。改一边必须同步另一边。
- `CHANGELOG.md`（CN，主文档）↔ `CHANGELOG.en.md`（EN）成对维护，遵循 Keep a Changelog + SemVer；GitHub Release 说明由 CI 取中文段落，正文末尾自动附英文版链接。
- `SECURITY.md`、`docs/CODE_STYLE.md` 为单文件双语（英文段在前）。
- `docs/DEVELOPMENT.md`、`docs/RELEASE.md` 为中文内部文档，不要求英文版。
- issue / PR 模板为中文（用户群体为中文读者），无需双语。

## 常用命令（工作目录为仓库根目录）

```bash
npm ci                 # 安装依赖（不要 npm install，避免锁文件漂移）
npm run dev            # Vite 开发调试（Web 形态）
npm run lint           # ESLint，提交前必过
npm test               # vitest 单元测试，提交前必过
npm run build          # tsc -b && vite build → dist/，提交前必过
npx cap sync android   # 把 dist/ 同步进 Android 工程
cd android && ./gradlew assembleDebug     # 本地验证包（无需签名）
cd android && ./gradlew assembleRelease   # 发布包（需要 android/key.properties）
```

环境要求：Node 20（见 `.nvmrc`；Node 24 实测可跑 Web 构建）、JDK 17+、Android SDK 35。

## 目录结构

```
src/pages/            九个页面：Library(书架)/Browse(发现)/SourceBrowse(单源浏览)/Detail/Reader/History/Downloads(下载管理)/Settings/About
src/lib/sources/      源体系：SourceConfig 配置驱动（config.ts）+ 站点驱动工厂（每站一文件）+ custom.ts 规则引擎 + payload.ts 导入导出
src/lib/store.ts      zustand persist 全局状态（订阅/进度/设置/历史）
src/lib/local/        本地漫画库：ZIP/CBZ 与文件夹导入、IndexedDB 元数据、本地 Source 实现
src/lib/update.ts     内置更新检查（GitHub Releases）；src/lib/native.ts 为原生插件桥
android/              Capacitor Android 工程（含自有插件 MangaStackPlugin；克隆后需先 npm run build && npx cap sync android 再 gradle 构建）
scripts/              bump-version.mjs（版本号同步，pre 关键字递增预发布计数）
docs/                 DEVELOPMENT.md（开发交接）/ RELEASE.md（发版流程）/ CODE_STYLE.md（代码规范）
apk/                  本地 APK（gitignore；对外发布用 GitHub Releases）
```

## 硬性约定（违反会破坏发布流程）

1. **版本号三处同步**：`package.json`（version）、`src/lib/appmeta.ts`（APP_VERSION/APP_BUILD）、`android/app/build.gradle`（versionCode/versionName）必须一起改——一律用 `node scripts/bump-version.mjs`（`pre` 关键字预发布计数自动 +1，如 `0.0.1-alpha` → `0.0.1-alpha.1`；也可显式指定版本号；versionCode 默认 +1，package-lock.json 顶部版本号由脚本一并同步），不要手改单处。正式公开发布（`0.1.0` 门槛）前内部构建一律用 `0.0.x-alpha.N` 预发布号，同一 x.y.z 内 N 只增不减。发版流程详见 `docs/RELEASE.md`：bump 脚本 → CHANGELOG 中英两文件同步条目（Release 说明由 CI 自动取中文段落并附英文版链接）→ 提交并 `git tag v*` 推送，release.yml 自动验签、按标签标记 pre-release 并发签名 APK 到 Releases（所需 secrets 见 workflow 头部注释）。
2. **敏感文件绝不入库**：`*.keystore`、`android/key.properties`、`apk/` 均在 .gitignore。签名配置模板见 README。
3. **package-lock.json 的 resolved 一律指向 `registry.npmjs.org`**（公开仓库要求，CI 在境外运行）。
4. 改动 `android/` 后，至少跑一次 `assembleDebug` 验证工程完整（CI 也会跑）。
5. 代码风格细节（命名、组件、样式、状态管理）见 `docs/CODE_STYLE.md`， lint 全绿是底线不是全部。

## 架构要点与已知坑（改相关代码前必读）

- **导航返回栈**：阅读器内返回、章节间导航一律用 **replace 语义**；push 会造成 详情↔阅读 ping-pong（v1.5 重构过，见 DEVELOPMENT.md 第四节）。
- **源注册时序**：注册表完全由持久化的 `sourceConfigs` 构建——必须在 React 渲染前同步调用 + 指纹幂等（`main.tsx` 调 `applySourceConfigs(useSettings.getState().sourceConfigs)`，store 的源 actions 同步重建），不要在组件 useEffect 里注册。
- **零源兜底**：App 不内置源，`getSource(id)` 返回 `Source | undefined`；书架检查更新跳过缺失源，详情/阅读/发现页各有空态，调用方不许假设源一定存在。
- **本地源**：`src/lib/local/` 自含（导入器 + IndexedDB 元数据 + 本地 Source 实现）；`getSource(LOCAL_SOURCE_ID)` 始终可用，不依赖源配置注册表，离线/零源场景不得把它当缺失源处理。
- **CORS 双通道**：APK 内走 CapacitorHttp 原生通道，Web 端 fallback fetch；**纯 HTML 解析型站点驱动只在 APK 内可用**（WebView CORS 限制，且需用户自行导入配置），Web 预览测不通是正常现象。
- **内置更新链路**：设置页检查更新走 `src/lib/update.ts`（查 GitHub Releases，稳定/尝鲜双频道，预发布安装默认尝鲜，fail soft）→ `src/lib/native.ts`（Capacitor 桥）→ 原生 `MangaStackPlugin`（HttpURLConnection 下载到 `files/updates`、FileProvider 调起系统安装器）；Web 端原生调用必 reject，调用方必须先 `isNative()` 把关。原生侧接线三处缺一不可：`capacitor.plugins.json`、`capacitor.build.gradle`、`capacitor.settings.gradle`（`@capacitor/app` 原生未同步曾导致返回键直接退出应用，`npx cap sync` 会自动补齐，手改 android 工程时注意别丢）。
- **阅读器手势**：翻页模式容器必须 `touch-none`（否则垂直手势被浏览器接管变滚动）；Zoomable 组件的回调必须经 cbRef 转发且在 effect 中赋值（react-hooks/refs 规则）。
- **flex 溢出**：横向滚动容器在 flex 行内必须加 `min-w-0`。

## 完成定义（DoD）

- `npm test`、`npm run lint` 与 `npm run build` 全绿
- 提交信息为英文 Conventional Commits；改了双语文件则两边已同步
- 涉及导航/阅读器/源体系的改动：对照 DEVELOPMENT.md 第四节自查未引入回归
- 涉及版本发布：三处版本号已同步（用 bump 脚本）+ CHANGELOG 中英两文件已同步 + APK 真机覆盖安装验证数据保留
