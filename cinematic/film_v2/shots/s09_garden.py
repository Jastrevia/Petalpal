"""S09a (3.0 s) + S09b (3.1 s): into the garden. Continues from the last frame of K03orb (approved K2 framing): the fairy's light
glides ahead over the lake toward the pavilion; waterfall, water, mist, wisteria and petals move. S09b is a closer view of the
pavilion over the water (from the 4x-upscaled K2). python s09_garden.py [a|b] [stills]"""
import sys, os, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
W, H, FPS = fx.W, fx.H, fx.FPS
K2o = fx.load(fx.V1 + 'refs/K2.png'); KH, KW = K2o.shape[:2]          # 941 x 1672
SR = fx.ROOT + '/sr/K2_x4.png'
SRC = cv2.resize(fx.load(SR), (KW * 2, KH * 2), interpolation=cv2.INTER_AREA) if os.path.exists(SR) else cv2.resize(K2o, (KW * 2, KH * 2), interpolation=cv2.INTER_CUBIC)
print('K2 source', 'SR' if os.path.exists(SR) else 'bicubic')
hsv = cv2.cvtColor((K2o * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32); Hh, Ss, Vv = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
yy, xx = np.mgrid[0:KH, 0:KW]
def soft(m, s=3): return cv2.GaussianBlur(m.astype(np.float32), (0, 0), s)
WF = soft(((xx > 1095) & (xx < 1262) & (yy > 232) & (yy < 622)) & (Ss < 0.28) & (Vv > 0.72), 2.5)
LAKE = soft(((yy > 598) & (yy < 716) & (xx > 625) & (xx < 1250)) & (Hh > 150) & (Hh < 200) & (Ss > 0.2), 3)
SWAY = soft((((xx < 600) | (xx > 1120)) & (yy < 560)) & (Hh > 250) & (Hh < 320) & (Ss > 0.15), 6) * np.clip((560 - yy) / 300, 0, 1)
MIST = soft(((yy > 280) & (yy < 640) & (xx > 540) & (xx < 1300)).astype(np.float32), 60)
NOISE = fx.value_noise((1100, 2600), 420, seed=3, octaves=4)
rng = np.random.default_rng(12); lk = np.argwhere(LAKE > 0.6); GL = lk[rng.choice(len(lk), 260, replace=False)]; GPH = rng.uniform(0, 6.28, 260)
SUN = np.array([690.0, 215.0])                                  # K2 px

def view(cx, cy, zoom):
    """affine K2-px -> output px for this camera (cam() convention, zoom 1 = cover)."""
    s = zoom * max(W / KW, H / KH); M = np.float32([[s, 0, W / 2 - cx * KW * s], [0, s, H / 2 - cy * KH * s]]); return M
def warpK(m, M):  return cv2.warpAffine(m, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

def render(t, cx, cy, zoom, i, orb_xy=None, orb_r=8, petals=None):
    M = view(cx, cy, zoom); M2 = M.copy(); M2[:, :2] /= 2               # SRC is 2x
    base = cv2.warpAffine(SRC, M2, (W, H), flags=cv2.INTER_AREA if zoom < 1.6 else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    s = M[0, 0]
    wf, lake, sway, mist = warpK(WF, M), warpK(LAKE, M), warpK(SWAY, M), warpK(MIST, M)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    # displacement: lake ripples, wisteria sway, waterfall flow (two phases)
    dx = lake * (1.6 * s / 1.15) * np.sin(gy * 0.21 / s + t * 3.1) + sway * (2.6 * s / 1.15) * np.sin(t * 1.25 + gy * 0.012 / s + gx * 0.004 / s)
    dy = lake * 0.6 * np.sin(gx * 0.05 / s + t * 2.3)
    L = 26 * s; ph = (t * 1.1) % 1.0
    dx = dx.astype(np.float32); dy = dy.astype(np.float32)
    r1 = cv2.remap(base, gx - dx, (gy - dy - wf * (ph * L)).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    r2 = cv2.remap(base, gx - dx, (gy - dy - wf * (((ph + 0.5) % 1.0) * L)).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    w1 = 1 - np.abs(2 * ph - 1); w1 = wf * w1 + (1 - wf)               # outside the falls only r1 (whose wf term is 0)
    img = r1 * w1[..., None] + r2 * (1 - w1)[..., None]
    img = img + wf[..., None] * 0.05 * (0.5 + 0.5 * np.sin(gy * 0.3 / s - t * 14))[..., None]      # white water shimmer
    # mist drifting across the valley
    ox = int(t * 22) % 1300; nz = NOISE[:, ox:ox + 1300]; nz = cv2.resize(nz, (W, H), interpolation=cv2.INTER_LINEAR)
    img = img + (mist * nz * 0.16)[..., None] * np.array([1.0, 0.97, 0.92])
    # sun rays
    sp = M @ np.array([SUN[0], SUN[1], 1]); ang = np.arctan2(gy - sp[1], gx - sp[0]); dist = np.hypot(gx - sp[0], gy - sp[1])
    rays = (0.5 + 0.5 * np.sin(ang * 23 + t * 0.35) * np.sin(ang * 9 - t * 0.2)) * np.exp(-dist / (900 * s / 1.15)) * 0.10
    img = img + rays[..., None] * np.array([1.0, 0.9, 0.7])
    # glints on the lake
    gl = np.zeros((H, W), np.float32)
    for (py, px), p in zip(GL, GPH):
        q = M @ np.array([px, py, 1]); xi, yi = int(q[0]), int(q[1])
        if 0 <= xi < W and 0 <= yi < H: gl[yi, xi] += max(0, np.sin(t * 4 + p)) ** 6 * 1.4
    img = img + (cv2.GaussianBlur(gl, (0, 0), 1.0) * 3 + fx.blur(gl, 4) * 4)[..., None] * np.array([1.0, 0.96, 0.88])
    if orb_xy is not None: img = fx.orb(img, orb_xy[0], orb_xy[1], r=orb_r, gain=1.0, t=t)
    if petals is not None: petals.step(t); petals.render(img, t, 0.9)
    img = fx.grade(img, gamma=1.02, sat=1.04, warm=0.3)
    return fx.finish(fx.bloom(img, 0.8, 22, 0.35), i, vig=0.28, grn=0.012)

trail = []
def shot_a(i):                                       # 3.0 s
    t = i / FPS; u = fx.ease(t / 3.0)
    zoom = 1.0 + 0.05 * u; cx = 0.5 + (0.487 - 0.5) * 0.4 * u; cy = 0.5 + (0.56 - 0.5) * 0.4 * u
    # the light: from where K03orb leaves it, out over the water toward the pavilion
    p0 = np.array([1120.0, 580.0]); p1 = np.array([930.0, 560.0]); p = p0 + (p1 - p0) * fx.ease(t / 3.0) + np.array([0, -14 * np.sin(t * 2.2)])
    return render(t, cx, cy, zoom, i, orb_xy=p, orb_r=9 - 4 * fx.ease(t / 3), petals=PA)
def shot_b(i):                                       # 3.1 s
    t = i / FPS; u = fx.ease(t / 3.1)
    zoom = 2.35 + 0.18 * u; cx = 0.487 + 0.01 * u; cy = 0.545 - 0.006 * u
    p = np.array([1500 - 520 * fx.ease(t / 3.1), 760 - 250 * fx.ease_out(t / 3.1) + 18 * np.sin(t * 2.6)])
    return render(t, cx, cy, zoom, i, orb_xy=p, orb_r=7, petals=PB)
PA = fx.Petals(14, seed=31, box=(0, -300, W, H), vel=(1.0, 1.4), size=(26, 52))
PB = fx.Petals(10, seed=32, box=(0, -300, W, H), vel=(0.8, 1.2), size=(30, 60))
if __name__ == '__main__':
    which = sys.argv[1]; fn, dur = (shot_a, 3.0) if which == 'a' else (shot_b, 3.1)
    if len(sys.argv) > 2:
        for t in [0.0, 1.5, dur - 0.05]: fx.save(fn(int(t * FPS)), f'{fx.ROOT}/review/s09{which}_{t:.2f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + f'/shots/S09{which}_garden.mp4')
        for i in range(int(round(dur * FPS))): w.put(fn(i))
        w.close()
