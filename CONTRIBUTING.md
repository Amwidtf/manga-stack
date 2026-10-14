# Contributing

**中文**: [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)

Thanks for your interest in MangaStack! Issues, PRs, and discussions are all welcome. The maintainer community is primarily Chinese-speaking, but English contributions are fully supported.

## Before you start

- Read [AGENTS.md](AGENTS.md) (engineering conventions for humans and AI agents), [docs/CODE_STYLE.md](docs/CODE_STYLE.md) (code style), and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (history and known pitfalls, Chinese).
- For larger changes (new pages, source-engine changes, navigation changes), **open an issue first** to avoid rework.

## Requirements

Node 20 (`.nvmrc`); JDK 17+ and Android SDK 35 only if you build the Android package. Web-only changes need just Node.

## Development

```bash
npm ci
npm run dev
```

Branching: cut `feat/xxx`, `fix/xxx`, `docs/xxx` branches from `main`.

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/) **in English**:

```
type(scope): summary

feat(reader): add double-tap zoom toggle
fix(sources): retry mirror lines on 5xx
docs: sync README.en with README
```

- type ∈ `feat` `fix` `refactor` `perf` `docs` `style` `test` `build` `ci` `chore` `revert`
- optional scope, common ones: `reader` `sources` `library` `settings` `android` `ci` `deps`
- subject line ≤ 72 chars, imperative mood, no trailing period
- breaking changes: add a `BREAKING CHANGE:` footer

## PR requirements

- PR title in English (Conventional Commits format preferred); body may be Chinese
- `npm test`, `npm run lint` and `npm run build` must pass (CI checks all three, plus an Android `assembleDebug` build)
- Keep bilingual docs in sync when touching README/CONTRIBUTING/CHANGELOG (see "Bilingual docs" in AGENTS.md)
- Complete the checklist in the PR template

## Hard rules

1. **Version numbers are kept in sync in three places** (`package.json`, `src/lib/appmeta.ts`, `android/app/build.gradle`) — always via `node scripts/bump-version.mjs <x.y.z[-prerelease[.N]] | pre> [versionCode]` (release PRs only; the `pre` keyword auto-increments the prerelease counter, and the script also syncs the version fields at the top of `package-lock.json`), and add matching entries to CHANGELOG.md and CHANGELOG.en.md. Internal builds use SemVer prerelease numbers (e.g. `0.0.1-alpha.1`, counter never reused) until the first public release. See [docs/RELEASE.md](docs/RELEASE.md) for the full release process and rollback policy.
2. Never commit `*.keystore`, `key.properties`, or APK files (gitignored; do not force-add).
3. Do not change the registry URLs in `package-lock.json` (must stay on `registry.npmjs.org`).
4. For navigation or reader-gesture changes, regression-check against section 4 of `docs/DEVELOPMENT.md`.

## Adding a content source

- Prefer validating feasibility via a custom rule source first (addable from Settings, no code change needed).
- **Built-in driver PRs are not accepted without prior discussion**: open an issue first (compliance review + long-term maintenance intent) before starting work.
- A built-in source needs full browse/search/detail/chapters/pages implementations, plus anti-bot and mirror-rotation handling; describe the tested path (search → chapters → pages) in the PR.
- Compliance: only integrate sites that permit programmatic access. The app ships content-source and liability disclaimers; new sources must be compatible with them.

## Reporting issues

Please include: device/OS version, app version, the source in use, reproduction steps, and screenshots or recordings. Templates are built in.
