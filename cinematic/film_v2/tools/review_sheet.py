"""Storyboard sheet of First Cut v2: two frames per shot from the final mp4, labelled with time and shot name."""
import json, cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont
R = '/mnt/user-data/outputs/film_v2'
E = json.load(open(R + '/edit/edl_v2.json'))
FB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17); F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
c = cv2.VideoCapture(R + '/edit/PetalPal_FirstCut_v2.mp4')
tw, th = 400, 225; cols = 4; shots = E['shots']; rows = len(shots)
cells = []
for s in shots:
    for frac in (0.3, 0.85):
        fi = s['start_frame'] + int(s['frames'] * frac); c.set(cv2.CAP_PROP_POS_FRAMES, fi); ok, f = c.read()
        cells.append((s, fi, Image.fromarray(cv2.cvtColor(cv2.resize(f, (tw, th), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB))))
n = len(cells); rws = (n + cols - 1) // cols
S = Image.new('RGB', (cols * (tw + 10) + 10, 70 + rws * (th + 50)), (250, 247, 242)); d = ImageDraw.Draw(S)
d.text((12, 14), 'PetalPal First Cut v2 (60.0 s, first person): two frames per shot', font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26), fill=(50, 30, 60))
for k, (s, fi, im) in enumerate(cells):
    x = 10 + (k % cols) * (tw + 10); y = 70 + (k // cols) * (th + 50)
    S.paste(im, (x, y)); d.text((x, y + th + 4), '%.1fs  %s' % (fi / 24, s['label'][:40]), font=F, fill=(60, 40, 70))
S.save(R + '/edit/FirstCut_v2_storyboard.jpg', quality=88); print(S.size)
