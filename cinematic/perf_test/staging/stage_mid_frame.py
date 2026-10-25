"""Stage the approved Mid-Glide as the MIDDLE pinned frame on the same paper as the start/end frames.
Same method as start_frame_poseA.png: the figure is multiply-blended onto the shared paper. No resize, no move, no
redraw. Only effect on her pixels: the paper-white balance ratio (<= ~2 levels per channel)."""
import numpy as np, cv2
from PIL import Image
APP = '/mnt/user-data/outputs/keypose_pilot/midglide/midglide_1_facefix_native.png'   # approved Mid-Glide (unchanged)
S = cv2.cvtColor(cv2.imread('start_frame_poseA.png'), cv2.COLOR_BGR2RGB).astype(np.float32)
M = cv2.cvtColor(cv2.imread(APP), cv2.COLOR_BGR2RGB).astype(np.float32)
H, W = M.shape[:2]; assert S.shape == M.shape == (1536, 2752, 3)
def fig_alpha(I, thr=6):
    paper = np.median(I[1100:1500, 100:600].reshape(-1, 3), 0)
    m = (np.abs(I - paper).max(2) > thr).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, l, st, _ = cv2.connectedComponentsWithStats(m); keep = np.isin(l, [i for i in range(1, n) if st[i, 4] > 400])
    return keep.astype(np.uint8)
def paper_field(I, figmask):
    """smooth paper colour field with the figure removed (low-res inpaint, blur, upsample)"""
    k = 16; small = cv2.resize(I, (W // k, H // k), interpolation=cv2.INTER_AREA)
    hole = cv2.resize(cv2.dilate(figmask, np.ones((61, 61), np.uint8)), (W // k, H // k), interpolation=cv2.INTER_NEAREST)
    f = np.dstack([cv2.inpaint(np.clip(small[..., c], 0, 255).astype(np.uint8), hole, 6, cv2.INPAINT_TELEA) for c in range(3)]).astype(np.float32)
    f = cv2.GaussianBlur(f, (0, 0), 3); return cv2.resize(f, (W, H), interpolation=cv2.INTER_CUBIC)
mM = fig_alpha(M); mS = fig_alpha(S)
ratio = M / np.maximum(paper_field(M, mM), 1)
a = cv2.GaussianBlur(cv2.dilate(mM, np.ones((7, 7), np.uint8)).astype(np.float32), (0, 0), 2.0)[..., None]
ratio = 1 + a * (ratio - 1)                                   # her own paper grain is not carried over
plateS = paper_field(S, mS)                                   # shared paper, with Pose A removed
pa = cv2.GaussianBlur(cv2.dilate(mS, np.ones((41, 41), np.uint8)).astype(np.float32), (0, 0), 8)[..., None]
plate = S * (1 - pa) + plateS * pa                            # real shared paper grain everywhere Pose A is not
out = np.clip(plate * ratio, 0, 255)
Image.fromarray(np.round(out).astype(np.uint8)).save('mid_frame_midglide.png')
# report
d = np.abs(np.round(out) - M); inside = mM.astype(bool)
print('her pixels vs approved: mean %.2f  p99 %.1f  max %.1f levels' % (d[inside].mean(), np.percentile(d[inside].max(1), 99), d[inside].max()))
