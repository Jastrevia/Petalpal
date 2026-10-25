"""FREE local test v2: (1) warp the candidate's head so its jaw/chin match the master's facial proportions,
(2) transplant the master's own face pixels, (3) shift the candidate's skin tone to the master's. No generation."""
import numpy as np, cv2
from PIL import Image
from scipy.interpolate import RBFInterpolator
M = cv2.cvtColor(cv2.imread('refs/master_on_paper.png'), cv2.COLOR_BGR2RGB).astype(np.float32)
def skin_mask(img):
    hsv = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    H, S, V = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    return ((H < 24) | (H > 345)) & (S > 0.06) & (S < 0.36) & (V > 0.78)
def run(cand_path, cp, jaw_c, out_prefix, smile=0.0, mirror=False):
    global M
    M0 = M
    if mirror: M = M0[:, ::-1].copy()
    C = cv2.cvtColor(cv2.imread(cand_path), cv2.COLOR_BGR2RGB).astype(np.float32)
    mp = np.float32([[650, 165], [705, 155], [688, 198], [690, 219]])
    MX = lambda a: np.float32([[1253 - x, y] for x, y in a]) if mirror else np.float32(a)
    mp = MX(mp)
    jaw_m = MX([[636, 200], [652, 213], [672, 220], [690, 223], [704, 214], [713, 196]])   # master jaw contour
    cp = np.float32(cp); k = np.linalg.norm(mp[1] - mp[0]) / np.linalg.norm(cp[1] - cp[0])
    Cs = cv2.resize(C, None, fx=k, fy=k, interpolation=cv2.INTER_AREA); cps = cp * k; jaw_cs = np.float32(jaw_c) * k
    T, _ = cv2.estimateAffinePartial2D(mp[:3], cps[:3]); H, W = Cs.shape[:2]
    jaw_mt = cv2.transform(jaw_m[None], T)[0]                                   # where the master's jaw lands
    # (1) RBF warp: output pixel on the master jaw samples the candidate's own jaw; anchors far away stay put
    ctr = cps[:2].mean(0)
    ang = np.linspace(0, 2 * np.pi, 24, endpoint=False)
    anchors = np.stack([ctr[0] + 115 * np.cos(ang), ctr[1] + 115 * np.sin(ang)], 1)
    eyes = cps[:2]
    neck = np.vstack([jaw_cs[1:5] + [0, 34], jaw_cs[1:5] + [0, 60]])          # neck/necklace stays where it is
    src_pts = np.vstack([jaw_mt, anchors, eyes, neck]); disp = np.vstack([jaw_cs - jaw_mt, np.zeros_like(anchors), np.zeros_like(eyes), np.zeros_like(neck)])
    rbf = RBFInterpolator(src_pts, disp, kernel='thin_plate_spline', smoothing=1.0)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    reg = (np.abs(xx - ctr[0]) < 130) & (np.abs(yy - ctr[1]) < 130)
    D = np.zeros((H, W, 2), np.float32); D[reg] = rbf(np.stack([xx[reg], yy[reg]], 1))
    D *= np.clip(1 - (np.hypot(xx - ctr[0], yy - ctr[1]) - 100) / 25, 0, 1)[..., None]
    Cw = cv2.remap(Cs, xx + D[..., 0], yy + D[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    # (3) skin tone: shift candidate skin toward the master's skin (master is the authority)
    sm_c = skin_mask(Cw); sm_m = skin_mask(M)
    shift = np.median(M[sm_m], 0) - np.median(Cw[sm_c], 0)
    soft = cv2.GaussianBlur(sm_c.astype(np.float32), (0, 0), 2)[..., None]
    Cw = Cw + shift * soft
    # (2) transplant master face (optionally with a subtle smile made by warping master pixels)
    Mw = M.copy()
    if smile:
        Y, X = np.mgrid[0:M.shape[0], 0:M.shape[1]].astype(np.float32)
        g = sum(np.exp(-((X - cx) ** 2 + (Y - cy) ** 2) / (2 * 3.0 ** 2)) for cx, cy in MX([(680, 199), (697, 195)]))
        Mw = cv2.remap(Mw, X, Y + smile * g, cv2.INTER_CUBIC)
    warped = cv2.warpAffine(Mw, T, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    poly = MX([[624, 148], [630, 178], [634, 201], [652, 215], [672, 222], [690, 226], [705, 216], [714, 197], [718, 172], [719, 148], [705, 138], [680, 141], [655, 143]])
    mask = np.zeros((H, W), np.float32); cv2.fillPoly(mask, [cv2.transform(poly[None], T)[0].astype(np.int32)], 1.0)
    mask = cv2.GaussianBlur(mask, (0, 0), 2.5)[..., None]
    out = Cw * (1 - mask) + warped * mask
    np.savez_compressed(out_prefix + '_parts.npz', Cw=Cw.astype(np.float32), warped=warped.astype(np.float32), mask=mask.astype(np.float32), T=T)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(out_prefix + '_facefix_v2.png')
    Image.fromarray(np.clip(Cs, 0, 255).astype(np.uint8)).save(out_prefix + '_orig_mscale.png')
    M = M0
    return out, k, T
if __name__ == '__main__':
    A_pts = [[940, 353], [1040, 340], [1006, 413], [1015, 460]]
    A_jaw = [[915, 500], [950, 478], [985, 458], [1015, 462], [1040, 440], [1062, 405]]   # candidate jaw contour (pixels)
    run('candidates/poseA_smile.png', A_pts, A_jaw, 'facefix/poseA', smile=0.0)
    run('candidates/poseA_smile.png', A_pts, A_jaw, 'facefix/poseA_smile', smile=1.2)
