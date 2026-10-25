"""S10 (4.0 s): in the pavilion, the viewer's journal. The words "Today was harder than I expected." are written in ink behind a
small golden nib-light; then the ink lifts off the page as golden motes that gather into one glowing seed, which drops
out of frame (into V13, where the seed lies glowing in the moss)."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
from PIL import Image, ImageDraw
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 4.0; N = int(DUR * FPS)
K2 = fx.load(fx.V1 + 'refs/K2.png')
BG = fx.grade(fx.blur(fx.cam(K2, 0.49, 0.58, 2.2), 22), gain=1.05, warm=0.8)
PAPER = fx.load(fx.U + 'mobile/assets/auth/entrance-v1/heirloom-paper-v1.png')            # 1122 x 1402
PH_, PW_ = PAPER.shape[:2]
# page in perspective: a slightly turned page filling the lower frame
dst = np.float32([[360, 150], [1590, 190], [1830, 1190], [90, 1150]])
src = np.float32([[0, 0], [PW_, 0], [PW_, PH_ * 0.80], [0, PH_ * 0.80]])
HP = cv2.getPerspectiveTransform(src, dst)
# handwriting in page coordinates
from PIL import ImageFont
F = ImageFont.truetype(fx.FONTS + 'Caveat[wght].ttf', 112)
try: F.set_variation_by_axes([520])
except Exception: pass
ink = Image.new('L', (PW_, PH_), 0); d = ImageDraw.Draw(ink)
lines = [('Today was harder', (120, 300)), ('than I expected.', (170, 470))]
boxes = []
for txt, (x, y) in lines:
    d.text((x, y), txt, font=F, fill=255); bb = d.textbbox((x, y), txt, font=F); boxes.append(bb)
INK = np.asarray(ink).astype(np.float32) / 255
INK = cv2.GaussianBlur(INK, (0, 0), 0.7)
# reveal order: line 1 left->right over 0.25-1.35 s, line 2 over 1.35-2.35 s
ORD = np.full((PH_, PW_), 9.0, np.float32); px = np.arange(PW_)[None, :].repeat(PH_, 0).astype(np.float32)
for k, (x0, y0, x1, y1) in enumerate(boxes):
    m = np.zeros((PH_, PW_), bool); m[y0 - 20:y1 + 30, x0 - 10:x1 + 10] = True
    ORD[m] = k + (px[m] - x0) / (x1 - x0)
INK_COL = np.array([0.20, 0.14, 0.20], np.float32)
# particles from ink pixels (page coords -> screen via HP)
ys, xs = np.nonzero(INK > 0.5); rng = np.random.default_rng(5); sel = rng.choice(len(xs), 900, replace=False)
pts = cv2.perspectiveTransform(np.float32(np.stack([xs[sel], ys[sel]], 1))[None], HP)[0]
SEED = np.array([960.0, 360.0])
delay = rng.uniform(0, 0.5, len(pts)); swirl = rng.uniform(-1, 1, len(pts))
NOISE = fx.value_noise((540, 960), 160, seed=8)
petals = fx.Petals(8, seed=41, box=(0, -200, W, H), vel=(0.7, 1.1), size=(28, 50))

def frame(i):
    t = i / FPS
    img = BG.copy()
    # page with dappled light
    page = PAPER * 0.98
    prog = np.interp(t, [0.25, 1.35, 2.35], [0, 1, 2])                 # line progress
    lift = fx.ease((t - 2.45) / 0.8)
    rev = fx.clamp01((prog - ORD) / 0.04)
    wet = np.clip(1 - (prog - ORD) / 0.5, 0, 1) * rev
    a = INK * rev * (1 - lift)
    col = INK_COL * (1 - 0.25 * wet[..., None])
    page = page * (1 - a[..., None] * 0.92) + col * a[..., None] * 0.92
    pa = np.ones((PH_, PW_), np.float32)
    fx.place(img, page, pa, HP)
    dap = cv2.resize(NOISE[:, int(t * 12) % 400:int(t * 12) % 400 + 560], (W, H)); dap = (dap - 0.5) * 0.16
    img = img * (1 + dap[..., None] * np.array([1.0, 0.95, 0.85]))
    # golden nib-light at the writing front
    if 0.25 < t < 2.35:
        k = 0 if prog < 1 else 1; x0, y0, x1, y1 = boxes[k]; f = prog - k
        px_, py_ = x0 + (x1 - x0) * f, y1 - 20 + 6 * np.sin(t * 30)
        q = cv2.perspectiveTransform(np.float32([[[px_, py_]]]), HP)[0, 0]
        img = fx.orb(img, q[0], q[1], r=5, gain=0.9, t=t)
    # ink lifts into motes and gathers into a seed
    if t > 2.45:
        layer = np.zeros((H, W), np.float32)
        u = np.clip((t - 2.45 - delay) / 0.85, 0, 1); e = u * u * (3 - 2 * u)
        ang = swirl * (1 - e) * 2.2
        rel = pts - SEED; c, s = np.cos(ang), np.sin(ang)
        rot = np.stack([rel[:, 0] * c - rel[:, 1] * s, rel[:, 0] * s + rel[:, 1] * c], 1)
        cur = SEED + rot * (1 - e)[:, None] - np.array([0, 40]) * np.sin(np.pi * e)[:, None]
        for (x, y), uu in zip(cur, u):
            if 0 < uu < 1 and 0 <= int(x) < W and 0 <= int(y) < H: layer[int(y), int(x)] += 1.2
        img = img + (cv2.GaussianBlur(layer, (0, 0), 1.3) * 3 + fx.blur(layer, 6) * 6)[..., None] * np.array([1.0, 0.82, 0.48])
    seed_on = fx.ease((t - 3.0) / 0.35)
    if seed_on > 0:
        drop = fx.ease_in((t - 3.4) / 0.6); sy = SEED[1] + drop * 900
        img = fx.orb(img, SEED[0], sy, r=6 + 5 * seed_on, gain=1.3 * seed_on, t=t)
    petals.step(t); petals.render(img, t, 0.8)
    img = fx.grade(img, warm=0.4, sat=1.02)
    return fx.finish(fx.bloom(img, 0.85, 18, 0.3), i, vig=0.34, grn=0.012)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.6, 1.8, 2.4, 2.9, 3.3, 3.7]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/s10_{t:.1f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/S10_journal.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
