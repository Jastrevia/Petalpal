"""Reference plates for V3: load an approved reference (its local 4x upscale when available), paint out the reference's own
baked-in "PetalPal" corner mark (V3 adds one consistent watermark in assembly), return float RGB."""
import os, numpy as np, cv2
import fx
REF = fx.ROOT + '/refs/'; SR = fx.ROOT + '/sr/'

def corner_mark_mask(img):
    """mask of the bright corner wordmark + crocus in the lower-right of a reference (any resolution)."""
    h, w = img.shape[:2]; k = w / 1672
    x0, y0, x1, y1 = int(1455 * k), int(805 * k), int(1665 * k), int(925 * k)
    sub = img[y0:y1, x0:x1]; g = sub @ np.array([0.299, 0.587, 0.114], np.float32)
    bg = cv2.GaussianBlur(g, (0, 0), 9 * k)
    m = ((g - bg) > 0.035) | ((g > 0.80) & ((g - bg) > 0.015))
    m = cv2.dilate(m.astype(np.uint8), np.ones((int(7 * k) | 1,) * 2, np.uint8))
    full = np.zeros((h, w), np.uint8); full[y0:y1, x0:x1] = m
    return full

def load(name, prefer_sr=True, clean=True):
    p_sr = SR + name + '_x4.png'
    img = fx.load(p_sr) if (prefer_sr and os.path.exists(p_sr)) else fx.load(REF + name + '.png')
    if clean:
        m = corner_mark_mask(img); u8 = (img * 255).astype(np.uint8)
        inp = cv2.inpaint(u8, m, int(9 * img.shape[1] / 1672), cv2.INPAINT_TELEA).astype(np.float32) / 255
        mm = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)[..., None]
        soft = cv2.GaussianBlur(inp, (0, 0), 3 * img.shape[1] / 1672)
        img = img * (1 - mm) + soft * mm
    return img

def to_canvas_scale(img): return img.shape[1] / 1672.0           # px per reference px
