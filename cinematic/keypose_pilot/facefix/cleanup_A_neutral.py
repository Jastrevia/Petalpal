"""Free cleanup of the Pose A face transplant: hair/face seam (keep the darker hair strand from either source),
remove the invented ear tip and earring by cloning neighbouring hair, soften the neck transition."""
import numpy as np, cv2
from PIL import Image
P = np.load('facefix/poseA_parts.npz'); Cw, Wm, mask = P['Cw'], P['warped'], P['mask'][..., 0]
H, W = mask.shape
out = Cw * (1 - mask[..., None]) + Wm * mask[..., None]
lum = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
# 1) seam: in the blend band, hair strands (darker, violet) from the candidate survive over the master's skin
band = (mask > 0.03) & (mask < 0.97)
band = cv2.dilate(band.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
hsv = cv2.cvtColor(np.clip(Cw, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
hairish = (hsv[..., 0] * 2 > 235) & (hsv[..., 0] * 2 < 330) & (hsv[..., 2] < 200)
dark_c = (lum(Cw) < lum(Wm) - 12) & hairish
take = (band & dark_c).astype(np.float32)
take = cv2.GaussianBlur(take, (0, 0), 1.2)
out = out * (1 - take[..., None]) + np.minimum(Cw, out) * take[..., None]
# 2) ear tip + earring -> hair, by cloning the hair 22 px below with a feathered mask
ear = np.zeros((H, W), np.float32)
cv2.fillPoly(ear, [np.int32([[460, 194], [472, 189], [486, 191], [492, 200], [493, 212], [487, 218], [474, 214], [462, 205]])], 1.0)
ear = cv2.GaussianBlur(ear, (0, 0), 2.0)
M_shift = np.float32([[1, 0, 0], [0, 1, -22]])
donor = cv2.warpAffine(out, M_shift, (W, H), borderMode=cv2.BORDER_REFLECT)   # pixel (x,y) takes (x, y+22)
out = out * (1 - ear[..., None]) + donor * ear[..., None]
# 3) neck: smooth skin-tone discontinuities just under the jaw (keep line art: only low-frequency correction)
neck = np.zeros((H, W), np.float32)
cv2.fillPoly(neck, [np.int32([[498, 250], [545, 252], [545, 300], [492, 300]])], 1.0)
neck = cv2.GaussianBlur(neck, (0, 0), 6)
low = cv2.GaussianBlur(out, (0, 0), 7); low_ref = cv2.GaussianBlur(out, (0, 0), 18)
out = out + (low_ref - low) * neck[..., None] * 0.6
res = np.clip(out, 0, 255).astype(np.uint8)
Image.fromarray(res).save('facefix/poseA_NEUTRAL_free.png')
print('saved', res.shape)
