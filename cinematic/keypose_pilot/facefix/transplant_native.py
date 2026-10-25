"""Master-face transplant at the CANDIDATE's native resolution (master face upscaled with Lanczos).
Same steps as transplant2: jaw warp to master proportions, skin-tone match, master face pixels, optional smile."""
import numpy as np, cv2
from PIL import Image
from scipy.interpolate import RBFInterpolator
M0 = cv2.cvtColor(cv2.imread('refs/master_on_paper.png'), cv2.COLOR_BGR2RGB).astype(np.float32)
def skin_mask(img):
    hsv = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    H, S, V = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    return ((H < 24) | (H > 345)) & (S > 0.06) & (S < 0.36) & (V > 0.78)
def run(cand, cp, jaw_c, out_prefix, smile=0.0):
    C = cv2.cvtColor(cv2.imread(cand), cv2.COLOR_BGR2RGB).astype(np.float32); H, W = C.shape[:2]
    mp = np.float32([[650, 165], [705, 155], [688, 198], [690, 219]]); jaw_m = np.float32([[636, 200], [652, 213], [672, 220], [690, 223], [704, 214], [713, 196]])
    cp = np.float32(cp); jaw_c = np.float32(jaw_c)
    s = np.linalg.norm(cp[1] - cp[0]) / np.linalg.norm(mp[1] - mp[0])
    # crop the master head region, upscale it, keep landmark coordinates consistent
    x0, y0, x1, y1 = 560, 80, 780, 320
    Mc = cv2.resize(M0[y0:y1, x0:x1], None, fx=s, fy=s, interpolation=cv2.INTER_LANCZOS4)
    bl = cv2.GaussianBlur(Mc, (0, 0), 1.1 * s); Mc = np.clip(Mc + 0.9 * (Mc - bl), 0, 255)   # restore line crispness lost in upscaling
    if smile:
        Y, X = np.mgrid[0:Mc.shape[0], 0:Mc.shape[1]].astype(np.float32)
        g = sum(np.exp(-((X - (cx - x0) * s) ** 2 + (Y - (cy - y0) * s) ** 2) / (2 * (3.0 * s) ** 2)) for cx, cy in [(680, 199), (697, 195)])
        Mc = cv2.remap(Mc, X, Y + smile * s * g, cv2.INTER_CUBIC)
    L = lambda a: (np.float32(a) - [x0, y0]) * s
    T, _ = cv2.estimateAffinePartial2D(L(mp[:3]), cp[:3])
    jaw_mt = cv2.transform(L(jaw_m)[None], T)[0]
    ctr = cp[:2].mean(0); R = 115 * s
    ang = np.linspace(0, 2 * np.pi, 24, endpoint=False)
    anchors = np.stack([ctr[0] + R * np.cos(ang), ctr[1] + R * np.sin(ang)], 1)
    neck = np.vstack([jaw_c[1:5] + [0, 34 * s], jaw_c[1:5] + [0, 60 * s]])
    pts = np.vstack([jaw_mt, anchors, cp[:2], neck]); disp = np.vstack([jaw_c - jaw_mt, np.zeros_like(anchors), np.zeros((2, 2)), np.zeros_like(neck)])
    rbf = RBFInterpolator(pts, disp, kernel='thin_plate_spline', smoothing=1.0)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    reg = (np.abs(xx - ctr[0]) < R * 1.15) & (np.abs(yy - ctr[1]) < R * 1.15)
    D = np.zeros((H, W, 2), np.float32); D[reg] = rbf(np.stack([xx[reg], yy[reg]], 1))
    D *= np.clip(1 - (np.hypot(xx - ctr[0], yy - ctr[1]) - R * 0.87) / (R * 0.22), 0, 1)[..., None]
    Cw = cv2.remap(C, xx + D[..., 0], yy + D[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    sm_c = skin_mask(Cw) & reg; shift = np.median(M0[skin_mask(M0)], 0) - np.median(Cw[sm_c], 0)
    Cw = Cw + shift * cv2.GaussianBlur(sm_c.astype(np.float32), (0, 0), 2 * s)[..., None]
    warped = cv2.warpAffine(Mc, T, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    poly = L([[624, 148], [630, 178], [634, 201], [652, 215], [672, 222], [690, 226], [705, 216], [714, 197], [718, 172], [719, 148], [705, 138], [680, 141], [655, 143]])
    mask = np.zeros((H, W), np.float32); cv2.fillPoly(mask, [cv2.transform(poly[None], T)[0].astype(np.int32)], 1.0)
    mask = cv2.GaussianBlur(mask, (0, 0), 2.5 * s)
    out = Cw * (1 - mask[..., None]) + warped * mask[..., None]
    # keep candidate hair strands over the seam (same rule as Pose A cleanup)
    lum = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
    band = cv2.dilate(((mask > 0.03) & (mask < 0.97)).astype(np.uint8), np.ones((int(5 * s), int(5 * s)), np.uint8)).astype(bool)
    hsv = cv2.cvtColor(np.clip(Cw, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    hairish = (hsv[..., 0] * 2 > 235) & (hsv[..., 0] * 2 < 330) & (hsv[..., 2] < 200)
    take = cv2.GaussianBlur((band & (lum(Cw) < lum(out) - 12) & hairish).astype(np.float32), (0, 0), 1.2 * s)
    out = out * (1 - take[..., None]) + np.minimum(Cw, out) * take[..., None]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(out_prefix + '_facefix_native.png')
    return s
if __name__ == '__main__':
    s = run('reach/reach_rebuild_1.png', [[1708, 398], [1825, 377], [1788, 481], [1798, 532]],
            [[1662, 482], [1700, 505], [1740, 522], [1798, 532], [1820, 515], [1850, 470]], 'reach/reach_rebuild_1', smile=1.2)
    print('master face upscale factor', round(s, 2))
