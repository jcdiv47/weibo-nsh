# Weibo NSH

A lightweight, native cross-platform Weibo client for personal use, built with [Native Shell (NSH)](https://nsh.dev) and TypeScript.

[![CI](https://github.com/jcdiv47/weibo-nsh/actions/workflows/ci.yml/badge.svg)](https://github.com/jcdiv47/weibo-nsh/actions/workflows/ci.yml)
[![Last Commit](https://img.shields.io/github/last-commit/jcdiv47/weibo-nsh?style=flat)](https://github.com/jcdiv47/weibo-nsh/commits/main)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat)](LICENSE)
[![Built with NSH](https://img.shields.io/badge/built%20with-NSH-111827?style=flat)](https://nsh.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-TSX-3178C6?style=flat&logo=typescript&logoColor=white)](tsconfig.json)
[![Platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android-555555?style=flat)](#platform-support)
[![i18n](https://img.shields.io/badge/i18n-EN%20%7C%20%E4%B8%AD%E6%96%87-E67E22?style=flat)](locales)
[![Issues](https://img.shields.io/github/issues/jcdiv47/weibo-nsh?style=flat)](https://github.com/jcdiv47/weibo-nsh/issues)

> [!IMPORTANT]
> **Personal Use & Platform Notice:** This is an independent, unofficial client built solely for personal browsing of your own Weibo account. It is not affiliated with or endorsed by Weibo, and is **not** intended to circumvent, abuse, or violate Weibo's Terms of Service. See [Personal Use & Terms of Service](#personal-use--terms-of-service) for details.

---

## Overview

Weibo NSH pairs a native UI built in [NSH](https://nsh.dev) with a standard WebView signed in to `weibo.com`. Every API request runs as a normal same-origin `fetch` inside your own signed-in web session (`bridge.ts`)—the app never reads, intercepts, or stores your password or session cookies.

## Features

- **Chronological Following Timeline** — Strictly newest-first via Weibo's **最新微博** group, with ads and non-followed recommendations filtered out. Supports pull-to-refresh, infinite scroll, a floating bottom glass button (scroll back to top, or refresh once at the top), and inline repost, like, and comment actions.
- **Posts, Comments & Edit History** — Full long-text expansion, dedicated **Reposts**, **Comments**, and **Likes** tabs (lazy-loaded on first open), nested reply threads, comment likes/reposts, and side-by-side diffs of edited posts (**Edited · history**).
- **Rich Text & Deep Linking** — Interactive `@mentions`, `#topics#`, inline Weibo emoticons, labelled short links, in-text picture links (`图一`–`图九`), and in-app navigation for linked Weibo posts (`weibo.com/<uid>/<id>`, `m.weibo.cn/status/<id>`).
- **Profiles & Relationships** — View bios, follower/following lists, pinned posts (`置顶`), and commented/liked activity markers; follow/unfollow and block/unblock directly from profile pages.
- **Favorites (收藏)** — Bookmark posts from the post header with quick-view toast notifications, and browse saved posts newest-first from the **Me** menu.
- **Search & Trending** — Timeline search with Weibo trending topics (ads excluded), live account and query suggestions, tabbed post/people results, and per-account profile search.
- **Native Media Viewer & Downloads** — Full-screen image viewer (swipe, pinch-to-zoom, double-tap), built-in video player (scrubber, 0.5×–2× playback speed, quality selector, landscape rotation, drag-to-dismiss). Long-press a picture or video (or tap **⋯**) for one menu: **Save to Photos** (iOS) and **Share…** (the system share sheet).
- **iPhone Duo** — Open, the app is a book of two pages split at the fold: the timeline (or any list) at the left, the post being read with its comments at the right, its card marked in the list. Closed, one page; folding and unfolding keeps the post in front. Beside the Duo's vertical bar (closed, and next to the right page when open), each page's back button and actions (search, favorite, repost, like, comment, menus) are the system's, in that bar.
- **Offline-Resilient Cache & Polish** — Caches the first page of recent lists and profiles locally (up to 40 entries, wiped on sign-out) so screens open immediately and stay readable when offline. Includes system-matched light/dark themes, English & Chinese (`en` / `zh`) localization, and native Liquid Glass on iOS 26+.

## Architecture

### WebView Session Bridge (`bridge.ts`)

- **Zero credential handling:** On first launch, the app displays Weibo's standard web sign-in page. Once signed in, the WebView hides on a lightweight same-origin idle page and executes user-initiated requests via `fetch(..., { credentials: "include" })` with Weibo's standard XSRF header.
- **Bridge transport:** Uses native `WebViewRef.evaluate` on iOS and Android to resolve each request's Promise and decode its JSON directly.
- **Consistent endpoints:** Pins a desktop Safari user agent (`DESKTOP_UA`) so mobile WebViews talk to `weibo.com` rather than redirecting to `m.weibo.cn`. A second hidden WebView handles `s.weibo.com` search/topic pages under the shared `.weibo.com` cookie domain.
- **Clean sign-out:** Signing out triggers Sina SSO's logout endpoint (`login.sina.com.cn/sso/logout.php`), clears WebView cookies and local cached pages, and returns to the sign-in screen.

### Defensive Parsing & Drift Detection (`api.ts`, `drift.ts`)

Because `weibo.com`'s web endpoints are undocumented and can change at any time, every endpoint lives in `api.ts` behind a dedicated `parse*` function checked by `drift.ts`:

- Items missing required fields are dropped safely instead of crashing a list.
- Structural changes throw `WeiboChanged` (surfaced cleanly in the UI) instead of rendering blank screens.
- Each schema mismatch logs `[weibo drift] <endpoint>: missing <fields>` once with a JSON sample so fixtures and parsers can be updated quickly.

### Streaming Media Saves (`download.ts`)

Images and videos of any size are saved without buffering bytes in JS: a hidden WebView opens the media host's origin, validates the content type via a `Range: bytes=0-0` probe, and clicks a same-origin `download` link so the web engine streams directly to disk. On iOS a save then adds the file to Photos through the app's own Rust module (`ext/weibo-media`, the Photos framework at add-only access); a share hands it to the system share sheet.

### Design System & Floating Glass (`theme.json`, `components/Glass.ts`, `components/Header.tsx`)

The UI follows a light/dark token palette defined in `theme.json` (`ground`, `well`, `hairline`, `ink`, `weibo`, `link`, etc.) and typography scale in `nsh.json`. Floating controls—headers, menus, toasts, and media overlays—derive their surface from `glass(kind)`, using Apple's native Liquid Glass (`glassEffect`) on iOS 26+ and a matching frosted translucent surface elsewhere.

## Getting Started

### Prerequisites

- [NSH CLI](https://nsh.dev) installed and on your `PATH`
  - *Note:* Sharing downloaded media files on iOS requires an NSH version newer than `0.6.1`.
- [Rust](https://rustup.rs): the app has Rust of its own (`ext/weibo-media`, listed in `nsh.json` `"rust"`), which NSH builds with the app.
  - It takes NSH's crates at the installed nightly's commit (crates.io's `0.6.x` lacks what the app needs). After `nsh update nightly`, run `scripts/pin-nsh.sh` to move that commit along; NSH stops with both commits named until you do. CI runs it after installing the latest nightly.

### Run Locally

```sh
# iOS Simulator (on macOS)
nsh run . --target ios

# Android device or emulator
nsh run . --target android

# Package an installable build
nsh package . --target ios
nsh package . --target android
```

On first start, sign in on Weibo's page; once authenticated, the WebView hides and your Following timeline loads. Session data persists in the platform WebView store.

> [!NOTE]
> On iOS, packaged builds offer **Save Image / Save Video** directly to Photos via `NSPhotoLibraryAddUsageDescription` in [`nsh.json`](nsh.json). The development host (`nsh run`) does not carry this key, so its share sheet shows **Save to Files** and installed apps.

## Platform Support

> [!NOTE]
> Weibo NSH targets **iOS** and **Android**, and is primarily developed and tested on **iOS**.

| Platform | Bridge Transport | Floating Surface | Media Save / Share |
| --- | --- | --- | --- |
| **iOS** | `WebViewRef.evaluate` | Liquid Glass (iOS 26+) / frosted fallback | System share sheet (Save to Photos in packaged builds) |
| **Android** | `WebViewRef.evaluate` | Frosted translucent surface | System share sheet |

## Development & Testing

```sh
# Type-check with TypeScript (via NSH)
nsh check .

# Run the headless test suite
nsh test
```

The test suite runs all API parsers against real-shaped responses in `tests/fixtures/`, alongside tests for drift detection, downloads, emoticons, rich-text references, and the offline cache.

**Updating after a Weibo endpoint change:**

1. Copy the JSON sample from the `[weibo drift]` log into the matching fixture under `tests/fixtures/`.
2. Run `nsh test` to reproduce the failure.
3. Update the corresponding parser in `api.ts` until all tests pass.

### Project Structure

```text
.
├── App.tsx          # App shell, WebView bridge lifecycle, and navigation stack
├── api.ts           # Weibo web API calls and defensive response parsers
├── bridge.ts        # Same-origin WebView fetch channels (weibo.com & s.weibo.com)
├── drift.ts         # Response schema checks and drift reporting
├── download.ts      # Streaming image/video download, save-to-Photos and share orchestration
├── ext/weibo-media/ # The app's own Rust: saving to the iOS photo library
├── scripts/         # pin-nsh.sh: points ext/ at the installed nightly's NSH crates
├── saved.ts         # Local on-device page cache (40-entry LRU, cleared on sign-out)
├── pages/           # Screen views (Timeline, Post, Replies, Edits, Profile, Search, Topic, Favorites, People)
├── components/      # Shared native UI components (Header, Glass, StatusCard, RichText, VideoPlayer, ImageViewer, …)
├── locales/         # Localization strings (en.yml, zh.yml)
├── icons/           # Tabler Icons SVGs
├── tests/           # Unit & fixture tests (api, download, emoticons, richtext, saved)
├── nsh.json         # NSH manifest, capabilities, typography scale, and iOS plist config
└── theme.json       # Light and dark color tokens
```

## Releases

CI ([`ci.yml`](.github/workflows/ci.yml)) runs `nsh check` and `nsh test` on every pull request and push to `main`.

Releases are published from GitHub's **Releases** page—no tags are pushed by hand:

1. **Draft a new release**, type the version as a new tag (`0.2.0`, no `v`), and click **Generate release notes**.
2. Publish it. GitHub creates the tag, and [`release.yml`](.github/workflows/release.yml) builds the Android app at it and attaches `Weibo-<version>-android.apk`.

The tag is the app's version (`nsh.json`'s `version` is only the development one), and the workflow run number is its build number. To rebuild a release's packages, run the **Release** workflow by hand with its tag. Coding agents can draft a release for you by following [`AGENTS.md`](AGENTS.md).

- **Android:** signed with the keystore in the `ANDROID_KEYSTORE_BASE64` (the file, base64-encoded), `ANDROID_KEY_ALIAS`, and `ANDROID_KEYSTORE_PASSWORD` repository secrets. Without them, the APK gets a throwaway debug key and won't install over the previous release.
- **iOS:** build and sign locally with `nsh package . --target ios --sign ... --profile ...`.

## Personal Use & Terms of Service

This project is developed and maintained for **personal, non-commercial use** as a clean native interface for reading and interacting with your own Weibo account.

- **No affiliation:** Weibo NSH is an independent open-source project and is not affiliated with, authorized by, or endorsed by Weibo Corporation or Sina.
- **No ToS circumvention:** This client is **not** built to bypass or violate Weibo's Terms of Service. It does not scrape data, automate actions, send background bulk requests, harvest credentials, or circumvent authentication or anti-abuse mechanisms—it simply presents your own authenticated web session in a native UI at normal human browsing speeds.
- **Use responsibly:** Please keep request rates gentle and use this software only with your own account in accordance with Weibo's Terms of Service and applicable rules. Because it relies on `weibo.com`'s undocumented web endpoints, functionality may break at any time if Weibo changes its web client.

## License

Licensed under the [MIT License](LICENSE).

## Acknowledgments

- Built with [Native Shell (NSH)](https://nsh.dev).
- Icons provided by [Tabler Icons](https://tabler.io/icons) under the MIT License ([`icons/LICENSE`](icons/LICENSE)).
