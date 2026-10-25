"""Pose C second free pass: (1) remove the candidate's higher eyebrows by local closing instead of extending the master
forehead (fixes the pale forehead band); (2) match hair hue/value distribution to the approved master (less gloss);
(3) ear -> hair as before. Mirrored master face as before."""
import numpy as np, cv2
from PIL import Image
P = np.load('facefix/poseC_smile_parts.npz'); Cw, Wm, mask = P['Cw'].copy(), P['warped'], P['mask'][..., 0]
T = P['T']; H, W = mask.shape
M = cv2.cvtColor(cv2.imread('refs/master_on_paper.png'), cv2.COLOR_BGR2RGB).astype(np.float32)
hsvf = lambda a: cv2.cvtColor(np.clip(a, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
lum = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
# (1) forehead: extend the master face up over the candidate's (higher) brows, but keep the candidate's bangs:
#     dark violet pixels that belong to the large connected hair mass stay on top; small isolated strokes (brows) go.
poly_ext = np.float32([[1253 - x, y] for x, y in [[622, 140], [628, 178], [634, 201], [652, 215], [672, 222], [690, 226], [705, 216], [714, 197], [719, 172], [721, 132], [705, 122], [680, 124], [655, 127]]])
m2 = np.zeros((H, W), np.float32); cv2.fillPoly(m2, [cv2.transform(poly_ext[None], T)[0].astype(np.int32)], 1.0)
mask_e = np.maximum(mask, cv2.GaussianBlur(m2, (0, 0), 2.5))
out = Cw * (1 - mask_e[..., None]) + Wm * mask_e[..., None]
h = hsvf(Cw); hairish = (h[..., 0] * 2 > 235) & (h[..., 0] * 2 < 335) & (h[..., 2] < 205) & (h[..., 1] > 20)
dark = hairish & (lum(Cw) < lum(Wm) - 10)
n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(dark.astype(np.uint8), np.ones((2, 2), np.uint8)))
big = np.isin(lab, 1 + np.nonzero(st[1:, cv2.CC_STAT_AREA] > 2500)[0]) & dark
keep = cv2.GaussianBlur((big & (mask_e > 0.03) & (mask < 0.6)).astype(np.float32), (0, 0), 1.0)
out = out * (1 - keep[..., None]) + np.minimum(Cw, out) * keep[..., None]
bandS = cv2.dilate(((mask > 0.03) & (mask < 0.97)).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
take = cv2.GaussianBlur((bandS & dark).astype(np.float32), (0, 0), 1.2)
out = out * (1 - take[..., None]) + np.minimum(Cw, out) * take[..., None]
brow = keep
# (3) ear -> hair
ear = np.zeros((H, W), np.float32)
cv2.fillPoly(ear, [np.int32([[404, 196], [416, 186], [429, 181], [440, 182], [437, 192], [431, 203], [420, 211], [406, 212]])], 1.0)
ear = cv2.GaussianBlur(ear, (0, 0), 1.8)
donor = cv2.warpAffine(out, np.float32([[1, 0, -30], [0, 1, -40]]), (W, H), borderMode=cv2.BORDER_REFLECT)
out = out * (1 - ear[..., None]) + donor * ear[..., None]
if False:  # (disabled) explicit brow-wash removal (candidate's higher brows that survived above the transplant), filled from surrounding skin
    bm = np.zeros((H, W), np.uint8)
    for poly in ([[336, 151], [380, 148], [382, 164], [338, 166]], [[288, 152], [319, 150], [321, 166], [289, 168]]):
        cv2.fillPoly(bm, [np.int32(poly)], 1)
    filled = cv2.inpaint(np.clip(out, 0, 255).astype(np.uint8), bm, 6, cv2.INPAINT_TELEA).astype(np.float32)
    bw = cv2.GaussianBlur(bm.astype(np.float32), (0, 0), 1.5)[..., None]
    out = out * (1 - bw) + filled * bw
# (2) hair grade: hue shift and quantile-match V and S of hair pixels in the head region to the master's hair
def hairmask(img, box):
    x0, y0, x1, y1 = box; hh = hsvf(img); m = np.zeros(img.shape[:2], bool)
    sub = hh[y0:y1, x0:x1]; m[y0:y1, x0:x1] = (sub[..., 0] * 2 > 235) & (sub[..., 0] * 2 < 330) & (sub[..., 2] < 191) & (sub[..., 1] > 25)
    return m, hh
mM, hM = hairmask(M, (520, 40, 780, 300))
mC, hC = hairmask(out, (220, 40, 500, 330))
mC &= mask < 0.5
mC &= ~(np.hypot(*np.mgrid[0:H, 0:W][::-1] - np.float32([450, 195])[:, None, None]) < 55)      # protect the crocus
def qmap(src, ref):
    qs = np.linspace(0, 100, 101); a = np.percentile(src, qs); b = np.percentile(ref, qs); return lambda v: np.interp(v, a, b)
fV = qmap(hC[..., 2][mC], hM[..., 2][mM]); fS = qmap(hC[..., 1][mC], hM[..., 1][mM])
dh = (np.median(hM[..., 0][mM]) - np.median(hC[..., 0][mC]))
hn = hC.copy(); hn[..., 2] = fV(hC[..., 2]); hn[..., 1] = fS(hC[..., 1]); hn[..., 0] = (hC[..., 0] + dh) % 180
graded = cv2.cvtColor(np.clip(hn, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)
w = cv2.GaussianBlur(mC.astype(np.float32), (0, 0), 1.5)[..., None]
out = out * (1 - w) + graded * w
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save('facefix/poseC_CLEAN_free_v2.png')
print('hue shift (deg)', dh * 2, 'brow px', int((brow > 0.5).sum()), 'hair px graded', int(mC.sum()))
