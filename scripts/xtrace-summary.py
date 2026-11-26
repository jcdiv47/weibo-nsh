#!/usr/bin/env python3
"""Sums up an Instruments trace as text (`scripts/xtrace.sh`).

    xtrace-summary.py <file.trace> <toc.xml> [--process WeeberDev] [--top 25]

`xctrace export` writes XML in which a value met before is only a `ref` to the element that had
its `id` (a frame, a backtrace, a thread): this resolves them. A time profile becomes the
functions with the most samples, by self time (the function itself was running) and by total time
(it or what it called); the binary each is in tells the app's own code (`WeeberDev`, its Rust),
QuickJS (`JS_*`, the TSX) and the system's apart. Other tables are listed with their row counts and
first rows, enough to see whether to open the trace in Instruments.
"""

import argparse
import collections
import subprocess
import sys
import xml.etree.ElementTree as ET

PROFILE_SCHEMAS = ("time-profile", "cpu-profile", "time-sample")
SAMPLE_ROWS = 8


def export(trace, xpath):
    r = subprocess.run(
        ["xcrun", "xctrace", "export", "--input", trace, "--xpath", xpath],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return ET.fromstring(r.stdout)


class Refs:
    """Each element by its `id`, so a `ref` reads as the element it stands for."""

    def __init__(self, root):
        self.by_id = {e.get("id"): e for e in root.iter() if e.get("id") is not None}

    def __call__(self, e):
        while e is not None and e.get("ref") is not None:
            e = self.by_id.get(e.get("ref"))
        return e


def frame_name(refs, f):
    f = refs(f)
    name = f.get("name") or f.get("addr") or "?"
    binary = refs(f.find("binary")) if f.find("binary") is not None else None
    return name, (binary.get("name") if binary is not None else "?")


def profile(trace, run, schema, process, top):
    root = export(trace, f'/trace-toc/run[@number="{run}"]/data/table[@schema="{schema}"]')
    refs = Refs(root)
    self_w, total_w, by_binary = collections.Counter(), collections.Counter(), collections.Counter()
    all_w = 0
    for row in root.iter("row"):
        if process:
            proc = refs(row.find("process"))
            if proc is not None and process not in (proc.get("fmt") or ""):
                continue
        w = refs(row.find("weight"))
        weight = int(w.text) if w is not None and w.text else 1
        # A time profile's stack is a `tagged-backtrace`, a CPU profile's a `backtrace`.
        bt = next((refs(c) for c in row if c.tag in ("tagged-backtrace", "backtrace")), None)
        if bt is None:
            continue
        frames = [frame_name(refs, f) for f in bt.findall("frame")]
        if not frames:
            continue
        all_w += weight
        self_w[frames[0]] += weight
        by_binary[frames[0][1]] += weight
        for fr in set(frames):
            total_w[fr] += weight
    if not all_w:
        return [f"{schema}: no samples{' of ' + process if process else ''}"]
    unit = "ms" if all_w > 10_000_000 else "samples"
    scale = 1e6 if unit == "ms" else 1

    def fmt(w):
        return f"{w / scale:9.1f}{unit[:2]} {w / all_w * 100:5.1f}%"

    out = [f"{schema}: {all_w / scale:.0f} {unit} sampled{' in ' + process if process else ''}", "", "by binary (self):"]
    out += [f"  {fmt(w)}  {b}" for b, w in by_binary.most_common(12)]
    out += ["", f"top {top} by self time:"]
    out += [f"  {fmt(w)}  {n[:100]}  [{b}]" for (n, b), w in self_w.most_common(top)]
    out += ["", f"top {top} by total time (it and what it called):"]
    out += [f"  {fmt(w)}  {n[:100]}  [{b}]" for (n, b), w in total_w.most_common(top)]
    return out


def table_sample(trace, run, schema):
    try:
        root = export(trace, f'/trace-toc/run[@number="{run}"]/data/table[@schema="{schema}"]')
    except RuntimeError as e:
        return [f"  (could not export: {e})"]
    refs = Refs(root)
    rows = list(root.iter("row"))
    out = [f"{schema}: {len(rows)} rows"]
    for row in rows[:SAMPLE_ROWS]:
        cells = []
        for c in row:
            c = refs(c)
            if c is None:
                continue
            cells.append(f"{c.tag}={(c.get('fmt') or c.text or '').strip()[:60]}")
        out.append("  " + "  ".join(cells))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("trace")
    ap.add_argument("toc")
    ap.add_argument("--process", default="")
    ap.add_argument("--top", type=int, default=25)
    args = ap.parse_args()
    toc = ET.parse(args.toc).getroot()
    for run in toc.findall("run"):
        n = run.get("number")
        info = run.find("info")
        target = info.find(".//process") if info is not None else None
        print(f"# run {n}" + (f": {target.get('name')}" if target is not None else ""))
        schemas = [t.get("schema") for t in run.iter("table") if t.get("schema")]
        print("tables: " + ", ".join(dict.fromkeys(schemas)))
        print()
        done = set()
        for schema in schemas:
            if schema in done:
                continue
            done.add(schema)
            if schema in PROFILE_SCHEMAS:
                lines = profile(args.trace, n, schema, args.process, args.top)
            elif any(k in schema for k in ("hang", "hitch", "leak", "allocation", "launch", "os-signpost", "memory")):
                lines = table_sample(args.trace, n, schema)
            else:
                continue
            print("\n".join(lines))
            print()


if __name__ == "__main__":
    sys.exit(main())
