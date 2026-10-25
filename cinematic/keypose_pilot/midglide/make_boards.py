import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
F = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', s)
FB = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', s)
def load(p): return Image.open(p).convert('RGB')
def figbox(im, pad=20):
    f = np.asarray(im).astype(np.float32); paper = np.median(np.concatenate([f[:40].reshape(-1, 3), f[-40:].reshape(-1, 3)]), 0)
    m = (np.abs(f - paper).max(2) > 28).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, l, st, _ = cv2.connectedComponentsWithStats(m); keep = [i for i in range(1, n) if st[i, 4] > 600]
    xs = np.concatenate([np.nonzero(l == i)[1] for i in keep]); ys = np.concatenate([np.nonzero(l == i)[0] for i in keep])
    return (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, im.width), min(ys.max() + pad, im.height))
items = [('Master (authority)', 'refs/master_on_paper.png', (560, 80, 780, 320)),
         ('Pose A (approved)', 'facefix/poseA_CLEAN_free.png', None),
         ('Mid-Glide raw (paid, $0.15)', 'midglide/midglide_1.png', (1690, 175, 1970, 455)),
         ('Mid-Glide corrected (free)', 'midglide/midglide_1_facefix_native.png', (1690, 175, 1970, 455)),
         ('Reach (approved)', 'reach/reach_handfix_composite.png', (1580, 230, 2010, 660))]
# Pose A face box from its eye positions (found by matching the master face crop)
im = load('facefix/poseA_CLEAN_free.png'); g = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2GRAY)
mf = cv2.cvtColor(np.asarray(load('refs/master_on_paper.png').crop((620, 130, 730, 230))), cv2.COLOR_RGB2GRAY)
best = None
for s in np.linspace(0.6, 1.4, 17):
    t = cv2.resize(mf, None, fx=s, fy=s); r = cv2.matchTemplate(g, t, cv2.TM_CCOEFF_NORMED); _, v, _, loc = cv2.minMaxLoc(r)
    if best is None or v > best[0]: best = (v, s, loc)
v, s, (lx, ly) = best; cx, cy = lx + 55 * s, ly + 50 * s; half = 120 * s
items[1] = (items[1][0], items[1][1], (int(cx - half * 0.9), int(cy - half), int(cx + half * 1.1), int(cy + half * 1.2)))
TH, TW, FH = 900, 520, 520
board = Image.new('RGB', (len(items) * (TW + 20) + 20, 90 + TH + 50 + FH + 60), (250, 247, 242)); d = ImageDraw.Draw(board)
d.text((20, 18), 'PetalPal fairy, Mid-Glide key pose: comparison with the master, Pose A and Reach (free correction shown; nothing approved changed)', font=FB(26), fill=(50, 30, 60))
for i, (name, p, fb) in enumerate(items):
    im = load(p); x = 20 + i * (TW + 20)
    fig = im.crop(figbox(im)); k = min(TH / fig.height, TW / fig.width); fig = fig.resize((int(fig.width * k), int(fig.height * k)), Image.LANCZOS)
    board.paste(fig, (x + (TW - fig.width) // 2, 90 + TH - fig.height)); d.text((x, 60), name, font=FB(22), fill=(60, 40, 70))
    face = im.crop(fb); face = face.resize((TW, int(TW * face.height / face.width)), Image.LANCZOS).crop((0, 0, TW, FH))
    board.paste(face, (x, 90 + TH + 50)); d.text((x, 90 + TH + 14), 'face, same crop size', font=F(18), fill=(110, 90, 120))
d.text((20, board.height - 40), 'Corrected = stray blocking text removed (paper cloned), invented pointed ear tip -> hair, master face transplanted (jaw warp, skin match, smile 1.2 as Reach). Figure, pose, hands, wings, dress untouched.', font=F(18), fill=(90, 70, 100))
board.save('MIDGLIDE_comparison_board.jpg', quality=90)
# sequence board
S = load('../perf_test/start_frame_poseA.png'); M = load('midglide/midglide_1_facefix_native.png'); E = load('../perf_test/end_frame_reach.png')
w = 900; h = int(w * 1536 / 2752)
seq = Image.new('RGB', (3 * w + 80, 70 + h + 40 + 2 * h + 80), (250, 247, 242)); d = ImageDraw.Draw(seq)
d.text((20, 18), 'Motion sequence check: Pose A (start frame) -> Mid-Glide -> Reach (end frame), same 2752x1536 canvas', font=FB(26), fill=(50, 30, 60))
for i, (n, im) in enumerate([('0.0 s  Pose A (start frame)', S), ('~4.0 s  Mid-Glide', M), ('~7.0 s  Reach (end frame)', E)]):
    seq.paste(im.resize((w, h), Image.LANCZOS), (20 + i * (w + 20), 70)); d.text((20 + i * (w + 20), 70 + h + 6), n, font=FB(20), fill=(60, 40, 70))
on = load('midglide/_onion.jpg').resize((2 * w, 2 * h), Image.LANCZOS); seq.paste(on, (20, 70 + h + 40))
notes = ['Onion skin', 'blue = Pose A', 'green = Mid-Glide', 'red = Reach', '',
         'Eye distance (scale)', '52 -> 73 -> 117 px', 'x1.40 in 4 s, then x1.60 in 3 s', '',
         'Head (eye midpoint)', '(1906,229) -> (1837,281)', '-> (1766,388)', 'x steps even; y drops faster', '',
         'Right hand', 'chest -> front of waist (palm up)', '-> out to screen-left, open palm', '(~960 px sweep across body in 3 s)', '',
         'Body', 'upright -> ~20 deg lean -> ~45 deg', 'feet trail left monotonically', 'head angle identical in all three']
y = 70 + h + 50
for t in notes:
    d.text((2 * w + 60, y), t, font=FB(20) if t and not t[0].isdigit() and t in ('Onion skin', 'Eye distance (scale)', 'Head (eye midpoint)', 'Right hand', 'Body') else F(19), fill=(60, 40, 70)); y += 28
seq.save('MIDGLIDE_sequence_board.jpg', quality=90)
print('pose A match', round(v, 3), round(s, 2))
