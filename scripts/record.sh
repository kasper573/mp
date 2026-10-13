#!/usr/bin/env bash
# Usage: record.sh OUT TITLE SECONDS INPUT HOOK COMMAND...
# Films a native window on a private virtual display to OUT: starts COMMAND, waits for its window
# titled TITLE, and records SECONDS of it while playing INPUT, an xdotool command chain in window
# pixels, and running HOOK, a shell line.
set -euo pipefail
export out=$1 title=$2 seconds=$3 input=$4 hook=$5
shift 5
mkdir -p "$(dirname "$out")"
xvfb-run -a -s "-screen 0 2560x1440x24" bash -euo pipefail -c '
  "$@" & app=$!
  window=$(xdotool search --sync --name "$title" | head -1)
  xdotool windowmove --sync "$window" 0 0
  xdotool windowfocus --sync "$window"
  eval "$(xdotool getwindowgeometry --shell "$window")"
  # The window maps before bevy has rendered into it.
  sleep 2
  ffmpeg -v error -y -f x11grab -framerate 30 -video_size "${WIDTH}x${HEIGHT}" -i "$DISPLAY+$X,$Y" \
    -t "$seconds" -c:v libvpx -b:v 4M -deadline realtime -cpu-used 8 "$out" & recording=$!
  [ -z "$hook" ] || bash -c "$hook" &
  [ -z "$input" ] || xdotool $input
  wait $recording
  kill $app' _ "$@"
echo "$out"
