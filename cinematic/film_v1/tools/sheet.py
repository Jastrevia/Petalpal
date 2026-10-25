import sys, subprocess, os
# contact sheet: 6 evenly spaced frames per clip, one row per clip
clips = sys.argv[2:]; out = sys.argv[1]; rows = []
for c in clips:
    n = int(subprocess.check_output(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','csv=p=0',c]).strip())
    step = max(1, (n-1)//5); sel = '+'.join(f'eq(n\\,{min(n-1,i*step)})' for i in range(6))
    tmp = f'/tmp/row_{os.path.basename(c)}.jpg'
    subprocess.check_call(['ffmpeg','-v','error','-y','-i',c,'-vf',f"select='{sel}',scale=400:-2,drawtext=text='{os.path.basename(c)} %{{n}}':x=6:y=6:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.5,tile=6x1",'-frames:v','1',tmp])
    rows.append(tmp)
subprocess.check_call(['ffmpeg','-v','error','-y']+sum([['-i',r] for r in rows],[])+['-filter_complex',''.join(f'[{i}:v]' for i in range(len(rows)))+f'vstack=inputs={len(rows)}' if len(rows)>1 else 'null',out])
print(out)
