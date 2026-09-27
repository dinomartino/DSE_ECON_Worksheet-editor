#!/bin/bash
# grid.sh VIDEO OUT START_S DUR_S EVERY_N_FRAMES COLSxROWS [WIDTH]
v="$1"; out="$2"; ss="$3"; dur="$4"; n="$5"; tile="$6"; w="${7:-480}"
ffmpeg -hide_banner -loglevel error -y -ss "$ss" -i "$v" -t "$dur" \
  -vf "select='not(mod(n\,$n))',scale=$w:-1,tile=$tile:padding=4" -frames:v 1 -vsync 0 "$out"
ls -la "$out"
