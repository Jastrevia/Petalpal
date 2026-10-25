"""S15 (3.0 s): back in the room at dawn; the rain has stopped and warm light comes through the window. The viewer's hands hold the
phone, now open on the PetalPal garden (real app art), where the crocus has bloomed."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx, phone
import os
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 3.0; N = int(DUR * FPS)
S01 = fx.load(fx.V1 + 'keyframes/S01.png')
BG = fx.blur(fx.cam(S01, 0.5, 0.5, 1.06), 18)
lum = BG @ np.array([0.299, 0.587, 0.114], np.float32)
l2 = np.clip((lum - lum.min()) / (lum.max() - lum.min()), 0, 1)[..., None] ** 0.7
BGd = (np.array([0.62, 0.50, 0.52]) * (1 - l2) + np.array([1.0, 0.94, 0.82]) * l2).astype(np.float32)     # dawn: same window, warm and bright
pal = fx.ROOT + '/sr/palms_x4.png'
HR, HA0 = fx.load(pal if os.path.exists(pal) else fx.U + 'mobile/assets/mailbox/fairy_palms_foreground.png', alpha=True); hk = HR.shape[1] / 1376
HR, HA, AURA = fx.hand_alpha(HR, HA0, hk)
BODY, BALPHA, SMASK = phone.body(); SW, SH = phone.SW, phone.SH
G = fx.load(fx.U + 'mobile/assets/auth/cinematic_v3/stage2_just_inside_hd.jpg')            # 1024 x 1536
gw = int(G.shape[0] * SW / SH); g0 = (G.shape[1] - gw) // 2
SCR = cv2.resize(G[:, g0:g0 + gw], (SW, SH), interpolation=cv2.INTER_AREA)
top = np.zeros((SH, SW), np.float32); top[:150] = 1; top = fx.blur(top, 40)
SCR = SCR * (1 - 0.62 * top[..., None]) + np.array([0.98, 0.95, 0.99]) * 0.0
phone.island(SCR)
phone.ui_text(SCR, [('Good morning', 'CormorantGaramond-Italic[wght].ttf', 34, (SW / 2, 98), (255, 250, 240), 1, 'mm'),
                    ('your garden', 'CormorantGaramond[wght].ttf', 18, (SW / 2, 132), (250, 244, 235), 0.95, 'mm')])
LOGO = fx.load(fx.V1 + 'keyframes/S19title.png')[430:710, 1235:1515]
card = np.zeros((SH, SW, 3), np.float32); ca = phone.rounded_card(card, (24, SH - 150, SW - 24, SH - 72), 22, (0.98, 0.95, 0.99), 0.93)
lg = cv2.resize(LOGO, (52, 52), interpolation=cv2.INTER_AREA); m = np.zeros((52, 52), np.float32); cv2.circle(m, (26, 26), 25, 1.0, -1)
card[SH - 137:SH - 85, 40:92] = card[SH - 137:SH - 85, 40:92] * (1 - m[..., None]) + lg * m[..., None]
phone.ui_text(card, [('Your crocus bloomed', 'Poppins-Medium.ttf', 15, (106, SH - 128), (70, 50, 90), 1, 'la'), ('A letter is kept in your mailbox.', 'Poppins-Regular.ttf', 13, (106, SH - 104), (90, 75, 100), 1, 'la')])
CARD, CA = card, ca
P_CX, P_CY = 960, 600
def frame(i):
    t = i / FPS; u = fx.ease(t / DUR)
    img = BGd.copy()
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    ang = np.arctan2(gy + 300, gx + 200); rays = (0.5 + 0.5 * np.sin(ang * 31 + t * 0.4)) * np.exp(-np.hypot(gx + 200, gy + 300) / 1500) * 0.20
    img = img + rays[..., None] * np.array([1.0, 0.86, 0.6])
    MH = fx.affine(1.42 / hk, 1.42 / hk, 0, W / 2, 875, HR.shape[1] / 2, HR.shape[0] / 2)
    hands = np.zeros_like(img); ha = np.zeros((H, W), np.float32)
    hands = cv2.warpAffine(HR, MH, (W, H), flags=cv2.INTER_LINEAR); ha = cv2.warpAffine(HA, MH, (W, H), flags=cv2.INTER_LINEAR)
    hands = hands * (0.98 + 0.12 * np.exp(-((gx - 300) / 900) ** 2))[..., None] * np.array([1.06, 1.0, 0.92])
    img = img * (1 - ha[..., None]) + hands * ha[..., None]
    scr = SCR.copy(); s_in = fx.ease((t - 0.6) / 0.5); a = CA[..., None] * s_in
    scr = scr * (1 - a) + CARD * a
    ph = BODY.copy(); inner = np.zeros_like(ph); inner[phone.BZ:phone.BZ + SH, phone.BZ:phone.BZ + SW] = scr
    ph = ph * (1 - SMASK[..., None]) + inner * SMASK[..., None]
    fx.place(img, ph, BALPHA, fx.affine(1, 1, -2.5, P_CX, P_CY, phone.PW / 2, phone.PH / 2))
    img = fx.cam(img, 0.5, 0.52, 1.0 + 0.04 * u, border=cv2.BORDER_REPLICATE)
    return fx.finish(fx.bloom(img, 0.8, 24, 0.35), i, vig=0.25, grn=0.012)
if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.2, 2.5]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/s15_{t:.1f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/S15_dawn.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
