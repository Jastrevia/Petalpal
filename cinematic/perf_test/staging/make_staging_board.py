import numpy as np, cv2, json
from PIL import Image, ImageDraw, ImageFont
F = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', s)
FB = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', s)
R = json.load(open('staging/alignment_report.json'))
fr = [('START  0.0 s  Pose A (approved)', 'start_frame_poseA.png'), ('MIDDLE  3.5 s  Mid-Glide (approved)', 'mid_frame_midglide.png'), ('END  7.0 s  Reach (approved)', 'end_frame_reach.png')]
ims = [Image.open(p).convert('RGB') for _, p in fr]
# key points (canvas px), measured on grids; head from the template match
P = {'head': [tuple(R[k]['eye_mid']) for k in ('start', 'middle', 'end')],
     'right palm': [(2010, 380), (1925, 690), (1160, 820)],
     'left hand': [(1910, 850), (1850, 960), (1760, 1140)],
     'lead foot': [(1950, 1410), (1140, 1440), (840, 1440)]}
w = 1000; h = int(w * 1536 / 2752); k = w / 2752
B = Image.new('RGB', (3 * w + 80, 80 + h + 50 + 1000 + 40), (250, 247, 242)); d = ImageDraw.Draw(B)
d.text((20, 20), 'Pinned frames, staged on one 2752x1536 canvas with shared paper (no resize, no move, no redraw)', font=FB(28), fill=(50, 30, 60))
for i, ((n, _), im) in enumerate(zip(fr, ims)):
    x = 20 + i * (w + 20); B.paste(im.resize((w, h), Image.LANCZOS), (x, 80))
    r = R[['start', 'middle', 'end'][i]]
    d.text((x, 80 + h + 8), n, font=FB(20), fill=(60, 40, 70))
    d.text((x, 80 + h + 32), 'eyes %s  eye-dist %.1f px  roll %+d deg vs master' % (tuple(r['eye_mid']), r['eye_dist_px'], r['head_roll_vs_master_deg']), font=F(17), fill=(90, 70, 100))
# join inspection panel: middle frame, faded, with incoming/outgoing motion
y0 = 80 + h + 70; W2 = 1700; H2 = int(W2 * 1536 / 2752); k2 = W2 / 2752
base = np.asarray(ims[1]).astype(np.float32); base = 255 - (255 - base) * 0.45
J = Image.fromarray(base.astype(np.uint8)).resize((W2, H2), Image.LANCZOS); dj = ImageDraw.Draw(J)
def arrow(a, b, col, wd=5):
    a = np.array(a) * k2; b = np.array(b) * k2; dj.line([tuple(a), tuple(b)], fill=col, width=wd)
    v = b - a; L = np.linalg.norm(v); u = v / L; n = np.array([-u[1], u[0]])
    dj.polygon([tuple(b), tuple(b - 18 * u + 8 * n), tuple(b - 18 * u - 8 * n)], fill=col)
for name, pts in P.items():
    arrow(pts[0], pts[1], (40, 110, 230)); arrow(pts[1], pts[2], (220, 40, 60))
    dj.ellipse([pts[1][0] * k2 - 7, pts[1][1] * k2 - 7, pts[1][0] * k2 + 7, pts[1][1] * k2 + 7], fill=(30, 150, 60))
    dj.text((pts[1][0] * k2 + 10, pts[1][1] * k2 + 6), name, font=FB(18), fill=(30, 110, 50))
# right-hand path in HER body frame (head-relative, normalised by eye distance), drawn on the middle frame
hd = [np.array(R[k]['eye_mid'], float) for k in ('start', 'middle', 'end')]; ed = [R[k]['eye_dist_px'] for k in ('start', 'middle', 'end')]
rel = [(np.array(P['right palm'][i]) - hd[i]) / ed[i] for i in range(3)]
bp = [hd[1] + r * ed[1] for r in rel]
ts = np.linspace(0, 1, 40); ctl = 2 * bp[1] - 0.5 * (bp[0] + bp[2]); curve = [(1 - t) ** 2 * bp[0] + 2 * (1 - t) * t * ctl + t ** 2 * bp[2] for t in ts]
for a, b in zip(curve[::2], curve[1::2]): dj.line([tuple(a * k2), tuple(b * k2)], fill=(150, 60, 170), width=4)
for p, lab in zip(bp, ['A', 'M', 'R']): dj.text((p[0] * k2 - 8, p[1] * k2 - 30), lab, font=FB(20), fill=(150, 60, 170))
dj.line([(1600 * k2, 900 * k2), (1900 * k2, 900 * k2)], fill=(120, 120, 120), width=2); dj.text((1330 * k2, 890 * k2), 'skirt hem / thigh', font=F(15), fill=(100, 100, 100))
B.paste(J, (20, y0))
d.text((20, y0 + H2 + 6), 'Join at the middle frame: blue = motion arriving from Pose A, red = motion leaving toward Reach. Purple dotted = right-hand path in her own body frame.', font=F(18), fill=(70, 50, 80))
sp = lambda a, b: np.linalg.norm(np.subtract(b, a)) / 3.5
tx = 20 + W2 + 40; ty = y0
lines = [('Speed at the join (px/s, 3.5 s + 3.5 s)', 1)]
for name, pts in P.items(): lines.append(('%-11s %4.0f  ->  %4.0f' % (name, sp(pts[0], pts[1]), sp(pts[1], pts[2])), 0))
s1 = np.log(ed[1] / ed[0]) / 3.5; s2 = np.log(ed[2] / ed[1]) / 3.5
lines += [('', 0), ('Approach (growth in frame)', 1), ('eye distance %.1f -> %.1f -> %.1f px' % tuple(ed), 0), ('x%.2f in seg 1, x%.2f in seg 2' % (ed[1] / ed[0], ed[2] / ed[1]), 0), ('rate jumps %.1fx at the join' % (s2 / s1), 0),
          ('', 0), ('Right hand, in eye-widths from her eyes', 1)] + [('%s  (%+.1f, %+.1f)' % (n, r[0], r[1]), 0) for n, r in zip(['Pose A   ', 'Mid-Glide', 'Reach    '], rel)] + \
         [('drops %.1f, then rises %.1f while it extends' % (rel[1][1] - rel[0][1], rel[1][1] - rel[2][1]), 0), ('lowest point: front of waist, %.0f px above the hem' % (900 - P['right palm'][1][1]), 0),
          ('', 0), ('Head roll vs master', 1), ('%+d / %+d / %+d deg' % tuple(R[k]['head_roll_vs_master_deg'] for k in ('start', 'middle', 'end')), 0),
          ('', 0), ('Paper', 1), ('start = middle grain (mean diff %.2f)' % R['paper_diff_start_middle']['mean'], 0), ('end: own grain, mean diff %.2f, p99 %d' % (R['paper_diff_middle_end']['mean'], R['paper_diff_middle_end']['p99']), 0)]
for t, b in lines: d.text((tx, ty), t, font=FB(20) if b else F(19), fill=(60, 40, 70)); ty += 30
B.save('STAGED_FRAMES_board.jpg', quality=90); print(B.size, 'rel', [r.round(2) for r in rel], 'rate', round(s1, 3), round(s2, 3))
