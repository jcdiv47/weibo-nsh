#!/bin/sh
# Points the app's Rust (ext/weibo-media) at the nsh crates of the installed nsh nightly.
#
# An app with Rust builds its runtime from wherever its crates take nsh, and nsh stops when that is
# a Git commit other than the one its own nightly was built from. The crate takes nsh by Git at a
# nightly's commit (crates.io's 0.6.x lacks what the app needs), so after `nsh update nightly`, and
# in CI, which installs the latest nightly, run this to move the commit along:
#
#   scripts/pin-nsh.sh
set -eu

manifest="$(dirname "$0")/../ext/weibo-media/Cargo.toml"
repository=https://github.com/longbridge/nsh

version="$(nsh --version)"
short="$(printf '%s\n' "$version" | sed -n 's/.*(\([0-9a-f]\{7,\}\) nightly.*/\1/p')"
[ -n "$short" ] || {
  echo "pin-nsh: not an nsh nightly: $version" >&2
  exit 1
}

# The full commit: the nightly tag's when it is that build, else GitHub's for the short one.
full="$(git ls-remote "$repository" refs/tags/nightly | cut -f1)"
case "$full" in
  "$short"*) ;;
  *)
    full="$(curl -fsSL "https://api.github.com/repos/longbridge/nsh/commits/$short" |
      sed -n 's/^  "sha": "\([0-9a-f]\{40\}\)".*/\1/p' | head -1)"
    ;;
esac
[ "${#full}" -eq 40 ] || {
  echo "pin-nsh: cannot find the commit of nsh $short" >&2
  exit 1
}

sed "s|^\(nsh-core = { git = \"$repository\", rev = \"\)[0-9a-f]\{40\}\(\" }\)|\1$full\2|" "$manifest" > "$manifest.new"
mv "$manifest.new" "$manifest"
grep -q "rev = \"$full\"" "$manifest" || {
  echo "pin-nsh: no nsh-core Git dependency to move in $manifest" >&2
  exit 1
}
cargo update --quiet --manifest-path "$manifest" -p nsh-core
echo "pin-nsh: ext/weibo-media takes nsh at $full"
