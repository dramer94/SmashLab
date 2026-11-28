#!/bin/bash
# Renders every clip in clips.json (from plan-clips.ts) with the Telemetry overlay, 3 at a time.
# usage: ./render-clips.sh lab-data/clips.json lab-data/clips
set -e
plan=$1; out=$2; mkdir -p "$out"
export PW_CHANNEL=${PW_CHANNEL:-chrome} FPS=${FPS:-15}
node -e "for (const j of require('./'+process.argv[1])) console.log([j.id, j.file, j.from, j.to, j.focus, JSON.stringify(j.names), j.video].join('\t'))" "$plan" |
while IFS=$'\t' read -r id file from to focus names video; do
  [ -s "$out/$id.mp4" ] && continue
  ( cd lab-data && FOCUS=$focus NAMES=$names node ../render-clip.js "$video.MOV" "${file#lab-data/}" "$from" "$to" "../$out/$id.mp4" telemetry >/dev/null 2>&1 && echo "done $id" || echo "FAILED $id" ) &
  while [ "$(jobs -r | wc -l)" -ge 3 ]; do sleep 1; done
done
wait
