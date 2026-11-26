#!/usr/bin/env bash
# Records an Instruments trace of the dev build on the iPhone (or a simulator) and sums it up as
# text (`perf/README.md`): for what `scripts/perf.sh` cannot see, the native side (image decoding,
# layout, the web view's work, memory) and real-device timings. Needs the dev build
# (`dev.jcdiv47.weibo`, a development-signed `nsh package`) installed: the TestFlight build is
# signed for distribution, which lets no profiler attach.
#
#   scripts/xtrace.sh                                  # Time Profiler, 20 s, the connected iPhone
#   scripts/xtrace.sh --template "Animation Hitches"   # or Allocations, Leaks, "App Launch", ...
#   scripts/xtrace.sh --time 40s --device <udid|simulator name>
#   scripts/xtrace.sh --summarize <file.trace>         # sum up a trace recorded before
#
# It launches the app afresh, records while someone uses it (the phone must be unlocked: say what
# to do on it, e.g. scroll the timeline), then writes .perf/xtrace-<time>/ with the .trace (open it
# in Instruments to look closer), toc.xml (the tables it holds) and summary.txt.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# The iPhone: $WEEBER_DEVICE, else the first paired iPhone `devicectl` finds connected.
device="${WEEBER_DEVICE:-}"
bundle="dev.jcdiv47.weibo"
process="WeeberDev"
template="Time Profiler"
time="20s"
trace=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --template) template="$2"; shift ;;
    --time) time="$2"; shift ;;
    --device) device="$2"; shift ;;
    --bundle) bundle="$2"; shift ;;
    --process) process="$2"; shift ;;
    --summarize) trace="$2"; shift ;;
    -h | --help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ -z "$trace" ]]; then
  if [[ -z "$device" ]]; then
    device="$(xcrun devicectl list devices 2>/dev/null | grep -E 'available.*iPhone.*physical' | grep -oE '[0-9A-F]{8}-[0-9A-F]{16}' | head -1 || true)"
    [[ -n "$device" ]] || { echo "no iPhone connected: connect and unlock it, or set WEEBER_DEVICE / pass --device" >&2; exit 1; }
  fi
  out="$root/.perf/xtrace-$(date +%Y%m%d-%H%M%S)-$(tr ' A-Z' '-a-z' <<<"$template")"
  mkdir -p "$out"
  trace="$out/run.trace"
  # A fresh launch, then attach: recording from the launch would need the profiler to start the
  # app, which on a phone asks for its path on the device.
  xcrun devicectl device process launch --terminate-existing --device "$device" "$bundle" >/dev/null
  sleep 2
  echo "recording $template for $time on $device: use the app now" >&2
  xcrun xctrace record --template "$template" --device "$device" --attach "$process" \
    --time-limit "$time" --output "$trace" --no-prompt >&2
else
  out="$(dirname "$trace")"
fi

xcrun xctrace export --input "$trace" --toc >"$out/toc.xml"
python3 "$root/scripts/xtrace-summary.py" "$trace" "$out/toc.xml" --process "$process" | tee "$out/summary.txt"
