# MangaStack 漫栈

**中文**: [README.md](README.md)

[![CI](https://github.com/Amwidtf/manga-stack/actions/workflows/ci.yml/badge.svg)](https://github.com/Amwidtf/manga-stack/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An aggregated manga subscription reader — the app ships no content and no pre-configured sources; you import source configs (JSON or Base64) to enable the built-in site drivers or the generic rule engine, then subscribe, track, and read. Interaction modelled after Mihon / Tachiyomi. It is also a fully-featured local comic reader.

- Form factor: Android APK (Capacitor WebView shell), installable via HarmonyOS compatibility layers; the same codebase also runs as a web app
- Current version: v0.0.1-alpha (versionCode 11), appId `com.mangastack.app`
- All data stays on-device (localStorage + CacheStorage) — no account, no backend

> Note: the app UI and most documentation are in Simplified Chinese, as the target readers and content sources are Chinese-language. Contributions in English are equally welcome.

## Features

- **Local reading**: import ZIP/CBZ archives or image folders from the device — offline reading, straight onto the bookshelf; with no source configs imported the app works as a pure local comic reader
- **Library (subscriptions)**: auto update checks, unread badges, manual refresh, three sort orders; mixed-source lists with cover badges and a source filter
- **Browse**: multi-source in parallel — per-source sections and cross-source search across all enabled sources; Chinese search, popular/latest/rating charts, genre filters, infinite scroll
- **Detail**: cover/rating/tags/synopsis, chapters grouped by language (zh-Hans/zh-Hant first with fallback), read chapters dimmed, ascending/descending order, list/grid toggle
- **Reader**: vertical (webtoon) and paged modes; RTL/LTR; pinch & double-tap zoom; keyboard arrows, swipe, image preloading, chapter TOC drawer (locate current chapter, ascending/descending), one-tap next chapter; auto-hiding chrome
- **History**: grouped by manga with automatic progress tracking, one-tap resume; grid/list toggle, manage mode with multi-select delete
- **Offline cache**: chapter images cached via a Service Worker — rereads cost no traffic; clear per chapter or per title
- **Download manager**: standalone page for the comic cache and update APKs — cover grid/list, per-chapter or per-manga deletion, multi-select cleanup
- **Built-in updater**: stable and beta channels checked against GitHub Releases, in-app APK download (progress bar) and hand-off to the system installer
- **Settings**: dark/light theme, chapter language preference, content rating, reader defaults, source line probing, one-tap factory reset
- **Sources**: config-driven, no bundled sources; site drivers and a generic JSON rule engine only work after importing configs (JSON text or Base64 string, shareable/backable)

## Tech stack

React 19 · TypeScript · Vite 7 · Tailwind 3.4 · shadcn/ui · zustand(persist) · react-router 7 · Capacitor 7.6 · Gradle 8.11 · AGP 8.7 · Android SDK 35

## Repository layout

```
src/pages/            Library / Browse / SourceBrowse / Detail / Reader / History / Downloads / Settings / About
src/lib/sources/      source system: SourceConfig-driven registry, official drivers + custom rule engine, JSON/Base64 payload IO
src/lib/store.ts      global state (zustand persist)
android/              native Android project (run npm run build && npx cap sync android after cloning)
docs/                 dev handover / release process / repo governance / code style
apk/                  local release APKs (gitignored; use GitHub Releases)
```

## Quick start

Requirements: Node 20, JDK 17+ (21 recommended), Android SDK 35.

```bash
npm ci
npm run dev        # web dev server
npm run build      # outputs dist/
npx cap sync android
cd android && ./gradlew assembleRelease   # release APK
```

### Signing setup (required for release builds)

Release signing credentials are read from `android/key.properties` (gitignored). Template:

```properties
storePassword=<your keystore password>
keyAlias=mangastack
keyPassword=<your key password>
```

The keystore lives at `keystore/mangastack.keystore` (gitignored). **Keep the keystore and passwords safe locally — losing them means you can never update the app under the same signature.** Without `key.properties`, release builds fall back to debug signing so contributors can build locally.

## Documentation

- [CHANGELOG.md](CHANGELOG.md) ([English](CHANGELOG.en.md)): release history
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): full dev handover — requirement evolution, root causes of key bugs, outstanding issues (Chinese)
- [docs/RELEASE.md](docs/RELEASE.md): release process, version naming and rollback policy (Chinese)
- [docs/CODE_STYLE.md](docs/CODE_STYLE.md): code style guide (bilingual)
- [AGENTS.md](AGENTS.md): engineering conventions for humans and AI agents (Chinese, with English brief)
- [CONTRIBUTING.md](CONTRIBUTING.md) ([中文](CONTRIBUTING.zh-CN.md)) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [SECURITY.md](SECURITY.md)

## Acknowledgements

MangaStack is built in the open with AI coding assistants. The core features were designed and implemented by Kimi K3 via Kimi Code (Moonshot AI); GLM (Z.ai) + Z Code, Codex and MiniMax contributed as auxiliary coding and review assistants along the way. Every AI-produced change is reviewed, tested and integrated by the human maintainer before it lands.

## License

Code is open-sourced under [MIT](LICENSE). Copyright of manga content belongs to the original sites and rights holders; this project is a reading tool only, with content-source and liability disclaimers shipped in-app.
