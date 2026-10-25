"""V3 crocus (5.0 s): the approved V13 crocus bloom is kept exactly (flower pixels, timing, camera). Only the surroundings are
restyled toward reference R5: softer painterly moss and ground, golden light, bokeh, sparkle filaments, drifting 3D petals."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v3/tools'); import fx, fx3
W, H, FPS = fx.W, fx.H, fx.FPS
F = fx.frames(fx.V1 + 'shots/V13.mp4')[:120]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
ROI = ((xx > 560) & (xx < 1460) & (yy > 220) & (yy < 990))
STEM = np.clip(1.5 - np.sqrt(((xx - 958) / 78) ** 2 + ((yy - 770) / 185) ** 2), 0, 1) ** 1.5; STEM = STEM.astype(np.float32)   # stem base: always original
BGMED = np.median(np.stack(F[0:24:2]), 0)          # static scene before the bloom (seed only)

def flower_mask(f, i):
    u8 = (f * 255).astype(np.uint8); hsv = cv2.cvtColor(u8, cv2.COLOR_RGB2HSV).astype(np.float32)
    h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    g = cv2.cvtColor(u8, cv2.COLOR_RGB2GRAY).astype(np.float32)
    sharp = cv2.GaussianBlur(np.abs(cv2.Laplacian(g, cv2.CV_32F, ksize=3)), (0, 0), 4)
    diff = np.abs(f - BGMED).max(2)
    changed = cv2.morphologyEx((diff > 0.11).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(bool)   # what grew (rain streaks removed)
    flowerish = ((h > 230) & (h < 345) & (s > 0.12) & (v > 0.25)) | (((h > 330) | (h < 18)) & (s > 0.12) & (v > 0.35) & (xx > 820) & (xx < 1080) & (yy > 560)) | ((s < 0.4) & (v > 0.5)) | ((h > 10) & (h < 100) & (s > 0.4) & (v > 0.4))
    yellow = (h > 15) & (h < 70) & (s > 0.4) & (v > 0.45)
    seed = yellow & (v > 0.55) & (yy > 650) & (yy < 900) & (xx > 760) & (xx < 1150)                                    # the glowing seed (present from frame 0)
    sprout = (h > 60) & (h < 100) & (s > 0.55) & (v > 0.62)
    m = ((changed & flowerish) | seed | (sprout & changed)) & ROI
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    if n > 1:
        big = 1 + np.argsort(-st[1:, cv2.CC_STAT_AREA])
        a0 = st[big[0], cv2.CC_STAT_AREA]
        for k in big[:6]:
            if st[k, cv2.CC_STAT_AREA] > max(300, 0.04 * a0): keep[lab == k] = 1
    # fill holes (water droplets on the petals)
    ff = keep.copy(); hgt, wid = ff.shape; msk = np.zeros((hgt + 2, wid + 2), np.uint8); cv2.floodFill(ff, msk, (0, 0), 1)
    holes = (1 - ff).astype(np.uint8); nh, lh, sh, _ = cv2.connectedComponentsWithStats(holes)
    small = np.isin(lh, 1 + np.nonzero(sh[1:, cv2.CC_STAT_AREA] < 2500)[0]).astype(np.uint8)
    keep = keep | small
    keep = cv2.morphologyEx(keep, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    keep = cv2.erode(keep, np.ones((3, 3), np.uint8))
    m = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 1.4)
    return np.maximum(m, STEM)

rng = np.random.default_rng(5)
BOK = [dict(x=rng.uniform(0, W), y=rng.uniform(0, H * 0.75), r=rng.uniform(10, 46), ph=rng.uniform(0, 6.28), a=rng.uniform(0.15, 0.5)) for _ in range(55)]
FIL = [dict(p0=np.array([rng.uniform(0, W), rng.uniform(H * 0.3, H)]), d=rng.uniform(-1, 1, 2), ph=rng.uniform(0, 6.28), L=rng.uniform(200, 520)) for _ in range(10)]
PET = fx3.Petals3D(26, seed=55, xr=(-1.4, 1.4), yr=(-0.9, 0.9), zr=(0.6, 4.5), vel=(0.03, 0.035, 0.0), spread=0.015, size=(0.04, 0.08), focus=2.2, dof=7)

def restyle(f, t):
    u8 = (f * 255).astype(np.uint8)
    ep = cv2.edgePreservingFilter(u8, flags=1, sigma_s=70, sigma_r=0.45).astype(np.float32) / 255
    ep = cv2.GaussianBlur(ep, (0, 0), 1.6)
    hsv = cv2.cvtColor((ep * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[..., 1] *= 0.72; hsv[..., 2] = 255 * (hsv[..., 2] / 255) ** 0.72
    st = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32) / 255
    lum = st @ np.array([0.299, 0.587, 0.114], np.float32)
    gold = np.array([1.0, 0.86, 0.62], np.float32); lav = np.array([0.88, 0.80, 0.96], np.float32)
    st = st * (0.74 + 0.26 * gold) + (lum[..., None] ** 2) * gold * 0.28
    upper = np.clip((560 - yy) / 400, 0, 1)[..., None]                                # misty lavender-gold background band
    st = st * (1 - 0.35 * upper) + (lav * 0.75 + gold * 0.25) * 0.95 * 0.35 * upper
    # light from the upper right, soft haze
    st = st + (np.exp(-(((xx - 1500) / 900) ** 2 + ((yy - 120) / 600) ** 2)) * 0.22)[..., None] * gold
    # bokeh
    bk = np.zeros((H, W), np.float32)
    for b in BOK:
        cv2.circle(bk, (int(b['x'] + 12 * np.sin(t * 0.4 + b['ph'])), int(b['y'])), int(b['r']), float(b['a'] * (0.65 + 0.35 * np.sin(t * 1.7 + b['ph']))), -1, cv2.LINE_AA)
    st = st + fx.blur(bk, 3)[..., None] * gold * 0.55
    # sparkle filaments drifting low across the moss
    fl = np.zeros((H, W), np.float32)
    for q in FIL:
        pts = []
        for k in range(24):
            s = k / 23; p = q['p0'] + q['d'] * q['L'] * s + np.array([30 * np.sin(s * 5 + t * 1.3 + q['ph']), 22 * np.cos(s * 4 + t * 1.1 + q['ph'])])
            pts.append(p)
        cv2.polylines(fl, [np.int32(pts)], False, 0.55, 1, cv2.LINE_AA)
    st = st + (fl * 1.2 + fx.blur(fl, 4) * 2.5)[..., None] * gold * 0.6
    return st

def frame(i):
    t = i / FPS; f = F[i]
    m = flower_mask(f, i)
    bg = restyle(f, t)
    PET.step(t, 1 / FPS); PET.render(bg, t)
    # warm glow behind the flower so it sits in the new light
    glow = fx.blur(m * (f @ np.array([0.299, 0.587, 0.114], np.float32)), 24)
    bg = bg + glow[..., None] * np.array([1.0, 0.82, 0.62]) * 0.5
    bg = fx.bloom(bg, 0.78, 26, 0.45)
    out = bg * (1 - m[..., None]) + f * m[..., None]                                     # flower pixels exactly as V13
    return np.clip(out, 0, 1), m

if __name__ == '__main__':
    import os
    if len(sys.argv) > 1:
        for i in [0, 70, 100, 119]:
            o, m = frame(i); fx.save(o, f'{fx.ROOT}/review/crocus_{i:03d}.jpg'); fx.save(np.dstack([m] * 3), f'{fx.ROOT}/review/crocus_mask_{i:03d}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/V3_crocus.mp4'); diffs = []
        for i in range(len(F)):
            o, m = frame(i); w.put(o)
            core = m > 0.98; diffs.append(float(np.abs(o[core] - F[i][core]).max()) if core.any() else 0)
        w.close(); print('flower pixels max change (core mask):', max(diffs))
