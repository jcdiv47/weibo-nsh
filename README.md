# Weibo (personal NSH client, POC)

A native client for your own Weibo account. The UI is NSH; the session is a WebView signed in
to weibo.com, and every API request runs as that page's own same-origin `fetch`
(`bridge.ts`). The app never reads your password or the session cookies.

What it does now:

- **Following timeline**, strictly newest first: the "最新微博" group (`/ajax/feed/allGroups` for its
  gid, then `/ajax/feed/friendstimeline`), with ads and posts from accounts you don't follow
  filtered out. Pull to refresh, more on scroll.
- **Post page** with its full text (`/ajax/statuses/longtext`) and comments
  (`/ajax/statuses/buildComments`), with a comment's replies opening in place.
- **Profile** (`/ajax/profile/info`, `/ajax/statuses/mymblog`): following / follows you and the
  block status (`block` / `blockText` of the profile answer), with **Follow / Unfollow**
  (`/ajax/friendships/create`, `/ajax/friendships/destory`) and **Block / Unblock**
  (`/ajax/statuses/filterUser` with every box of weibo.com's dialog ticked,
  `/ajax/statuses/deleteFilters`). Blocking ends the follow; unblocking does not restore it.
- **Pictures** full screen (swipe, pinch, double tap), **videos** in the system player, `@mentions`
  to profiles, `#topics#` to their posts (read from s.weibo.com's search page through a second
  hidden web view), short links labelled as Weibo labels them.

## Run on Linux

Needs WebKitGTK 6.0 for the web view: `sudo pacman -S webkitgtk-6.0`.

```sh
nsh run .          # GTK window, hot reload
nsh check .        # type check
```

The first start shows Weibo's sign-in page; after signing in, the web view hides and the
timeline loads. The session persists in the app's WebKit data directory
(`$XDG_DATA_HOME/com.example.weibo/webkit`).

## Port to iOS

The TSX is unchanged. On a Mac: `nsh run . --target ios` (simulator), then `nsh package` for a
device. Differences handled already:

- `bridge.ts` uses `WebViewRef.evaluate` where it is available (iOS, macOS, Android): the
  answer's JSON is decoded natively. Linux uses `injectJavaScript` + `window.nsh.postMessage`.
- WKWebView's mobile user agent would send weibo.com to m.weibo.cn: the bridge pins a desktop
  Safari user agent (`DESKTOP_UA`).

## Notes

- The endpoints are weibo.com's web client's, undocumented and liable to change; they all live
  in `api.ts`.
- Images load straight from `*.sinaimg.cn` with no `Referer`, which its hot-link guard allows.
- Keep request rates gentle; this is against Weibo's terms of service and for personal use only.
