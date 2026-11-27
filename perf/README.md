# Performance and resource use

How to find out what the app costs (CPU, frames, memory) and whether it crashed, from a terminal,
so that a coding agent can measure a problem, change the code, and measure again. Four tools,
the first the one to start with:

| Tool | What it sees | Needs |
| --- | --- | --- |
| `scripts/perf.sh` | The TSX side on stand-in data: each commit's and JS turn's time, frames over budget, views mounted and alive, GC; with `--ios`, frame rate, CPU and memory on a simulator | Nothing: headless, or a simulator |
| `scripts/pull-crashes.sh` | What happened on the iPhone: crashes, CPU and disk-write reports, and iOS ending the app to free memory (with its memory then) | The iPhone, unlocked |
| `scripts/xtrace.sh` | Instruments on the iPhone: native time (image decoding, layout, the web view, Rust), hitches, allocations | The dev build installed on the iPhone, someone using it |
| App Store Connect | Testers' crashes and feedback (TestFlight → Crashes, Feedback); Xcode Organizer's metrics | Enough testers to show anything |

Each writes into `.perf/` (ignored by git). Run these with the `nsh` the app pins: `nsh test`
refuses to run when `nsh --version` is not at the commit `ext/weibo-media/Cargo.toml` names
(`scripts/pin-nsh.sh` moves the pin to a nightly; don't commit a pin moved for measuring). The
iPhone scripts take the first connected iPhone, or `WEEBER_DEVICE` / `--device`.

## The loop: `scripts/perf.sh`

The app's data comes through a web view signed in to weibo.com, which an agent has no session
for. `TimelineHarness.tsx` runs the real Timeline and Post pages (their requests, parsers, list
and cards) over a stand-in bridge answering from `tests/fixtures/`: ten pages of twenty posts,
their text one to six sentences long, nought to nine pictures, every fifth a repost.
`timeline.scenarios.tsx` takes the steps whose cost is measured:

- **cold start**: the first page of the timeline shows.
- **scroll**: down the whole feed (loading every page) and back up.
- **open**: a post's page and back, five times.

```sh
scripts/perf.sh                 # every scenario, headless: about 3 minutes, most of it scrolling
scripts/perf.sh open            # those whose name contains "open"
scripts/perf.sh --ios scroll    # on an iOS simulator, with the performance monitor (--fps)
scripts/perf.sh compare .perf/<before>/summary.json .perf/<after>/summary.json
```

A run prints a report per scenario and keeps `run.log` (the whole `nsh test --trace`: every
mount item each step sent), `summary.txt` and `summary.json` in `.perf/<time>-<commit>/`;
`.perf/latest` is the last. In the report:

- **commits**: the engine applying a batch of changes to the native views. `p95`, `max`, and how
  many took over a frame (8.3 ms at 120 Hz, 16.7 ms at 60 Hz). `list js` is the part spent in
  the lists' JS (row functions, keys).
- **js turns**: a run of the app's JS (an event, a timer, a resolved request). A long one blocks
  the next frame.
- **mounted / nodes alive**: views created or changed, and how many exist at first, at most and at
  the end. Nodes that grow with each round of the same steps and never come down are views kept
  alive after they left the screen, but only on a simulator: headless, a popped page's nodes stay
  counted (five posts opened and closed end at 810 headless, back at 270 on the simulator).
- **monitor** (`--ios` only): the performance monitor's readings, once a second: frames drawn
  against the display's rate, the share of frames over budget, and the app's memory. A screen at
  rest draws few frames, so a low rate there is no problem; frames over budget are.
- **heaviest steps**: the steps that cost most, by name, to know which move to look into.

Headless times are this Mac's, not a phone's: compare runs with each other, not with a frame
budget on a device. Confirm a result on the simulator (`--ios`), and on the iPhone with
`scripts/xtrace.sh` when it is about frames or memory.

### Investigating and fixing

1. Run the scenario (`scripts/perf.sh <filter>`) and keep the path of its `summary.json`.
2. Read `heaviest steps`, then that step's lines in `run.log`: the mount items under a step name
   the views it created (`Create`), changed (`ViewProps`, `Text`, `Frame`) and removed. A scroll
   that recreates cards, or a press that rebuilds a list, means a binding reads more than it
   should (NSH's Coding Guides, "Performance rules": https://nsh.dev/docs/coding-guides.md).
3. Change the code, run the same scenario, and `scripts/perf.sh compare` the two
   `summary.json`. Run each side twice: a run differs from the last by some percent.
4. `nsh check .` and `nsh test` as for any change.

To measure another screen, add a harness (a stand-in bridge as in `TimelineHarness.tsx`, the
page in a `NavStack`) and a `<name>.scenarios.tsx` beside it. A scenario file is not named
`*.test.tsx`, so that `nsh test` and CI do not run it; `scripts/perf.sh` runs a copy named so.

## The iPhone: `scripts/pull-crashes.sh`

```sh
scripts/pull-crashes.sh          # the newest 60 jetsam reports, and every report of the app
scripts/pull-crashes.sh --all
```

It copies the iPhone's reports of the app (TestFlight `Weeber` and the dev build `WeeberDev`)
into `.perf/crashes/<device>/` and prints one line each, oldest first:

- a **crash**: the exception, the termination reason, the crashed thread's top frames. The JS
  side's errors are not here: an uncaught one shows in the app, and `nsh symbolicate` maps its
  `bundle.js:LINE:COL` to the sources.
- a **resource report**: CPU, disk writes or wakeups over iOS's limit.
- a **jetsam report**: the app's state, memory (resident, and its peak since launch) when iOS
  ended an app to free memory, and `ENDED: <reason>` when the app was the one ended.
  `long-idle-exit` is iOS ending an app left in the background for long, which is normal;
  Another reason while the app was frontmost (a per-process limit, memory running short) is the
  app using too much memory.

## Instruments: `scripts/xtrace.sh`

For what the headless runs cannot see: the native side, and the phone's own timings and memory.
It needs the dev build (`dev.jcdiv47.weibo`) on the iPhone, packaged with a development profile
(`nsh package . --target ios --id dev.jcdiv47.weibo --sign … --profile …`) and installed with
`xcrun devicectl device install app`, as the TestFlight build lets no profiler attach; and someone
using the app while it records.

```sh
scripts/xtrace.sh                                   # Time Profiler, 20 s
scripts/xtrace.sh --template "Animation Hitches"    # or Allocations, Leaks, "App Launch"
scripts/xtrace.sh --summarize .perf/xtrace-.../run.trace
```

The summary lists the trace's tables, and for a time profile the functions with the most samples
by self and total time, with their binaries: `WeeberDev` (the app's Rust and the engine), QuickJS
(`JS_*`, the TSX), UIKit, WebKit, ImageIO. QuickJS frames do not say which TSX function ran:
use `scripts/perf.sh` for that side. Open the `.trace` in Instruments for a closer look.

## Testers' phones

What happens on other testers' phones reaches App Store Connect, not this Mac: TestFlight →
Crashes and Feedback, and Xcode → Organizer for crashes, hangs and (with enough devices sharing
analytics) launch time, memory and battery metrics. With a few testers, these stay sparse.
