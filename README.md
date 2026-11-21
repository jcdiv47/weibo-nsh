# Weibo (personal NSH client, POC)

A native client for your own Weibo account. The UI is NSH; the session is a WebView signed in
to weibo.com, and every API request runs as that page's own same-origin `fetch`
(`bridge.ts`). The app never reads your password or the session cookies.

What it does now:

- **Following timeline**, strictly newest first: the "最新微博" group (`/ajax/feed/allGroups` for its
  gid, then `/ajax/feed/friendstimeline`), with ads and posts from accounts you don't follow
  filtered out. Pull to refresh, more on scroll.
- **Post page** with its full text (`/ajax/statuses/longtext`) and, in three tabs under it, its
  reposts (`/ajax/statuses/repostTimeline`), comments (`/ajax/statuses/buildComments`, the tab
  it opens on) and who liked it (`/ajax/statuses/likeShow`); a tab loads its list when first
  opened. A press on a comment opens a reply box over the keyboard
  (`/ajax/comments/reply`); a press on its replies opens its thread, "N replies", where a press on
  the comment or any reply answers it. Under each comment, a like (`/ajax/statuses/updateLike`,
  `destroyLike`, with `object_type=comment`) and a repost (`/ajax/statuses/normal_repost` with its
  `cid`, the box starting with "//@author:text" as weibo.com's does).
- **Favorites** (收藏): the bookmark at the top right of a post's page saves it or takes it out
  (`/ajax/statuses/createFavorites`, `destoryFavorites`), filled while saved (the post's `favorited`);
  saving says so in a toast that leads to them. The "我" menu on the timeline opens "My favorites",
  the posts I saved, latest first (`/ajax/favorites/all_fav`).
- **Edit history**: an edited post (`edit_count`) says so; on its page, "Edited · history" lists its
  versions (`/ajax/statuses/editHistory`), newest first, each with what changed from the one before.
- **Profile** (`/ajax/profile/info`, `/ajax/statuses/mymblog`): following / follows you and the
  block status (`block` / `blockText` of the profile answer), with **Follow / Unfollow**
  (`/ajax/friendships/create`, `/ajax/friendships/destory`) and **Block / Unblock**
  (`/ajax/statuses/filterUser` with every box of weibo.com's dialog ticked,
  `/ajax/statuses/deleteFilters`). Blocking ends the follow; unblocking does not restore it.
- **Sign out**, from the "我" menu on the timeline or the menu of my own profile, asking first: the
  session web view runs weibo.com's own sign-out (Sina SSO's `login.sina.com.cn/sso/logout.php`),
  which ends the session and clears its cookies; the saved pages are cleared, the pages close and the sign-in page shows. Whoever
  signs in next starts on a timeline of their own.
- **Pictures** full screen (swipe, pinch, double tap), **videos** in the system player, `@mentions`
  to profiles, `#topics#` to their posts (read from s.weibo.com's search page through a second
  hidden web view), short links labelled as Weibo labels them. A link to a Weibo post ("微博正文",
  `weibo.com/<uid>/<id>`, `m.weibo.cn/status/<id>`) opens its page in the app, loading it by id
  (`/ajax/statuses/show`) when the app hasn't got it; such pages stack, so back returns through
  each.

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
  in `api.ts`, each answer read by a `parse...` function. `drift.ts` checks the fields a screen
  needs: an item missing them is dropped, an answer whose list or user is gone throws
  `WeiboChanged` (shown as "Weibo changed how it answers"), and either logs
  `[weibo drift] <endpoint>: missing <fields>` once, with a sample of the answer.
- `nsh test` runs the parsers against `tests/fixtures/` (answers in weibo.com's shapes) and the
  saved-page logic. When Weibo changes an endpoint, put its new answer (the drift log's sample)
  in the fixture, see which test fails, fix the parser.
- The first page of each list (except a post's reposts and likes) and each profile are saved on the device (`saved.ts`, the newest
  40): a page opens on its saved copy while it loads and keeps it, marked as saved, when the load
  fails. Signing out clears them.
- The look follows the "Weibo for iPhone" design (Paper): its tokens are `theme.json`, light and
  dark, named as the design names them (`ground`, `well`, `hairline`, `ink`, `ink-2`, `weibo`,
  `link`, ...), its type scale `nsh.json`'s `tailwind`. Every page draws its own header
  (`components/Header.tsx`): glass back and action buttons, the system header hidden.
- Icons are [Tabler Icons](https://tabler.io/icons) (MIT, `icons/LICENSE`): only the SVGs the app
  uses, in `icons/`, named in `components/Icon.tsx`. To add one, copy it from `@tabler/icons`'
  `icons/outline/` (or `filled/`) and list it there; give each use a `tint-*` class.
- Images load straight from `*.sinaimg.cn` with no `Referer`, which its hot-link guard allows.
- Keep request rates gentle; this is against Weibo's terms of service and for personal use only.
