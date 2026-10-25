"""Side-by-side measurements for several takes of shot 2C.
Usage: python compare_takes.py <out_dir> <K1.png> <K2.png> take1.mp4 take2.mp4 ...
Per take: forward-speed curve (radial optical flow), settle (motion in the final 0.5 s), exposure arc (mean L*),
opening (share of bright pixels: how much the view has opened), lake (share of turquoise pixels), frame-to-frame
coherence (motion-compensated residual), and start/end fidelity to K1/K2. Writes compare.png and compare.json.
"""
import sys, os, json, numpy as np, cv2
from skimage.metrics import structural_similarity as ssim
out, k1p, k2p, takes = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
os.makedirs(out, exist_ok=True)
K1, K2 = cv2.imread(k1p), cv2.imread(k2p)
g = lambda im, w=480, h=270: cv2.cvtColor(cv2.resize(im, (w, h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
res = {}
for p in takes:
    cap = cv2.VideoCapture(p); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(f)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24; n = len(fr)
    yy, xx = np.mgrid[0:270, 0:480].astype(np.float32); rx, ry = (xx - 240) / 240, (yy - 135) / 135; ring = np.hypot(rx, ry) > 0.25
    speed, resid, lum, bright, lake = [], [], [], [], []
    gs = [g(f) for f in fr]
    for f in fr:
        sm = cv2.resize(f, (480, 270), interpolation=cv2.INTER_AREA)
        lab = cv2.cvtColor(sm, cv2.COLOR_BGR2LAB); L = lab[..., 0] / 2.55
        lum.append(float(L.mean())); bright.append(float((L > 75).mean()))
        hsv = cv2.cvtColor(sm, cv2.COLOR_BGR2HSV); H, S, V = hsv[..., 0] * 2.0, hsv[..., 1] / 255, hsv[..., 2] / 255
        lake.append(float(((H > 165) & (H < 200) & (S > 0.3) & (V > 0.45)).mean()))
    for a, b in zip(gs[:-1], gs[1:]):
        fl = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 4, 15, 3, 5, 1.1, 0)
        speed.append(float(np.median((fl[..., 0] * rx + fl[..., 1] * ry)[ring])))
        flb = cv2.calcOpticalFlowFarneback(b, a, None, 0.5, 4, 15, 3, 5, 1.1, 0)
        w = cv2.remap(a.astype(np.float32), xx + flb[..., 0], yy + flb[..., 1], cv2.INTER_LINEAR)
        resid.append(float(np.mean(np.abs(w - b.astype(np.float32))[8:-8, 8:-8])))
    sp = np.convolve(speed, np.ones(5) / 5, 'same'); half = int(round(fps / 2))
    settle = float(np.mean(np.abs(speed[-half:]))); peak_t = float((np.argmax(sp) + 1) / fps)
    ssim_s = ssim(g(fr[0], 960, 540), g(K1, 960, 540)); ssim_e = ssim(g(fr[-1], 960, 540), g(K2, 960, 540))
    name = os.path.splitext(os.path.basename(p))[0]
    res[name] = dict(frames=n, peak_speed_t=round(peak_t, 2), peak_speed=round(float(sp.max()), 2),
                     final_half_second_motion=round(settle, 3), motion_at_peak_vs_end=round(float(sp.max() / max(settle, 1e-3)), 1),
                     lum_start=round(lum[0], 1), lum_min=round(min(lum), 1), lum_min_t=round(float(np.argmin(lum) / fps), 2), lum_end=round(lum[-1], 1),
                     max_lum_step=round(float(np.max(np.abs(np.diff(lum)))), 2), opening_end=round(bright[-1], 3), lake_end=round(lake[-1], 4),
                     lake_last_second_mean=round(float(np.mean(lake[-int(fps):])), 4),
                     coherence_resid_median=round(float(np.median(resid)), 2), ssim_start_K1=round(ssim_s, 3), ssim_end_K2=round(ssim_e, 3),
                     curves=dict(speed=[round(x, 3) for x in speed], lum=[round(x, 2) for x in lum], bright=[round(x, 4) for x in bright], lake=[round(x, 4) for x in lake]))
    print(name, {k: v for k, v in res[name].items() if k != 'curves'})
json.dump(res, open(os.path.join(out, 'compare.json'), 'w'), indent=1)
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, ax = plt.subplots(4, 1, figsize=(10, 10), sharex=True)
for name, r in res.items():
    t = np.arange(len(r['curves']['lum'])) / 24
    ax[0].plot(t[1:], np.convolve(r['curves']['speed'], np.ones(5) / 5, 'same'), label=name)
    ax[1].plot(t, r['curves']['lum'], label=name); ax[2].plot(t, r['curves']['bright'], label=name); ax[3].plot(t, r['curves']['lake'], label=name)
for a, lab in zip(ax, ['forward speed (radial flow px/frame)', 'mean L* (exposure)', 'share of bright pixels (opening)', 'share of turquoise pixels (lake)']):
    a.set_ylabel(lab, fontsize=8); a.axvspan(5.5, 6.05, color='#eee', zorder=0); a.legend(fontsize=7)
ax[0].text(5.52, ax[0].get_ylim()[1] * 0.85, 'settle', fontsize=7); ax[3].set_xlabel('s')
fig.tight_layout(); fig.savefig(os.path.join(out, 'compare.png'), dpi=100)
