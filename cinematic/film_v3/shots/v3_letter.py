"""V3 treehouse letter (8.0 s), reference R6, one continuous first-person shot in one space:
1. the envelope emerges from the glowing treehouse mailbox, 2. floats toward the viewer, 3. the viewer's hands rise to
receive it, 4. fingers make contact, 5. the viewer holds it; the wax seal glows and opens, 6. the letter rises out and the
comforting message is written. The envelope, hands and mailbox are all cut from R6 itself, so they share its light and
geometry; the final held pose is R6's own composition."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v3/tools'); import fx, fx3, plates
from PIL import Image, ImageDraw, ImageFont
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 8.0; N = int(DUR * FPS)
P0 = plates.load('R6_mailbox'); P = cv2.resize(P0, (W, H), interpolation=cv2.INTER_CUBIC) if P0.shape[1] < W else cv2.resize(P0, (W, H), interpolation=cv2.INTER_AREA)
k = W / 1672.0
def K(pts): return np.float32(pts) * k
ENVQ = K([[695, 312], [1138, 398], [1088, 708], [626, 602]])                   # envelope corners in R6 (TL, TR, BR, BL)
LHAND = K([[430, 941], [445, 800], [470, 640], [500, 520], [560, 480], [640, 470], [660, 520], [705, 505], [742, 560], [745, 640], [700, 720], [640, 760], [600, 941]])
RHAND = K([[1040, 380], [1110, 372], [1190, 380], [1260, 430], [1320, 560], [1400, 700], [1520, 941], [1180, 941], [1150, 760], [1115, 640], [1080, 560], [1060, 470]])
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
u8 = (P * 255).astype(np.uint8); hsv = cv2.cvtColor(u8, cv2.COLOR_RGB2HSV).astype(np.float32); hh, ss, vv = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
skin = ((hh > 5) & (hh < 40) & (ss > 0.17) & (ss < 0.6) & (vv > 0.45)).astype(np.uint8)
def poly(p):
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.int32(p)], 1); return m
env_m = poly(ENVQ); hands_poly = poly(LHAND) | poly(RHAND)
# hands = skin inside the hand polygons (includes the thumbs lying on the envelope); sleeves below are part of the hands
sleeve = ((yy > 760 * k) & hands_poly.astype(bool)).astype(np.uint8)
_inner = cv2.erode(env_m, np.ones((int(40 * k),) * 2, np.uint8))      # deep inside the envelope: never hand
HMb = (((hands_poly & skin) | sleeve) & (1 - _inner)).astype(np.uint8)
HMb = cv2.morphologyEx(HMb, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)); HMb = cv2.morphologyEx(HMb, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
HM = cv2.GaussianBlur(HMb.astype(np.float32), (0, 0), 1.6)
# empty balcony: R6 with the envelope and hands removed (low-res inpaint, softened - the area is out of focus anyway)
hole = cv2.dilate((env_m | hands_poly).astype(np.uint8), np.ones((25, 25), np.uint8))
small = cv2.inpaint(cv2.resize(u8, (W // 4, H // 4), interpolation=cv2.INTER_AREA), cv2.resize(hole, (W // 4, H // 4), interpolation=cv2.INTER_NEAREST), 8, cv2.INPAINT_TELEA)
fill = cv2.GaussianBlur(cv2.resize(small, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255, (0, 0), 9)
hm_soft = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 8)[..., None]
fill = fill * np.array([0.92, 0.86, 0.80]) * (0.86 + 0.28 * cv2.resize(fx.value_noise((270, 480), 60, seed=11), (W, H))[..., None])
EMPTY = P * (1 - hm_soft) + fill * hm_soft
# flat envelope texture (rectified), with the thumbs painted out
EW, EH = 900, 600
Hrect = cv2.getPerspectiveTransform(ENVQ, np.float32([[0, 0], [EW, 0], [EW, EH], [0, EH]]))
ENV = cv2.warpPerspective(P, Hrect, (EW, EH), flags=cv2.INTER_CUBIC)
thumbs = cv2.warpPerspective(HMb.astype(np.float32), Hrect, (EW, EH)) > 0.3
thumbs = cv2.dilate(thumbs.astype(np.uint8), np.ones((15, 15), np.uint8))
_paper = np.median(ENV[EH // 3:2 * EH // 3, EW // 3:2 * EW // 3].reshape(-1, 3), 0)
_tm = cv2.GaussianBlur(thumbs.astype(np.float32), (0, 0), 4)[..., None]
_tex = ENV[EH // 3:EH // 3 + 1, :].mean() * 0 + _paper * (0.97 + 0.06 * fx.value_noise((EH, EW), 40, seed=2)[..., None])
ENV = ENV * (1 - _tm) + _tex * _tm
EA = np.ones((EH, EW), np.float32); EA[:3] = EA[-3:] = 0; EA[:, :3] = EA[:, -3:] = 0; EA = cv2.GaussianBlur(EA, (0, 0), 1.2)
SEAL = np.array([0.505, 0.33])                                                 # wax seal position on the flat envelope (u,v)
# the letter (PetalPal letter paper) with the message
LR, LA = fx.load(fx.U + 'mobile/assets/auth/invitation_materials_repaired.png', alpha=True); LR, LA = fx.decontam(LR, LA, choke=0.04); lh, lw = LA.shape
TF = ImageFont.truetype(fx.FONTS + 'DancingScript[wght].ttf', 108)
INK = Image.new('L', (lw, lh), 0); d = ImageDraw.Draw(INK); boxes = []
for s_, y in [("You don't have to", 470), ('have it all', 600), ('figured out today.', 730)]:
    bb = d.textbbox((0, 0), s_, font=TF); x = (lw - (bb[2] - bb[0])) // 2; d.text((x, y), s_, font=TF, fill=255); boxes.append(d.textbbox((x, y), s_, font=TF))
INK = cv2.GaussianBlur(np.asarray(INK).astype(np.float32) / 255, (0, 0), 0.8)
ORD = np.full((lh, lw), 9.0, np.float32); pxg = np.arange(lw)[None].repeat(lh, 0).astype(np.float32)
for kk, (x0, y0, x1, y1) in enumerate(boxes):
    m = np.zeros((lh, lw), bool); m[y0 - 25:y1 + 40, x0 - 10:x1 + 10] = True; ORD[m] = kk + (pxg[m] - x0) / (x1 - x0)
INK_COL = np.array([0.36, 0.22, 0.36], np.float32)
MOUTH = K([575, 300]); STREAM_MASK = cv2.GaussianBlur(poly(K([[470, 170], [700, 120], [1300, 300], [1330, 380], [700, 470], [470, 450]])).astype(np.float32), (0, 0), 30)
PET = fx3.Petals3D(22, seed=61, xr=(-1.5, 1.5), yr=(-0.9, 0.9), zr=(0.5, 4.5), vel=(0.02, 0.03, 0.0), size=(0.04, 0.08), focus=1.6, dof=8)
MOT = fx.Motes(130, seed=62, box=(400, 120, 1500, 800), vel=(0.6, -0.4), spread=0.7, size=(0.5, 1.8))
NZ = fx.value_noise((540, 1920), 120, seed=4)

def quad_at(t):
    """envelope corners over time: emerges from the mailbox mouth, arcs toward the viewer, lands on R6's held pose."""
    u = fx.ease((t - 0.35) / 2.45)
    c0 = MOUTH + K([10, 20]); c1 = ENVQ.mean(0)
    ctr = c0 + (c1 - c0) * u + K([0, -110]) * np.sin(np.pi * u)            # gentle arc
    sc = 0.22 + 0.78 * u ** 0.9
    ang = (1 - u) * -28 + 6 * np.sin(t * 2.0) * (1 - u)
    tilt = (1 - u) * 0.55                                                  # starts edge-on (perspective), turns to face the viewer
    base = ENVQ - c1
    c, s = np.cos(np.radians(ang)), np.sin(np.radians(ang)); R = np.array([[c, -s], [s, c]])
    q = (base * sc) @ R.T
    q[:, 0] *= (1 - tilt * 0.6)
    q[[0, 3], 1] *= (1 - tilt * 0.4); q[[1, 2], 1] *= (1 + tilt * 0.15)
    return np.float32(q + ctr), u

def frame(i):
    t = i / FPS
    bgmix = fx.ease((t - 2.55) / 0.35)
    img = EMPTY * (1 - bgmix) + P * bgmix          # once everything has landed in R6's pose, the true R6 pixels sit behind it
    # living mailbox light stream
    flow = np.roll(NZ, int(t * 160), axis=1)[:, :W]; flow = cv2.resize(flow, (W, H))
    img = img + (STREAM_MASK * (0.12 + 0.18 * flow))[..., None] * np.array([1.0, 0.82, 0.5])
    # hands rise into frame (1.4-2.8 s) and receive
    rise = fx.ease((t - 1.0) / 1.8)
    q, u = quad_at(t)
    landed = t >= 2.8
    hold = fx.ease((t - 2.8) / 0.3)
    offs = (1 - rise) * 250 * k
    Mh = np.float32([[1, 0, 0], [0, 1, offs]])
    hands = cv2.warpAffine(P, Mh, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE); ha = cv2.warpAffine(HM, Mh, (W, H))
    # breathing hold after contact
    bob = np.float32([[1, 0, 0], [0, 1, 3 * k * np.sin(t * 2.0) * hold]])
    # envelope: perspective-warp the flat texture to its current corners
    Hq = cv2.getPerspectiveTransform(np.float32([[0, 0], [EW, 0], [EW, EH], [0, EH]]), q)
    env = cv2.warpPerspective(ENV, Hq, (W, H), flags=cv2.INTER_LINEAR); ea = cv2.warpPerspective(EA, Hq, (W, H))
    if hold > 0: env = cv2.warpAffine(env, bob, (W, H)); ea = cv2.warpAffine(ea, bob, (W, H)); hands = cv2.warpAffine(hands, bob, (W, H)); ha = cv2.warpAffine(ha, bob, (W, H))
    glow_e = cv2.GaussianBlur(ea, (0, 0), 30) * (0.5 * (1 - u) + 0.15)
    img = img + glow_e[..., None] * np.array([1.0, 0.85, 0.55])
    # depth order: palms/fingers behind the envelope, thumbs (top edge of the hand masks inside the envelope) in front
    thumb_front = ha * cv2.GaussianBlur(cv2.warpAffine(env_m.astype(np.float32), Mh, (W, H)), (0, 0), 2) if landed else np.zeros_like(ha)
    img = img * (1 - ha[..., None]) + hands * ha[..., None]
    img = img * (1 - ea[..., None]) + env * ea[..., None]
    img = img * (1 - thumb_front[..., None]) + hands * thumb_front[..., None]
    # contact: soft light where the fingers meet the paper
    if 2.6 < t < 3.6:
        cp = [K([705, 560]), K([1085, 430])]; pulse = fx.win(t, 2.65, 2.85, 3.0, 3.6)
        for c in cp: img = img + (np.exp(-(((xx - c[0]) ** 2 + (yy - c[1]) ** 2) / (2 * (40 * k) ** 2))) * 0.45 * pulse)[..., None] * np.array([1.0, 0.88, 0.62])
    # the seal glows and opens; the letter rises out of the envelope toward the viewer
    open_ = fx.ease((t - 3.4) / 0.6)
    seal = cv2.perspectiveTransform(np.float32([[[SEAL[0] * EW, SEAL[1] * EH]]]), Hq)[0, 0]
    if t > 3.2:
        img = fx.orb(img, seal[0], seal[1], r=6 + 8 * open_, gain=1.2 * fx.win(t, 3.2, 3.6, 4.0, 4.6), t=t)
        MOT.step(1.0); img = img + MOT.render(t, 0.8 * fx.win(t, 3.4, 3.8, 6.5, 7.5))
    lift = fx.ease((t - 3.9) / 1.6)
    dof = fx.ease((t - 4.2) / 1.0)
    if dof > 0: img = img * (1 - dof * 0.7) + fx.blur(img, 10) * dof * 0.7
    if lift > 0:
        top_c = (q[0] + q[1]) / 2
        s = 0.40 + 0.38 * lift
        ctr = top_c + np.array([0, -10 * k]) + (np.array([W / 2, H / 2 - 20]) - top_c) * lift
        ML = fx.affine(s * (0.55 + 0.45 * lift), s, -3 * (1 - lift), ctr[0], ctr[1] + lh * s * 0.5 * (1 - lift), lw / 2, lh / 2)
        prog = np.interp(t, [5.1, 5.9, 6.5, 7.2], [0, 1, 2, 3]); rev = fx.clamp01((prog - ORD) / 0.04)
        a = INK * rev; letter = LR * (1 - a[..., None] * 0.9) + INK_COL * a[..., None] * 0.9
        la = LA * fx.ease((t - 3.9) / 0.4)
        if lift < 0.6:                                       # still partly inside the envelope: clip below its top edge
            clip = np.ones((H, W), np.float32); edge_y = top_c[1] + 6
            clip = np.clip((edge_y - yy) / 6 + 1, 0, 1) * (1 - fx.ease((lift - 0.35) / 0.25)) + fx.ease((lift - 0.35) / 0.25)
        else: clip = None
        tmp = img.copy(); fx.place(tmp, letter * 1.03, la, ML)
        img = tmp if clip is None else img * (1 - clip[..., None]) + tmp * clip[..., None]
        if 0.05 < prog < 3:
            kk = min(int(prog), 2); x0, y0, x1, y1 = boxes[kk]; f = prog - kk
            qn = ML @ np.array([x0 + (x1 - x0) * f, y1 - 10, 1]); img = fx.orb(img, qn[0], qn[1], r=4, gain=0.8, t=t)
    # camera: begins close on the mailbox, eases back to the R6 framing, then pushes gently toward the letter
    back = fx.ease((t - 0.2) / 2.6)
    zoom = 1.55 - 0.55 * back + 0.05 * fx.ease((t - 4.5) / 3.5); cx = (MOUTH[0] / W) + (0.5 - MOUTH[0] / W) * back; cy = (MOUTH[1] / H + 0.05) + (0.5 - MOUTH[1] / H - 0.05) * back
    out = fx.cam(img, cx, cy, zoom, border=cv2.BORDER_REPLICATE)
    PET.step(t, 1 / FPS); PET.render(out, t)
    return fx.finish(fx.bloom(out, 0.84, 22, 0.32), i, vig=0.24, grn=0.010)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.3, 1.2, 2.2, 2.9, 3.7, 4.6, 5.6, 7.8]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/letter_{t:.1f}.jpg')
        fx.save(EMPTY, f'{fx.ROOT}/review/letter_empty.jpg'); fx.save(ENV, f'{fx.ROOT}/review/letter_env.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/V3_letter.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
