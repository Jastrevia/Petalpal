"""S06 (3.0 s): continues from the last frame of the accepted A01. Her open palm waits; the viewer's hand rises into frame and a
fingertip meets her palm; a soft bloom of light at the contact (the emotional centre), building to a white-gold flash.
Plate = approved Reach (registered to A01's last frame); the viewer's hand = PetalPal's own illustrated palm art."""
import sys, os, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
sys.path.insert(0, '/mnt/user-data/outputs/film_v31/tools'); import roomkey as rk
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 3.0; N = int(DUR * FPS)
A01 = '/mnt/user-data/outputs/perf_test/glide_review/glide_v1_7s_retimed.mp4'
def a01_to_canvas(f):            # same mapping the edit uses for A01: cover-scale 1928x1072 -> 1920x1080
    s = max(W / f.shape[1], H / f.shape[0]); f = cv2.resize(f, (int(round(f.shape[1] * s)), int(round(f.shape[0] * s))), interpolation=cv2.INTER_CUBIC)
    x0 = (f.shape[1] - W) // 2; y0 = (f.shape[0] - H) // 2; return f[y0:y0 + H, x0:x0 + W]
c = cv2.VideoCapture(A01); n = int(c.get(cv2.CAP_PROP_FRAME_COUNT)); c.set(cv2.CAP_PROP_POS_FRAMES, n - 1); ok, last = c.read()
LAST = cv2.cvtColor(a01_to_canvas(last), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
END = fx.load('/mnt/user-data/outputs/perf_test/end_frame_reach.png')
# register the approved end frame to A01's last frame (affine, ECC)
g1 = cv2.cvtColor((LAST * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
s0 = W / END.shape[1]; M0 = np.float32([[s0, 0, 0], [0, s0, (H - END.shape[0] * s0) / 2]])
e0 = cv2.warpAffine(END, M0, (W, H), flags=cv2.INTER_AREA)
g2 = cv2.cvtColor((e0 * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
warp = np.eye(2, 3, dtype=np.float32)
try:
    _, warp = cv2.findTransformECC(cv2.GaussianBlur(g1, (0, 0), 2), cv2.GaussianBlur(g2, (0, 0), 2), warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6))
except cv2.error as e: print('ECC failed, identity', e)
Wi = cv2.invertAffineTransform(warp)
Mend = (np.vstack([Wi, [0, 0, 1]]) @ np.vstack([M0, [0, 0, 1]]))[:2].astype(np.float32)
PLATE = cv2.warpAffine(END, Mend, (W, H), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
print('end-frame vs A01 last frame after registration: mean abs %.2f levels' % (np.abs(PLATE - LAST).mean() * 255))
# her palm centre (end-frame px (1160,820)) in canvas px
PALM = (Mend @ np.array([1160, 820, 1.0])).astype(np.float32); print('palm at', PALM)
# viewer's hand: right hand of the palms art (solid only), fingers up
SR = fx.ROOT + '/sr/palms_x4.png'
HR, HA0 = fx.load(SR if os.path.exists(SR) else fx.U + 'mobile/assets/mailbox/fairy_palms_foreground.png', alpha=True); k = HR.shape[1] / 1376
HR, HA, _AU = fx.hand_alpha(HR, HA0, k)
# isolate the right hand: the connected solid region containing a point on its palm (original px 1100,500)
n_, lab = cv2.connectedComponents((HA > 0.5).astype(np.uint8))
keep = (lab == lab[int(500 * k), int(1100 * k)]).astype(np.float32)
keep = cv2.dilate(keep, np.ones((5, 5), np.uint8)); HAL = HA * keep; HAND = HR
TIP = np.array([790 * k, 140 * k])                                             # top fingertip of the right hand

def frame(i):
    t = i / FPS
    zoom = 1.0 + 0.07 * fx.ease(t / DUR); cx = 0.5 + (PALM[0] / W - 0.5) * 0.35 * fx.ease(t / DUR); cy = 0.5 + (PALM[1] / H - 0.5) * 0.35 * fx.ease(t / DUR)
    bob = 3.0 * np.sin(t * 2.1)
    base = PLATE if i >= 8 else LAST * (1 - i / 8) + PLATE * (i / 8)        # settle from A01's own last frame
    fg, a = rk.fairy_key(base); img = rk.composite(fg, a, rk.room(168 + i), glow=0.22, rim=0.5)   # same room as A01_room
    # contact progress: hand enters 0.2-1.6 s, touches at 1.6 s
    u = fx.ease_out((t - 0.15) / 1.45)
    contact = fx.ease((t - 1.45) / 0.35)
    # place the hand so its middle fingertip travels to just below-right of her palm
    target = PALM + np.array([18, 26])
    start = target + np.array([520, 760])
    tip = start + (target - start) * u + np.array([0, bob])
    ang = 4.0
    s = 0.92 / k
    M = fx.affine(s, s, ang, tip[0], tip[1], TIP[0], TIP[1])
    hand = np.zeros_like(img); ha = np.zeros((H, W), np.float32)
    hand = cv2.warpAffine(HAND, M, (W, H), flags=cv2.INTER_LINEAR); ha = cv2.warpAffine(HAL, M, (W, H), flags=cv2.INTER_LINEAR)
    hand = fx.blur(hand, 1.6); ha = fx.blur(ha, 1.6)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); d = np.hypot(xx - target[0], yy - target[1])
    warm_light = 0.92 + 0.35 * np.exp(-(d / 420) ** 2) * (0.4 + contact)
    hand = hand * warm_light[..., None] * np.array([1.04, 0.99, 0.93])
    img = img * (1 - ha[..., None]) + hand * ha[..., None]
    # contact bloom: core + halo + expanding ripple + motes
    if contact > 0:
        core = np.exp(-(d / (9 + 14 * contact)) ** 2) * 1.1 * contact + np.exp(-(d / (60 + 110 * contact)) ** 2) * 0.30 * contact
        rr = (t - 1.6) * 420; ring = np.exp(-((d - rr) ** 2) / (2 * 14 ** 2)) * 0.35 * fx.clamp01(1 - (t - 1.6) / 1.1) if t > 1.6 else 0
        img = img + (core + ring)[..., None] * np.array([1.0, 0.88, 0.64])
    flash = fx.ease((t - 2.4) / 0.6)
    img = img * (1 - flash * 0.85) + np.array([1.0, 0.95, 0.85]) * flash * 0.92 + np.exp(-(d / 600) ** 2)[..., None] * flash * 0.4
    img = fx.cam(img, cx, cy, zoom, border=cv2.BORDER_REPLICATE)
    img = fx.bloom(img, 0.86, 22, 0.25)
    return fx.finish(img, i, vig=0.22 * (1 - flash) * min(1.0, i / 12), grn=0.012 * min(1.0, i / 12))

motes_b = None
if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'stills':
        for t in [0.0, 0.8, 1.5, 1.9, 2.3, 2.8]: fx.save(frame(int(t * FPS)), f'/mnt/user-data/outputs/film_v31/review/s06_{t:.1f}.jpg')
    else:
        w = fx.Writer('/mnt/user-data/outputs/film_v31/shots/S06_room.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
