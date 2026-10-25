"""S02 (8.7 s): first person, the rainy night. The viewer's hands hold the phone; a PetalPal notification arrives, a tap opens
the invitation, and the card lifts off the screen toward the viewer until its light fills the frame (cut to the accepted A01).
python s02_phone.py [stills]"""
import sys, os, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx, phone
from PIL import Image
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 8.7; N = int(round(DUR * FPS))
SR = fx.ROOT + '/sr/'
# ---------------- plates
S01 = fx.load(fx.V1 + 'keyframes/S01.png')
BG = fx.blur(fx.cam(S01, 0.5, 0.5, 1.06), 16)
BGc = fx.grade(BG, gain=0.62, gamma=0.95, sat=0.9, tint=(0.92, 0.97, 1.08))
BGw = fx.grade(BG, gain=0.95, gamma=1.05, sat=1.0, warm=1.5)
pal_path = SR + 'palms_x4.png' if os.path.exists(SR + 'palms_x4.png') else fx.U + 'mobile/assets/mailbox/fairy_palms_foreground.png'
HR, HA0 = fx.load(pal_path, alpha=True); hk = 1376 / HR.shape[1]; HR, HA, AURA = fx.hand_alpha(HR, HA0, 1 / hk)
card_path = SR + 'invitation_card_x4.png' if os.path.exists(SR + 'invitation_card_x4.png') else fx.U + 'mobile/assets/auth/invitation_card_composite.png'
CR, CA = fx.load(card_path, alpha=True); CR, CA = fx.decontam(CR, CA, choke=0.05); ck = CR.shape[1] / 608           # card px per original px
# card text (drawn into the blank paper area of the card art)
def card_with_text():
    rgb = CR.copy()
    lines = [("You're invited", 'CormorantGaramond-Italic[wght].ttf', 58, (92, 64, 98), 300),
             ('to a garden where', 'CormorantGaramond[wght].ttf', 30, (110, 86, 104), 392),
             ('every feeling may bloom', 'CormorantGaramond[wght].ttf', 30, (110, 86, 104), 432),
             ('PetalPal', 'CormorantGaramond-Italic[wght].ttf', 30, (150, 118, 72), 540)]
    for txt, f, size, col, y in lines:
        trgb, ta = fx.text_layer([txt], f, int(size * ck), color=col)
        th, tw = ta.shape; x0 = int(304 * ck - tw / 2); y0 = int(y * ck - th / 2)
        sub = rgb[y0:y0 + th, x0:x0 + tw]; sub[:] = sub * (1 - ta[..., None] * 0.92) + trgb * ta[..., None] * 0.92
    return rgb
CARD = card_with_text()
LOGO = fx.load(fx.V1 + 'keyframes/S19title.png')[430:710, 1235:1515]
# ---------------- phone
BODY, BALPHA, SMASK = phone.body()
SW, SH = phone.SW, phone.SH

def lock_screen():
    s = np.zeros((SH, SW, 3), np.float32); yy = np.linspace(0, 1, SH)[:, None, None]
    s[:] = (1 - yy) * np.array([0.10, 0.10, 0.20]) + yy * np.array([0.20, 0.12, 0.22])
    rng = np.random.default_rng(4); dots = np.zeros((SH, SW), np.float32)
    for _ in range(40): cv2.circle(dots, (int(rng.uniform(0, SW)), int(rng.uniform(0, SH))), int(rng.uniform(6, 22)), float(rng.uniform(0.2, 0.6)), -1)
    s += fx.blur(dots, 9)[..., None] * np.array([0.35, 0.3, 0.45])
    phone.island(s)
    phone.ui_text(s, [('Tuesday', 'Poppins-Regular.ttf', 17, (SW / 2, 118), (225, 222, 240), 0.85, 'mm'),
                      ('11:47', 'Poppins-Light.ttf', 86, (SW / 2, 182), (240, 236, 250), 0.95, 'mm')])
    notes = [('Messages', '12 unread messages', 'now'), ('Calendar', 'Deadline · tomorrow 9:00', '2h ago'), ('Mail', 'Re: Re: updated timeline', '4h ago')]
    for k, (a, b, c) in enumerate(notes):
        y = 404 + k * 92
        phone.rounded_card(s, (16, y, SW - 16, y + 80), 20, (0.32, 0.31, 0.38), 0.55)
        phone.ui_text(s, [(a, 'Poppins-Medium.ttf', 14, (34, y + 18), (230, 228, 236), 0.9, 'la'), (c, 'Poppins-Regular.ttf', 12, (SW - 30, y + 19), (190, 188, 200), 0.8, 'ra'),
                          (b, 'Poppins-Regular.ttf', 14, (34, y + 44), (215, 212, 222), 0.85, 'la')])
    return s
LOCK = lock_screen()

def pp_note():
    """the PetalPal notification card (rgb, alpha) sized to the screen width"""
    h = 96; rgb = np.zeros((h, SW, 3), np.float32); a = np.zeros((h, SW), np.float32)
    tmp = np.zeros((h, SW, 3), np.float32); al = phone.rounded_card(tmp, (12, 4, SW - 12, h - 4), 22, (0.97, 0.94, 0.99), 0.96)
    lg = cv2.resize(LOGO, (52, 52), interpolation=cv2.INTER_AREA); m = np.zeros((52, 52), np.float32)
    cv2.circle(m, (26, 26), 25, 1.0, -1); m = cv2.GaussianBlur(m, (0, 0), 0.8)
    tmp[22:74, 26:78] = tmp[22:74, 26:78] * (1 - m[..., None]) + lg * m[..., None]
    phone.ui_text(tmp, [('PetalPal', 'Poppins-Medium.ttf', 15, (92, 24), (70, 50, 90), 1, 'la'), ('now', 'Poppins-Regular.ttf', 12, (SW - 28, 26), (120, 105, 130), 0.9, 'ra'),
                        ('A letter is waiting for you', 'Poppins-Regular.ttf', 14, (92, 48), (70, 58, 80), 1, 'la'), ('in your garden.', 'Poppins-Regular.ttf', 14, (92, 68), (70, 58, 80), 1, 'la')])
    return tmp, al
PPR, PPA = pp_note()

def invite_screen():
    s = np.zeros((SH, SW, 3), np.float32); yy = np.linspace(0, 1, SH)[:, None, None]
    s[:] = (1 - yy) * np.array([0.80, 0.74, 0.92]) + yy * np.array([0.99, 0.86, 0.78])
    phone.island(s); return s
INV = invite_screen()
CARD_ON_SCREEN_H = 400                          # card height inside the screen (px)

def screen_at(t):
    """screen image (SH,SW,3) and whether the card is drawn on screen"""
    if t < 2.6:
        s = LOCK.copy()
        if t > 0.8:                                 # notification slides in
            u = fx.ease_out((t - 0.8) / 0.45); y = int(-110 + u * (300 + 110))
            glow = 0.5 + 0.5 * np.sin((t - 0.8) * 4.0)
            y0, y1 = max(0, y), min(SH, y + PPR.shape[0])
            if y1 > y0:
                a = PPA[y0 - y:y1 - y][..., None]
                s[y0:y1] = s[y0:y1] * (1 - a) + PPR[y0 - y:y1 - y] * a
                # lavender halo around the card
                hal = np.zeros((SH, SW), np.float32); hal[y0:y1, 8:SW - 8] = 1; hal = fx.blur(hal, 14) * (0.25 + 0.2 * glow) * u
                s += hal[..., None] * np.array([0.55, 0.42, 0.75])
            if t > 2.15:                            # tap ripple
                r = (t - 2.15) / 0.45; yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32)
                d = np.hypot(xx - SW * 0.42, yy - (300 + 48)); ring = np.exp(-((d - r * 120) ** 2) / (2 * 8 ** 2)) * (1 - fx.clamp01(r)) * 0.8
                s += ring[..., None] * np.array([1, 1, 1]) + np.exp(-d ** 2 / (2 * 30 ** 2))[..., None] * 0.25 * (1 - fx.clamp01(r))
        return s, False
    u = fx.ease((t - 2.6) / 0.6)
    return LOCK * (1 - u) + INV * u, True

# card placement on canvas when lying on the screen
P_CX, P_CY, P_ROT = 960, 592, -3.0
def phone_M(t):
    sh = 2.0 * np.sin(t * 90) * fx.win(t, 0.8, 0.82, 1.05, 1.15)          # haptic buzz
    return fx.affine(1, 1, P_ROT, P_CX + sh, P_CY, phone.PW / 2, phone.PH / 2)

rng = np.random.default_rng(9)
STREAKS = [dict(x=rng.uniform(0, W), y=rng.uniform(-400, H), v=rng.uniform(1.2, 3.2), l=rng.uniform(40, 120)) for _ in range(26)]
motes = fx.Motes(110, seed=5, box=(P_CX - 240, P_CY - 300, P_CX + 240, P_CY + 260), vel=(0, -1.6), spread=0.9, size=(0.7, 2.2))

def frame(i):
    t = i / FPS
    lift = fx.ease((t - 4.4) / 2.3)                 # 0..1 card travels toward the viewer
    flood = fx.ease((t - 6.75) / 1.05)                # light fills frame
    warm = fx.ease((t - 3.2) / 2.5)
    # background: defocused rainy window, warming as the invitation glows
    img = BGc * (1 - warm) + BGw * warm
    st = np.zeros((H, W), np.float32)
    for s in STREAKS:
        y = (s['y'] + s['v'] * i) % (H + 400) - 200
        cv2.line(st, (int(s['x']), int(y)), (int(s['x'] + 2), int(y + s['l'])), 0.35, 3)
    img = img + fx.blur(st, 6)[..., None] * np.array([0.5, 0.6, 0.75]) * (1 - 0.6 * warm)
    img = fx.cam(img, 0.5, 0.5, 1.0 + 0.02 * t / DUR)
    # screen brightness: dim lock screen, brighter when the notification glows, bright on the invitation
    sb = 0.55 + 0.2 * fx.ease((t - 0.8) / 0.4) + 0.15 * fx.ease((t - 2.6) / 0.8)
    scr, card_on = screen_at(t)
    ph = BODY.copy(); ph_a = BALPHA.copy()
    inner = np.zeros_like(ph); inner[phone.BZ:phone.BZ + SH, phone.BZ:phone.BZ + SW] = scr * sb
    ph = ph * (1 - SMASK[..., None]) + inner * SMASK[..., None]
    # hands, lit by the screen
    hands = np.zeros((H, W, 3), np.float32); MH = fx.affine(1.42 * hk, 1.42 * hk, 0, W / 2, 875, HR.shape[1] / 2, HR.shape[0] / 2); ha = fx.place(hands, HR, HA, MH)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    glow = np.exp(-(((xx - P_CX) / 520) ** 2 + ((yy - P_CY) / 470) ** 2))
    light = (0.30 + 0.25 * warm) + glow * (0.55 * sb + 0.35 * warm)
    tint = np.array([0.93, 0.95, 1.06]) * (1 - warm) + np.array([1.08, 0.98, 0.86]) * warm
    hands = hands * light[..., None] * tint
    img = img * (1 - ha[..., None]) + hands * ha[..., None]
    aura = np.zeros((H, W), np.float32); aura = cv2.warpAffine(AURA, MH, (W, H), flags=cv2.INTER_LINEAR)
    img = img + fx.blur(aura, 3)[..., None] * np.array([1.0, 0.8, 0.45]) * (0.9 * warm)
    # screen light spill on the room (soft)
    img = img + fx.blur((glow * 0.10 * sb)[..., None] * np.ones(3), 1)
    M = phone_M(t); pa = fx.place(img, ph, ph_a, M)
    # depth of field + dim on hands/phone while the card comes forward
    if lift > 0:
        img = fx.blur(img, 14 * lift) * (1 - 0.35 * lift) + 0.0
    # card: on the screen, then lifting toward the viewer
    if card_on:
        appear = fx.ease((t - 2.8) / 0.6)
        base_s = CARD_ON_SCREEN_H / CR.shape[0]
        k = base_s * (1 + lift ** 1.5 * 4.2)
        cx = P_CX + (W / 2 - P_CX) * lift; cy = P_CY - 10 + (H / 2 - 6 - (P_CY - 10)) * lift
        rot = P_ROT * (1 - lift) + 1.5 * np.sin(lift * 3.1) * (1 - lift)
        Mc = fx.affine(k, k * (0.92 + 0.08 * lift), rot, cx, cy, CR.shape[1] / 2, CR.shape[0] / 2)
        glowc = fx.win(t, 3.0, 3.8, 9, 10)
        if lift > 0.02:   # soft shadow/glow under the card in the air
            g = np.zeros((H, W), np.float32); g = cv2.warpAffine(CA, Mc, (W, H), flags=cv2.INTER_LINEAR)
            img = img + fx.blur(g, 30 + 40 * lift)[..., None] * np.array([1.0, 0.85, 0.6]) * 0.35 * glowc
        burn = fx.ease((lift - 0.78) / 0.22); crd = CARD * (1 + 0.06 * glowc) * (1 - burn) + (fx.PAPER * 1.08)[None, None] * burn
        fx.place(img, crd, CA * appear, Mc)
        if lift < 0.02:   # halo on the screen while the card glows
            g = np.zeros((H, W), np.float32); g = cv2.warpAffine(CA, Mc, (W, H), flags=cv2.INTER_LINEAR)
            img = img + fx.blur(g, 24)[..., None] * np.array([1.0, 0.85, 0.6]) * 0.28 * glowc * appear
    # gold motes rising from the invitation
    mg = fx.win(t, 3.0, 3.8, 7.6, 8.4)
    if mg > 0:
        motes.step(1.0); img = img + motes.render(t, 0.9 * mg)
    # light flood into the paper of the fairy's world, sparkle where she appears
    if flood > 0:
        img = img * (1 - flood) + fx.PAPER[None, None] * flood
    sp = fx.ease((t - 7.5) / 1.0)
    if sp > 0:   # golden glow where she will appear: tinted (visible on the bright paper), white core
        yy2, xx2 = np.mgrid[0:H, 0:W].astype(np.float32); d2 = (xx2 - 1300) ** 2 + (yy2 - 470) ** 2
        halo = np.exp(-d2 / (2 * (60 + 140 * sp) ** 2)) * sp * (1 - 0.6 * fx.ease((t - 8.3) / 0.4))
        img = img * (1 - halo[..., None] * np.array([0.0, 0.10, 0.30]))
        img = fx.orb(img, 1300, 470, r=4 + 10 * sp, gain=0.5 + 0.8 * sp, t=t)
    if i >= N - 2: img = img + (0.35 if i == N - 1 else 0.18)
    img = fx.bloom(img, 0.8, 20, (0.3 + 0.25 * warm) * (1 - flood))
    return fx.finish(img, i, vig=0.32 * (1 - flood), grn=0.014)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'stills':
        for t in [0.3, 1.2, 2.3, 3.6, 5.2, 6.3, 7.4, 8.4]:
            fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/s02_{t:.1f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/S02_phone.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
