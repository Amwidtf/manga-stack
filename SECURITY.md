# Security Policy / 安全政策

## English

**Please do not report security issues via public issues.** Use GitHub [Private vulnerability reporting](/Amwidtf/manga-stack/security/advisories/new) (Security tab → Report a vulnerability), or contact the repository owner @Amwidtf directly.

We acknowledge reports as soon as possible (usually within 3 days), ship fixes with the next release, and credit reporters unless you prefer anonymity.

### Scope

- The app stores all data on-device — there is no server or account system, so classic server-side vulnerabilities are out of scope.
- **In scope**: injection/parsing issues in the custom rule-source engine, WebView configuration security, arbitrary file read/write, cross-source data leakage.
- Signing secrets (`*.keystore`, `key.properties`) are never committed by design. If you find any secret accidentally committed, report it immediately via the channels above — we will revoke and rotate it.

### Supported versions

Only the latest release receives security fixes. Please keep the app up to date.

---

## 中文

**请勿用公开 issue 报告安全问题。** 请使用 GitHub 的[私密漏洞报告](/Amwidtf/manga-stack/security/advisories/new)（仓库 Security 页 → Report a vulnerability），或直接联系仓库所有者 @Amwidtf。

我们会在收到报告后尽快确认（通常 3 天内），修复后随版本发布并注明贡献者（除非你希望匿名）。

### 范围说明

- 本应用数据全部存储在用户本机，无服务端、无账号体系，因此传统意义上的服务端漏洞不在范围内。
- **在范围内**：自定义规则源引擎的注入/解析问题、WebView 配置安全、任意文件读写、跨源数据泄露等。
- 签名密钥（`*.keystore`、`key.properties`）本来就不入库；如果你发现任何密钥类文件被意外提交，请立即按上述渠道报告，我们会吊销并轮换。

### 支持的版本

仅最新 release 版本接收安全修复。请始终保持 App 为最新版。
