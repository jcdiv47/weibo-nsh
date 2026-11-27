#!/usr/bin/env bash
# Pulls the app's crash and resource reports off an iPhone over USB or Wi-Fi, for the TestFlight
# build and the dev build alike (`perf/README.md`), and sums them up.
#
#   scripts/pull-crashes.sh                  # the connected iPhone, the newest 60 jetsam reports
#   scripts/pull-crashes.sh --all            # every jetsam report the phone still has
#   scripts/pull-crashes.sh --device <udid>  # another device
#
# What it keeps, in .perf/crashes/<device>/ (files already there are not fetched again):
# - the app's own reports: crashes (`Weeber-*.ips`), CPU, disk writes and wakeups over iOS's
#   limits (`Weeber.cpu_resource-*`, `.diskwrites_resource-*`), user faults;
# - the jetsam reports (iOS ending apps to free memory) that list the app: whether it was the one
#   ended, and how much memory it held then.
# The phone must be unlocked and trusted. Reports reach it only from the builds it ran; testers'
# phones keep their own (theirs come through App Store Connect, see perf/README.md).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# The iPhone: $WEEBER_DEVICE, else the first paired iPhone `devicectl` finds connected.
device="${WEEBER_DEVICE:-}"
jetsams=60
# The app's process names: Weeber (TestFlight), WeeberDev (the dev build) and an earlier dev build's
# WeberDev. Not "Weibo": that is Sina's own app too, as WeiboOverseas is.
names='^(Weeber|WeberDev)'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) device="$2"; shift ;;
    --all) jetsams=100000 ;;
    -h | --help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ -z "$device" ]]; then
  device="$(xcrun devicectl list devices 2>/dev/null | grep -E 'available.*iPhone.*physical' | grep -oE '[0-9A-F]{8}-[0-9A-F]{16}' | head -1 || true)"
  [[ -n "$device" ]] || { echo "no iPhone connected: connect and unlock it, or set WEEBER_DEVICE / pass --device" >&2; exit 1; }
fi

out="$root/.perf/crashes/$device"
mkdir -p "$out"

# The domain cannot be copied whole (some of its files are not readable), so file by file.
listing="$(xcrun devicectl device info files --device "$device" --domain-type systemCrashLogs 2>&1)" || {
  echo "$listing" | tail -5 >&2
  echo "could not list the device's reports: is it connected, unlocked and trusted?" >&2
  exit 1
}
paths="$(awk '{print $1}' <<<"$listing" | grep -E '\.ips$' | grep -v '^ProxiedDevice' || true)"
own="$(grep -E "(^|/)${names#^}" <<<"$paths" || true)"
jetsam="$(grep -E '(^|/)JetsamEvent-' <<<"$paths" | sort -t- -k2 | tail -n "$jetsams" || true)"

fetch() {
  local src="$1" dest="$out/$(basename "$1")"
  [[ -s "$dest" ]] && return 0
  xcrun devicectl device copy from --device "$device" --domain-type systemCrashLogs \
    --source "$src" --destination "$dest" >/dev/null 2>&1 || echo "could not copy $src" >&2
}
export -f fetch
export device out

n_own=$(grep -c . <<<"$own" || true)
n_jet=$(grep -c . <<<"$jetsam" || true)
echo "fetching $n_own report(s) of the app and $n_jet jetsam report(s) into ${out#$root/}" >&2
printf '%s\n' "$own" "$jetsam" | grep . | xargs -P 6 -I{} bash -c 'fetch "$1"' _ {}

# Jetsam reports that do not list the app are of no use here.
for f in "$out"/JetsamEvent-*.ips; do
  [[ -e "$f" ]] || continue
  grep -qE "\"name\" *: *\"${names#^}" "$f" || rm -f "$f"
done

python3 "$root/scripts/crash-summary.py" "$out"
