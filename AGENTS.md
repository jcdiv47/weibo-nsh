# AGENTS.md

A personal native client for one's own Weibo account, written in TSX on [NSH](https://nsh.dev).
The UI is native; the session is a WebView signed in to weibo.com, and every API call runs as that
page's own same-origin `fetch` (`bridge.ts`). The app never sees the password or the cookies.
`README.md` has the full feature list and design notes.

## Layout

- `App.tsx`: the shell, with the session web view and the navigation stack (`nav.ts`).
- `pages/`: one file per screen (Timeline, Post, Profile, People, Favorites, Replies, Edits, Topic,
  Search, ProfileSearch).
- `components/`: shared views (Header, StatusCard, Glass, Icon, VideoPlayer, ...).
- `api.ts`: every weibo.com endpoint. Each answer goes through a `parse...` function. `drift.ts`
  checks the fields a screen needs and throws `WeiboChanged` when they're gone.
- `feed.ts` (paged lists), `saved.ts` (first pages kept on the device), `download.ts`, `format.ts`,
  `emoticons.ts`, `diff.ts`.
- `locales/en.yml`, `locales/zh.yml`: every UI string, read with `t()` from `nsh/i18n`.
- `theme.json` (color tokens, light and dark), `nsh.json` (app config, type scale, capabilities).
- `icons/`: Tabler SVGs, registered in `components/Icon.tsx`.
- `tests/`: `*.test.ts` and `fixtures/`, real answers in weibo.com's shapes.

## Commands

```sh
nsh check .    # type check
nsh test       # parsers against fixtures, saved-page logic
nsh run .      # run with hot reload (macOS: AppKit; --target ios for the simulator)
```

Run `nsh check .` and `nsh test` before handing back a change. CI runs both on every PR.

## Conventions

- Endpoints are undocumented. Read fields defensively in `api.ts`. When one changes, put the new
  answer in `tests/fixtures/`, watch the test fail, then fix the parser.
- Add new strings to both locales. Use theme tokens (`ink`, `ink-2`, `weibo`, `hairline`, ...),
  not raw colors. Floating surfaces take their look from `glass(kind)` in `components/Glass.ts`.
- Comments explain what a thing is for, in full sentences, as the existing files do.
- Commit and PR titles describe what the user now sees, as a sentence ("The follow button sits at
  the end of a profile's counts line…"). The body says why and what changed.
- Keep request rates gentle. This is for personal use only.

## Releasing

A release is a GitHub Release whose tag is a plain version (`0.2.0`, no `v`). Publishing it runs
`.github/workflows/release.yml`, which builds `Weibo-<version>-macos-arm64.zip` and
`Weibo-<version>-android.apk` and attaches them. The tag is the app's version; don't edit
`nsh.json` for it. Never push tags by hand.

To draft one:

1. Make sure `main` is up to date and CI on it passed: `git fetch`,
   `gh run list --branch main --workflow CI --limit 1`.
2. Find the last release (`gh release list --limit 1`). Read what merged since then:
   `git log <last>..origin/main --oneline`, and the PRs it names.
3. Pick the next version. Bump the patch for fixes, the minor for new features. If there's no
   release yet, use `0.1.0`. Use the version the user names, if they name one.
4. Write the notes in the following style: a line "What's new in this version:", then a short bullet
   for each user-visible change, in plain words. Leave out CI, docs and refactors. Write it to a
   temporary file.
5. Create a **draft** and add GitHub's generated notes (PR list, "Full Changelog") under yours:

   ```sh
   gh release create <version> --draft --target main --title <version> \
     --notes-file notes.md --generate-notes
   ```

6. Show the user the draft's URL and notes. **Don't publish until they approve.** Publishing is
   public and starts the build.
7. Once they approve: `gh release edit <version> --draft=false`. Then confirm the Release workflow
   started (`gh run list --workflow Release --limit 1`) and report when its assets are attached.

Publish with the user's own `gh` login, not a token inside GitHub Actions. A release published by
`GITHUB_TOKEN` doesn't start other workflows, so no packages would be built. To rebuild an existing
release's packages, run the workflow by hand: `gh workflow run Release -f tag=<version>`.
