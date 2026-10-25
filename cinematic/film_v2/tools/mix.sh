#!/bin/bash
# PetalPal First Cut v2 mix: score_v2 (reused, composed for this 60 s structure) + reused MMAudio beds aligned to the
# matching shots (sfx_a rain 0-3.5 s and passage 24.8-29.44 s; sfx_b garden half shifted +0.42 s) + procedural accents.
set -e; cd /mnt/user-data/outputs/film_v2
V1=/mnt/user-data/outputs/film_v1
OUT=${1:-edit/PetalPal_FirstCut_v2.mp4}
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 edit/PetalPal_FirstCut_v2_picture.mp4)
FO=$(python3 -c "print(round($D-2.0,3))")
ffmpeg -v error -y -i edit/PetalPal_FirstCut_v2_picture.mp4 -i $V1/audio/score_v2.mp3 -i $V1/audio/sfx_a.wav -i $V1/audio/sfx_b.wav -i audio/sfx_proc.wav -filter_complex "\
[1:a]aresample=48000,volume=1.0,apad[m];\
[2:a]asplit=2[a1][a2];\
[a1]atrim=0:3.9,asetpts=PTS-STARTPTS,afade=t=out:st=3.3:d=0.6,volume=0.42[ra];\
[a2]atrim=24.8:29.44,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=4.2:d=0.44,volume=0.40,adelay=24800|24800[pa];\
[3:a]afade=t=in:st=0:d=0.5,volume=0.42,adelay=29920|29920[gb];\
[4:a]volume=0.85[pr];\
[ra][pa][gb][pr]amix=inputs=4:normalize=0[sfx];\
[m][sfx]amix=inputs=2:normalize=0:duration=first,atrim=0:$D,afade=t=in:st=0:d=0.5,afade=t=out:st=$FO:d=2.0,loudnorm=I=-16:TP=-1.5:LRA=11[a];\
[0:v]fade=t=in:st=0:d=0.6[v]" -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -ar 48000 -movflags +faststart -t $D "$OUT"
ffprobe -v error -show_entries format=duration,size -of compact "$OUT"
