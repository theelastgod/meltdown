#!/usr/bin/env bash
# MELTDOWN opening trailer — 29.6 s. The opening text's own lines over Higgsfield footage, cut to the bed.
set -euo pipefail
S=/tmp/claude-0/-home-user-meltdown/916c8f45-a14e-5f36-933c-270380eb331e/scratchpad
SEG=$S/seg30; mkdir -p "$SEG"; rm -f "$SEG"/*.mp4
F=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf
W=1280; H=720; FPS=30
GRADE="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p"
FLASH="fade=t=in:st=0:d=0.10:color=white"
HERO=$S/hero; ADS=$S/vid; NEW=$S/t30
n=0
cut () { local src=$1 ss=$2 dur=$3 extra=${4:-}
  local out; out=$(printf "%s/%03d.mp4" "$SEG" "$n")
  local vf="$GRADE"; [ -n "$extra" ] && vf="$extra,$GRADE"
  local frames; frames=$(awk -v d="$dur" -v f=$FPS 'BEGIN{printf "%d", d*f+0.5}')
  ffmpeg -v error -y -ss "$ss" -i "$src" -an -vf "$vf" -frames:v "$frames" -c:v libx264 -crf 16 -preset medium -r $FPS "$out"
  n=$((n+1)); }
# 0.0 – 8.0: the place, the lease, the watcher (quiet intro of the bed)
cut $HERO/21_aerial.mp4   0.15 2.6 "fade=t=in:st=0:d=1.2"
cut $NEW/n0.mp4           0.3  2.6
cut $HERO/04_eye.mp4      1.15 2.8
# 8.0 — the drop: the collections department at work
cut $NEW/n1.mp4           0.2  1.8 "$FLASH"
cut $ADS/ad_counted.mp4   2.0  0.7
cut $ADS/ad_hours.mp4     1.6  0.7
cut $HERO/09_kernel.mp4   1.15 1.8
cut $HERO/02_rise.mp4     1.2  2.2 "$FLASH"
cut $NEW/n2.mp4           0.3  1.8
# 17.0 — the second half of the bed: the build to its peak
cut $HERO/05_aim.mp4       1.4 0.9
cut $HERO/07_mech.mp4      2.0 0.9
cut $HERO/08_firefight.mp4 1.2 0.8
cut $HERO/28_uprising.mp4  0.5 0.8
cut $HERO/27_meltdown.mp4  1.5 2.4 "$FLASH"
cut $NEW/n3.mp4            0.5 2.4
# 25.2 – 29.6: the title over the plate, into black
TITLE=$(printf "%s/%03d.mp4" "$SEG" "$n")
ffmpeg -v error -y -ss 0.15 -i $HERO/12_plate.mp4 -an -vf "setpts=1.6*PTS,$GRADE,\
drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.5:t=fill,\
drawtext=fontfile=$F:text='MELTDOWN':fontcolor=0xff3ec9@0.55:fontsize=132:x=(w-tw)/2+4:y=(h-th)/2:alpha='min(1,max(0,(t-0.2)*2))',\
drawtext=fontfile=$F:text='MELTDOWN':fontcolor=0x35f2ff:fontsize=132:x=(w-tw)/2:y=(h-th)/2:alpha='min(1,max(0,(t-0.2)*2))':shadowcolor=0x35f2ff@0.8:shadowx=0:shadowy=0,\
fade=t=out:st=3.4:d=1.0,format=yuv420p" -frames:v 132 -c:v libx264 -crf 16 -r $FPS "$TITLE"
: > "$S/list30.txt"; for f in "$SEG"/*.mp4; do echo "file '$f'" >> "$S/list30.txt"; done
ffmpeg -v error -y -f concat -safe 0 -i "$S/list30.txt" -c:v libx264 -crf 16 -preset medium -pix_fmt yuv420p -r $FPS "$S/t30_cut.mp4"
# the opening text's lines, typed on as the terminal types them: exact sentences from client/crawl-text.ts
TXT=""
line () { local a=$1 b=$2 s=$3
  local e="between(t,$a,$b)"
  local al="min(1,(t-$a)*8)*min(1,($b-t)*6)"
  TXT="$TXT,drawbox=x=0:y=ih*0.70:w=iw:h=100:color=black@0.45:t=fill:enable='$e'"
  TXT="$TXT,drawtext=fontfile=$F:text='$s':fontcolor=0xff3ec9@0.5:fontsize=40:x=(w-tw)/2+2:y=h*0.70+29:alpha='$al':enable='$e'"
  TXT="$TXT,drawtext=fontfile=$F:text='$s':fontcolor=0x35f2ff:fontsize=40:x=(w-tw)/2:y=h*0.70+29:alpha='$al':enable='$e':shadowcolor=0x35f2ff@0.6:shadowx=0:shadowy=0"; }
line 0.6  2.5  "NEO-CHINA."
line 2.8  5.1  "EVERY MIND IN NEO-CHINA IS LEASED."
line 5.4  7.9  "VANTAGE WAS THE COLLECTIONS DEPARTMENT."
line 8.2  10.9 "BY THE HOUR. WITH INTEREST."
line 11.1 13.0 "IT AUDITED THE AUDITORS."
line 13.2 15.1 "THE CITY CALLED IT A BLANK."
line 15.3 17.0 "THERE WERE FOUR. THEN FORTY."
line 20.6 22.7 "SOMETHING IS ARRIVING FROM NEXT YEAR."
line 23.0 25.1 "IT KNOWS YOUR NAME."
# scanlines over everything, as the terminal draws them
SCAN="drawgrid=w=iw:h=3:t=1:color=black@0.28"
# the bed: its intro into the drop, then the build to its peak and the decay, crossfaded at 17.0
ffmpeg -v error -y -i "$S/t30_cut.mp4" -i "$S/bed4.wav" -filter_complex "\
[0:v]format=yuv420p${TXT},${SCAN},format=yuv420p[v];\
[1:a]atrim=4.5:21.7,asetpts=PTS-STARTPTS[a1];[1:a]atrim=62.4:75.2,asetpts=PTS-STARTPTS,afade=t=out:st=11.6:d=1.2[a2];\
[a1][a2]acrossfade=d=0.4:c1=tri:c2=tri,afade=t=in:st=0:d=0.6[a]" \
 -map "[v]" -map "[a]" -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "$S/MELTDOWN_trailer30.mp4"
# the web cut: VP9 + Opus in WebM, the codec the CI browser can decode
ffmpeg -v error -y -i "$S/MELTDOWN_trailer30.mp4" -c:v libvpx-vp9 -b:v 1500k -pass 1 -deadline good -cpu-used 2 -row-mt 1 -an -f null /dev/null
ffmpeg -v error -y -i "$S/MELTDOWN_trailer30.mp4" -c:v libvpx-vp9 -b:v 1500k -pass 2 -deadline good -cpu-used 2 -row-mt 1 -c:a libopus -b:a 112k "$S/trailer.webm"
for f in MELTDOWN_trailer30.mp4 trailer.webm; do ffprobe -v error -show_entries format=duration,size -of csv=p=0 "$S/$f"; done
