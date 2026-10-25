"""Free cleanup of midglide_1.png (no AI, no paid calls):
(1) remove the blocking-sketch header text the model copied into the empty top-left by cloning blank paper
    from directly below it (rows 285-505 -> 20-240), feathered;
(2) invented pointed ear tip -> hair, cloned from the hair 42 px below (same rule as Pose A / Pose C)."""
import numpy as np, cv2
from PIL import Image
C = cv2.cvtColor(cv2.imread('midglide/midglide_1.png'), cv2.COLOR_BGR2RGB).astype(np.float32); H, W = C.shape[:2]
out = C.copy()
# (1) text -> paper
x0, x1, y0, y1, dy = 0, 1330, 0, 250, 265
m = np.zeros((H, W), np.float32); m[y0:y1, x0:x1] = 1; m = cv2.GaussianBlur(m, (0, 0), 6)
donor = np.roll(C, -dy, axis=0)
out = out * (1 - m[..., None]) + donor * m[..., None]
# (2) ear tip -> hair
ear = np.zeros((H, W), np.float32)
cv2.fillPoly(ear, [np.int32([[1717, 308], [1727, 297], [1745, 297], [1758, 304], [1763, 318], [1761, 338], [1752, 343], [1737, 337], [1724, 326]])], 1.0)
ear = cv2.GaussianBlur(ear, (0, 0), 2.0)
donor = np.roll(out, -42, axis=0)
out = out * (1 - ear[..., None]) + donor * ear[..., None]
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save('midglide/midglide_1_clean.png')
d = np.abs(out - C).max(2) > 2
ys, xs = np.nonzero(d); print('changed px', d.sum(), 'bbox', xs.min(), ys.min(), xs.max(), ys.max())
