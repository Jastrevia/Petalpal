#!/bin/bash
# Final mux: picture + score_v2 + MMAudio SFX (two halves), fade in/out, loudness -16 LUFS.
set -e; cd /mnt/user-data/outputs/film_v1
OUT=${1:-edit/PetalPal_FirstCut_v1.mp4}
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 edit/firstcut_video.mp4)
FO=$(python3 -c "print(round($D-1.8,3))")
ffmpeg -v error -y -i edit/firstcut_video.mp4 -i audio/score_v2.mp3 -i audio/sfx_a.wav -i audio/sfx_b.wav -filter_complex "\
[1:a]aresample=48000,apad[m];\
[2:a]volume=0.42,afade=t=out:st=29.0:d=0.4[s1];\
[3:a]volume=0.45,afade=t=in:st=0:d=0.4,adelay=29500|29500[s2];\
[s1][s2]amix=inputs=2:normalize=0[sfx];\
[m][sfx]amix=inputs=2:normalize=0:duration=first,atrim=0:$D,afade=t=in:st=0:d=0.6,afade=t=out:st=$FO:d=1.8,loudnorm=I=-16:TP=-1.5:LRA=11[a];\
[0:v]fade=t=in:st=0:d=0.7[v]" -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 256k -ar 48000 -movflags +faststart -t $D "$OUT"
ffprobe -v error -show_entries format=duration,size -of compact "$OUT"
