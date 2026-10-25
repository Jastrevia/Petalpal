"""Shot 11: the approved handwriting ("Today was harder than I expected.") appears in reading order just behind the tracked pen tip of V11r."""
import cv2, numpy as np, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 1920, 1080
A = cv2.resize(cv2.imread('keyframes/S11a.png'), (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
B = cv2.resize(cv2.imread('keyframes/S11b.png'), (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
ga = cv2.cvtColor(A.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32); gb = cv2.cvtColor(B.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
ink = ((ga - gb) > 28) & (gb < 140)
box = (int(W*0.30), int(H*0.42), int(W*0.75), int(H*0.75)); bm = np.zeros_like(ink); bm[box[1]:box[3], box[0]:box[2]] = True; ink &= bm
ys, xs = np.nonzero(ink)
# text direction from a line fit; two lines separated along the normal
vx, vy, x0, y0 = cv2.fitLine(np.stack([xs, ys], 1).astype(np.float32), cv2.DIST_L2, 0, 0.01, 0.01).ravel()
if vx < 0: vx, vy = -vx, -vy
u = (xs - x0) * vx + (ys - y0) * vy; v = -(xs - x0) * vy + (ys - y0) * vx
thr = np.median(v); l1 = v < thr
order = np.zeros(len(xs), np.float32)
for m, (o0, o1) in ((l1, (0.0, 0.56)), (~l1, (0.56, 1.0))):
    uu = u[m]; order[m] = o0 + (uu - uu.min()) / (uu.max() - uu.min() + 1e-6) * (o1 - o0)
ordmap = np.full((H, W), 9.0, np.float32); ordmap[ys, xs] = order
ordmap = cv2.erode(ordmap, np.ones((3, 3), np.uint8))  # spread order to stroke edges (min filter)
inkA = np.zeros((H, W), np.float32); inkA[ys, xs] = 1; inkA = cv2.GaussianBlur(cv2.dilate(inkA, np.ones((2, 2), np.uint8)), (3, 3), 0)
textband = np.zeros((H, W), bool); textband[int(H*0.36):int(H*0.82), int(W*0.26):int(W*0.80)] = True
# clean paper plate: S11a with its hand region filled from S11b (whose hand sits elsewhere), ink excluded
dAB = np.abs(A - B).max(axis=2); handA = (dAB > 45) & ~cv2.dilate(ink.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
nA, labA, stA, _ = cv2.connectedComponentsWithStats(handA.astype(np.uint8))
handA = np.isin(labA, 1 + np.nonzero(stA[1:, cv2.CC_STAT_AREA] > 4000)[0]); handA = cv2.dilate(handA.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
PLATE = A.copy(); PLATE[handA] = B[handA]
PLATE_INKFREE = PLATE.copy(); inkd = cv2.dilate(ink.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
PLATE_INKFREE[inkd] = cv2.medianBlur(PLATE.astype(np.uint8), 15).astype(np.float32)[inkd]
cap = cv2.VideoCapture('shots/V11r.mp4'); F = []
while True:
    ok, f = cap.read()
    if not ok: break
    F.append(cv2.resize(f, (W, H), interpolation=cv2.INTER_LANCZOS4))
def tip(f):
    hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV); h, s, val = hsv[..., 0].astype(int)*2, hsv[..., 1], hsv[..., 2]
    gold = (h > 25) & (h < 60) & (s > 90) & (val > 120)
    gold = cv2.morphologyEx(gold.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(gold)
    if n < 2: return None
    k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); yy, xx = np.nonzero(lab == k)
    i = np.argmin(xx); return xx[i], yy[i]
tips = [tip(f) for f in F]
tx = np.array([t[0] if t else np.nan for t in tips], float)
# first writing pass: from the first frame until the pen reaches its right-most point before returning
valid = ~np.isnan(tx); txs = np.where(valid, tx, np.interp(np.arange(len(tx)), np.nonzero(valid)[0], tx[valid]))
txs = np.convolve(txs, np.ones(5)/5, 'same')
end = int(np.argmax(txs[:60])) if len(txs) > 60 else int(np.argmax(txs))
prog = np.clip((txs - txs[0]) / (txs[end] - txs[0] + 1e-6), 0, 1); prog[end:] = 1
prog = np.clip((np.arange(len(txs)) - 3) / (end - 6), 0, 1); prog = prog*prog*(3-2*prog)
print('frames', len(F), 'pass end frame', end, 'tip x start %.0f end %.0f' % (txs[0], txs[end]))
os.makedirs('vfx/S11', exist_ok=True); NOUT = min(len(F), end + 16)
for i in range(NOUT):
    f = F[i].astype(np.float32)
    diff = np.abs(f - PLATE_INKFREE).max(axis=2)
    hand = (diff > 45).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(hand)
    big = np.isin(lab, 1 + np.nonzero(st[1:, cv2.CC_STAT_AREA] > 6000)[0]); big = cv2.dilate(big.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    clean = f.copy(); m = textband & ~big; clean[m] = PLATE_INKFREE[m]          # erase the model's own marks under the text, keep the hand
    p = prog[i] * 1.02
    vis = np.clip((p - ordmap) / 0.025, 0, 1) * inkA * (~big)
    out = clean * (1 - vis[..., None]) + B * vis[..., None]
    cv2.imwrite(f'vfx/S11/{i:03d}.png', np.clip(out, 0, 255).astype(np.uint8))
print('S11 frames', NOUT)
