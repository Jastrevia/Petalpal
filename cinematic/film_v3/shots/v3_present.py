"""V3 presenting (3.0 s), reference R1: in the room, the fairy presents the invitation; the viewer's hand (PetalPal's own
illustrated hand, replacing the reference's malformed one) moves gently toward it. Living plate: camera drift, light,
flowing sparkle ribbons, 3D petals."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v3/tools'); import fx, fx3, plates
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 3.0; N = int(DUR * FPS)
P = plates.load('R1_fairy_presenting'); k = plates.to_canvas_scale(P); ph_, pw_ = P.shape[:2]
# remove the reference's own (malformed) hand where it does not overlap the invitation: skin-toned, left of / below the card
_u8 = (P * 255).astype(np.uint8); _hsv = cv2.cvtColor(_u8, cv2.COLOR_RGB2HSV).astype(np.float32)
_h, _s, _v = _hsv[..., 0] * 2, _hsv[..., 1] / 255, _hsv[..., 2] / 255
_yy, _xx = np.mgrid[0:ph_, 0:pw_]
_zone = ((_xx < 512 * k) & (_yy > 560 * k)) | ((_xx < 720 * k) & (_yy > 815 * k))
_skin = (_h > 5) & (_h < 42) & (_s > 0.12) & (_s < 0.65) & (_v > 0.35) & _zone
_m = cv2.morphologyEx(_skin.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((int(21 * k),) * 2, np.uint8))
_m = cv2.dilate(_m, np.ones((int(15 * k),) * 2, np.uint8)) & _zone.astype(np.uint8)
_small = cv2.resize(_u8, (pw_ // 4, ph_ // 4), interpolation=cv2.INTER_AREA); _ms = cv2.resize(_m, (pw_ // 4, ph_ // 4), interpolation=cv2.INTER_NEAREST)
_fill = cv2.resize(cv2.inpaint(_small, _ms, 12, cv2.INPAINT_TELEA), (pw_, ph_), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
_fill = cv2.GaussianBlur(_fill, (0, 0), 10 * k); _mm = cv2.GaussianBlur(_m.astype(np.float32), (0, 0), 6 * k)[..., None]
# (removal disabled: the inpaint left a pale smear; the new hand fully covers the old one instead)
HR, HA0 = fx.load(fx.V2 + '/sr/palms_x4.png', alpha=True); hk = HR.shape[1] / 1376
HR, HA, _ = fx.hand_alpha(HR, HA0, hk); HA[:, int(688 * hk):] = 0                       # left hand only
TIP = np.array([619, 120]) * hk; WRIST = np.array([176, 767]) * hk
v0 = TIP - WRIST; base_len = np.linalg.norm(v0); base_ang = np.degrees(np.arctan2(v0[0], -v0[1]))
rng = np.random.default_rng(8)
RIB = [dict(c=np.array([rng.uniform(700, 1450), rng.uniform(250, 800)]), r=rng.uniform(120, 340), ph=rng.uniform(0, 6.28), sp=rng.uniform(0.6, 1.3)) for _ in range(6)]
PET = fx3.Petals3D(22, seed=31, xr=(-1.5, 1.5), yr=(-0.9, 0.9), zr=(0.5, 4.5), vel=(0.02, 0.03, 0.0), size=(0.04, 0.08), focus=2.2, dof=8)
MOT = fx.Motes(90, seed=32, box=(500, 150, 1700, 1000), vel=(0, -0.4), spread=0.5, size=(0.5, 1.6))

def hand_at(t):
    u = fx.ease(t / DUR)
    tip = np.array([600, 592]) + np.array([46, -38]) * u + np.array([0, 3 * np.sin(t * 2.2)])
    wrist = np.array([-10, 1130]) + np.array([30, -24]) * u
    v = tip - wrist; L = np.linalg.norm(v); ang = np.degrees(np.arctan2(v[0], -v[1]))
    s = L / base_len
    return fx.affine(s * k, s * k, -(ang - base_ang), tip[0] * k, tip[1] * k, TIP[0], TIP[1])

def frame(i):
    t = i / FPS
    img = P.copy()
    M = hand_at(t)
    hand = cv2.warpAffine(HR, M, (pw_, ph_), flags=cv2.INTER_LINEAR); ha = cv2.warpAffine(HA, M, (pw_, ph_), flags=cv2.INTER_LINEAR)
    yy, xx = np.mgrid[0:ph_, 0:pw_].astype(np.float32)
    warm = 0.9 + 0.35 * np.exp(-(((xx - 760 * k) / (420 * k)) ** 2 + ((yy - 640 * k) / (360 * k)) ** 2))
    hand = hand * warm[..., None] * np.array([1.05, 0.98, 0.9])
    hand = cv2.GaussianBlur(hand, (0, 0), 3.2 * k); ha = cv2.GaussianBlur(ha, (0, 0), 3.2 * k)     # near the lens: soft focus
    img = img * (1 - ha[..., None]) + hand * ha[..., None]
    out = fx.cam(img, 0.5 + 0.06 * fx.ease(t / DUR), 0.5 - 0.02 * fx.ease(t / DUR), 1.0 + 0.06 * fx.ease(t / DUR), border=cv2.BORDER_REPLICATE)
    # flowing sparkle ribbons around her
    rb = np.zeros((H, W), np.float32)
    for r in RIB:
        pts = [r['c'] * 1.148 + np.array([r['r'] * np.cos(a), 0.45 * r['r'] * np.sin(a)]) for a in np.linspace(0, 2 * np.pi, 60) + t * r['sp'] + r['ph']]
        for j, p in enumerate(pts[:40]):
            xi, yi = int(p[0]), int(p[1])
            if 0 <= xi < W and 0 <= yi < H: rb[yi, xi] += (j / 40) * 0.9
    out = out + (cv2.GaussianBlur(rb, (0, 0), 1.6) * 3 + fx.blur(rb, 7) * 6)[..., None] * np.array([1.0, 0.86, 0.56]) * 0.7
    MOT.step(1.0); out = out + MOT.render(t, 0.6)
    PET.step(t, 1 / FPS); PET.render(out, t)
    return fx.finish(fx.bloom(out, 0.82, 20, 0.3), i, vig=0.22, grn=0.010)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.0, 1.5, 2.95]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/present_{t:.2f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/V3_present.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
