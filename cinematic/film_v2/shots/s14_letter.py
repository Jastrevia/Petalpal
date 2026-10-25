"""S14 (5.0 s): the fairy's light brings a letter down into the viewer's open palms on the treehouse balcony; the words appear:
"You don't have to have it all figured out today." """
import sys, os, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 5.0; N = int(DUR * FPS)
SRC = fx.load(fx.ROOT + '/sr/mailbox_bg_clean_x4.png')[330:330 + 1728]
BG = fx.grade(fx.blur(cv2.resize(SRC, (W, H), interpolation=cv2.INTER_AREA), 12), gain=0.92, warm=0.4)
pal = fx.ROOT + '/sr/palms_x4.png'
HR, HA0 = fx.load(pal if os.path.exists(pal) else fx.U + 'mobile/assets/mailbox/fairy_palms_foreground.png', alpha=True); hk = HR.shape[1] / 1376
HR, HA, AURA = fx.hand_alpha(HR, HA0, hk)
LR, LA = fx.load(fx.U + 'mobile/assets/auth/invitation_materials_repaired.png', alpha=True); LR, LA = fx.decontam(LR, LA, choke=0.04)
lh, lw = LA.shape
# letter text (drawn into the blank paper)
from PIL import Image, ImageDraw, ImageFont
TXT = [("You don't have to", 470), ('have it all', 600), ('figured out today.', 730)]
TF = ImageFont.truetype(fx.FONTS + 'DancingScript[wght].ttf', 108)
INK = Image.new('L', (lw, lh), 0); d = ImageDraw.Draw(INK); boxes = []
for s, y in TXT:
    bb = d.textbbox((0, 0), s, font=TF); x = (lw - (bb[2] - bb[0])) // 2; d.text((x, y), s, font=TF, fill=255); boxes.append(d.textbbox((x, y), s, font=TF))
INK = cv2.GaussianBlur(np.asarray(INK).astype(np.float32) / 255, (0, 0), 0.8)
ORD = np.full((lh, lw), 9.0, np.float32); px = np.arange(lw)[None].repeat(lh, 0).astype(np.float32)
for k, (x0, y0, x1, y1) in enumerate(boxes):
    m = np.zeros((lh, lw), bool); m[y0 - 25:y1 + 40, x0 - 10:x1 + 10] = True; ORD[m] = k + (px[m] - x0) / (x1 - x0)
LOGO = fx.load(fx.V1 + 'keyframes/S19title.png')[430:710, 1235:1515]
lg = cv2.resize(LOGO, (120, 120), interpolation=cv2.INTER_AREA); lga = fx.clamp01((lg.max(2) - 0.18) / 0.25)
ly0 = 900; LR[ly0:ly0 + 120, lw // 2 - 60:lw // 2 + 60] = LR[ly0:ly0 + 120, lw // 2 - 60:lw // 2 + 60] * (1 - lga[..., None]) + lg * lga[..., None]
INK_COL = np.array([0.36, 0.22, 0.36], np.float32)
pet = fx.Petals(10, seed=61, box=(0, -300, W, H), vel=(0.8, 1.2), size=(26, 50))
mot = fx.Motes(60, seed=62, box=(600, 200, 1320, 900), vel=(0, -0.5), spread=0.5, size=(0.5, 1.5))

def frame(i):
    t = i / FPS
    img = BG.copy()
    # palms rise slightly to receive
    rise = 40 * fx.ease((t - 1.2) / 0.8)
    MH = fx.affine(1.40 / hk, 1.40 / hk, 0, W / 2, 1150 - rise, HR.shape[1] / 2, HR.shape[0] / 2)
    hands = np.zeros_like(img); ha = np.zeros((H, W), np.float32)
    hands = cv2.warpAffine(HR, MH, (W, H), flags=cv2.INTER_LINEAR); ha = cv2.warpAffine(HA, MH, (W, H), flags=cv2.INTER_LINEAR)
    au = np.zeros((H, W), np.float32); au = cv2.warpAffine(AURA, MH, (W, H), flags=cv2.INTER_LINEAR)
    img = img * (1 - ha[..., None]) + hands * 1.04 * ha[..., None] + au[..., None] * np.array([1.0, 0.82, 0.5]) * 0.6
    # the letter floats down and settles
    d_ = fx.ease_out(t / 1.9); y = -520 + (500 + 520) * d_ - rise * fx.ease((t - 1.2) / 0.8) + 6 * np.sin(t * 2) * (1 - d_)
    rot = 7 * np.sin(t * 2.4) * (1 - d_) - 2.0 * d_
    s = 0.62
    ML = fx.affine(s, s, rot, W / 2, y, lw / 2, lh / 2)
    prog = np.interp(t, [2.0, 2.8, 3.4, 4.1], [0, 1, 2, 3]); rev = fx.clamp01((prog - ORD) / 0.04)
    a = INK * rev; letter = LR * (1 - a[..., None] * 0.9) + INK_COL * a[..., None] * 0.9
    sh = np.zeros((H, W), np.float32); sh = cv2.warpAffine(LA, fx.affine(s, s, rot, W / 2 + 14, y + 26, lw / 2, lh / 2), (W, H))
    img = img * (1 - fx.blur(sh, 14)[..., None] * 0.25)
    fx.place(img, letter * 1.02, LA, ML)
    # her light accompanies the letter and then rests above it
    p = np.array([W / 2 + 330 * np.cos(t * 1.4), y - 420 + 60 * np.sin(t * 2.1)]) if t < 2.0 else np.array([W / 2 + 360, 230 + 15 * np.sin(t * 2.2)])
    img = fx.orb(img, p[0], p[1], r=8, gain=1.0, t=t)
    if 0.1 < prog < 3:     # nib glint at the writing front
        k = min(int(prog), 2); x0, y0, x1, y1 = boxes[k]; f = prog - k
        q = ML @ np.array([x0 + (x1 - x0) * f, y1 - 10, 1]); img = fx.orb(img, q[0], q[1], r=4, gain=0.8, t=t)
    mot.step(1.0); img = img + mot.render(t, 0.5)
    pet.step(t); pet.render(img, t, 0.8)
    img = fx.grade(img, warm=0.25, sat=1.0)
    return fx.finish(fx.bloom(img, 0.82, 20, 0.32), i, vig=0.3, grn=0.012)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.6, 1.6, 2.6, 4.6]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/s14_{t:.1f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/S14_letter.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
