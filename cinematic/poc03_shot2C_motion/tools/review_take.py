"""Objective review of one generated take of shot 2C (K1 -> K2).
Usage: python review_take.py <take.mp4> <K1.png> <K2.png> <out_dir> [--conform]
Writes report.md, curves.png, contact_sheet.jpg, first_last_compare.jpg; with --conform also
<take>_24fps_1080p.mp4 (H.264, high quality). Never modifies the take or the keyframes.
Needs: Python 3, numpy, opencv-python, scikit-image, matplotlib, ffmpeg/ffprobe on PATH.
"""
import sys, os, json, subprocess
import numpy as np, cv2
from skimage.metrics import structural_similarity as ssim

take, k1p, k2p, out = sys.argv[1:5]; conform = '--conform' in sys.argv
os.makedirs(out, exist_ok=True)
pr = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
     'stream=width,height,r_frame_rate,nb_frames,duration', '-of', 'json', take]))['streams'][0]
num, den = map(int, pr['r_frame_rate'].split('/')); fps = num / den
cap = cv2.VideoCapture(take); frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(f)
n = len(frames); H, W = frames[0].shape[:2]
K1 = cv2.resize(cv2.imread(k1p), (W, H), interpolation=cv2.INTER_AREA)
K2 = cv2.resize(cv2.imread(k2p), (W, H), interpolation=cv2.INTER_AREA)
small = lambda im: cv2.resize(im, (960, 540), interpolation=cv2.INTER_AREA)
gray = lambda im: cv2.cvtColor(small(im), cv2.COLOR_BGR2GRAY)
s_first = ssim(gray(frames[0]), gray(K1)); s_last = ssim(gray(frames[-1]), gray(K2))
s_to_k2 = [ssim(gray(f), gray(K2)) for f in frames[::max(1, n // 48)]]
dE = lambda a, b: float(np.mean(np.abs(cv2.cvtColor(small(a), cv2.COLOR_BGR2LAB).astype(float) - cv2.cvtColor(small(b), cv2.COLOR_BGR2LAB).astype(float))))

# Crossfade / slideshow detector: how well each frame is explained as a pixel blend of K1 and K2.
A = np.stack([gray(K1).ravel(), gray(K2).ravel(), np.ones(960 * 540)], 1).astype(float)
blend_r2 = []
for f in frames:
    y = gray(f).ravel().astype(float); c, *_ = np.linalg.lstsq(A, y, rcond=None)
    blend_r2.append(1 - np.sum((A @ c - y) ** 2) / np.sum((y - y.mean()) ** 2))
blend_r2 = np.array(blend_r2); mid = blend_r2[int(n * 0.3):int(n * 0.7)]

# Motion: optical flow between consecutive frames (480x270).
fl = lambda im: cv2.cvtColor(cv2.resize(im, (480, 270), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
edge_m, centre_m, diverg, lum, nonaff = [], [], [], [], []
Xg = np.stack([np.mgrid[0:270:6, 0:480:6][1].ravel(), np.mgrid[0:270:6, 0:480:6][0].ravel(), np.ones((270 // 6 + (270 % 6 > 0)) * 80)], 1).astype(float)
yy, xx = np.mgrid[0:270, 0:480]; rx, ry = (xx - 240) / 240, (yy - 135) / 135
border = (np.abs(rx) > 0.75) | (np.abs(ry) > 0.75); centre = (np.abs(rx) < 0.15) & (np.abs(ry) < 0.2)
prev = fl(frames[0])
for f in frames:
    lum.append(float(cv2.cvtColor(f, cv2.COLOR_BGR2LAB)[..., 0].mean()) / 2.55)
for f in frames[1:]:
    cur = fl(f); flow = cv2.calcOpticalFlowFarneback(prev, cur, None, 0.5, 4, 21, 3, 5, 1.1, 0)
    mag = np.hypot(flow[..., 0], flow[..., 1])
    edge_m.append(float(np.median(mag[border]))); centre_m.append(float(np.median(mag[centre])))
    diverg.append(float(np.median((flow[..., 0] * rx + flow[..., 1] * ry)[~centre])))  # radial outflow ~ forward speed
    # 3D test: a zoom, pan or 2D warp is explained by one affine transform; real camera travel through depth is not.
    fs = flow[::6, ::6].reshape(-1, 2); cx_, *_ = np.linalg.lstsq(Xg, fs, rcond=None)
    res = np.hypot(*(fs - Xg @ cx_).T); nonaff.append(float(np.median(res) / max(np.median(np.hypot(*fs.T)), 1e-3)))
    prev = cur
edge_m, centre_m, diverg, lum, nonaff = map(np.array, (edge_m, centre_m, diverg, lum, nonaff))
moving = edge_m > 0.3
parallax = float(np.median(edge_m[moving] / np.maximum(centre_m[moving], 0.05))) if moving.any() else 0.0
threed = float(np.median(nonaff[moving])) if moving.any() else 0.0
k = 5; sm = np.convolve(diverg, np.ones(k) / k, mode='same')
jumps = [int(i + 1) for i in range(len(diverg)) if abs(diverg[i] - sm[i]) > max(0.6, 3 * np.std(diverg - sm))]
lum_step = float(np.max(np.abs(np.diff(lum)))) if n > 1 else 0.0

# Pavilion stability over the last half: best normalized correlation with the K2 pavilion, multi-scale.
sx, sy = W / 1672, H / 941
T0 = cv2.cvtColor(K2, cv2.COLOR_BGR2GRAY)[int(432 * sy):int(592 * sy), int(732 * sx):int(898 * sx)]
pav = []
for i in range(n // 2, n, max(1, n // 48)):
    g = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY); best = -1
    for s in np.linspace(0.6, 1.15, 12):
        t = cv2.resize(T0, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        if t.shape[0] >= g.shape[0] or t.shape[1] >= g.shape[1]: continue
        best = max(best, float(cv2.matchTemplate(g, t, cv2.TM_CCOEFF_NORMED).max()))
    pav.append((i, best))
pav_min = min(p[1] for p in pav)

# Outputs
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
t = np.arange(n) / fps
fig, ax = plt.subplots(4, 1, figsize=(10, 9), sharex=True)
ax[0].plot(t[1:], diverg, label='forward motion (radial flow)'); ax[0].plot(t[1:], edge_m, label='edge flow', alpha=.6); ax[0].plot(t[1:], centre_m, label='centre flow', alpha=.6); ax[0].legend(fontsize=8); ax[0].set_ylabel('px/frame')
for j in jumps: ax[0].axvline(j / fps, color='r', alpha=.4)
ax[1].plot(t, lum); ax[1].set_ylabel('mean L*')
ax[2].plot(t, blend_r2); ax[2].axhline(0.9, color='r', ls=':'); ax[2].set_ylabel('K1/K2 blend R²')
ax[3].plot([p[0] / fps for p in pav], [p[1] for p in pav], 'o-'); ax[3].axhline(0.5, color='r', ls=':'); ax[3].set_ylabel('pavilion NCC'); ax[3].set_xlabel('s')
fig.tight_layout(); fig.savefig(os.path.join(out, 'curves.png'), dpi=100)
idx = np.linspace(0, n - 1, 12).astype(int); th = [cv2.resize(frames[i], (480, 270)) for i in idx]
for i, im in zip(idx, th): cv2.putText(im, '%d  %.2fs' % (i + 1, i / fps), (8, 22), cv2.FONT_HERSHEY_SIMPLEX, .6, (255, 255, 255), 2)
cv2.imwrite(os.path.join(out, 'contact_sheet.jpg'), np.vstack([np.hstack(th[r * 4:(r + 1) * 4]) for r in range(3)]), [cv2.IMWRITE_JPEG_QUALITY, 90])
cmp_ = np.vstack([np.hstack([small(frames[0]), small(K1)]), np.hstack([small(frames[-1]), small(K2)])])
cv2.imwrite(os.path.join(out, 'first_last_compare.jpg'), cmp_, [cv2.IMWRITE_JPEG_QUALITY, 90])

ok = lambda c: 'PASS' if c else 'CHECK'
rows = [
 ('Format', '%dx%d, %.3f fps, %d frames, %.2f s' % (W, H, fps, n, n / fps), ok(abs(W / H - 16 / 9) < 0.02 and H >= 1080 and abs(fps - 24) < 0.01)),
 ('Starts on K1', 'SSIM %.3f, mean Lab diff %.1f' % (s_first, dE(frames[0], K1)), ok(s_first >= 0.80)),
 ('Ends on K2', 'SSIM %.3f, mean Lab diff %.1f (best SSIM to K2 in take %.3f)' % (s_last, dE(frames[-1], K2), max(s_to_k2)), ok(s_last >= 0.80)),
 ('Not a crossfade', 'K1/K2 pixel-blend R² in middle 40%%: median %.2f, max %.2f' % (np.median(mid), mid.max()), ok(mid.max() < 0.9)),
 ('Parallax', 'edge/centre flow ratio %.1f' % parallax, ok(parallax >= 3)),
 ('Real 3D travel, not a 2D zoom', 'flow not explained by one affine warp: %.2f (2D zoom ~0.03; threshold 0.08, calibrated on synthetic tests)' % threed, ok(threed >= 0.08)),
 ('Smooth motion', '%d flow jumps %s' % (len(jumps), jumps[:10]), ok(len(jumps) == 0)),
 ('Exposure steps', 'max frame-to-frame change %.2f L*' % lum_step, ok(lum_step < 3)),
 ('Pavilion stable (2nd half)', 'min NCC %.2f' % pav_min, ok(pav_min >= 0.5)),
]
md = ['# Review: %s' % os.path.basename(take), '', '| Check | Measured | Result |', '| --- | --- | --- |'] + ['| %s | %s | %s |' % r for r in rows]
md += ['', 'Visual checks still needed: arch and lantern design (no warping, melting or duplication), vegetation and water motion, motion blur, the moment the camera enters the sunlight, overall beauty.',
       'Images: contact_sheet.jpg, first_last_compare.jpg (top: first frame | K1, bottom: last frame | K2), curves.png.']
open(os.path.join(out, 'report.md'), 'w').write('\n'.join(md) + '\n'); print('\n'.join(md))

if conform:
    dst = os.path.join(out, os.path.splitext(os.path.basename(take))[0] + '_24fps_1080p.mp4')
    vf = 'scale=1920:1080:flags=lanczos' + ('' if abs(fps - 24) < 0.01 else ',minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir')
    subprocess.check_call(['ffmpeg', '-y', '-v', 'error', '-i', take, '-an', '-vf', vf, '-r', '24', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', dst])
    print('conformed ->', dst, '' if abs(fps - 24) < 0.01 else '(frame rate converted with motion interpolation: inspect for artifacts; prefer native 24 fps output)')
