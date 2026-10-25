"""Free compositing for the contact scene, all in the room of still SA (2752x1536 work canvas, 1920x1080 output).
- screens: the exact PetalPal notification and the glowing invitation on SA's phone screen
- a01_frame(i): the ACCEPTED fairy performance (A01, unmodified source) keyed off its paper, placed above the phone in SA's
  room, emerging from the screen light; the app invitation card hovers beside her (she takes it in shot C)."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v31/tools'); import roomkey as rk
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx, phone
from PIL import Image, ImageDraw, ImageFont
C = '/mnt/user-data/outputs/contact/'
OW, OH = 1920, 1080
SA = fx.load(C + 'stills/contact_SA.png'); KH, KW = SA.shape[:2]; k = OW / KW
SCREEN = np.float32([[1181, 514], [1566, 514], [1566, 1338], [1181, 1338]])
SCR_W, SCR_H = 385 * 2, 824 * 2
def rr(w, h, r):
    im = Image.new('L', (w, h), 0); ImageDraw.Draw(im).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255); return np.asarray(im).astype(np.float32) / 255
SMASK = rr(SCR_W, SCR_H, 96)
Hs = cv2.getPerspectiveTransform(np.float32([[0, 0], [SCR_W, 0], [SCR_W, SCR_H], [0, SCR_H]]), SCREEN)
WALL = cv2.warpPerspective(SA, np.linalg.inv(Hs), (SCR_W, SCR_H), flags=cv2.INTER_CUBIC)       # SA's own wallpaper, flattened
LOGO = fx.load(fx.V1 + 'keyframes/S19title.png')[430:710, 1235:1515]
def text(img, items):
    h, w = img.shape[:2]
    for txt, fnt, size, (x, y), col, al, anchor in items:
        L = Image.new('L', (w, h), 0); ImageDraw.Draw(L).text((x, y), txt, font=fx.font(fnt, size), fill=255, anchor=anchor)
        a = np.asarray(L).astype(np.float32) / 255 * al; img[:] = img * (1 - a[..., None]) + np.array(col, np.float32) / 255 * a[..., None]
def notif_screen():
    s = WALL.copy()
    y0, y1 = 520, 760; card = rr(SCR_W - 60, y1 - y0, 46)
    s[y0:y1, 30:SCR_W - 30] = s[y0:y1, 30:SCR_W - 30] * (1 - card[..., None] * 0.94) + np.array([0.97, 0.94, 0.99]) * card[..., None] * 0.94
    lg = cv2.resize(LOGO, (120, 120), interpolation=cv2.INTER_AREA); m = rr(120, 120, 60)
    s[y0 + 60:y0 + 180, 70:190] = s[y0 + 60:y0 + 180, 70:190] * (1 - m[..., None]) + lg * m[..., None]
    text(s, [('PetalPal', 'Poppins-Medium.ttf', 38, (220, y0 + 50), (70, 50, 90), 1, 'la'), ('now', 'Poppins-Regular.ttf', 30, (SCR_W - 70, y0 + 54), (120, 105, 130), 1, 'ra'),
             ('A letter is waiting for you', 'Poppins-Regular.ttf', 34, (220, y0 + 112), (70, 58, 80), 1, 'la'), ('in your garden', 'Poppins-Regular.ttf', 34, (220, y0 + 160), (70, 58, 80), 1, 'la')])
    halo = np.zeros((SCR_H, SCR_W), np.float32); halo[y0:y1, 30:SCR_W - 30] = card; halo = cv2.GaussianBlur(halo, (0, 0), 30)
    return s + (halo * (1 - card_full(y0, y1)) * 0.35)[..., None] * np.array([0.7, 0.55, 0.95])
def card_full(y0, y1):
    m = np.zeros((SCR_H, SCR_W), np.float32); m[y0:y1, 30:SCR_W - 30] = rr(SCR_W - 60, y1 - y0, 46); return m
CR, CA = fx.load(fx.U + 'mobile/assets/auth/invitation_card_composite.png', alpha=True); CR, CA = fx.decontam(CR, CA, choke=0.05)
def invite_screen(glow=1.0):
    yy = np.linspace(0, 1, SCR_H)[:, None, None]
    s = np.repeat((1 - yy) * np.array([0.42, 0.33, 0.62]) + yy * np.array([0.98, 0.80, 0.62]), SCR_W, axis=1).astype(np.float32)
    ch = int(SCR_H * 0.52); cw = int(CR.shape[1] * ch / CR.shape[0]); c = cv2.resize(CR, (cw, ch), interpolation=cv2.INTER_AREA); ca = cv2.resize(CA, (cw, ch), interpolation=cv2.INTER_AREA)
    x0 = (SCR_W - cw) // 2; y0 = int(SCR_H * 0.17)
    s[y0:y0 + ch, x0:x0 + cw] = s[y0:y0 + ch, x0:x0 + cw] * (1 - ca[..., None]) + c * ca[..., None]
    g = np.zeros((SCR_H, SCR_W), np.float32); g[y0:y0 + ch, x0:x0 + cw] = ca; g = cv2.GaussianBlur(g, (0, 0), 60)
    yy2, xx2 = np.mgrid[0:SCR_H, 0:SCR_W].astype(np.float32); core = np.exp(-(((xx2 - SCR_W / 2) / 260) ** 2 + ((yy2 - SCR_H * 0.48) / 420) ** 2))
    return np.clip(s + (g * 0.28 + core * 0.22 * glow)[..., None] * np.array([1.0, 0.88, 0.62]), 0, 1.3)
def put_screen(base, scr, spill=0.0):
    out = base.copy()
    w = cv2.warpPerspective(scr, Hs, (KW, KH), flags=cv2.INTER_AREA); m = cv2.warpPerspective(SMASK, Hs, (KW, KH), flags=cv2.INTER_LINEAR)
    out = out * (1 - m[..., None]) + w * m[..., None]
    if spill > 0:                                                         # warm light from the screen onto hands, sill and room
        yy, xx = np.mgrid[0:KH, 0:KW].astype(np.float32); c = SCREEN.mean(0)
        L = np.exp(-(((xx - c[0]) / 700) ** 2 + ((yy - c[1]) / 620) ** 2)) * spill
        out = out + L[..., None] * np.array([1.0, 0.84, 0.58]) * 0.25 * (1 - m[..., None])
    return out
def to_out(img): return cv2.resize(np.clip(img, 0, 1), (OW, OH), interpolation=cv2.INTER_AREA)

SA_LOCK = to_out(SA)
SA_NOTIF = to_out(put_screen(SA, notif_screen()))
SA_INV = to_out(put_screen(SA, invite_screen(1.0), spill=0.6))
# ---------- the accepted fairy (A01) in this room, above the phone
A01 = '/mnt/user-data/outputs/perf_test/glide_review/glide_v1_7s_retimed.mp4'
PLATE = to_out(put_screen(SA, invite_screen(1.25), spill=0.9))            # the screen stays an open, glowing portal while she is out
PLATE_SOFT = fx.blur(PLATE, 3.0)
yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
FG = np.zeros((OH, OW), np.float32)                                      # the viewer's hands + phone stay sharp (near), room softens
_m = cv2.imread(C + 'frames/FG_mask_SA.png', 0).astype(np.float32) / 255           # viewer's hands, sleeves and phone (nearest to the eyes)
FG = cv2.GaussianBlur(cv2.resize(_m, (OW, OH), interpolation=cv2.INTER_AREA), (0, 0), 1.5)
BG_ROOM = PLATE_SOFT * (1 - FG[..., None]) + PLATE * FG[..., None]
def a01_canvas(f):
    s = max(OW / f.shape[1], OH / f.shape[0]); f = cv2.resize(f, (int(round(f.shape[1] * s)), int(round(f.shape[0] * s))), interpolation=cv2.INTER_CUBIC)
    x0 = (f.shape[1] - OW) // 2; y0 = (f.shape[0] - OH) // 2; return cv2.cvtColor(f[y0:y0 + OH, x0:x0 + OW], cv2.COLOR_BGR2RGB).astype(np.float32) / 255
def place_fairy(i, N=168):
    """A01 frame i -> (fg, alpha) in output canvas. Scale grows a little as she comes toward the viewer (on top of A01's own growth)."""
    u = fx.ease(i / (N - 1))
    s = 0.50 + 0.25 * u
    tx = 686 + (647 - 686) * u; ty = 136 + (25 - 136) * u                 # beside the phone, in front of the window -> toward the viewer
    return s, tx, ty
_cap = None
def a01_frame(i, with_card=True, light=1.0):
    global _cap
    if _cap is None: _cap = cv2.VideoCapture(A01)
    _cap.set(cv2.CAP_PROP_POS_FRAMES, i); ok, f = _cap.read()
    src = a01_canvas(f); fg, a = rk.fairy_key(src)
    s, tx, ty = place_fairy(i)
    M = np.float32([[s, 0, tx], [0, s, ty]])
    fgw = cv2.warpAffine(fg, M, (OW, OH), flags=cv2.INTER_AREA); aw = cv2.warpAffine(a, M, (OW, OH), flags=cv2.INTER_AREA)
    out = BG_ROOM.copy()
    # portal light behind and below her (she has just come out of the screen)
    c = SCREEN.mean(0) * k
    out = out + (np.exp(-(((xx - c[0]) / 330) ** 2 + ((yy - (c[1] - 250)) / 420) ** 2)) * 0.20 * light)[..., None] * np.array([1.0, 0.86, 0.6])
    out = rk.composite(fgw, aw, out, glow=0.25, rim=0.55)
    # warm key light on her from the portal below
    out = out + (aw * np.clip((yy - 200) / 900, 0, 1) * 0.10 * light)[..., None] * np.array([1.0, 0.85, 0.6])
    out = out * (1 - FG[..., None]) + BG_ROOM * FG[..., None]               # the viewer's hands and phone are nearer than she is
    if with_card:
        ys, xs = np.nonzero(aw > 0.5)
        if len(xs):
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
            cx = x1 - 0.05 * (x1 - x0) + 8 * np.sin(i / 24 * 1.7); cy = y0 + 0.62 * (y1 - y0) + 10 * np.sin(i / 24 * 2.3)
            ch = 0.20 * (y1 - y0) + 40; cw = ch * CR.shape[1] / CR.shape[0]
            ang = 8 * np.sin(i / 24 * 1.1) - 6
            Mc = fx.affine(ch / CR.shape[0], ch / CR.shape[0], ang, cx, cy, CR.shape[1] / 2, CR.shape[0] / 2)
            g = cv2.warpAffine(CA, Mc, (OW, OH)); out = out + fx.blur(g, 22)[..., None] * np.array([1.0, 0.85, 0.55]) * 0.35
            fx.place(out, CR * 1.04, CA, Mc)
    return np.clip(out, 0, 1.2), aw

def save(img, p): fx.save(np.clip(img, 0, 1), p)
if __name__ == '__main__':
    save(SA_LOCK, C + 'frames/A_start.png'); save(SA_INV, C + 'frames/A_end.png'); save(SA_NOTIF, C + 'frames/A_notif_ref.png')
    f0, _ = a01_frame(0); save(f0, C + 'frames/B_end_A01_f000.png')
    f1, _ = a01_frame(167); save(f1, C + 'frames/C_start_A01_f167.png')
    print('frames written')
