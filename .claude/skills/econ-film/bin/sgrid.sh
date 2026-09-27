#!/bin/bash
# sgrid.sh STILLS_DIR OUT COLSxROWS [WIDTH]  — tiles a stills directory (sorted) into one JPEG
d="$1"; out="$2"; tile="$3"; w="${4:-480}"
ffmpeg -hide_banner -loglevel error -y -pattern_type glob -i "$d/*.png" \
  -vf "scale=$w:-1,tile=$tile:padding=4" -frames:v 1 -update 1 "$out"
ls "$d" | head -1; ls "$d" | tail -1; ls -la "$out"
