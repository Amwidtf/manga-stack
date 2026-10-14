# 漫栈 MangaStack 开发交接文档

> 本文整理自早期 AI 协作开发会话的交接记录（2026-10-02），供后续开发参考。
> 内部备注（原始会话链接、协作偏好）保存在不入库的 `.local/` 目录。

## 一、需求演进（按时间顺序）

1. 寻找可订阅心仪漫画站的漫画 App → 决定自研，要求好用、简洁、功能全面
2. 必须是手机 App（卓易通可安装的 APK），而非纯 Web
3. 支持自定义源，目标站点的大陆镜像地址可配置
4. 源方案定为**通用规则源引擎**：代码自研，架构参考 Tachiyomi/Mihon 扩展体系与「阅读/Cimoc」规则源思路
5. 某站点在手机上连不上 → 诊断为 api.* 子域被大陆运营商拦截，加大陆专线 + 一键测活 + 自动切换
6. 六点 UX 需求：①返回键不退出软件 ②规则源表单填写模式 ③章节排序切换 ④章节列表/网格切换 ⑤离线缓存可清理 ⑥清除操作二次确认
7. 页面禁止缩放（只有漫画图片能缩放）；修复详情页横向滚动溢出
8. 七点反馈：阅读页返回变退出、阅读↔详情返回 ping-pong、新增内置源、确认弹窗被底栏遮挡、设置页显示版本号与上架条款声明、书架/历史显示来源徽标
9. 翻页模式实际变成上下滑动 → 根因：`touch-pan-y` 让垂直手势变成页面滚动 → 改 `touch-none` 锁死

## 二、技术决策

- **前端**：React 19 + TypeScript + Vite 7 + Tailwind 3.4 + shadcn/ui + zustand(persist) + react-router 7；深色优先 `#0b0b0c` + 红色主色
- **打包**：Capacitor 7.6.9（+@capacitor/app），Gradle 8.11.1，AGP 8.7.2，Android SDK 35
- **签名**：keystore 在 `keystore/mangastack.keystore`（gitignore）；凭据在 `android/key.properties`（gitignore）；v1.0–v1.6 签名一致，覆盖安装保留数据
- **存储**：全部本地。zustand persist → localStorage（订阅/进度/设置/历史）；离线图片 → CacheStorage + localStorage 元数据（跨域图片走 no-cors opaque，体积按 153600B/页估算）
- **版本号三处同步**：`package.json`、`src/lib/appmeta.ts`、`android/app/build.gradle`，统一用 `scripts/bump-version.mjs`（开源前 v1.x 时代为 build.gradle 与 appmeta.ts 双处手动同步）

## 三、版本历史

| 版本 | 变更 |
|---|---|
| v1.0 | 基础版：书架/发现/详情/阅读器/历史/设置，MangaDex + 第二个站点驱动 |
| v1.1 | 自定义源 JSON 规则引擎初版 |
| v1.2 | 站点驱动多线路（国际线 + 大陆专线）+ 一键测活 + 断线自动切换 |
| v1.3 | 六点 UX 全量：硬件返回处理、规则源表单编辑器、章节正倒序、列表/网格切换、被动+主动离线缓存与清理、Confirm 二次确认弹窗 |
| v1.4 | viewport 锁定禁止页面缩放；阅读器自实现 Zoomable 组件（双指捏合/双击 2.4x/缩放拖动，缩放中屏蔽翻页手势）；详情页章节头部溢出修复（语言筛选 chips 独立成行） |
| v1.5 | 返回栈重构（阅读器返回 replace 到详情、章节导航 replace、栈空兜底回书架、顶层双击退出）；新增 HTML 解析型内置站点驱动；原生 HTTP 通道（CapacitorHttp）绕 WebView CORS；确认弹窗 Portal 到 body 居中置顶；设置页版本号 + 内容来源/隐私/免责/开源声明；书架历史来源徽标 |
| v1.6 | 翻页模式 `touch-none` 锁死垂直滑动；方向切换按钮仅翻页模式显示 |

## 四、关键 bug 与根因（重要，勿重蹈覆辙）

- **返回 ping-pong**：阅读器内返回按钮用 push 跳详情页，栈变成 详情→阅读→详情→阅读，硬件返回在两级间循环；栈耗尽后表现为「返回即退出」。修复 = replace 语义
- **WebView 跨域**：`<img>` 能显示但 fetch() 被 CORS 拦（缓存功能一度失败）；HTML 解析型站点整站抓取在 WebView 内全部 CORS 失败。修复 = CapacitorHttp 原生通道（仅 APK 内），Web 端 fallback fetch —— 因此该类站点驱动只在 APK 可用
- **规则源注册时序**：zustand rehydrate 后 App useEffect 晚于首帧渲染，且重复注册清空内存缓存。修复 = main.tsx 渲染前同步注册 + 指纹幂等（见 `src/lib/sources/index.ts` registerCustomSources）
- **Zoomable 缩放莫名复位**：父组件每次渲染传入新内联回调，setT 引用变化触发重置 effect。修复 = cbRef 转发
- **缩放吃掉单击**：suppress 标志残留吞掉下一次真实点按。修复 = 手势开始时重置 + click 统一调度
- **某站点 api.\* 子域被墙**：连接层拦截（非 DNS/CORS），可用域名列表参考自社区 Mihon 扩展
- **详情页横向滚动**：章节头部 flex 行中 overflow-x-auto 容器无 `min-w-0`，chips 把按钮挤出视口

### 测试基建注意事项

- SPA 静态测试服务器需带路由回退，且 `/tmp` 在沙箱常被清空需重建
- `sed -i` 在 `/mnt` 挂载点报错，需用编辑工具改文件
- Playwright strict 模式要点 role 定位，避免命中桌面侧栏的隐藏同名元素

## 五、数据源现状

| 源 | 可用性 | 限制 |
|---|---|---|
| MangaDex | 境外稳定 | 中文资源少，API 规范完整 |
| 多线路站点驱动 | 大陆可用性需真机持续观察 | api.* 子域被运营商拦；专线域名有 IP 白名单，沙箱无法验证 |
| HTML 解析型站点驱动 | 已实测全链路可用 | 纯 HTML 解析无官方 API；仅 APK 内可用；镜像域名轮换需维护候选域名常量 |
| 自定义规则源 | 引擎完整（表单 + JSON） | 仅支持 JSON API 型站点，不支持 HTML 解析型 |

## 六、架构演进：源配置化（v1.7 开发中）

- 内置站点驱动从编译期单例改为 `SourceConfig` 配置驱动：store 持久化 `sourceConfigs[]`，`applySourceConfigs` 在渲染前同步构建注册表（沿用「渲染前同步 + 指纹幂等」）
- 驱动工厂化：`make*` 工厂函数每站一个；baseUrl/缓存/换线状态归属实例，断线自动换线成功经 `onSourceAutoSwitch` 回调把新 baseUrl 持久化回对应配置
- 设置存储 v2→v3 迁移：旧 `customSources` 逐条转 `type:'custom'` 配置；仅当订阅/历史的复合键或旧 `source` 字段实际引用过某内置驱动时才迁移该驱动配置（baseUrl 取旧的站点线路字段，空则省略、驱动走默认线路）；activeSource 取旧 source，失效兜底第一个 enabled，再否则 null；全新安装零源
- 导入导出：`parseSourcePayload` 自动识别 JSON / Base64（容忍 URL-safe 与空白换行；兼容旧版纯规则导出），同 id 冲突后者覆盖前者；`exportSourcePayload` 同时产出 JSON 与 Base64
- 复合键兼容：内置驱动的配置 id 恒等于驱动名（payload 校验与迁移都归一化），自定义源迁移与导入都保留原 id——书架/历史里的 `source:id` 键不受影响
- 设置页不再提供「表单填规则」入口，自定义源统一走导入框（可粘贴单条规则 JSON，示例按钮保留）

## 七、遗留问题与未实现需求

- **深链整页导航白屏（Capacitor 既有行为）**：在 APK 内对 `/read/...`、`/manga/...` 等路由做整页跳转（`location.href` 或刷新）时，WebViewAssetLoader 没有SPA history 兜底，直接 404 白屏；应用内导航（Link/replace）不受影响。后续可评估 HashRouter 或原生侧 `shouldInterceptRequest` 兜底。离线图片缓存已由 Service Worker（`public/sw.js`，图片请求 cache-first）接管，APK 内根路径刷新在 SW 接管下验证正常。
- 多线路站点在用户设备上的大陆可用性需持续观察 —— 真机验证的长期项
- 曾评估过新增其他站点，源站不稳（522/523）放弃，可日后再评估
- 规则引擎不支持 HTML 解析型站点，可扩展 selector 型规则
- HTML 解析型站点驱动：无分页浏览（只抓第一页 60 条）、无评分/关注数、章节无发布时间
- 离线缓存体积是估算值（opaque 响应读不到真实大小）
