# Changelog

All notable changes to this project are documented here, following [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/). Chinese edition: [CHANGELOG.md](CHANGELOG.md).

## [Unreleased]

## [0.0.1-alpha.5] - 2026-10-15 (versionCode 16)

### Changed

- Known-issue handling: as a fallback for soft-keyboard environments, bottom panels are no longer anchored to the screen bottom — they now sit centered in the safe area above the keyboard, keeping the input row in the middle of the screen so it stays visible even on devices with broken keyboard viewport behavior

## [0.0.1-alpha.4] - 2026-10-15 (versionCode 15)

### Fixed

- Known issue fixed: bottom panels were still covered by the soft keyboard on a few devices — IME insets are now applied to the WebView natively (the view physically shrinks with the keyboard) instead of relying on the WebView's own keyboard viewport behavior

## [0.0.1-alpha.3] - 2026-10-15 (versionCode 14)

### Fixed

- Known issue fixed: bottom panels were still covered by the soft keyboard on some devices — on WebViews whose layout viewport does not shrink with the keyboard, panels now track the visual viewport and lift above it

## [0.0.1-alpha.2] - 2026-10-14 (versionCode 13)

### Fixed

- Safe-area compensation had a unit error: the native side injected physical pixels while the CSS variables are consumed as density-scaled CSS pixels, amplifying the compensation by the screen scale (about 2.75-3x on high-density displays) — the bottom navigation and reader cleared several times the required space above system bars (roughly 150px of dead space on Mate60RS-class devices). Values are now divided by the display density before injection

## [0.0.1-alpha.1] - 2026-10-14 (versionCode 12)

### Fixed


- On Android 15 (targetSdk 35) edge-to-edge enforcement the page top sat under the status bar — the native side now injects real system-bar insets as CSS variables (`--safe-top` etc.) and every safe area uses `max(env(...), var(...))`; the mobile top bar and reader toolbars switched to min-height so insets padding no longer squeezes them; the reader's full-screen container also carries the insets, so manga pages start below the status bar
- The soft keyboard no longer covers bottom content — viewport meta gains `interactive-widget=resizes-content`
- Bottom sheets clear the gesture bar, top toasts clear the status bar, and the long factory-reset button label in Settings wraps instead of overflowing

### Changed

- Reader (paged mode): removed the floating page indicator shown during immersive reading — it covered the art, and page info is available from the bottom toolbar
- End-of-chapter "next chapter" now appears on demand: reaching the last page stays quiet so the page is fully visible; flipping forward again (tap or swipe) brings up the chapter-end prompt with a next-chapter button, dismissed by any tap

## [0.0.1-alpha] - 2026-10-13 (versionCode 11)

First internal prerelease. From this point the project uses SemVer prerelease numbers (`0.0.x-alpha`) for internal builds until it is ready for a public `0.1.0`; earlier `1.x` entries below are historical version names from the pre-open-source era, kept for the record. This build combines the open-source repo setup, the config-driven source system and the multi-source / updater / download-manager merge.

### Added

- Open-source repo setup: MIT license, CONTRIBUTING / CODE_OF_CONDUCT / SECURITY, issue & PR templates, CI (web lint+build, Android assembleDebug)
- Harness docs: `AGENTS.md`, `docs/DEVELOPMENT.md`, `docs/CODE_STYLE.md`
- Bilingual docs: README (Chinese-primary, with `README.en.md`) and CONTRIBUTING (English-primary, with `CONTRIBUTING.zh-CN.md`)
- Source configuration system: the app no longer bundles any source — the built-in site drivers and the custom rule engine are all provisioned as importable `SourceConfig` entries
- Settings → source manager rework: enable/disable toggle, delete with confirmation (cascades to the source's subscriptions, history and offline cache), one-tap line probing for mirror-based drivers, config import (auto-detects JSON / Base64) and export (copy JSON / copy Base64)
- Multi-source in parallel: sources are toggle-based and several can be enabled at once; Browse groups results into per-source horizontal sections, and search fans out across all enabled sources
- Library: source badges on covers plus a source filter for mixed-source subscription lists
- Built-in updater: Settings → check for updates against GitHub Releases, with release notes, in-app APK download (progress bar) and hand-off to the system installer — `src/lib/update.ts` + `src/lib/native.ts` bridged to the new `MangaStackPlugin` native plugin (downloads to `files/updates`, FileProvider install)
- Updater channels: stable and beta; prerelease installs default to the beta channel
- Downloads page: comic cache and update APKs moved out of Settings into a standalone page — cover grid (list view available), per-chapter / per-manga / clear-all deletion, multi-select manage mode
- History reworked: entries grouped by manga — grid view by default, expandable list, one-tap resume, manage mode with multi-select delete
- Cover self-heal: history groups backfill missing covers from the library or the source (detail request, falling back to title search); missing covers render as a title-filled placeholder instead of a broken-image icon, and transient load failures retry before giving up
- Reader: chapter TOC drawer — locate the current chapter, toggle ascending/descending order
- Offline page cache via a Service Worker: cross-origin images are served cache-first, so rereads cost no traffic; failed loads evict the URL from the cache and retry
- One-tap factory reset: wipes all app data (subscriptions, history, settings, caches, downloaded APKs)
- Release engineering: `scripts/bump-version.mjs` syncs the three version carriers (package.json / appmeta.ts / build.gradle); pushing a `v*` tag runs the release workflow that signs the APK from secrets and publishes it to GitHub Releases
- Local manga library: import ZIP/CBZ archives or image folders from the device (Android) — imported titles join the bookshelf as a local source, managed in Settings with per-title deletion cascading to its subscription and history
- Route-level code splitting (lazy loading) — initial chunk back under the 500 kB warning threshold

### Changed

- Built-in site drivers became config-driven factories (one `make*` factory per site); the registry is rebuilt by `applySourceConfigs` from the persisted `sourceConfigs`, keeping the synchronous-before-render + fingerprint-idempotent registration
- Settings store migrated v2 → v3 → v4: the old active-source field, legacy per-driver line settings and custom rules merge into `sourceConfigs` + `activeSource`; only built-in sources actually referenced by subscriptions / history / the old active source are migrated, fresh installs start with zero sources; v4 adds a compatibility path converting legacy K3-style `enabledSources` configs so cover-upgrades keep their sources
- `getSource(id)` now returns `Source | undefined`: library update checks skip removed sources, detail/reader pages show an empty state
- MangaDex language / content-rating preferences now show only when an enabled MangaDex config exists (previously a global display condition)
- New installs focus on the local comic reader experience; the Browse tab and online source management are not shown by default

### Fixed

- Cross-chapter navigation kept the previous chapter's page number — page state is now stamped per chapter, stale updates are ignored
- Zoomable: comply with react-hooks v7 rules (ref writes moved into effect; `touchAction` derived from state)
- `package-lock.json` registry URLs normalized to `registry.npmjs.org`
- ESLint baseline is green (vendored shadcn/ui files exempted from fast-refresh purity rules)
- Reader gestures: page-turn hot zones (left/right 30%) no longer participate in double-tap zoom detection, and a 60px position threshold keeps two distant quick taps from being misread as a double tap
- Bottom navigation bar overlapped the system gesture strip — added safe-area spacing
- System back button exited the app directly: `@capacitor/app` native side is now actually synced into the Android project (`capacitor.plugins.json` / capacitor gradle wiring), restoring in-app back navigation
- Settings: local-manga rows linked to a dead `/detail/` route — now `/manga/`

### Security

- Release signing credentials moved out of `android/app/build.gradle` into gitignored `android/key.properties`; release builds fall back to debug signing when absent

## [1.6.0] - 2026-10-02 (versionCode 7)

### Fixed

- Paged reader mode locked to `touch-none` so vertical swipes no longer turn into page scrolls
- Reading-direction toggle button now only shows in paged mode

## [1.5.0] - 2026-10-02 (versionCode 6)

### Added

- New built-in HTML-parsing site driver (3 mirror lines, one-tap probing, auto-switch)
- Native HTTP channel (CapacitorHttp) to bypass WebView CORS in APK
- Settings → About: version number, content-source / privacy / disclaimer / open-source statements
- Source badges in library and history

### Fixed

- Navigation stack rework (Mihon-style): reader back uses replace, chapter navigation uses replace, empty stack falls back to library, double-press to exit at top level — fixes back-button ping-pong and "back exits the app"
- Confirm dialogs now render centered via portal, no longer obscured by the bottom bar

## [1.4.0] - 2026-10-02 (versionCode 5)

### Added

- Viewport locked (no page zoom); in-reader Zoomable component: pinch, double-tap 2.4x, pan while zoomed, page gestures suppressed while zooming

### Fixed

- Detail page horizontal overflow: chapter header chips moved to their own row (`min-w-0` flex fix)

## [1.3.0] - 2026-10-02 (versionCode 4)

### Added

- Six UX items: hardware back handling, form-mode rule-source editor, chapter asc/desc sort, list/grid toggle, passive+active offline cache with cleanup, global confirm dialogs

## [1.2.0] - 2026-10-02 (versionCode 3)

### Added

- Site driver multi-line support (international line + mainland relay), one-tap line probing, auto-switch on failure

## [1.1.0] - 2026-10-02 (versionCode 2)

### Added

- Custom source JSON rule engine (first version)

## [1.0.0] - 2026-10-02 (versionCode 1)

### Added

- Initial release: Library / Browse / Detail / Reader / History / Settings; MangaDex + a second site driver; Capacitor Android build
