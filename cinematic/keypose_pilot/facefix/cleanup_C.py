import numpy as np, cv2
from PIL import Image
P = np.load('facefix/poseC_smile_parts.npz'); Cw, Wm, mask = P['Cw'], P['warped'], P['mask'][..., 0]
H, W = mask.shape
# extend the transplant mask upward so the candidate's own (higher) eyebrows are replaced by the master's brow area
T = P['T']; poly = np.float32([[1253 - x, y] for x, y in [[622, 140], [628, 178], [634, 201], [652, 215], [672, 222], [690, 226], [705, 216], [714, 197], [719, 172], [721, 136], [705, 126], [680, 128], [655, 131]]])
m2 = np.zeros((H, W), np.float32); cv2.fillPoly(m2, [cv2.transform(poly[None], T)[0].astype(np.int32)], 1.0)
mask = np.maximum(mask, cv2.GaussianBlur(m2, (0, 0), 2.5))
out = Cw * (1 - mask[..., None]) + Wm * mask[..., None]
lum = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
band = cv2.dilate(((mask > 0.03) & (mask < 0.97)).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
hsv = cv2.cvtColor(np.clip(Cw, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
hairish = (hsv[..., 0] * 2 > 235) & (hsv[..., 0] * 2 < 330) & (hsv[..., 2] < 200)
take = cv2.GaussianBlur((band & (lum(Cw) < lum(Wm) - 12) & hairish).astype(np.float32), (0, 0), 1.2)
out = out * (1 - take[..., None]) + np.minimum(Cw, out) * take[..., None]
# pointed ear -> dark hair, cloned from the hair at (+30, +40)
ear = np.zeros((H, W), np.float32)
cv2.fillPoly(ear, [np.int32([[404, 196], [416, 186], [429, 181], [440, 182], [437, 192], [431, 203], [420, 211], [406, 212]])], 1.0)
ear = cv2.GaussianBlur(ear, (0, 0), 1.8)
donor = cv2.warpAffine(out, np.float32([[1, 0, 30], [0, 1, 40]]) * np.float32([[1, 1, -1], [1, 1, -1]]), (W, H), borderMode=cv2.BORDER_REFLECT)
out = out * (1 - ear[..., None]) + donor * ear[..., None]
np.save('facefix/_C_out.npy', out)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save('facefix/poseC_CLEAN_free.png')
