#!/usr/bin/env bash
#
# The MELTDOWN trailer (Stage 639).
#
#   S=<workdir> bash tools/trailer/build.sh
#
# Expects three things under $S, and is deliberately dumb about where they came from:
#   hero/NN_name.mp4  the generated cinematics (docs/TRAILER.md lists every prompt)
#   vid/ad_*.mp4      the in-world advertisements, the same clips the city's signs play
#   gp/*.mp4          real gameplay, from tools/trailer/capture.ts
#
# The cut is written out as numbered segments and concatenated, rather than assembled in one
# filter_complex, so a bad shot can be replaced without re-rendering the other twenty-one.
set -euo pipefail
S=${S:?set S to the working directory holding hero/, vid/ and gp/}
SEG=$S/seg
mkdir -p "$SEG"
rm -f "$SEG"/*.mp4
F=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf
W=1280; H=720; FPS=30

# common tail for every segment: exact size, fps, and a light filmic grade
GRADE="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p"
# gameplay is darker than the cinematics; lift it so it reads on a phone
GPGRADE="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},eq=brightness=0.06:contrast=1.18:saturation=1.28,format=yuv420p"

n=0
cut () { # cut <src> <ss> <dur> <grade> [extra filters]
  local src=$1 ss=$2 dur=$3 gr=$4 extra=${5:-}
  local out
  out=$(printf "%s/%03d.mp4" "$SEG" "$n")
  local vf="$gr"
  [ -n "$extra" ] && vf="$extra,$gr"
  ffmpeg -v error -y -ss "$ss" -t "$dur" -i "$src" -an -vf "$vf" -c:v libx264 -crf 17 -preset medium -r $FPS "$out"
  n=$((n+1))
}

HERO=$S/hero
ADS=$S/vid
GP=$S/gp

# ---- ACT 1 · the city -------------------------------------------------------
cut $HERO/01_rain.mp4     0.3 2.7 "$GRADE" "fade=t=in:st=0:d=1.2"
cut $HERO/04_eye.mp4      1.2 3.0 "$GRADE"
cut $HERO/09_kernel.mp4   1.5 3.0 "$GRADE"
cut $HERO/02_rise.mp4     1.0 3.5 "$GRADE"

# ---- ACT 2 · the world talks back (the in-world ads) ------------------------
cut $ADS/ad_watching.mp4  1.5 2.0 "$GRADE"
cut $ADS/ad_counted.mp4   1.8 1.8 "$GRADE"
cut $ADS/ad_hours.mp4     1.5 1.8 "$GRADE"
cut $ADS/ad_lease.mp4     1.5 1.8 "$GRADE"
cut $HERO/03_alley.mp4    0.5 3.5 "$GRADE"

# ---- ACT 3 · actual gameplay ------------------------------------------------
# an honest card: everything after it until the swarm is the running game
ffmpeg -v error -y -f lavfi -i "color=c=black:s=${W}x${H}:d=1.8:r=${FPS}" -an \
  -vf "drawtext=fontfile=$F:text='ACTUAL GAMEPLAY':fontcolor=0x35f2ff:fontsize=44:x=(w-tw)/2:y=(h-th)/2:alpha='min(1,t*3)',drawtext=fontfile=$F:text='CAPTURED IN A BROWSER':fontcolor=0x5a6b7a:fontsize=20:x=(w-tw)/2:y=(h-th)/2+56,format=yuv420p" \
  -c:v libx264 -crf 17 "$(printf "%s/%03d.mp4" "$SEG" "$n")"; n=$((n+1))

cut $GP/run_street.mp4    1.0 4.5 "$GPGRADE"
cut $GP/wake.mp4          1.5 4.0 "$GPGRADE"
cut $GP/fight.mp4         2.0 4.0 "$GPGRADE"
cut $GP/slide.mp4         3.0 4.0 "$GPGRADE"
cut $GP/docks.mp4         1.0 3.5 "$GPGRADE"

# ---- ACT 4 · what is out there ---------------------------------------------
cut $HERO/06_swarm.mp4    1.5 2.8 "$GRADE"
cut $HERO/07_mech.mp4     1.8 2.8 "$GRADE"
cut $HERO/08_firefight.mp4 1.0 2.8 "$GRADE"
cut $HERO/11_shutter.mp4  1.2 2.8 "$GRADE"

# ---- ACT 5 · the money, and the title --------------------------------------
cut $ADS/ad_ticker.mp4    1.0 2.5 "$GRADE"
cut $HERO/10_extract.mp4  1.5 3.0 "$GRADE"

# the title plate: slowed, with MELTDOWN and the ticker drawn on
TITLE=$(printf "%s/%03d.mp4" "$SEG" "$n"); n=$((n+1))
ffmpeg -v error -y -ss 0.3 -t 4.8 -i $HERO/12_plate.mp4 -an -vf "\
setpts=1.75*PTS,\
$GRADE,\
drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.34:t=fill,\
drawtext=fontfile=$F:text='MELTDOWN':fontcolor=white:fontsize=118:x=(w-tw)/2:y=(h-th)/2-46:alpha='min(1,max(0,(t-0.5)*1.4))':shadowcolor=0x35f2ff@0.85:shadowx=0:shadowy=0,\
drawtext=fontfile=$F:text='\\\$CAPITAL':fontcolor=0x35f2ff:fontsize=40:x=(w-tw)/2:y=(h-th)/2+64:alpha='min(1,max(0,(t-1.7)*1.6))',\
drawtext=fontfile=$F:text='THE COUNTER-LEDGER IS LIVE':fontcolor=0x8fa3b0:fontsize=19:x=(w-tw)/2:y=(h-th)/2+118:alpha='min(1,max(0,(t-2.4)*1.6))',\
fade=t=out:st=7.2:d=1.2,format=yuv420p" -c:v libx264 -crf 17 -r $FPS "$TITLE"

# ---- concat -----------------------------------------------------------------
: > "$S/list.txt"
for f in "$SEG"/*.mp4; do echo "file '$f'" >> "$S/list.txt"; done
ffmpeg -v error -y -f concat -safe 0 -i "$S/list.txt" -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r $FPS "$S/trailer_silent.mp4"
echo "segments: $n · $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$S/trailer_silent.mp4")s"
