"""V3 dawn (3.5 s), reference R2 re-lit: back in the same room at dawn, rain stopped; the viewer's hands hold the same phone,
now showing the PetalPal garden (real app art) and "Your crocus bloomed"."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v3/tools'); import fx, fx3, plates, phone
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 3.5; N = int(round(DUR * FPS))
P = plates.load('R2_phone'); k = plates.to_canvas_scale(P); ph_, pw_ = P.shape[:2]
yy, xx = np.mgrid[0:ph_, 0:pw_].astype(np.float32)
SCREEN = np.float32([[700, 148], [1072, 148], [1126, 862], [732, 884]]) * k
scr_m = np.zeros((ph_, pw_), np.uint8); cv2.fillPoly(scr_m, [np.int32(SCREEN)], 1); SCRM = cv2.GaussianBlur(scr_m.astype(np.float32), (0, 0), 2 * k)
# dawn grade: same room; the night window becomes soft morning light, rain streaks quieted
lum = P @ np.array([0.299, 0.587, 0.114], np.float32)
WINDOW = cv2.GaussianBlur((((xx > 1150 * k) & (yy < 760 * k)) | ((xx > 420 * k) & (xx < 690 * k) & (yy < 330 * k))).astype(np.float32), (0, 0), 24 * k)
soft = cv2.GaussianBlur(P, (0, 0), 7 * k)
dawn_win = (np.array([1.0, 0.90, 0.80]) * (0.55 + 0.5 * np.clip(lum, 0, 1)[..., None])) * 0.9 + 0.1 * soft
room = P * np.array([1.12, 1.02, 0.88]) * 1.08 + 0.05 * np.array([1.0, 0.85, 0.65])
D = room * (1 - WINDOW[..., None]) + (soft * 0.25 + dawn_win * 0.75) * WINDOW[..., None]
D = np.clip(D, 0, 1)
# phone screen: the PetalPal garden
G = fx.load(fx.U + 'mobile/assets/auth/cinematic_v3/stage2_just_inside_hd.jpg')
SWp, SHp = 600, 1200; gw = int(G.shape[0] * SWp / SHp); g0 = (G.shape[1] - gw) // 2
S = cv2.resize(G[:, g0:g0 + gw], (SWp, SHp), interpolation=cv2.INTER_AREA)
top = np.zeros((SHp, SWp), np.float32); top[:230] = 1; S = S * (1 - 0.55 * fx.blur(top, 60)[..., None])
phone.ui_text(S, [('Good morning', 'CormorantGaramond-Italic[wght].ttf', 58, (SWp / 2, 150), (255, 250, 240), 1, 'mm'),
                  ('your garden', 'CormorantGaramond[wght].ttf', 30, (SWp / 2, 205), (250, 244, 235), 0.95, 'mm')])
LOGO = fx.load(fx.V1 + 'keyframes/S19title.png')[430:710, 1235:1515]
CARD = np.zeros((SHp, SWp, 3), np.float32); CA = phone.rounded_card(CARD, (30, SHp - 250, SWp - 30, SHp - 120), 32, (0.98, 0.95, 0.99), 0.94)
lg = cv2.resize(LOGO, (80, 80), interpolation=cv2.INTER_AREA); m = np.zeros((80, 80), np.float32); cv2.circle(m, (40, 40), 39, 1.0, -1)
CARD[SHp - 225:SHp - 145, 56:136] = CARD[SHp - 225:SHp - 145, 56:136] * (1 - m[..., None]) + lg * m[..., None]
phone.ui_text(CARD, [('Your crocus bloomed', 'Poppins-Medium.ttf', 25, (158, SHp - 212), (70, 50, 90), 1, 'la'), ('A letter is kept in your mailbox.', 'Poppins-Regular.ttf', 21, (158, SHp - 172), (90, 75, 100), 1, 'la')])
Hs = cv2.getPerspectiveTransform(np.float32([[0, 0], [SWp, 0], [SWp, SHp], [0, SHp]]), SCREEN)
PET = fx3.Petals3D(12, seed=71, xr=(-1.5, 1.5), yr=(-0.9, 0.9), zr=(0.6, 4.0), vel=(0.02, 0.02, 0.0), size=(0.04, 0.08), focus=1.2, dof=8)

def frame(i):
    t = i / FPS
    s_in = fx.ease((t - 0.7) / 0.5)
    scr = S * (1 - CA[..., None] * s_in) + CARD * (CA[..., None] * s_in)
    sw = cv2.warpPerspective(scr, Hs, (pw_, ph_), flags=cv2.INTER_AREA)
    img = D * (1 - SCRM[..., None]) + sw * SCRM[..., None]
    rays = (0.5 + 0.5 * np.sin(np.arctan2(yy + 300 * k, xx - 1900 * k) * 29 + t * 0.4)) * np.exp(-np.hypot(xx - 1900 * k, yy + 300 * k) / (1700 * k)) * 0.16
    img = img + rays[..., None] * np.array([1.0, 0.88, 0.65])
    out = fx.cam(img, 0.5, 0.5, 1.04 - 0.04 * fx.ease(t / DUR), border=cv2.BORDER_REPLICATE)
    PET.step(t, 1 / FPS); PET.render(out, t)
    fadein = fx.ease(t / 0.4)
    out = out * fadein + np.array([1.0, 0.95, 0.86]) * (1 - fadein)
    return fx.finish(fx.bloom(out, 0.84, 24, 0.3), i, vig=0.22, grn=0.010)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.5, 2.5]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/dawn_{t:.1f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/V3_dawn.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
