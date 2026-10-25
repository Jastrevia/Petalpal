"""V3 phone (6.5 s), reference R2: the viewer holds the phone by the rainy window. The screen wakes as the PetalPal notification
slides in, it glows, a tap ripples on it, and the screen's light rises toward the viewer until it fills the frame (cut to A01)."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v3/tools'); import fx, fx3, plates
from PIL import Image, ImageDraw
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 6.5; N = int(round(DUR * FPS))
P = plates.load('R2_phone'); k = plates.to_canvas_scale(P); ph_, pw_ = P.shape[:2]
def S(x, y): return np.float32([x * k, y * k])                      # reference px -> plate px
# phone screen polygon (reference px) and the notification card box
SCREEN = np.float32([[700, 148], [1072, 148], [1126, 862], [732, 884]])
CARD = (714, 398, 1104, 514)
def rr_mask(box, r, shape, kk):
    im = Image.new('L', (shape[1], shape[0]), 0); x0, y0, x1, y1 = [v * kk for v in box]
    ImageDraw.Draw(im).rounded_rectangle([x0, y0, x1, y1], r * kk, fill=255); return np.asarray(im).astype(np.float32) / 255
scr_m = np.zeros((ph_, pw_), np.uint8); cv2.fillPoly(scr_m, [np.int32(SCREEN * k)], 1); SCRM = cv2.GaussianBlur(scr_m.astype(np.float32), (0, 0), 2 * k)
CM = rr_mask(CARD, 22, P.shape, k)
CARD_IMG = P.copy()
u8 = (P * 255).astype(np.uint8); hole = cv2.dilate((CM > 0.02).astype(np.uint8), np.ones((int(9 * k),) * 2, np.uint8))
WALL = cv2.inpaint(u8, hole, int(14 * k), cv2.INPAINT_TELEA).astype(np.float32) / 255     # wallpaper without the card
WALL = WALL * (1 - cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 6 * k)[..., None]) + cv2.GaussianBlur(WALL, (0, 0), 6 * k) * cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 6 * k)[..., None]
yy, xx = np.mgrid[0:ph_, 0:pw_].astype(np.float32)
WINDOW = cv2.GaussianBlur((((xx > 1150 * k) & (yy < 760 * k)) | ((xx > 420 * k) & (xx < 690 * k) & (yy < 330 * k))).astype(np.float32), (0, 0), 20 * k)
lum = P @ np.array([0.299, 0.587, 0.114], np.float32)
SPOTS = (lum > 0.82) & (cv2.GaussianBlur(lum, (0, 0), 6 * k) < lum - 0.05) & (SCRM < 0.5)              # small bright bokeh / fairy lights
TW = cv2.GaussianBlur(SPOTS.astype(np.float32), (0, 0), 2 * k)
PHASE = cv2.resize(fx.value_noise((120, 200), 30, seed=9), (pw_, ph_)) * 12.0
LANT = S(205, 470)
rng = np.random.default_rng(3)
DROPS = [dict(x=rng.uniform(1160, 1672) * k if rng.random() < 0.8 else rng.uniform(430, 680) * k, y=rng.uniform(-200, 800) * k, v=rng.uniform(0.6, 2.4) * k, r=rng.uniform(2, 5) * k) for _ in range(70)]
CTR = (S(912, 470) + S(925, 515)) / 2; TAP = S(860, 456)
EMG = fx3.Petals3D(34, seed=23, xr=(-0.12, 0.12), yr=(-0.2, 0.2), zr=(3.2, 4.2), vel=(0.0, -0.03, -1.1), spread=0.18, size=(0.04, 0.08), focus=1.5, dof=7)
MOT = fx.Motes(160, seed=24, box=(860, 360, 1060, 700), vel=(0, -1.2), spread=2.2, size=(0.6, 2.2))
PET = fx3.Petals3D(16, seed=21, xr=(-1.5, 1.5), yr=(-0.9, 0.9), zr=(0.5, 4.0), vel=(0.02, 0.03, 0.0), size=(0.04, 0.08), focus=1.2, dof=8)

def frame(i):
    t = i / FPS
    wake = fx.ease((t - 0.55) / 0.45); slide = fx.ease_out((t - 0.6) / 0.5)
    rise = fx.ease((t - 3.4) / 2.2); flood = fx.ease((t - 5.2) / 1.0)
    img = P.copy()
    # screen: wallpaper (dim while asleep), card slides in from the top of the screen
    scr = WALL * (0.28 + 0.72 * wake)
    if slide > 0:
        dy = (1 - slide) * (-200 * k); M = np.float32([[1, 0, 0], [0, 1, dy]])
        c = cv2.warpAffine(CARD_IMG, M, (pw_, ph_)); cm = cv2.warpAffine(CM, M, (pw_, ph_)) * SCRM * slide
        glow = 0.5 + 0.5 * np.sin((t - 1.0) * 4.2) if t > 1.0 else 0
        halo = cv2.GaussianBlur(cm, (0, 0), 16 * k) * (0.18 + 0.14 * glow) * fx.win(t, 0.9, 1.2, 3.3, 3.8)
        scr = scr * (1 - cm[..., None]) + c * cm[..., None] + halo[..., None] * np.array([0.7, 0.55, 0.95])
    if t > 2.15:                                                                         # tap ripple
        r = (t - 2.15) / 0.5; d = np.hypot(xx - TAP[0], yy - TAP[1])
        ring = np.exp(-((d - r * 140 * k) ** 2) / (2 * (7 * k) ** 2)) * (1 - fx.clamp01(r)) * 0.7 + np.exp(-d ** 2 / (2 * (26 * k) ** 2)) * 0.35 * (1 - fx.clamp01(r))
        scr = scr + ring[..., None]
    sglow = fx.ease((t - 2.5) / 1.0)                                                     # the screen fills with warm light
    d0 = np.hypot(xx - CTR[0], yy - CTR[1])
    scr = scr * (1 - 0.38 * sglow) + np.array([1.0, 0.93, 0.80]) * (0.38 * sglow) + np.exp(-(d0 / ((150 + 200 * rise) * k)) ** 2)[..., None] * (0.45 * sglow + 0.5 * rise)
    img = img * (1 - SCRM[..., None]) + scr * SCRM[..., None]
    # light spills onto the hands and the room
    spill = np.exp(-(d0 / ((420 + 700 * rise) * k)) ** 2) * (0.10 * wake + 0.35 * sglow + 0.6 * rise)
    img = img + spill[..., None] * np.array([1.0, 0.86, 0.62])
    # room life: rain on the glass, twinkling lights, lantern flicker
    dr = np.zeros((ph_, pw_), np.float32)
    for q in DROPS:
        y = (q['y'] + q['v'] * i) % (900 * k) - 100 * k
        cv2.ellipse(dr, (int(q['x']), int(y)), (int(q['r']), int(q['r'] * 1.6)), 0, 0, 360, 0.5, -1, cv2.LINE_AA)
        cv2.line(dr, (int(q['x']), int(y - 26 * k)), (int(q['x']), int(y)), 0.18, max(1, int(q['r'] * 0.6)), cv2.LINE_AA)
    img = img + cv2.GaussianBlur(dr, (0, 0), 1.2 * k)[..., None] * WINDOW[..., None] * np.array([0.75, 0.82, 1.0]) * 0.6
    img = img * (1 + (TW * 0.35 * np.sin(t * 2.3 + PHASE))[..., None])
    fl = 1 + 0.10 * np.sin(t * 7.1) + 0.06 * np.sin(t * 15.7)
    img = img + (np.exp(-(((xx - LANT[0]) / (150 * k)) ** 2 + ((yy - LANT[1]) / (170 * k)) ** 2)) * 0.10 * (fl - 0.9))[..., None] * np.array([1.0, 0.8, 0.5])
    # camera: slow push toward the screen
    zoom = 1.0 + 0.10 * fx.ease(t / 5.6)
    cx = 0.5 + (CTR[0] / pw_ - 0.5) * 0.5 * fx.ease(t / 5.6); cy = 0.5 + (CTR[1] / ph_ - 0.5) * 0.5 * fx.ease(t / 5.6)
    out = fx.cam(img, cx, cy, zoom, border=cv2.BORDER_REPLICATE)
    PET.step(t, 1 / FPS); PET.render(out, t)
    if t > 3.0:                                   # light, motes and petals rise out of the screen toward the viewer
        EMG.step(t, 1 / FPS); EMG.render(out, t); MOT.step(1.0); out = out + MOT.render(t, 1.1 * fx.win(t, 3.0, 3.6, 6.0, 6.5))
    if flood > 0: out = out * (1 - flood) + fx.PAPER[None, None] * flood
    sp = fx.ease((t - 5.6) / 0.8)
    if sp > 0:
        gy, gx = np.mgrid[0:H, 0:W].astype(np.float32); halo = np.exp(-((gx - 1300) ** 2 + (gy - 470) ** 2) / (2 * (60 + 140 * sp) ** 2)) * sp
        out = out * (1 - halo[..., None] * np.array([0.0, 0.10, 0.30])); out = fx.orb(out, 1300, 470, r=4 + 10 * sp, gain=0.5 + 0.8 * sp, t=t)
    if i >= N - 2: out = out + (0.35 if i == N - 1 else 0.18)
    out = fx.bloom(out, 0.8, 22, 0.35 * (1 - flood))
    return fx.finish(out, i, vig=0.25 * (1 - flood), grn=0.010)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.2, 1.4, 2.35, 3.6, 4.8, 6.0]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/phone_{t:.2f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/V3_phone.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
