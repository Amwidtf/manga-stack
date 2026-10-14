# 贡献指南

**English**: [CONTRIBUTING.md](CONTRIBUTING.md)

感谢关注漫栈 MangaStack！本项目欢迎 issue、PR 与讨论。

## 开始之前

- 先读 [AGENTS.md](AGENTS.md)（人机共读的工程约定）、[docs/CODE_STYLE.md](docs/CODE_STYLE.md)（代码规范）与 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)（版本历史与已知坑）。
- 较大改动（新页面、源引擎调整、导航改动）请**先开 issue 讨论**，避免方向性返工。

## 环境要求

Node 20（`.nvmrc`）、JDK 17+（打 Android 包时需要）、Android SDK 35（打 Android 包时需要）。只做 Web 端改动有 Node 即可。

## 开发流程

```bash
npm ci
npm run dev
```

分支：从 `main` 切 `feat/xxx`、`fix/xxx`、`docs/xxx` 等功能分支。

## 提交规范（Commit Convention）

采用 [Conventional Commits](https://www.conventionalcommits.org/)，**使用英文**：

```
type(scope): summary

feat(reader): add double-tap zoom toggle
fix(sources): retry mirror lines on 5xx
docs: sync README.en with README
```

- type ∈ `feat` `fix` `refactor` `perf` `docs` `style` `test` `build` `ci` `chore` `revert`
- scope 可选，常用：`reader` `sources` `library` `settings` `android` `ci` `deps`
- 概要首行 ≤ 72 字符，祈使句，结尾不加句号
- 破坏性改动在页脚写 `BREAKING CHANGE:` 说明

## PR 要求

- PR 标题用英文（同样建议 Conventional Commits 格式），正文可中文
- 提交前确保 `npm test`、`npm run lint` 和 `npm run build` 通过（CI 会检查这三项 + Android assembleDebug）
- 改动 README/CONTRIBUTING/CHANGELOG 时注意双语同步（见 AGENTS.md「双语文档同步规则」）
- PR 模板内含自查清单，请逐项确认

## 改动红线

1. **版本号三处同步**（`package.json`、`src/lib/appmeta.ts`、`android/app/build.gradle`）——一律用 `node scripts/bump-version.mjs <x.y.z[-预发布[.N]]> | pre [versionCode]`（仅发版 PR 需要；`pre` 关键字自动递增预发布计数，package-lock.json 顶部版本号由脚本一并同步），并在 CHANGELOG.md 与 CHANGELOG.en.md 同步记录条目。正式公开发布前，内部构建使用 SemVer 预发布号（如 `0.0.1-alpha.1`，N 只增不减）。发版流程与回滚见 [docs/RELEASE.md](docs/RELEASE.md)。
2. 不要把 `*.keystore`、`key.properties`、APK 提交进仓库（已被 .gitignore 拦截，请勿强行 `git add -f`）。
3. 不要改动 `package-lock.json` 的 registry 指向（统一 `registry.npmjs.org`）。
4. 导航与阅读器手势相关改动，请对照 `docs/DEVELOPMENT.md` 第四节做回归自查。

## 新增数据源

- 优先通过「自定义规则源」验证可行性（设置页可表单添加，无需改代码）。
- **新增内置站点驱动默认不接受直接 PR**：请先开 issue 讨论（合规评估 + 长期维护意愿），经维护者确认后再动手。
- 内置源需要完整的 browse/search/detail/chapters/pages 实现，并处理源站反爬与镜像轮换；请在 PR 中说明实测链路（搜索 → 章节 → 读图）。
- 注意合规：只接入允许程序化访问的站点；App 内已有内容来源与免责声明，新源需与之兼容。

## 报告问题

issue 请附带：设备/系统版本、App 版本号、使用的数据源、复现步骤、截图或录屏。模板已内置。
