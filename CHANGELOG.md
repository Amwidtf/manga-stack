# 更新日志

本项目所有重要变更都记录在此，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与[语义化版本](https://semver.org/lang/zh-CN/)。英文版见 [CHANGELOG.en.md](CHANGELOG.en.md)。

## [Unreleased]

## [0.0.1-alpha.2] - 2026-10-14 (versionCode 13)

### 修复

- 安全区补偿存在单位错误：原生注入的是物理像素，CSS 变量按 CSS 像素使用，高密度屏（约 2.75–3 倍缩放）上补偿被等比放大——底部导航、阅读器在系统栏上方留出数倍死区（Mate60RS 级别设备约 150px 多余空白）。现注入前已按屏幕密度换算

## [0.0.1-alpha.1] - 2026-10-14 (versionCode 12)

### 修复


- Android 15（targetSdk 35）强制 edge-to-edge 后，页面顶部被状态栏遮挡——原生侧把系统栏真实 insets 注入为 CSS 变量（`--safe-top` 等），Web 侧安全区一律取 `max(env(...), var(...))`；移动端顶部标题栏与阅读器工具栏改为 min-height，不再被安全区内边距挤压；阅读器全屏容器同样带安全区内边距，漫画画面从状态栏下方开始
- 软键盘弹出时不再遮挡底部内容（含隐藏控制台的输入行）——viewport 增加 `interactive-widget=resizes-content`
- 底部抽屉（Sheet）避开手势条；顶部通知避开状态栏；设置页「清除全部应用数据」按钮长文字允许换行不再溢出

### 变更

- 阅读器（翻页模式）移除沉浸阅读时的悬浮页码——遮挡画面，页码信息由底部工具栏提供
- 章末「下一章」改为按需浮出：到达末页不打扰（最后一页完整可见），仍在末页向后翻（点按或滑动）时浮出「本章完」与「下一章」，任意点击收起

## [0.0.1-alpha] - 2026-10-13 (versionCode 11)

首个内部预发布版本。自此项目改用 SemVer 预发布号（`0.0.x-alpha`）作为内部版本，直到达到可公开发布 `0.1.0` 的程度；更早的 `1.x` 条目为开源前的历史版本名，保留备查。本构建合并了开源仓库初始化、源配置化改造、多源并行 / 内置更新 / 下载管理合入。

### 新增

- 开源仓库初始化：MIT 许可证、CONTRIBUTING / CODE_OF_CONDUCT / SECURITY、issue 与 PR 模板、CI（Web 端 lint+build，Android assembleDebug）
- 协作文档：`AGENTS.md`、`docs/DEVELOPMENT.md`、`docs/CODE_STYLE.md`
- 双语文档：README（中文为主，另有 `README.en.md`）、CONTRIBUTING（英文为主，另有 `CONTRIBUTING.zh-CN.md`）
- 源配置化：App 不再内置源，内置站点驱动与自定义规则引擎均以可导入的 `SourceConfig` 配置接入
- 设置页源管理重做：启用/停用开关；删除需确认，并级联清除该源的订阅、历史与离线缓存；镜像类驱动一键测活；配置导入（自动识别 JSON / Base64）与导出（复制 JSON / Base64）
- 多源并行：源按开关启用、可同时开启多个；发现页按源横向分区展示，跨源搜索全部已启用源
- 书架：封面来源徽标，混合来源订阅列表支持按来源筛选
- 内置更新：设置页对接 GitHub Releases 检查更新，带发布说明；应用内下载 APK（进度条）并调起系统安装器——`src/lib/update.ts` + `src/lib/native.ts` 桥接原生插件 `MangaStackPlugin`（下载到 `files/updates`，FileProvider 安装）
- 更新频道：稳定 / 尝鲜双频道，预发布构建默认尝鲜
- 下载管理独立成页：漫画缓存与更新安装包移出设置页——封面网格（可切列表）、逐章 / 整部 / 清空删除、管理模式多选删除
- 历史按漫画分组重做：默认网格、可展开列表、一键续读、管理模式多选删除
- 封面自愈：历史分组缺失封面时从书架或源（详情请求，退回标题搜索）回填；占位用标题文本填充而非裂图图标；瞬时加载失败自动重试后才定格
- 阅读器章节目录抽屉：定位当前章、正倒序切换
- Service Worker 离线页缓存：跨域图片 cache-first，重读零流量；加载失败自动清缓存并重试
- 一键恢复出厂：清除全部应用数据（订阅、历史、设置、缓存、已下载安装包）
- 发布工程：`scripts/bump-version.mjs` 同步三处版本号（package.json / appmeta.ts / build.gradle）；推送 `v*` tag 触发发布工作流，用 secrets 签名 APK 并发布到 GitHub Releases
- 本地漫画库：从设备导入 ZIP/CBZ 压缩包或图片文件夹（Android），导入即入书架成为本地源；设置页可管理，删除时级联移除其订阅与历史
- 路由级代码分割（懒加载），首屏 chunk 回落至 500 kB 告警线以下

### 变更

- 内置站点驱动改为配置驱动的工厂函数（每站一个 `make*` 工厂）；注册表由 `applySourceConfigs` 依据持久化的 `sourceConfigs` 重建，保持「渲染前同步注册 + 指纹幂等」
- 设置存储 v2 → v3 → v4 迁移：旧的激活源字段、各驱动的线路设置与自定义规则合并进 `sourceConfigs` + `activeSource`；只迁移订阅 / 历史 / 旧激活源实际引用过的内置源，全新安装零源启动；v4 增加兼容路径，把旧版 K3 式 `enabledSources` 配置转换为现行结构，覆盖升级不丢源
- `getSource(id)` 改为可返回 `Source | undefined`：书架检查更新跳过已删除的源，详情 / 阅读页各有空态兜底
- MangaDex 语言 / 内容分级偏好改为存在已启用的 MangaDex 配置时才显示（此前为全局显示条件）
- 全新安装默认聚焦本地漫画阅读体验，发现页与在线源管理默认不显示

### 修复

- 跨章跳转不再保留上一章的页码——页码状态按章节纪元盖章，过期更新一律忽略
- Zoomable 符合 react-hooks v7 规则（ref 写入移入 effect；`touchAction` 由状态推导）
- `package-lock.json` 源地址统一为 `registry.npmjs.org`
- ESLint 基线转绿（shadcn/ui vendored 文件豁免 fast-refresh 纯函数规则）
- 阅读器翻页热区（左右 30%）不再参与双击缩放判定；双击增加 60px 位置阈值，两次远距离快速点按不再误判为双击
- 底部导航栏与系统手势条重叠——增加安全区间距
- 系统返回键直接退出应用：补齐 `@capacitor/app` 原生侧同步（`capacitor.plugins.json` / capacitor gradle 接线），恢复应用内返回导航
- 设置页本地漫画条目指向失效的 `/detail/` 路由——改为 `/manga/`

### 安全

- 发布签名凭据从 `android/app/build.gradle` 迁出至不入库的 `android/key.properties`；缺失时 release 构建回退 debug 签名

## [1.6.0] - 2026-10-02 (versionCode 7)

### 修复

- 翻页模式锁定 `touch-none`，垂直滑动不再变成页面滚动
- 方向切换按钮仅在翻页模式显示

## [1.5.0] - 2026-10-02 (versionCode 6)

### 新增

- 新增 HTML 解析型内置站点驱动（3 条镜像线路、一键测活、自动切换）
- 原生 HTTP 通道（CapacitorHttp），APK 内绕过 WebView CORS
- 设置页「关于」：版本号、内容来源 / 隐私 / 免责 / 开源声明
- 书架与历史的来源徽标

### 修复

- 导航返回栈重构（Mihon 式）：阅读器返回与章节间跳转均用 replace 语义，栈空回书架，顶层双击退出——修复返回键 ping-pong 与「返回即退出应用」
- 确认弹窗经 Portal 居中渲染，不再被底部导航遮挡

## [1.4.0] - 2026-10-02 (versionCode 5)

### 新增

- 视口锁定（禁用页面缩放）；阅读器内置 Zoomable 组件：捏合缩放、双击 2.4x、缩放中拖动，缩放期间屏蔽翻页手势

### 修复

- 详情页横向溢出：章节头部的语言筛选 chips 独立成行（`min-w-0` flex 修复）

## [1.3.0] - 2026-10-02 (versionCode 4)

### 新增

- 六项 UX 改进：硬件返回处理、规则源表单编辑器、章节正倒序、列表/网格切换、被动 + 主动离线缓存与清理、全局二次确认弹窗

## [1.2.0] - 2026-10-02 (versionCode 3)

### 新增

- 站点驱动多线路（国际线路 + 大陆中转）、一键测活、失败自动切换

## [1.1.0] - 2026-10-02 (versionCode 2)

### 新增

- 自定义源 JSON 规则引擎（初版）

## [1.0.0] - 2026-10-02 (versionCode 1)

### 新增

- 首个版本：书架 / 发现 / 详情 / 阅读器 / 历史 / 设置；MangaDex 与第二个站点驱动；Capacitor 打包 Android
