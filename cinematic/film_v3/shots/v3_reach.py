"""V3 reach and touch (3.5 s), reference R3: she holds the invitation and extends her free hand; the viewer's hands move
forward into the same space toward hers; contact at the fingertips blooms with light, and the light spreads outward."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v3/tools'); import fx, fx3, plates
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 3.5; N = int(round(DUR * FPS))
P = plates.load('R3_reach'); k = plates.to_canvas_scale(P); ph_, pw_ = P.shape[:2]
yy, xx = np.mgrid[0:ph_, 0:pw_].astype(np.float32)
u8 = (P * 255).astype(np.uint8); hsv = cv2.cvtColor(u8, cv2.COLOR_RGB2HSV).astype(np.float32)
h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
# the viewer's hands: warm skin, large and out of focus, in the lower part of the frame (her hand is sharp and above)
g = cv2.cvtColor(u8, cv2.COLOR_RGB2GRAY).astype(np.float32); sharp = cv2.GaussianBlur(np.abs(cv2.Laplacian(g, cv2.CV_32F, ksize=3)), (0, 0), 6 * k)
low = np.clip((yy - 640 * k) / (60 * k), 0, 1)
skin = ((h > 8) & (h < 45) & (s > 0.10) & (s < 0.62) & (v > 0.45)).astype(np.float32)
HM = cv2.GaussianBlur(cv2.morphologyEx((skin * low > 0.5).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((int(25 * k),) * 2, np.uint8)).astype(np.float32), (0, 0), 10 * k)
HM = HM * (sharp < np.percentile(sharp, 70))
HM = cv2.GaussianBlur(cv2.erode((HM > 0.5).astype(np.uint8), np.ones((int(9 * k),) * 2, np.uint8)).astype(np.float32), (0, 0), 14 * k)
CONTACT = np.array([872.0, 712.0]) * k
BG = cv2.inpaint(cv2.resize(u8, (pw_ // 4, ph_ // 4)), (cv2.resize(HM, (pw_ // 4, ph_ // 4)) > 0.3).astype(np.uint8), 9, cv2.INPAINT_TELEA)
BG = cv2.GaussianBlur(cv2.resize(BG, (pw_, ph_), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255, (0, 0), 18 * k)
PET = fx3.Petals3D(26, seed=41, xr=(-1.5, 1.5), yr=(-0.9, 0.9), zr=(0.5, 4.5), vel=(0.02, 0.025, 0.0), size=(0.04, 0.08), focus=2.0, dof=8)
MOT = fx.Motes(120, seed=42, box=(300, 100, 1700, 1050), vel=(0, -0.5), spread=0.6, size=(0.5, 1.7))

def frame(i):
    t = i / FPS
    fwd = fx.ease_out(t / 1.7)                                  # the viewer's hands move forward to meet hers
    contact = fx.ease((t - 1.55) / 0.35)
    sc = 1.0 + 0.09 * fwd; dy = 0.0; dx = 0.0
    M = cv2.getRotationMatrix2D((float(CONTACT[0]), float(ph_ + 40 * k)), 0, sc); M[:, 2] += [dx, dy]
    hands = cv2.warpAffine(P, M, (pw_, ph_), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    hm = cv2.warpAffine(HM, M, (pw_, ph_), flags=cv2.INTER_LINEAR)
    base = P                                                       # the moved hands always cover their own start position
    img = base * (1 - hm[..., None]) + hands * hm[..., None]
    d = np.hypot(xx - CONTACT[0], yy - CONTACT[1])
    near = np.exp(-(d / (260 * k)) ** 2) * (0.15 + 0.5 * contact)
    img = img + near[..., None] * np.array([1.0, 0.86, 0.62]) * 0.35
    if contact > 0:
        core = np.exp(-(d / ((8 + 16 * contact) * k)) ** 2) * 1.3 * contact + np.exp(-(d / ((50 + 120 * contact) * k)) ** 2) * 0.45 * contact
        ring = 0
        if t > 1.75:
            r = (t - 1.75) * 650 * k; ring = np.exp(-((d - r) ** 2) / (2 * (16 * k) ** 2)) * 0.45 * fx.clamp01(1 - (t - 1.75) / 1.4)
        img = img + (core + ring)[..., None] * np.array([1.0, 0.88, 0.64])
    flood = fx.ease((t - 2.7) / 0.8)
    img = img * (1 - 0.9 * flood) + np.array([1.0, 0.95, 0.84]) * 0.9 * flood
    zoom = 1.0 + 0.08 * fx.ease(t / DUR); cx = 0.5 + (CONTACT[0] / pw_ - 0.5) * 0.4 * fx.ease(t / DUR); cy = 0.5 + (CONTACT[1] / ph_ - 0.5) * 0.4 * fx.ease(t / DUR)
    out = fx.cam(img, cx, cy, zoom, border=cv2.BORDER_REPLICATE)
    MOT.step(1.0); out = out + MOT.render(t, 0.5 + 0.8 * contact)
    PET.step(t, 1 / FPS); PET.render(out, t)
    return fx.finish(fx.bloom(out, 0.82, 22, 0.35), i, vig=0.22 * (1 - flood), grn=0.010)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.0, 1.0, 1.9, 2.6, 3.3]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/reach_{t:.1f}.jpg')
        fx.save(np.dstack([HM] * 3), f'{fx.ROOT}/review/reach_mask.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/V3_reach.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
