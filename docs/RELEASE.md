# 发版流程

> 本文件是发布流程的单一来源；`AGENTS.md` 与 `.github/workflows/release.yml` 只做引用，不重复展开。
> 中文内部文档，不要求英文版（同 `docs/DEVELOPMENT.md`）。

## 版本规范

- SemVer。正式公开发布（`0.1.0`）之前，内部构建一律用预发布号 `0.0.x-alpha.N`，N 从 1 递增。
- 同一个 x.y.z 内多次内部构建 → N 递增（`0.0.1-alpha.1` → `0.0.1-alpha.2`），绝不复用相同版本号。
- `0.1.0` 是第一个公开发布的门槛：功能面齐备、更新双频道可用、真机回归通过。
- versionCode 单调递增（Android 覆盖安装的硬约束）；版本名可以重置，versionCode 不可以回退。
- 版本号同步（`package.json` / `src/lib/appmeta.ts` / `android/app/build.gradle` 三处 + `package-lock.json` 顶部两处）一律用脚本，不要手改单处：
  - `node scripts/bump-version.mjs pre` —— 预发布计数自动 +1（`0.0.1-alpha` → `0.0.1-alpha.1`）
  - `node scripts/bump-version.mjs 0.1.0` —— 显式指定版本（versionCode 默认 +1，可第二个参数覆盖）

## 发布步骤

1. 发版检查单：`npm test`、`npm run lint`、`npm run build` 全绿；改动过 `android/` 则本地 `assembleDebug` 通过。
2. `node scripts/bump-version.mjs pre`（或显式版本号）。
3. `CHANGELOG.md`（中文）与 `CHANGELOG.en.md`（英文）各增加对应版本段落，两文件逐条对齐 —— **GitHub Release 说明由 CI 自动取中文段落，并在末尾附英文版文件链接**。面向用户措辞（解决了什么问题，而非改了哪个文件），破坏性变更置顶加粗。
4. `git commit -am "release: vX.Y.Z"` → `git tag vX.Y.Z` → `git push origin main --tags`。
5. CI（`release.yml`）自动：构建 Web 资源 → 同步 Capacitor → 签名 APK → **验签守卫**（检测到 debug 签名直接 fail，防止 secrets 缺失时静默发出无法覆盖升级的包）→ 从 CHANGELOG.md 提取该版本中文段落（末尾附 CHANGELOG.en.md 链接）作为 Release 说明 → 发布 GitHub Release（标签含 alpha/beta/rc 时自动标记 pre-release）。
6. 真机覆盖安装验证：数据保留、内置更新能拉到新版本。

## 更新双频道

- **稳定频道**：应用内查 `releases/latest`，GitHub 只返回最新正式版 —— pre-release 标记保证预发布不会出现在该接口。
- **尝鲜频道**：查 `releases` 列表，含 alpha/beta/rc 预发布；预发布安装（版本号带预发布后缀）默认订阅尝鲜版，设置 → 版本更新可切换。
- **上线顺序约束**：标记 pre-release 与尝鲜频道必须同批发布。只标记不发布尝鲜频道，单频道老版本会查不到任何更新（`/releases/latest` 对 pre-release 返回 404）。

## 回滚

- 代码回滚：revert 提交后按正常流程发新版本，不发递减版本号。
- 仅撤 Release：GitHub 网页删除 Release 与 tag（APK 下载链接随之失效）。
