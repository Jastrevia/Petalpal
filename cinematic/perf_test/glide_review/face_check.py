"""Per-drawing face check: master face (eyes-nose-mouth) searched over full scale range in every 3rd frame."""
import cv2, numpy as np, json
from PIL import Image, ImageDraw, ImageFont
FB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13); F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
cap = cv2.VideoCapture('glide_v1_8s_join.mp4'); fr = []
while True:
    ok, f = cap.read()
    if not ok: break
    fr.append(f)
H, W = fr[0].shape[:2]
Mst = cv2.cvtColor(cv2.imread('../../keypose_pilot/refs/master_on_paper.png'), cv2.COLOR_BGR2GRAY); T0 = Mst[140:215, 630:725]
idx = sorted(set(list(range(0, len(fr), 3)) + [96, len(fr) - 1])); out = []
for i in idx:
    g = cv2.cvtColor(fr[i], cv2.COLOR_BGR2GRAY); best = None
    for s in np.arange(0.7, 1.75, 0.035):
        for ang in (-6, -3, 0, 3, 6):
            R = cv2.getRotationMatrix2D((47.5, 37.5), ang, s); w, h = int(95 * s), int(75 * s); R[:, 2] += [(w - 95) / 2, (h - 75) / 2]
            t = cv2.warpAffine(T0, R, (w, h), borderMode=cv2.BORDER_REPLICATE)
            r = cv2.matchTemplate(g[:int(H * .55), int(W * .5):int(W * .85)], t, cv2.TM_CCOEFF_NORMED); _, v, _, loc = cv2.minMaxLoc(r)
            if best is None or v > best[0]: best = (float(v), float(s), ang, loc[0] + int(W * .5), loc[1], w, h)
    out.append(dict(frame=i, ncc=round(best[0], 3), scale=round(best[1], 3), roll=best[2], box=list(best[3:])))
json.dump(out, open('face_check.json', 'w'))
n = len(out); cols = 17; tw = 160; rows = (n + cols - 1) // cols
S = Image.new('RGB', (cols * tw, rows * (tw + 34)), 'white'); d = ImageDraw.Draw(S)
for k, o in enumerate(out):
    x0, y0, w, h = o['box']; cx, cy = x0 + w / 2, y0 + h / 2; r = w * 1.05
    im = Image.fromarray(cv2.cvtColor(fr[o['frame']], cv2.COLOR_BGR2RGB)).crop((int(cx - r), int(cy - r * 1.1), int(cx + r), int(cy + r * .9))).resize((tw, tw), Image.LANCZOS)
    x, y = (k % cols) * tw, (k // cols) * (tw + 34); S.paste(im, (x, y + 34))
    d.text((x + 3, y + 2), 'f%03d%s' % (o['frame'], ' JOIN' if o['frame'] == 96 else ''), font=FB, fill=(180, 0, 0) if o['frame'] == 96 else (30, 30, 30)); d.text((x + 3, y + 18), 'ncc %.2f roll %+d' % (o['ncc'], o['roll']), font=F, fill=(70, 70, 70))
S.save('face_strip_drawings.jpg', quality=90)
v = [o['ncc'] for o in out]; print('min', min(v), 'at', out[int(np.argmin(v))]['frame'], 'mean', round(float(np.mean(v)), 3)); print([(o['frame'], o['ncc']) for o in out if o['ncc'] < 0.85])
