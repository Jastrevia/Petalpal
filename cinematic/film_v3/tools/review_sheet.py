"""Storyboard sheet of Film V3: two frames per shot from the final mp4."""
import json, cv2
from PIL import Image, ImageDraw, ImageFont
R = '/mnt/user-data/outputs/film_v3'
E = json.load(open(R + '/edit/edl_v3.json'))
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15); FT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
c = cv2.VideoCapture(R + '/edit/PetalPal_Film_V3.mp4')
tw, th = 400, 225; cols = 4; cells = []
for s in E['shots']:
    for frac in (0.3, 0.85):
        fi = s['start_frame'] + int(s['frames'] * frac); c.set(cv2.CAP_PROP_POS_FRAMES, fi); ok, f = c.read()
        cells.append((s, fi, Image.fromarray(cv2.cvtColor(cv2.resize(f, (tw, th), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB))))
rws = (len(cells) + cols - 1) // cols
S = Image.new('RGB', (cols * (tw + 10) + 10, 70 + rws * (th + 50)), (250, 247, 242)); d = ImageDraw.Draw(S)
d.text((12, 14), 'PetalPal Film V3 (%.1f s, first person): two frames per shot' % E['seconds'], font=FT, fill=(50, 30, 60))
for kk, (s, fi, im) in enumerate(cells):
    x = 10 + (kk % cols) * (tw + 10); y = 70 + (kk // cols) * (th + 50)
    S.paste(im, (x, y)); d.text((x, y + th + 4), '%.1fs  %s' % (fi / 24, s['label'][:44]), font=F, fill=(60, 40, 70))
S.save(R + '/edit/Film_V3_storyboard.jpg', quality=88); print(S.size)
