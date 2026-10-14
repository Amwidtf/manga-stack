# Code Style / 代码规范

Lint + build 全绿是底线，本文件是不被工具覆盖的约定。Passing `npm run lint` is the floor, not the ceiling — this document covers what tooling cannot.

## English

### Language & comments

- Identifiers (variables, functions, types, files) in English; **comments and doc strings in Chinese** (the maintainer community is primarily Chinese-speaking).
- Write comments only where the *why* is non-obvious — no narrating what the code does.

### TypeScript

- Strict mode per `tsconfig`; no `any` without a justification comment. Prefer narrowing and `zod`-style validation at boundaries (source engines, persisted state).
- Explicit return types on exported functions in `src/lib/`; components may rely on inference.

### Files & naming

- Components: `PascalCase.tsx` (`src/pages/Detail.tsx`, `src/components/Zoomable.tsx`).
- Hooks: kebab-case with `use-` prefix (`src/hooks/use-mobile.ts`).
- Utilities / stores / sources: camelCase or kebab-case matching the existing neighbours (`cache.ts`, `store.ts`, `sources/mangadex.ts`).

### React

- Function components + hooks only. Obey the react-hooks v7 rules: **never read/write refs during render** — assign in effects or handlers (see the `cbRef` pattern in `Zoomable.tsx`).
- Avoid passing fresh inline callbacks into gesture/zoom components; use the ref-forwarding pattern instead of fighting referential instability.
- `src/components/ui/**` are vendored shadcn/ui files — prefer regenerating via the shadcn CLI over hand-editing; fast-refresh purity rules are intentionally disabled for that directory in `eslint.config.js`.

### Styling

- Tailwind utilities first; compose conditional classes with `cn()` from `src/lib/utils.ts`.
- Theme tokens live in `src/index.css` / `tailwind.config.js`: dark-first (`#0b0b0c`), red primary. Don't introduce hard-coded off-palette colors.
- Horizontal-scroll containers inside flex rows need `min-w-0`.

### State & persistence

- Global state in zustand with `persist` (`src/lib/store.ts`). Everything user-facing (subscriptions, progress, settings, history) must survive restarts — think about the persisted schema before adding fields, and migrate rather than break existing installs.
- Offline images: CacheStorage + localStorage metadata (`src/lib/cache.ts`).

### Sources (src/lib/sources/)

- Implement the `Source` interface from `types.ts`; sources are driven by `SourceConfig` (`config.ts`) and registered via `applySourceConfigs` — nothing is hard-coded into the registry.
- **Network access in the rule engine and all new drivers must go through `src/lib/http.ts`** (CapacitorHttp native channel on APK, fetch fallback on web). Never call `fetch` directly — that is what makes CORS-closed APIs reachable on Android. The two legacy JSON-API drivers predate this rule and call `fetch` (their APIs are CORS-open); do not copy that pattern.
- Source registration must stay synchronous-before-render and fingerprint-idempotent (see `applySourceConfigs`).

### Tests

- Pure logic under `src/lib/` is covered by vitest (`npm test`), colocated in `__tests__/` directories; tests ship with the code.
- The store migration chain (`store.ts` v2→v6) and the rule-engine field-path extraction must stay covered — they carry real user data.

### Commits, docs, versions

- Commits: English Conventional Commits (see CONTRIBUTING).
- Bilingual docs sync: see AGENTS.md.
- Releases: run `node scripts/bump-version.mjs pre` (syncs `package.json` + `package-lock.json` + `src/lib/appmeta.ts` + `android/app/build.gradle`) and add matching entries to `CHANGELOG.md` + `CHANGELOG.en.md` — see `docs/RELEASE.md`.

---

## 中文

### 语言与注释

- 标识符（变量、函数、类型、文件名）一律英文；**注释与文档字符串用中文**。
- 只在「为什么」不明显时写注释，不要复述代码在做什么。

### TypeScript

- 遵循 tsconfig 严格模式；不允许无注释说明的 `any`。在边界处（源引擎、持久化数据）做类型收窄与校验。
- `src/lib/` 的导出函数写显式返回类型；组件内可依赖类型推断。

### 文件与命名

- 组件：`PascalCase.tsx`（如 `src/pages/Detail.tsx`、`src/components/Zoomable.tsx`）。
- Hooks：kebab-case + `use-` 前缀（如 `src/hooks/use-mobile.ts`）。
- 工具/store/源：与所在目录现有风格保持一致（`cache.ts`、`store.ts`、`sources/mangadex.ts`）。

### React

- 只用函数组件 + hooks。遵守 react-hooks v7 规则：**渲染期间禁止读写 ref**——在 effect 或事件处理器中赋值（参考 `Zoomable.tsx` 的 cbRef 模式）。
- 不要向手势/缩放组件传递新的内联回调；用 ref 转发模式规避引用不稳定。
- `src/components/ui/**` 是 shadcn/ui 生成文件——优先用 CLI 重新生成而不是手改；该目录在 `eslint.config.js` 中刻意关闭了 fast-refresh 纯度规则。

### 样式

- 优先 Tailwind 工具类；条件类名用 `src/lib/utils.ts` 的 `cn()` 组合。
- 主题 token 在 `src/index.css` / `tailwind.config.js`：深色优先（`#0b0b0c`）、红色主色。不要引入调色板之外的硬编码颜色。
- flex 行内的横向滚动容器必须加 `min-w-0`。

### 状态与持久化

- 全局状态用 zustand + `persist`（`src/lib/store.ts`）。所有面向用户的数据（订阅、进度、设置、历史）必须能跨重启保留——新增字段前先想清楚持久化 schema，老用户数据要做迁移而不是破坏。
- 离线图片：CacheStorage + localStorage 元数据（`src/lib/cache.ts`）。

### 源体系（src/lib/sources/）

- 实现 `types.ts` 的 `Source` 接口；源由 `SourceConfig`（`config.ts`）驱动，经 `applySourceConfigs` 注册——注册表不内置任何源。
- **规则引擎与所有新增驱动的网络请求必须走 `src/lib/http.ts`**（APK 内走 CapacitorHttp 原生通道，Web 端回退 fetch）。源代码里禁止直接调 `fetch`——这是 Android 上访问无 CORS 头 API 的关键。两个旧 JSON API 驱动早于此规则、仍直接调 fetch（其 API 本身 CORS 开放），不要效仿。
- 源注册必须保持「渲染前同步 + 指纹幂等」（见 `applySourceConfigs`）。

### 测试

- `src/lib/` 下的纯逻辑用 vitest 覆盖（`npm test`），测试文件就近放在 `__tests__/` 目录，随代码同提交。
- store 迁移链（`store.ts` v2→v6）与规则引擎字段路径提取必须保持有测试——它们承载真实用户数据。

### 提交、文档、版本

- 提交信息：英文 Conventional Commits（见 CONTRIBUTING）。
- 双语文档同步：见 AGENTS.md「双语文档同步规则」。
- 发版一律用 `node scripts/bump-version.mjs pre`（同步 `package.json` / `package-lock.json` / `src/lib/appmeta.ts` / `android/app/build.gradle`）并同步新增 `CHANGELOG.md` 与 `CHANGELOG.en.md` 条目——流程见 `docs/RELEASE.md`。
