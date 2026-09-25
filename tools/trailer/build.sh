#!/usr/bin/env bash
# MELTDOWN trailer v3 — eight acts, an uprising and a meltdown before the title.
set -euo pipefail
: "${S:?set S to the working directory holding hero/ vid/ gp/}"
SEG=$S/seg3
mkdir -p "$SEG"; rm -f "$SEG"/*.mp4
F=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf
W=1280; H=720; FPS=30
GRADE="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p"
GPGRADE="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},eq=brightness=0.06:contrast=1.18:saturation=1.28,format=yuv420p"
n=0
cut () { local src=$1 ss=$2 dur=$3 gr=$4 extra=${5:-}
  local out; out=$(printf "%s/%03d.mp4" "$SEG" "$n")
  local vf="$gr"; [ -n "$extra" ] && vf="$extra,$gr"
  ffmpeg -v error -y -ss "$ss" -t "$dur" -i "$src" -an -vf "$vf" -c:v libx264 -crf 17 -preset medium -r $FPS "$out"
  n=$((n+1)); }
# an act boundary: the first frames blown out, so the cut lands as a hit rather than a dissolve
FLASH="fade=t=in:st=0:d=0.10:color=white"
black () { local dur=$1
  ffmpeg -v error -y -f lavfi -i "color=c=black:s=${W}x${H}:d=${dur}:r=${FPS}" -an -c:v libx264 -crf 17 \
    "$(printf "%s/%03d.mp4" "$SEG" "$n")"; n=$((n+1)); }
HERO=$S/hero; ADS=$S/vid; GP=$S/gp

# ACT 0 · cold open — the place, how many of them, and the thing on the horizon
cut $HERO/01_rain.mp4     0.4 2.6 "$GRADE" "fade=t=in:st=0:d=1.4"
cut $HERO/21_aerial.mp4   0.6 4.6 "$GRADE"
cut $HERO/22_crowd.mp4    0.5 3.4 "$GRADE"
cut $HERO/09_kernel.mp4   1.5 3.0 "$GRADE"

# ACT 1 · the world talks back — six of the city's own ads, cut fast, then the eye opens
cut $ADS/ad_watching.mp4  1.6 1.6 "$GRADE" "$FLASH"
cut $ADS/ad_counted.mp4   2.0 1.4 "$GRADE"
cut $ADS/ad_lease.mp4     1.6 1.4 "$GRADE"
cut $ADS/ad_hours.mp4     1.6 1.3 "$GRADE"
cut $ADS/ad_unclaimed.mp4 1.4 1.3 "$GRADE"
cut $ADS/ad_ticker.mp4    1.2 1.4 "$GRADE"
cut $HERO/04_eye.mp4      1.8 2.4 "$GRADE"

# ACT 2 · the Blank
cut $HERO/02_rise.mp4     1.2 3.0 "$GRADE" "$FLASH"
cut $HERO/05_aim.mp4      1.4 2.4 "$GRADE"
cut $HERO/03_alley.mp4    0.6 3.4 "$GRADE"

# ACT 3 · actual gameplay, announced as such
ffmpeg -v error -y -f lavfi -i "color=c=black:s=${W}x${H}:d=1.8:r=${FPS}" -an \
  -vf "drawtext=fontfile=$F:text='ACTUAL GAMEPLAY':fontcolor=0x35f2ff:fontsize=46:x=(w-tw)/2:y=(h-th)/2:alpha='min(1,t*4)',drawtext=fontfile=$F:text='CAPTURED IN A BROWSER':fontcolor=0x5a6b7a:fontsize=20:x=(w-tw)/2:y=(h-th)/2+58,format=yuv420p" \
  -c:v libx264 -crf 17 "$(printf "%s/%03d.mp4" "$SEG" "$n")"; n=$((n+1))
cut $GP/run_street.mp4    1.2 4.0 "$GPGRADE"
cut $GP/wake.mp4          1.8 3.4 "$GPGRADE"
cut $GP/fight.mp4         2.2 4.0 "$GPGRADE"
cut $GP/slide.mp4         3.2 3.4 "$GPGRADE"
cut $GP/docks.mp4         1.2 2.8 "$GPGRADE"
cut $GP/city_vista.mp4    1.0 3.0 "$GPGRADE"

# ACT 4 · escalation, accelerating into the shortest cuts in the film
cut $HERO/24_wall.mp4      1.4 2.2 "$GRADE" "$FLASH"
cut $HERO/06_swarm.mp4     1.8 1.8 "$GRADE"
cut $HERO/07_mech.mp4      2.0 2.0 "$GRADE"
cut $HERO/08_firefight.mp4 1.2 1.8 "$GRADE"
cut $HERO/11_shutter.mp4   1.4 1.8 "$GRADE"
cut $HERO/26_roof.mp4      1.2 2.2 "$GRADE"
cut $HERO/10_extract.mp4   2.0 1.8 "$GRADE"

# ACT 5 · the uprising — the crowd from act 0, answering
cut $HERO/28_uprising.mp4  0.5 3.6 "$GRADE" "$FLASH"
cut $HERO/30_charge.mp4    0.8 2.6 "$GRADE"
cut $HERO/29_ticker.mp4    0.6 2.6 "$GRADE"

# ACT 6 · the meltdown — everything stops, then the title event
black 0.5
cut $HERO/27_meltdown.mp4  0.4 4.5 "$GRADE"
cut $HERO/23_beam.mp4      0.9 3.6 "$GRADE"
cut $HERO/25_walk.mp4      0.8 3.4 "$GRADE"

# ACT 7 · the title, on the game's own CRT chrome
TITLE=$(printf "%s/%03d.mp4" "$SEG" "$n"); n=$((n+1))
ffmpeg -v error -y -ss 0.3 -t 4.9 -i $HERO/12_plate.mp4 -an -vf "\
setpts=2.0*PTS,\
$GRADE,\
drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.42:t=fill,\
drawtext=fontfile=$F:text='MELTDOWN':fontcolor=0x35f2ff@0.55:fontsize=132:x=(w-tw)/2-4:y=(h-th)/2-52:alpha='min(1,max(0,(t-0.25)*3.2))',\
drawtext=fontfile=$F:text='MELTDOWN':fontcolor=0xff3ce0@0.45:fontsize=132:x=(w-tw)/2+4:y=(h-th)/2-52:alpha='min(1,max(0,(t-0.25)*3.2))',\
drawtext=fontfile=$F:text='MELTDOWN':fontcolor=white:fontsize=132:x=(w-tw)/2:y=(h-th)/2-52:alpha='min(1,max(0,(t-0.25)*3.2))':shadowcolor=0x35f2ff@0.9:shadowx=0:shadowy=0,\
drawbox=x=(iw-460)/2:y=ih/2+30:w=460:h=2:color=0x35f2ff@0.7:t=fill:enable='gte(t,1.35)',\
drawtext=fontfile=$F:text='\\\$CAPITAL':fontcolor=0x35f2ff:fontsize=46:x=(w-tw)/2:y=(h-th)/2+74:alpha='min(1,max(0,(t-1.5)*2.0))',\
drawtext=fontfile=$F:text='THE COUNTER-LEDGER IS LIVE':fontcolor=0x8fa3b0:fontsize=20:x=(w-tw)/2:y=(h-th)/2+132:alpha='min(1,max(0,(t-2.3)*2.0))',\
drawtext=fontfile=$F:text='PLAYS IN A BROWSER':fontcolor=0x5a6b7a:fontsize=17:x=(w-tw)/2:y=h-54:alpha='min(1,max(0,(t-3.2)*2.0))',\
fade=t=out:st=8.3:d=1.4,format=yuv420p" -c:v libx264 -crf 17 -r $FPS "$TITLE"

: > "$S/list3.txt"; for f in "$SEG"/*.mp4; do echo "file '$f'" >> "$S/list3.txt"; done
ffmpeg -v error -y -f concat -safe 0 -i "$S/list3.txt" -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r $FPS "$S/v3_silent.mp4"
echo "segments: $n · $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$S/v3_silent.mp4")s"
