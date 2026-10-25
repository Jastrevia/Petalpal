"""PetalPal fairy 2.5D rig built ONLY from the approved master and its 18 registered layers.
No pixel is redrawn by AI. Deformations: smooth displacement fields (breathing, head, hair, petals, legs, wings)
on the continuous master, plus a separated screen-right arm (upper/lower, rigid with an overlapping elbow) for
reaching / holding / presenting. The only non-original pixels are an automatic fill of the area the arm uncovers
(reported and visualised separately; minimum additional artwork = a painted 'behind the arm' patch).
"""
import json, numpy as np, cv2
from PIL import Image

L = '/mnt/user-data/uploads/Petalpal/Resources/fairy/production/layers/first_approved/'
MASTER = '/mnt/user-data/outputs/film_v1/refs/fairy_master.png'
S = 1254

def load(p): return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255.0
M = load(MASTER)
man = json.load(open(L + 'manifest.json'))
A = {l['id']: load(L + l['file'])[..., 3] for l in man['layers']}
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)

def soft(mask, grow=6, blur=9):
    m = cv2.dilate((mask > 0.02).astype(np.uint8), np.ones((grow*2+1, grow*2+1), np.uint8)).astype(np.float32)
    return cv2.GaussianBlur(m, (0, 0), blur)
def ramp(v, a, b):
    t = np.clip((v - a) / (b - a), 0, 1); return t*t*(3-2*t)

# ---- region weights (all from the original layer masks)
HEAD = soft(A['head_face'] + A['hair_front'] + A['hair_back'] + A['braided_updo'] + A['flower_accessory'], 10, 8)
HEAD = np.maximum(HEAD, ramp(-yy, -300, -255) * (np.abs(xx - 650) < 140))      # neck blends into head
ARM_R = (A['arm_right_upper'] + A['arm_right_lower']) > 0.0
WING_L = soft(A['wing_left'] + A['dress_side_petals'] * (yy < 560) * (xx < 545), 4, 6) * ramp(-xx, -600, -545)
WING_R = soft(A['wing_right'] + A['dress_back_petals'] * (yy < 470) * (xx > 790), 4, 6) * ramp(xx, 735, 790)
PETAL = soft(A['dress_side_petals'] + A['dress_back_petals'], 3, 6) * ramp(yy, 560, 1060)
SKIRT = soft(A['dress_front_petals'] + A['dress_base'], 2, 5) * ramp(yy, 600, 860)
LEGS = soft(A['leg_left'] + A['leg_right'], 2, 4) * ramp(yy, 760, 1180)
TORSO = ramp(-yy, -690, -330)                                                     # 0 at hips, 1 at shoulders
STRANDS = soft(A['hair_front'] + A['hair_back'], 2, 4) * ramp(yy, 150, 290)

NECK = np.array([652., 292.]); WPIV_L = np.array([592., 330.]); WPIV_R = np.array([725., 335.])
SHOULDER = np.array([757., 376.]); ELBOW = np.array([788., 494.]); HIPS = np.array(man['hips'], np.float32)

# ---- separated arm: upper/lower layers with a shared elbow overlap
def arm_layer(ids, extra=None):
    a = sum(A[i] for i in ids); a = np.clip(a, 0, 1)
    if extra is not None: a = np.maximum(a, extra)
    out = M.copy(); out[..., 3] = M[..., 3] * a; return out
ELB_CAP = (np.hypot(xx - ELBOW[0], yy - ELBOW[1]) < 15).astype(np.float32) * ((A['arm_right_upper'] + A['arm_right_lower']) > 0)
UP = arm_layer(['arm_right_upper']); LO = arm_layer(['arm_right_lower'], ELB_CAP)
# body plate: arm removed, uncovered area auto-filled (Telea inpaint on premultiplied RGBA) -- PROVISIONAL, non-original
hole = cv2.dilate(ARM_R.astype(np.uint8), np.ones((3, 3), np.uint8))
pm = M.copy(); pm[..., :3] *= pm[..., 3:4]
pm8 = (np.clip(pm, 0, 1) * 255).astype(np.uint8)
rgb = cv2.inpaint(pm8[..., :3], hole, 7, cv2.INPAINT_TELEA).astype(np.float32) / 255
al = cv2.inpaint(pm8[..., 3], hole, 7, cv2.INPAINT_TELEA).astype(np.float32) / 255
BODY = np.dstack([np.where(hole[..., None] > 0, rgb, pm[..., :3]), np.where(hole > 0, al, pm[..., 3])])   # premultiplied
FILLMASK = hole.astype(bool)
MASTER_PM = pm

def rot(p, piv, ang):
    c, s = np.cos(ang), np.sin(ang); d = p - piv
    return np.array([piv[0] + c*d[0] - s*d[1], piv[1] + s*d[0] + c*d[1]])

def field_rot(px, py, piv, ang):
    """displacement (dx,dy) of rotating points about piv by ang (radians)"""
    c, s = np.cos(ang), np.sin(ang); dx, dy = px - piv[0], py - piv[1]
    return (c*dx - s*dy) - dx, (s*dx + c*dy) - dy

def body_warp(p, img):
    """p: dict of params. Returns warped premultiplied RGBA via inverse sampling (src = x - D)."""
    Dx = np.zeros((S, S), np.float32); Dy = np.zeros((S, S), np.float32)
    # breathing / shoulder lift (torso moves up, head follows)
    Dy += -p['breath'] * TORSO
    Dx += p['chest_sway'] * TORSO
    # head tilt + nod about the neck
    hx, hy = field_rot(xx, yy, NECK, np.radians(p['head_tilt']))
    Dx += HEAD * hx; Dy += HEAD * (hy + p['head_nod'])
    # hair strands sway
    Dx += STRANDS * p['hair'] * np.sin(p['t']*2.1 + yy*0.02)
    # wings flutter about their roots (outer wing tips travel most)
    wx, wy = field_rot(xx, yy, WPIV_L, np.radians(-p['wing'])); Dx += WING_L * wx; Dy += WING_L * wy
    wx, wy = field_rot(xx, yy, WPIV_R, np.radians(p['wing'] * 0.8)); Dx += WING_R * wx; Dy += WING_R * wy
    # trailing petals and skirt sway, legs dangle
    Dx += PETAL * p['petal'] * np.sin(p['t']*1.6 - yy*0.008) + SKIRT * p['petal']*0.35*np.sin(p['t']*1.6 - yy*0.01)
    Dy += PETAL * p['petal'] * 0.25 * np.cos(p['t']*1.6 - yy*0.008)
    Dx += LEGS * p['legs'] * np.sin(p['t']*1.2 - 0.6)
    return cv2.remap(img, xx - Dx, yy - Dy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0), (Dx, Dy)

def warp_affine_pm(img, Mx):
    return cv2.warpAffine(img, Mx, (S, S), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

def arm_transforms(p, Dfield):
    """upper arm rotates about the shoulder (which follows the torso field); lower arm about the elbow."""
    sx, sy = SHOULDER; dsx = float(Dfield[0][int(sy), int(sx)]); dsy = float(Dfield[1][int(sy), int(sx)])
    au = np.radians(p['arm_up']); al_ = np.radians(p['arm_lo'])
    sh = SHOULDER + np.array([dsx, dsy])
    Mu = cv2.getRotationMatrix2D(tuple(SHOULDER), -np.degrees(au), 1.0); Mu[:, 2] += [dsx, dsy]
    el = rot(ELBOW, SHOULDER, au) + np.array([dsx, dsy])
    # lower arm: rotate about the elbow, foreshorten along the forearm axis as it reaches toward camera
    ax = (np.array([850., 668.]) - ELBOW); ax /= np.linalg.norm(ax)
    k = p['foreshorten']
    Fs = np.eye(2) + (k - 1) * np.outer(ax, ax)                      # scale along axis
    R = np.array([[np.cos(au + al_), -np.sin(au + al_)], [np.sin(au + al_), np.cos(au + al_)]])
    Lm = R @ Fs; t = el - Lm @ ELBOW
    Ml = np.hstack([Lm, t[:, None]]).astype(np.float32)
    hand = Lm @ np.array([850., 668.]) + t
    return Mu.astype(np.float32), Ml, hand

def render(p, card=None):
    """Returns premultiplied RGBA (S x S) of the fairy and the hand position (for effects)."""
    moving = abs(p['arm_up']) > 1e-3 or abs(p['arm_lo']) > 1e-3 or abs(p['foreshorten'] - 1) > 1e-4 or card is not None
    if not moving:
        out, D = body_warp(p, MASTER_PM); Mu, Ml, hand = arm_transforms(p, D); return out, hand, None
    body, D = body_warp(p, BODY)
    Mu, Ml, hand = arm_transforms(p, D)
    def pmul(L_):
        x = L_.copy(); x[..., :3] *= x[..., 3:4]; return x
    up = warp_affine_pm(pmul(UP), Mu); lo = warp_affine_pm(pmul(LO), Ml)
    out = body
    if card is not None:                                              # card sits behind the fingers
        out = card + out * (1 - card[..., 3:4])
        out = out  # body over card would hide it; card is drawn over body, fingers drawn over card below
    out = up + out * (1 - up[..., 3:4])
    out = lo + out * (1 - lo[..., 3:4])
    return out, hand, (Mu, Ml)

def rest_params(t=0.0):
    return dict(t=t, breath=0.0, chest_sway=0.0, head_tilt=0.0, head_nod=0.0, hair=0.0, wing=0.0, petal=0.0, legs=0.0,
                arm_up=0.0, arm_lo=0.0, foreshorten=1.0)
