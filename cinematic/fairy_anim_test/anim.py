"""Free fairy animation test over the approved K2 garden.  python anim.py [out.mp4]
Fairy pixels = approved master + its registered layers only. Motion = smooth deformation fields + separated forearm.
"""
import sys, os, subprocess, numpy as np, cv2
from PIL import Image
import rig

OUT = sys.argv[1] if len(sys.argv) > 1 else 'fairy_test_v1.mp4'
W, H, FPS, DUR, SUB = 1920, 1080, 24, 14.0, 2
N = int(DUR * FPS)
S = rig.S; xx, yy = rig.xx, rig.yy; M = rig.M

# ---------- refined forearm (skin + gold band only, from the master) replacing the coarse polygon split
ARM = np.load('arm_skin_mask.npy')
ELBOW = np.array([788., 494.]); WRIST = np.array([833., 628.])
hole = cv2.dilate(ARM.astype(np.uint8), np.ones((3, 3), np.uint8))
pm = M.copy(); pm[..., :3] *= pm[..., 3:4]; pm8 = (np.clip(pm, 0, 1) * 255).astype(np.uint8)
# straight-colour fill sourced only from opaque neighbours; alpha filled then thresholded so no grey haze appears outside her
st8 = (np.clip(M[..., :3], 0, 1) * 255).astype(np.uint8)
src_bad = ((M[..., 3] < 0.6) & (cv2.dilate(hole, np.ones((41, 41), np.uint8)) > 0)).astype(np.uint8)
fill_rgb = cv2.inpaint(st8, np.maximum(hole, src_bad), 5, cv2.INPAINT_TELEA).astype(np.float32) / 255
fill_a = cv2.inpaint(pm8[..., 3], hole, 5, cv2.INPAINT_TELEA).astype(np.float32) / 255
fill_a = np.where(fill_a < 0.55, 0.0, fill_a)
BODY = pm.copy(); BODY[hole > 0, :3] = (fill_rgb * fill_a[..., None])[hole > 0]; BODY[hole > 0, 3] = fill_a[hole > 0]
HANDM = (ARM & (np.hypot(xx - WRIST[0], yy - WRIST[1]) < 70) & (yy > WRIST[1] - 12)).astype(np.float32)
HANDM = cv2.GaussianBlur(HANDM, (0, 0), 1.2) * ARM
FORE = pm * ARM[..., None]

# ---------- invitation card (approved app asset), fairy-sized, held by the right hand
card_src = np.asarray(Image.open('/mnt/user-data/uploads/Petalpal/mobile/assets/auth/invitation_card_composite.png').convert('RGBA')).astype(np.float32) / 255
ch = 128; cw = int(card_src.shape[1] * ch / card_src.shape[0])
card_small = cv2.resize(card_src, (cw, ch), interpolation=cv2.INTER_AREA); card_small[..., :3] *= card_small[..., 3:4]
CARD_GRIP = np.array([848., 664.])            # point under the fingers that grips the card (master coords)

def ease(u): u = np.clip(u, 0, 1); return u * u * (3 - 2 * u)
def window(t, a, b, c, d): return ease((t - a) / (b - a)) * (1 - ease((t - c) / (d - c)))

def params(t):
    p = rig.rest_params(t)
    p['breath'] = 2.2 * np.sin(2 * np.pi * 0.27 * t) + 1.6 * window(t, 5.0, 5.7, 6.6, 7.6)      # breathing + shoulder lift accent
    p['chest_sway'] = 1.0 * np.sin(2 * np.pi * 0.13 * t)
    p['head_tilt'] = 0.8 * np.sin(2 * np.pi * 0.11 * t + 1) + 4.5 * window(t, 4.8, 6.0, 12.0, 13.5)
    p['head_nod'] = 2.5 * window(t, 5.2, 5.8, 6.2, 7.0)
    p['hair'] = 2.0
    p['wing'] = 3.6 * np.sin(2 * np.pi * 3.0 * t) + 2.0 * np.sin(2 * np.pi * 0.4 * t)
    p['petal'] = 6.0; p['legs'] = 2.5
    present = window(t, 7.2, 8.6, 11.4, 12.8)
    p['fore'] = 11.0 * present + 1.5 * np.sin(2 * np.pi * 0.27 * t + 0.5)      # forearm lift (deg, CCW = outward/up)
    p['wrist'] = -5.0 * present
    p['card_tilt'] = present
    return p

def forearm_mats(p, D):
    ex, ey = ELBOW.astype(int); off = np.array([D[0][ey, ex], D[1][ey, ex]], np.float32)
    Mf = cv2.getRotationMatrix2D(tuple(ELBOW), p['fore'], 1.0); Mf[:, 2] += off
    w2 = Mf[:, :2] @ WRIST + Mf[:, 2]
    Mh = cv2.getRotationMatrix2D(tuple(w2), p['wrist'], 1.0)
    Mh3 = np.vstack([Mh, [0, 0, 1]]) @ np.vstack([Mf, [0, 0, 1]])
    return Mf.astype(np.float32), Mh3[:2].astype(np.float32)

def render_fairy(t, show_card):
    p = params(t)
    body, D = rig.body_warp(p, BODY)
    Mf, Mh = forearm_mats(p, D)
    fore = cv2.warpAffine(FORE * (1 - HANDM[..., None]), Mf, (S, S), flags=cv2.INTER_CUBIC)
    hand = cv2.warpAffine(FORE * HANDM[..., None], Mh, (S, S), flags=cv2.INTER_CUBIC)
    out = body
    if show_card:
        g = Mh[:, :2] @ CARD_GRIP + Mh[:, 2]
        ang = -16 + 12 * p['card_tilt']; sc = 1.0 + 0.12 * p['card_tilt']
        C = cv2.getRotationMatrix2D((cw / 2, 18), ang, sc); C[:, 2] += g - np.array([cw / 2, 18])
        card = cv2.warpAffine(card_small, C, (S, S), flags=cv2.INTER_CUBIC)
        out = card + out * (1 - card[..., 3:4])
    out = fore + out * (1 - fore[..., 3:4])
    out = hand + out * (1 - hand[..., 3:4])
    return out, p

# ---------- scene: approved K2 (unchanged file; a lightly defocused copy sits behind the fairy)
K2 = cv2.cvtColor(cv2.imread('/mnt/user-data/outputs/film_v1/refs/K2.png'), cv2.COLOR_BGR2RGB)
BG = cv2.resize(K2, (W, H), interpolation=cv2.INTER_LANCZOS4).astype(np.float32) / 255
BG = cv2.GaussianBlur(BG, (0, 0), 1.6)
SUN = np.array([861., 264.])
SCALE = 0.56; POS = np.array([610., 800.])                 # where the master's root (feet) lands in the frame
ROOT = np.array(rig.man['root'], np.float32)
rng = np.random.default_rng(11)
motes = rng.uniform([0, 0], [W, H], (90, 2)); mv = rng.normal(0, 0.25, (90, 2)) + [0.15, -0.25]; ms = rng.uniform(0.4, 1.2, 90)
gx, gy = np.mgrid[0:H, 0:W][1].astype(np.float32), np.mgrid[0:H, 0:W][0].astype(np.float32)

def composite(fairy_pm, t):
    bob = np.array([2.0 * np.sin(2 * np.pi * 0.21 * t), 7.0 * np.sin(2 * np.pi * 0.42 * t)])
    sway = 0.7 * np.sin(2 * np.pi * 0.21 * t + 0.8)
    A2 = cv2.getRotationMatrix2D(tuple(ROOT), sway, SCALE); A2[:, 2] += POS + bob - ROOT
    f = cv2.warpAffine(fairy_pm, A2, (W, H), flags=cv2.INTER_AREA if SCALE < 1 else cv2.INTER_CUBIC)
    a = f[..., 3:4]
    # light integration: warm back-light rim from the sun, slight backlit exposure, translucent glow
    d = SUN - (POS + np.array([0, -330])); d /= np.linalg.norm(d)
    sh = cv2.warpAffine(a[..., 0], np.float32([[1, 0, -d[0] * 5], [0, 1, -d[1] * 5]]), (W, H))
    rim = np.clip(a[..., 0] - sh, 0, 1); rim = cv2.GaussianBlur(rim, (0, 0), 1.6)[..., None]
    col = f[..., :3] * np.array([1.015, 0.99, 0.95]) * 0.97
    col = col + rim * np.array([1.0, 0.86, 0.62]) * 0.55 * a
    transl = np.clip(1.4 - a * 1.4, 0, 1) * a                      # wings / sheer drapes
    col = col + transl * np.array([1.0, 0.9, 0.75]) * 0.10
    out = col + BG * (1 - a)
    edge = np.clip(cv2.GaussianBlur(a[..., 0], (0, 0), 6) - a[..., 0] * 0.0, 0, 1)
    wrap = np.clip(1 - cv2.GaussianBlur(a[..., 0], (0, 0), 3), 0, 1) * a[..., 0]
    out = out + (cv2.GaussianBlur(BG, (0, 0), 10) * wrap[..., None] * 0.35)       # background light wraps her edges
    feet = A2[:, :2] @ ROOT + A2[:, 2]
    r2 = ((gx - feet[0]) / 1.6) ** 2 + (gy - feet[1] - 40) ** 2
    out = out + (np.exp(-r2 / (2 * 55 ** 2)) * 0.10)[..., None] * np.array([1.0, 0.85, 0.6])
    # contact shadow is not needed (she floats in mid-air near the camera); soft bloom
    br = np.clip(out - 0.82, 0, 1); out = out + cv2.GaussianBlur(br, (0, 0), 12) * 0.6
    return out, A2

def appear_fx(out, t, A2):
    c = A2[:, :2] @ np.array([660., 560.]) + A2[:, 2]
    g = ease(t / 0.9) * (1 - ease((t - 1.0) / 1.2))
    r2 = (gx - c[0]) ** 2 + (gy - c[1]) ** 2
    glow = g * (np.exp(-r2 / (2 * 60 ** 2)) * 0.9 + np.exp(-r2 / (2 * 260 ** 2)) * 0.25)
    return out + glow[..., None] * np.array([1.0, 0.85, 0.6])

def motes_fx(out, t):
    global motes
    layer = np.zeros((H, W), np.float32)
    for (x, y), s in zip(motes, ms):
        xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H: layer[yi, xi] += s * (0.6 + 0.4 * np.sin(t * 3 + x))
    layer = cv2.GaussianBlur(layer, (0, 0), 1.3) * 3 + cv2.GaussianBlur(layer, (0, 0), 5) * 4
    return out + layer[..., None] * np.array([1.0, 0.88, 0.6]) * 0.5

ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
os.makedirs('frames', exist_ok=True)
for i in range(N):
    acc = None; A2 = None
    for s in range(SUB):
        t = (i + s / SUB * 0.5) / FPS                                  # 180-degree shutter
        fp, p = render_fairy(t, show_card=True)
        appear = ease((t - 0.35) / 0.9)
        fp = fp * appear
        o, A2 = composite(fp, t)
        acc = o if acc is None else acc + o
    out = acc / SUB
    t = i / FPS
    out = appear_fx(out, t, A2); out = motes_fx(out, t); motes += mv
    fr = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    ff.stdin.write(fr.tobytes())
    if i in (0, 48, 100, 150, 200, 260, 330): Image.fromarray(fr).save(f'frames/f{i:03d}.jpg', quality=92)
ff.stdin.close(); ff.wait(); print('wrote', OUT, N, 'frames')
