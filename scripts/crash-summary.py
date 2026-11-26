#!/usr/bin/env python3
"""Sums up the app's .ips reports that `scripts/pull-crashes.sh` pulled (or any folder of them).

    crash-summary.py <dir> [--app Weeber]

An .ips file is a JSON header line, then the report's JSON. For a crash (bug_type 309) it prints
the exception, the termination reason and the crashed thread's top frames; for a resource report
(CPU, disk writes, wakeups) what limit was passed; for a jetsam report (298) the app's memory then,
and whether it was the process iOS ended to free memory, and why.
"""

import argparse
import glob
import json
import os
import re

# Weeber (TestFlight), WeeberDev (the dev build), WeberDev (an earlier dev build); not Sina's "Weibo".
APP = re.compile(r"^(Weeber|WeberDev)")


def read(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        head, _, body = f.read().partition("\n")
    try:
        header = json.loads(head)
    except json.JSONDecodeError:
        header = {}
    try:
        report = json.loads(body)
    except json.JSONDecodeError:
        report = None
    return header, report, body


def mb(pages, page_size):
    return f"{pages * page_size / 1024 / 1024:.0f} MB"


def jetsam(path, header, r, app):
    page = (r.get("memoryStatus") or {}).get("pageSize", 16384)
    mine = [p for p in r.get("processes", []) if app.match(p.get("name", ""))]
    if not mine:
        return None
    lines = []
    for p in mine:
        reason = p.get("reason")
        state = ",".join(p.get("states", []))
        lines.append(
            f"{header.get('timestamp', '?')[:19]}  jetsam  {p.get('name')}: {state or '?'}, "
            f"resident {mb(p.get('rpages', 0), page)}, peak {mb(p.get('lifetimeMax', 0), page)}"
            + (f"  ** ENDED: {reason} **" if reason else "")
            + f"  (largest process: {r.get('largestProcess', '?')})"
        )
    return lines


def crash(path, header, r):
    exc = r.get("exception") or {}
    term = r.get("termination") or {}
    out = [
        f"{header.get('timestamp', '?')[:19]}  crash   {r.get('procName', '?')} {header.get('app_version', '')} "
        f"({header.get('build_version', '')}): {exc.get('type', '?')} {exc.get('signal', '')} "
        f"{exc.get('subtype', '')}".rstrip()
    ]
    if term:
        out.append(f"    termination: {term.get('namespace', '')} {term.get('indicator', '')} {' '.join(term.get('reasons', []))}".rstrip())
    images = r.get("usedImages", [])
    for t in r.get("threads", []):
        if not t.get("triggered"):
            continue
        out.append(f"    crashed thread {t.get('name') or t.get('queue') or ''}:")
        for fr in t.get("frames", [])[:12]:
            img = images[fr["imageIndex"]].get("name", "?") if fr.get("imageIndex", -1) < len(images) else "?"
            sym = fr.get("symbol") or f"+{fr.get('imageOffset', '?')}"
            out.append(f"      {img:<24} {sym}")
    return out


def resource(path, header, body):
    # Resource reports are text after the header: their first lines say what was passed.
    lines = [l for l in body.splitlines() if l.strip()][:14]
    keep = [l for l in lines if re.match(r"\s*(Event|Action taken|Writes|CPU|Wakeups|Duration|Steps|Limit)", l)]
    return [f"{header.get('timestamp', '?')[:19]}  {header.get('bug_type', '?'):>6}  {os.path.basename(path)}"] + [
        f"    {l.strip()}" for l in keep
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--app", help="a regex of the app's process names")
    args = ap.parse_args()
    app = re.compile(args.app) if args.app else APP
    entries = []
    for path in sorted(glob.glob(os.path.join(args.dir, "*.ips"))):
        header, report, body = read(path)
        name = os.path.basename(path)
        if name.startswith("JetsamEvent") and report:
            lines = jetsam(path, header, report, app)
        elif report and header.get("bug_type") == "309":
            lines = crash(path, header, report)
        elif app.match(name):
            lines = resource(path, header, body)
        else:
            lines = None
        if lines:
            entries.append((header.get("timestamp", ""), lines))
    if not entries:
        print(f"no report of the app in {args.dir}")
        return
    crashes = sum(1 for _, l in entries if "  crash  " in l[0])
    ended = sum(1 for _, l in entries for x in l if "ENDED" in x)
    print(f"{len(entries)} report(s): {crashes} crash(es), app ended by jetsam {ended} time(s)\n")
    for _, lines in sorted(entries, key=lambda e: e[0]):
        print("\n".join(lines))


if __name__ == "__main__":
    main()
