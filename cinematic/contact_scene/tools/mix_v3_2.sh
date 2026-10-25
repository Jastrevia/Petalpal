#!/bin/bash
# V3.2 mix: score_v2 time-stretched (pitch kept) to the film length; reused MMAudio beds (rain 0-3.9 s, passage air at 34.0 s,
# garden half from 36.42 s); procedural accents timed to V3.2 (sound_v3_2.py). Scene review: same mix trimmed to the scene.
set -e; cd /mnt/user-data/outputs/contact
V1=/mnt/user-data/outputs/film_v1
mix() {  # $1 picture, $2 out
  D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"); FO=$(python3 -c "print(round($D-2.0,3))")
  TEMPO=$(python3 -c "print(round(60.03/64.0,4))")
  ffmpeg -v error -y -i "$1" -i $V1/audio/score_v2.mp3 -i $V1/audio/sfx_a.wav -i $V1/audio/sfx_b.wav -i sfx_v3_2.wav -filter_complex "\
[1:a]aresample=48000,atempo=$TEMPO,apad[m];\
[2:a]asplit=2[a1][a2];\
[a1]atrim=0:3.9,asetpts=PTS-STARTPTS,afade=t=out:st=3.3:d=0.6,volume=0.42[ra];\
[a2]atrim=24.8:27.8,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=2.6:d=0.4,volume=0.40,adelay=34000|34000[pa];\
[3:a]afade=t=in:st=0:d=0.5,volume=0.42,adelay=36420|36420,apad[gb];\
[4:a]volume=0.85,apad[pr];\
[ra][pa][gb][pr]amix=inputs=4:normalize=0:duration=longest[sfx];\
[m][sfx]amix=inputs=2:normalize=0:duration=first,atrim=0:$D,afade=t=in:st=0:d=0.5,afade=t=out:st=$FO:d=2.0,loudnorm=I=-16:TP=-1.5:LRA=11[a];\
[0:v]fade=t=in:st=0:d=0.6[v]" -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -ar 48000 -movflags +faststart -t $D "$2"
  ffprobe -v error -show_entries format=duration,size -of compact "$2"
}
mix edit/Contact_Scene_picture.mp4 edit/Contact_Scene.mp4
mix edit/PetalPal_Film_V3_2_picture.mp4 edit/PetalPal_Film_V3_2.mp4
for f in Contact_Scene PetalPal_Film_V3_2; do ffmpeg -v error -y -i edit/$f.mp4 -c:v libx264 -preset slow -crf 23 -c:a aac -b:a 192k -movflags +faststart edit/${f}_review.mp4; done
echo MIXDONE
