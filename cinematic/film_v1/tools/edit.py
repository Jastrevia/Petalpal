"""Assemble the first cut (video only): 1920x1080, 24 fps. Writes edit/firstcut_video.mp4 and edit/edl.json."""
import cv2, numpy as np, subprocess, json, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H, FPS = 1920, 1080, 24
# (label, source, in_s, out_s, dissolve_frames_into_this_clip)
EDL = [
 ('01 rain',            'shots/V01.mp4', 0.0, 3.5, 0),
 ('02 girl at desk',    'shots/V02.mp4', 0.4, 4.4, 0),
 ('03 lights',          'shots/V03.mp4', 0.6, 3.1, 0),
 ('04 invitation',      'shots/V04r.mp4', 1.0, 4.2, 0),
 ('05 touch, fairy',    'shots/V05.mp4', 1.6, 4.6, 0),
 ('06 take my hand',    'shots/V06a.mp4', 1.5, 5.04, 0),
 ('07 pull-through',    'shots/V07a.mp4', 0.0, 5.04, 0),
 ('08 passage (K03)',   'vfx/K03orb.mp4', 0.0, 5.25, 0),
 ('09 garden entrance', 'shots/V09a.mp4', 0.0, 3.0, 10),
 ('10 wide garden',     'shots/V10.mp4', 0.5, 3.6, 0),
 ('11 journal',         'vfx/S11.mp4', 0.0, 2.6, 0),
 ('12 words to seed',   'vfx/S12.mp4', 0.0, 1.75, 0),
 ('13 crocus blooms',   'shots/V13.mp4', 0.0, 3.5, 8),
 ('14 fairy stays',     'shots/V14.mp4', 0.5, 3.0, 0),
 ('15 mailbox',         'shots/V15.mp4', 0.3, 2.8, 0),
 ('16 a letter for you','shots/V16.mp4', 1.5, 4.0, 0),
 ('17 the letter',      'shots/V17.mp4', 0.5, 3.0, 0),
 ('18 morning',         'shots/V18.mp4', 1.3, 4.8, 0),
 ('19 title',           'vfx/S19.mp4', 0.0, 3.5, 12),
]
def frames(src, a, b):
    cap = cv2.VideoCapture(src); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); out = []
    i0, i1 = int(round(a*FPS)), min(n, int(round(b*FPS)))
    cap.set(cv2.CAP_PROP_POS_FRAMES, i0)
    for _ in range(i1 - i0):
        ok, f = cap.read()
        if not ok: break
        out.append(cv2.resize(f, (W, H), interpolation=cv2.INTER_LANCZOS4))
    return out
os.makedirs('edit', exist_ok=True)
ff = subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
     '-vf','noise=alls=3:allf=t,format=yuv420p','-c:v','libx264','-preset','slow','-crf','15','-movflags','+faststart','edit/firstcut_video.mp4'], stdin=subprocess.PIPE)
timeline = []; t = 0; tail = []
for k, (lab, src, a, b, dis) in enumerate(EDL):
    fr = frames(src, a, b)
    if dis and tail:
        d = min(dis, len(tail), len(fr))
        for j in range(d):
            al = (j + 1) / (d + 1)
            fr[j] = cv2.addWeighted(tail[len(tail)-d+j], 1-al, fr[j], al, 0)
        tail = tail[:len(tail)-d]
    for f in tail: ff.stdin.write(f.tobytes())
    t += len(tail)
    start_t = t
    tail = fr
    timeline.append(dict(label=lab, source=src, src_in=a, src_out=b, start_frame=start_t, frames=len(fr)))
# fade in/out
for f in tail: pass
total_before = t
for i, f in enumerate(tail):
    fo = max(0, (i - (len(tail) - 15)) / 15)
    ff.stdin.write((f.astype(np.float32) * (1 - fo)).astype(np.uint8).tobytes())
t += len(tail)
ff.stdin.close(); ff.wait()
json.dump(dict(fps=FPS, total_frames=t, seconds=t/FPS, shots=timeline), open('edit/edl.json','w'), indent=1)
print('frames', t, 'seconds', round(t/FPS, 2))
for s in timeline: print('%6.2fs  %s' % (s['start_frame']/FPS, s['label']))
