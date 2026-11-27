#!/usr/bin/env bash
# Measures what the app's common moves cost, on stand-in data (`perf/README.md`): runs the
# scenarios of `perf/*.scenarios.tsx` under `nsh test --trace`, keeps the raw log, and prints a
# short report per scenario (commit and JS turn times, frames over budget, mounts, GC).
#
#   scripts/perf.sh                     # every scenario, headless (fast, no simulator)
#   scripts/perf.sh scroll              # only the scenarios whose name contains "scroll"
#   scripts/perf.sh --ios [filter]      # on an iOS simulator, with the frame rate (--fps)
#   scripts/perf.sh --device <sim> ...  # that simulator (name or UDID)
#   scripts/perf.sh compare <before.json> <after.json>
#
# Each run writes .perf/<time>-<commit>[-ios]/ with run.log, summary.txt and summary.json; the
# last one is linked at .perf/latest. Compare two runs' summary.json before and after a change.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ "${1:-}" == "compare" ]]; then
  [[ $# -eq 3 ]] || { echo "usage: scripts/perf.sh compare <before.json> <after.json>" >&2; exit 2; }
  exec python3 scripts/perf-summary.py --compare "$2" "$3"
fi

ios=0
device=""
filter=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ios) ios=1 ;;
    --device) ios=1; device="$2"; shift ;;
    -h | --help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) filter="$1" ;;
  esac
  shift
done

# `nsh test` only runs files named as tests, and CI runs every test file: the scenarios take
# minutes, so they keep another name and run here from copies, removed again on the way out.
copies=()
cleanup() { [[ ${#copies[@]} -gt 0 ]] && rm -f "${copies[@]}"; return 0; }
trap cleanup EXIT
for src in perf/*.scenarios.tsx; do
  copy="${src%.scenarios.tsx}.run.test.tsx"
  cp "$src" "$copy"
  copies+=("$copy")
done

out=".perf/$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
git diff --quiet HEAD || out+="-dirty"
[[ $ios == 1 ]] && out+="-ios"
mkdir -p "$out"

args=(--trace)
[[ -n "$filter" ]] && args+=(--filter "$filter")
if [[ $ios == 1 ]]; then
  # The host logs the performance monitor's readings once a second, which only -v shows.
  args+=(--target ios --fps -v)
  [[ -n "$device" ]] && args+=(--device "$device")
fi

# One file at a time: given a directory, `nsh test --trace` takes it for an app.
status=0
: >"$out/run.log"
for copy in "${copies[@]}"; do
  echo "nsh test $copy ${args[*]}  ->  $out/run.log" >&2
  nsh test "$copy" "${args[@]}" >>"$out/run.log" 2>&1 || status=$?
done

python3 scripts/perf-summary.py "$out/run.log" --json "$out/summary.json" | tee "$out/summary.txt" || true
ln -sfn "$(basename "$out")" .perf/latest
if [[ $status -ne 0 ]]; then
  echo "nsh test failed ($status): see the end of $out/run.log" >&2
  tail -n 20 "$out/run.log" | cut -c1-300 >&2
fi
exit $status
