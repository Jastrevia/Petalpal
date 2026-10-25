"""S12: the handwritten words lift off as golden motes and gather into one glowing seed (1.75 s, 42 frames, 1920x1080)."""
import numpy as np, cv2, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H, N = 1920, 1080, 42
B = cv2.resize(cv2.imread('keyframes/S11b.png'), (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
A = cv2.resize(cv2.imread('keyframes/S11a.png'), (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
gb = cv2.cvtColor(B.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32); ga = cv2.cvtColor(A.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
ink = ((ga - gb) > 28) & (gb < 140)
import glob
B = cv2.imread(sorted(glob.glob('vfx/S11/*.png'))[-1]).astype(np.float32)  # continue from the exact last frame of shot 11
# keep only the writing area (exclude hand/pen differences): the text block of S11b
ys, xs = np.nonzero(ink)
box = (int(W*0.30), int(H*0.42), int(W*0.75), int(H*0.75))
keep = (xs > box[0]) & (xs < box[2]) & (ys > box[1]) & (ys < box[3]); xs, ys = xs[keep], ys[keep]
mask = np.zeros((H, W), np.float32); mask[ys, xs] = 1; mask = cv2.dilate(mask, np.ones((3, 3), np.uint8)); mask = cv2.GaussianBlur(mask, (5, 5), 0)[..., None]
# clean page = S11b with ink replaced by local paper colour (median blur of the page)
paper = cv2.medianBlur(B.astype(np.uint8), 21).astype(np.float32)
rng = np.random.default_rng(7); idx = rng.choice(len(xs), size=min(2600, len(xs)), replace=False)
px, py = xs[idx].astype(np.float32), ys[idx].astype(np.float32)
tx, ty = W * 0.52, H * 0.50  # where the seed forms (over the page centre)
delay = (px - px.min()) / (px.max() - px.min() + 1) * 0.35  # motes lift left-to-right, like reading
ang = rng.uniform(0, 2*np.pi, len(px)); swirl = rng.uniform(60, 180, len(px))
os.makedirs('vfx/S12', exist_ok=True)
ease = lambda u: u*u*(3-2*u)
for f in range(N):
    t = f / (N - 1)
    fade = np.clip((t - 0.0) / 0.45, 0, 1)
    base = B * (1 - mask * fade) + paper * (mask * fade)
    # gentle warm grade toward the glow
    vig = (1 - 0.45 * ease(np.clip((t-0.15)/0.7, 0, 1)) * (0.55 + 0.45*np.clip(np.sqrt(((np.mgrid[0:H,0:W][1]-tx)/W)**2+((np.mgrid[0:H,0:W][0]-ty)/H)**2)*2.2,0,1)))[..., None]
    base = base * vig
    glow = np.zeros((H, W), np.float32)
    u = np.clip((t - delay) / 0.65, 0, 1); e = ease(u)
    cx = px + (tx - px) * e + np.cos(ang + 4*u) * swirl * np.sin(np.pi * e)
    cy = py + (ty - py) * e + np.sin(ang + 4*u) * swirl * 0.6 * np.sin(np.pi * e) - 80 * np.sin(np.pi * e)
    alive = u > 0
    xi, yi = np.clip(cx[alive], 0, W-1).astype(int), np.clip(cy[alive], 0, H-1).astype(int)
    np.add.at(glow, (yi, xi), 0.9)
    seed = ease(np.clip((t - 0.55) / 0.45, 0, 1))
    g = cv2.GaussianBlur(glow, (0, 0), 1.4) * 2.2 + cv2.GaussianBlur(glow, (0, 0), 6) * 3.0
    yy, xx = np.mgrid[0:H, 0:W]; r2 = ((xx - tx)**2 + (yy - ty)**2)
    ex = ((xx - tx)/16)**2 + ((yy - ty)/11)**2
    g += seed * (np.exp(-ex*1.5) * 2.4 + np.exp(-r2 / (2 * 60**2)) * 0.45 + np.exp(-r2 / (2 * 220**2)) * 0.12)
    gold = np.array([70, 175, 255], np.float32)  # BGR warm gold
    out = base + g[..., None] * gold
    out = 255 * (1 - np.exp(-out / 255 * 1.0)) / (1 - np.exp(-1.0))  # soft highlight roll-off, no clipping flash
    cv2.imwrite(f'vfx/S12/{f:03d}.png', np.clip(out, 0, 255).astype(np.uint8))
print('S12 frames', N, 'ink px', len(xs))
