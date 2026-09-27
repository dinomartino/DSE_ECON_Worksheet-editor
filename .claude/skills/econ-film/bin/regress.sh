#!/bin/sh
# regress.sh DEST FROM_BAR TO_BAR — 1 fps --final stills in 2-bar chunks (each < 100 s) into DEST.
# Run from the repo root. Renders go to $FILM_OUT (default: a folder beside DEST), never the
# shipped outputs. Compare two runs with regdiff.py DEST_A DEST_B.
set -e
dest="$1"; b="$2"; end="$3"
[ -n "$dest" ] && [ -n "$b" ] && [ -n "$end" ] || { echo "usage: regress.sh DEST FROM_BAR TO_BAR" >&2; exit 2; }
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$dest"
export FILM_OUT="${FILM_OUT:-$(cd "$dest/.." && pwd)/film-out}"
while [ "$b" -lt "$end" ]; do
  e=$((b + 2)); [ "$e" -gt "$end" ] && e="$end"
  log="$FILM_OUT/regress-$b.log"; mkdir -p "$FILM_OUT"
  "$here/timeout" 100 node scripts/film/render.mjs --final --workers=4 --from="$b" --to="$e" --stills=1 >"$log" 2>&1 \
    || { echo "bars $b-$e failed; see $log" >&2; tail -5 "$log" >&2; exit 1; }
  cp "$FILM_OUT/build/stills/final-bars$b-$e"/*.png "$dest/"
  grep -i "warn\|overflow\|missing" "$log" | head -3 || true
  echo "bars $b-$e done"
  b="$e"
done
ls "$dest" | wc -l
