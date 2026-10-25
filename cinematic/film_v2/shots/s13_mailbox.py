"""S13 (3.0 s): the wisteria treehouse balcony from PetalPal's Mailbox screen (first person). Lantern flickers, wisteria sways,
the fairy's light arrives at the crocus-bud mailbox and a letter inside begins to glow."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 3.0; N = int(DUR * FPS)
SRC = fx.load(fx.ROOT + '/sr/mailbox_bg_clean_x4.png')                     # 3072 x 5504
CROP = SRC[330:330 + 1728, :]                                               # 16:9 band without the watermark
PLATE = cv2.resize(CROP, (W * 2 // 2 * 1, H), interpolation=cv2.INTER_AREA) if False else CROP
ph, pw = PLATE.shape[:2]                                                   # 1728 x 3072
hsv = cv2.cvtColor((cv2.resize(PLATE, (W, H)) * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
SWAY = cv2.GaussianBlur((((hsv[..., 0] * 2 > 250) & (hsv[..., 0] * 2 < 320) & (hsv[..., 1] > 40)).astype(np.float32)), (0, 0), 6)
LANT = np.array([620.0, 150.0]); SLOT = np.array([660.0, 690.0])           # in 1920x1080 plate coords
pet = fx.Petals(12, seed=51, box=(0, -300, W, H), vel=(0.9, 1.3), size=(26, 50))
mot = fx.Motes(70, seed=52, box=(450, 500, 900, 820), vel=(0, -0.7), spread=0.6, size=(0.6, 1.8))
def frame(i):
    t = i / FPS; u = fx.ease(t / DUR)
    zoom = 1.0 + 0.07 * u; cx = 0.5 + (SLOT[0] / W - 0.5) * 0.3 * u; cy = 0.5 + (SLOT[1] / H - 0.5) * 0.3 * u
    base = cv2.resize(PLATE, (W, H), interpolation=cv2.INTER_AREA)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (SWAY * 2.4 * np.sin(t * 1.3 + gy * 0.012 + gx * 0.003)).astype(np.float32)
    img = cv2.remap(base, gx - dx, gy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    fl = 1 + 0.10 * np.sin(t * 7.3) + 0.06 * np.sin(t * 17.1)
    img = img + (np.exp(-(((gx - LANT[0]) / 170) ** 2 + ((gy - LANT[1]) / 210) ** 2)) * 0.16 * fl)[..., None] * np.array([1.0, 0.8, 0.5])
    # the fairy's light arrives and the letter in the mailbox glows
    p = np.array([1500 - 820 * fx.ease_out(t / 2.0), 260 + 380 * fx.ease_out(t / 2.0) + 14 * np.sin(t * 2.7)])
    img = fx.orb(img, p[0], p[1], r=9, gain=1.1, t=t)
    gl = fx.ease((t - 1.5) / 1.0)
    img = img + (np.exp(-(((gx - SLOT[0]) / 150) ** 2 + ((gy - SLOT[1]) / 70) ** 2)) * 0.45 * gl * (0.85 + 0.15 * np.sin(t * 5)))[..., None] * np.array([1.0, 0.86, 0.58])
    if gl > 0: mot.step(1.0); img = img + mot.render(t, 0.8 * gl)
    pet.step(t); pet.render(img, t, 0.85)
    img = fx.cam(img, cx, cy, zoom, border=cv2.BORDER_REPLICATE)
    img = fx.grade(img, gamma=1.0, sat=0.98, warm=0.2)
    return fx.finish(fx.bloom(img, 0.8, 20, 0.35), i, vig=0.3, grn=0.012)
if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.2, 1.4, 2.9]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/s13_{t:.1f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/S13_mailbox.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
