"""Review of the two Kling segments (originals never modified). python analyze.py
Writes: frames/, glide_v1_8s_join.mp4 (direct frame-continuous join), metrics.json, curves.png, contact sheets, face strip."""
import os, json, subprocess, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
D = os.path.dirname(os.path.abspath(__file__)); P = os.path.dirname(D)
F = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', s)
FB = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', s)
def read(path):
    cap = cv2.VideoCapture(path); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(f)
    return fr, cap.get(cv2.CAP_PROP_FPS)
s1, fps1 = read(P + '/glide_seg1.mp4'); s2, fps2 = read(P + '/glide_seg2.mp4')
H, W = s1[0].shape[:2]; info = dict(seg1=dict(frames=len(s1), fps=fps1, size=[W, H]), seg2=dict(frames=len(s2), fps=fps2, size=list(s2[0].shape[1::-1])))
# endpoint fidelity: each pinned frame vs the video frame that should equal it
def key(p): return cv2.resize(cv2.imread(P + '/' + p), (W, H), interpolation=cv2.INTER_AREA)
KS, KM, KE = key('start_frame_poseA.png'), key('mid_frame_midglide.png'), key('end_frame_reach.png')
mad = lambda a, b: round(float(np.abs(a.astype(np.float32) - b.astype(np.float32)).mean()), 2)
info['pin'] = dict(seg1_first_vs_start=mad(s1[0], KS), seg1_last_vs_mid=mad(s1[-1], KM), seg2_first_vs_mid=mad(s2[0], KM), seg2_last_vs_end=mad(s2[-1], KE),
                   seg1_last_vs_seg2_first=mad(s1[-1], s2[0]))
# direct, frame-continuous join: every frame of seg1, then seg2 without its first frame (the shared keyframe appears once)
J = s1 + s2[1:]; info['join_index'] = len(s1) - 1; info['assembled_frames'] = len(J)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', P + '/glide_seg1.mp4', '-i', P + '/glide_seg2.mp4', '-filter_complex',
                '[1:v]trim=start_frame=1,setpts=PTS-STARTPTS[b];[0:v][b]concat=n=2:v=1:a=0,fps=24[v]', '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow',
                '-crf', '10', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', D + '/glide_v1_8s_join.mp4'], check=True)
# per-frame motion: figure mask, centroid, size, DIS flow magnitude inside the figure
G = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in J]
paper = np.median(J[0][int(H * .75):, :int(W * .2)].reshape(-1, 3), 0)
def mask(f):
    m = (np.abs(f.astype(np.float32) - paper).max(2) > 18).astype(np.uint8)
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
cx, cy, size, flow, flow_p95, diff = [], [], [], [0.0], [0.0], [0.0]
for i, f in enumerate(J):
    m = mask(f); ys, xs = np.nonzero(m); cx.append(float(xs.mean())); cy.append(float(ys.mean())); size.append(float(np.sqrt(m.sum())))
    if i:
        fl = dis.calc(G[i - 1], G[i], None); mag = np.hypot(fl[..., 0], fl[..., 1]); mm = mask(J[i - 1]) | m
        flow.append(float(mag[mm > 0].mean())); flow_p95.append(float(np.percentile(mag[mm > 0], 95))); diff.append(mad(J[i - 1], J[i]))
# face identity per frame: master face (eyes-nose-mouth) matched over scale and small rotation
Mst = cv2.cvtColor(cv2.imread(P + '/../keypose_pilot/refs/master_on_paper.png'), cv2.COLOR_BGR2GRAY)
T0 = Mst[140:215, 630:725]; face = []; prev = None
for i, g in enumerate(G):
    best = None
    scales = np.arange(0.7, 1.8, 0.03) if prev is None else np.arange(max(0.6, prev - 0.08), prev + 0.09, 0.02)
    for s in scales:
        for ang in (-4, 0, 4):
            Rm = cv2.getRotationMatrix2D((47.5, 37.5), ang, s); w, h = int(95 * s), int(75 * s); Rm[:, 2] += [(w - 95) / 2, (h - 75) / 2]
            t = cv2.warpAffine(T0, Rm, (w, h), borderMode=cv2.BORDER_REPLICATE)
            r = cv2.matchTemplate(g[:int(H * .6), int(W * .45):int(W * .85)], t, cv2.TM_CCOEFF_NORMED); _, v, _, loc = cv2.minMaxLoc(r)
            if best is None or v > best[0]: best = (v, s, ang, loc[0] + int(W * .45), loc[1], w, h)
    face.append(dict(ncc=round(float(best[0]), 3), scale=round(float(best[1]), 2), roll=best[2], box=[int(best[3]), int(best[4]), int(best[5]), int(best[6])])); prev = best[1]
info['metrics'] = dict(cx=cx, cy=cy, size=size, flow=flow, flow_p95=flow_p95, diff=diff, face=face)
json.dump(info, open(D + '/metrics.json', 'w'))
# curves
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
t = np.arange(len(J)) / 24; jt = info['join_index'] / 24
fig, ax = plt.subplots(4, 1, figsize=(13, 11), sharex=True)
ax[0].plot(t, flow, label='mean flow in figure (px/frame)'); ax[0].plot(t, np.array(flow_p95) / 3, label='p95 flow / 3', alpha=.7); ax[0].legend(); ax[0].set_ylabel('motion')
v = np.hypot(np.diff(cx, prepend=cx[0]), np.diff(cy, prepend=cy[0])); ax[1].plot(t, v, label='centroid speed (px/frame)'); ax[1].plot(t, np.gradient(size) * 5, label='size growth x5'); ax[1].legend()
ax[2].plot(t, [f['ncc'] for f in face], label='master-face match (NCC)'); ax[2].set_ylim(0, 1); ax[2].legend()
ax[3].plot(t, diff, label='frame-to-frame mean abs diff'); ax[3].legend(); ax[3].set_xlabel('seconds')
for a in ax: a.axvline(jt, color='r', ls='--', lw=1); a.grid(alpha=.3)
fig.suptitle('Glide v1 (8 s direct join); red dashed = Mid-Glide join'); fig.tight_layout(); fig.savefig(D + '/curves.png', dpi=90)
# contact sheet: every 3rd frame
def sheet(idx, cols, tw, name, crop=None):
    th = int(tw * (H if crop is None else crop[3] - crop[1]) / (W if crop is None else crop[2] - crop[0])); rows = (len(idx) + cols - 1) // cols
    S = Image.new('RGB', (cols * tw, rows * (th + 22)), 'white'); d = ImageDraw.Draw(S)
    for n, i in enumerate(idx):
        im = Image.fromarray(cv2.cvtColor(J[i], cv2.COLOR_BGR2RGB)); im = im if crop is None else im.crop(crop)
        x, y = (n % cols) * tw, (n // cols) * (th + 22); S.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 22))
        d.text((x + 4, y + 3), 'f%03d %.2fs%s' % (i, i / 24, '  JOIN' if i == info['join_index'] else ''), font=FB(14), fill=(200, 0, 0) if i == info['join_index'] else (40, 40, 40))
    S.save(D + '/' + name, quality=88)
sheet(list(range(0, len(J), 4)), 7, 420, 'contact_sheet_every4.jpg')
j = info['join_index']; sheet(list(range(j - 10, min(j + 11, len(J)))), 7, 420, 'join_frames_pm10.jpg')
# face strip: every 6th frame, crops at the tracked face
strip = Image.new('RGB', (len(range(0, len(J), 6)) * 150, 182), 'white'); d = ImageDraw.Draw(strip)
for n, i in enumerate(range(0, len(J), 6)):
    x0, y0, w, h = face[i]['box']; cxf, cyf = x0 + w / 2, y0 + h / 2; r = w * 1.1
    im = Image.fromarray(cv2.cvtColor(J[i], cv2.COLOR_BGR2RGB)).crop((int(cxf - r), int(cyf - r * 1.05), int(cxf + r), int(cyf + r * .95))).resize((150, 150), Image.LANCZOS)
    strip.paste(im, (n * 150, 32)); d.text((n * 150 + 3, 2), 'f%03d' % i, font=FB(13), fill=(200, 0, 0) if abs(i - j) < 3 else (30, 30, 30)); d.text((n * 150 + 3, 16), 'ncc %.2f' % face[i]['ncc'], font=F(12), fill=(60, 60, 60))
strip.save(D + '/face_strip.jpg', quality=88)
summary = {k: info[k] for k in ('seg1', 'seg2', 'pin', 'join_index', 'assembled_frames')}
fl = np.array(flow); summary['flow_around_join'] = [round(x, 2) for x in fl[j - 6:j + 7]]
summary['face_ncc_min'] = min(f['ncc'] for f in face); summary['face_ncc_min_frame'] = int(np.argmin([f['ncc'] for f in face]))
print(json.dumps(summary, indent=1))
