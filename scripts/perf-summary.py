#!/usr/bin/env python3
"""Sums up an `nsh test --trace` log (`scripts/perf.sh`) into a short report per scenario.

    perf-summary.py run.log [--json out.json]     # report, and the numbers as JSON
    perf-summary.py --compare before.json after.json

The trace prints, for each step a test takes, the `perf` lines of the work that step caused (`perf commit:`, `perf turn:`, `perf gc:`, `perf event js:`), then the step's `── step(...)` line once it ends, and the test's `✓`/`✗` line
once the test ends. The mount items themselves (the view props each commit sends) are left
out: they are what makes the raw log thousands of lines long.
"""

import argparse
import json
import re
import sys

# One display frame at 120 Hz (ProMotion) and at 60 Hz: work over these drops frames.
FRAME_120_US = 8_333
FRAME_60_US = 16_667

STEP = re.compile(r"^── (.+?): (\d+) items?$")
TEST = re.compile(r"^([✓✗○]) (.+?) › (.+?)(?: \(([^()]*\d[^()]*s)\))?(?: skipped)?$")
COMMIT = re.compile(r"^perf commit: (\d+) ops, (\d+)µs \(list js (\d+)µs\), (\d+) mount items, (\d+) nodes")
TURN = re.compile(r"^perf turn: (\d+)µs \(timers and tasks (\d+)µs\)")
GC = re.compile(r"^perf gc: (\d+)µs")
EVENT_JS = re.compile(r"^perf event js: (\d+)µs")
FIRST_FRAME = re.compile(r"^perf first frame: eval (\d+)µs, total (\d+)µs")
# With -v (as on a simulator) the lines carry their log level and target: ` info nsh::perf commit: …`.
VERBOSE = re.compile(r"^\s*(?:trace|debug|info|warn|error)\s+nsh::perf\s+")
# The performance monitor's reading, once a second (`--fps`, shown with -v):
# ` info nsh::fps fps 55/60 frame … over 0% … cpu 12% mem 38.6 MB`.
MONITOR = re.compile(r"nsh::fps\s+fps (\d+)/(\d+)\b.*?\bover (\d+)%.*?\bmem ([\d.]+) MB")


def pct(values, p):
    if not values:
        return 0
    s = sorted(values)
    return s[min(len(s) - 1, int(round(p / 100 * (len(s) - 1))))]


def stats(values):
    return {
        "n": len(values),
        "total_us": sum(values),
        "p50_us": pct(values, 50),
        "p95_us": pct(values, 95),
        "max_us": max(values, default=0),
        "over_8ms": sum(v > FRAME_120_US for v in values),
        "over_16ms": sum(v > FRAME_60_US for v in values),
    }


class Scenario:
    def __init__(self):
        self.commits, self.list_js, self.turns, self.gcs, self.events = [], [], [], [], []
        self.mount_items = 0
        self.max_nodes = 0
        self.first_nodes = None
        self.last_nodes = 0
        self.first_frame = None
        self.fps = []  # [fps, target, % frames over budget, memory MB]
        self.steps = []  # [label, commit µs, mount items, longest turn µs]
        # The work logged since the last step ended: the next step's, once its line names it.
        self.pending = [0, 0, 0]

    def step(self, label):
        self.steps.append([f"#{len(self.steps) + 1} {label}", *self.pending])
        self.pending = [0, 0, 0]

    def add(self, commit_us=0, items=0, turn_us=0):
        self.pending[0] += commit_us
        self.pending[1] += items
        self.pending[2] = max(self.pending[2], turn_us)

    def report(self, name, status, took):
        if any(self.pending):
            self.step("(after the last step)")
        heavy = sorted(self.steps, key=lambda s: max(s[1], s[3]), reverse=True)[:8]
        return {
            "name": name,
            "status": status,
            "took": took,
            "steps": len(self.steps),
            "first_frame": self.first_frame,
            "commit": stats(self.commits),
            "commit_list_js_total_us": sum(self.list_js),
            "mount_items": self.mount_items,
            "max_nodes": self.max_nodes,
            "first_nodes": self.first_nodes,
            "last_nodes": self.last_nodes,
            "turn": stats(self.turns),
            "gc": stats(self.gcs),
            "event_js": stats(self.events),
            "monitor": {
                "n": len(self.fps),
                "fps_min": min((f[0] for f in self.fps), default=None),
                "fps_p50": pct([f[0] for f in self.fps], 50) if self.fps else None,
                "target": max((f[1] for f in self.fps), default=None),
                "over_pct_max": max((f[2] for f in self.fps), default=None),
                "mem_mb_max": max((f[3] for f in self.fps), default=None),
                "mem_mb_end": self.fps[-1][3] if self.fps else None,
            },
            "heaviest_steps": [
                {"step": s[0], "commit_us": s[1], "mount_items": s[2], "longest_turn_us": s[3]} for s in heavy
            ],
        }


def parse(lines):
    out, sc = [], Scenario()
    for raw in lines:
        line = VERBOSE.sub("perf ", raw.rstrip("\n"))
        if m := STEP.match(line):
            sc.step(m.group(1))
        elif m := COMMIT.match(line):
            us, js, items, nodes = int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
            sc.commits.append(us)
            sc.list_js.append(js)
            sc.mount_items += items
            sc.max_nodes = max(sc.max_nodes, nodes)
            sc.first_nodes = nodes if sc.first_nodes is None else sc.first_nodes
            sc.last_nodes = nodes
            sc.add(commit_us=us, items=items)
        elif m := TURN.match(line):
            us = int(m.group(1))
            sc.turns.append(us)
            sc.add(turn_us=us)
        elif m := GC.match(line):
            sc.gcs.append(int(m.group(1)))
        elif m := EVENT_JS.match(line):
            sc.events.append(int(m.group(1)))
        elif m := FIRST_FRAME.match(line):
            sc.first_frame = {"eval_us": int(m.group(1)), "total_us": int(m.group(2))}
        elif m := MONITOR.search(line):
            sc.fps.append([int(m.group(1)), int(m.group(2)), int(m.group(3)), float(m.group(4))])
        elif m := TEST.match(line):
            status = {"✓": "passed", "✗": "failed", "○": "skipped"}[m.group(1)]
            if status != "skipped":
                out.append(sc.report(m.group(3), status, m.group(4)))
            sc = Scenario()
    return out


def ms(us):
    return f"{us / 1000:.1f}ms"


def show(r):
    c, t, g, e = r["commit"], r["turn"], r["gc"], r["event_js"]
    print(f"## {r['name']}  [{r['status']}, {r['took'] or '?'}, {r['steps']} steps]")
    if r["first_frame"]:
        print(f"first frame      eval {ms(r['first_frame']['eval_us'])}, total {ms(r['first_frame']['total_us'])}")
    print(
        f"commits          {c['n']}, total {ms(c['total_us'])} (list js {ms(r['commit_list_js_total_us'])}), "
        f"p50 {ms(c['p50_us'])}, p95 {ms(c['p95_us'])}, max {ms(c['max_us'])}, >8ms {c['over_8ms']}, >16ms {c['over_16ms']}"
    )
    print(
        f"mounted          {r['mount_items']} items; nodes alive: {r['first_nodes']} at first, "
        f"{r['max_nodes']} at most, {r['last_nodes']} at the end"
    )
    print(
        f"js turns         {t['n']}, total {ms(t['total_us'])}, p95 {ms(t['p95_us'])}, max {ms(t['max_us'])}, "
        f">8ms {t['over_8ms']}, >16ms {t['over_16ms']}"
    )
    print(f"event handlers   {e['n']}, total {ms(e['total_us'])}, max {ms(e['max_us'])}")
    print(f"gc               {g['n']}, total {ms(g['total_us'])}, max {ms(g['max_us'])}")
    mon = r["monitor"]
    if mon["n"]:
        print(
            f"monitor          {mon['n']} readings: fps p50 {mon['fps_p50']}/{mon['target']}, min {mon['fps_min']}, "
            f"frames over budget up to {mon['over_pct_max']}%; memory up to {mon['mem_mb_max']} MB, {mon['mem_mb_end']} MB at the end"
        )
    print("heaviest steps:")
    for s in r["heaviest_steps"]:
        print(
            f"  {ms(s['commit_us']):>8} commit, {ms(s['longest_turn_us']):>8} longest turn, "
            f"{s['mount_items']:>5} items  {s['step'][:90]}"
        )
    print()


def compare(a_path, b_path):
    a = {r["name"]: r for r in json.load(open(a_path))}
    b = {r["name"]: r for r in json.load(open(b_path))}
    rows = [
        ("commit total", lambda r: r["commit"]["total_us"]),
        ("commit p95", lambda r: r["commit"]["p95_us"]),
        ("commit max", lambda r: r["commit"]["max_us"]),
        ("commits >8ms", lambda r: r["commit"]["over_8ms"]),
        ("turn total", lambda r: r["turn"]["total_us"]),
        ("turn p95", lambda r: r["turn"]["p95_us"]),
        ("turn max", lambda r: r["turn"]["max_us"]),
        ("turns >8ms", lambda r: r["turn"]["over_8ms"]),
        ("gc total", lambda r: r["gc"]["total_us"]),
        ("mount items", lambda r: r["mount_items"]),
        ("max nodes", lambda r: r["max_nodes"]),
        ("end nodes", lambda r: r["last_nodes"]),
        ("fps min", lambda r: r["monitor"]["fps_min"] or 0),
        ("mem MB max", lambda r: r["monitor"]["mem_mb_max"] or 0),
    ]
    for name in [n for n in a if n in b]:
        print(f"## {name}")
        for label, get in rows:
            x, y = get(a[name]), get(b[name])
            change = f"{(y - x) / x * 100:+.0f}%" if x else ("same" if x == y else "new")
            print(f"  {label:<14} {x:>10} -> {y:>10}  {change}")
        print()
    for name in sorted(set(a) ^ set(b)):
        print(f"(only in {'before' if name in a else 'after'}: {name})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("log", nargs="?")
    ap.add_argument("--json")
    ap.add_argument("--compare", nargs=2, metavar=("BEFORE", "AFTER"))
    args = ap.parse_args()
    if args.compare:
        compare(*args.compare)
        return
    if not args.log:
        ap.error("give a log, or --compare BEFORE AFTER")
    with open(args.log, encoding="utf-8", errors="replace") as f:
        reports = parse(f)
    if not reports:
        print("no scenario ran (no ✓/✗ line in the log)", file=sys.stderr)
        sys.exit(1)
    for r in reports:
        show(r)
    if args.json:
        with open(args.json, "w") as f:
            json.dump(reports, f, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
