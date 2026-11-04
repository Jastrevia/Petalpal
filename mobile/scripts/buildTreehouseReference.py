"""Builds the illustrated Treehouse's room layers (assets/bookhouse/reference) from the approved illustration.

    python3 scripts/buildTreehouseReference.py

Source: assets/bookhouse/reference/source/treehouse-reference.png (the approved illustration, 1024 x 1536). It shows the
whole screen, so everything interactive in it is painted out here and drawn live by the app instead:

  * its bookcase (books, year labels, the "My Journals" sign, the Flower History button): room-back.webp shows plain
    shelves there (only ever seen through the receding shelf while the camera pulls back), and room-front.webp is
    clear there (the live bookcase shows through), with soft edges;
  * the closed book and its lace cloth: gone — the desk top is laid anew (the live open journal lies on it);
  * the desk is made deeper for the open journal and its date controls.

The new desk top is continuous-structure.png's own desk boards (the same Treehouse's painted desk: boards, knots and
perspective), scaled uniformly, its dappled sunlight evened out and lit like the illustration's desk. The illustration's
lantern, quill and ink, teacup, books and flowers stand on it where they stood (cut out with GrabCut, with soft contact
shadows); its plant, the desk's front and its drawers come after the deeper desk. Nothing is stretched.

Rows above SEAM keep the illustration's own coordinates (composed.ts REF registers them).
"""
import os
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets/bookhouse/reference/source/treehouse-reference.png')
BOARDS = os.path.join(ROOT, 'assets/bookhouse/continuous-structure.png')
OUT = os.path.join(ROOT, 'assets/bookhouse/reference')

# Measurements on the illustration (px).
SHELF = (160, 880)          # the bookcase's outer edges (composed.ts REF.shelfX0/X1)
EDGE = 1058                 # the desk's back edge (REF.edge)
CANOPY = 80                 # vines and canopy above the bookcase, laid softly over the live shelf's top
SEAM = 1100                 # the illustration's desk is kept down to here (above the closed book and its cloth)
FRONT = 1428                # the desk top's front edge (then its lip and drawers, to the bottom)
EXTRA = 574                 # the desk is this much deeper
BOTTOM_PAD = 100            # more drawer front below the illustration's bottom edge (taller screens)
# Things standing on the desk (boxes for GrabCut) and whether they move with the desk's front.
PROPS = [
    # (The lantern's base ring and brass feet are wood-coloured: they are given by hand.)
    dict(name='lantern', box=(0, 936, 160, 1246), front=False, shadow=(70, 1228, 78, 12),
         extra=[[(0, 1168), (130, 1166), (132, 1213), (60, 1216), (0, 1218)], [(31, 1204), (59, 1204), (58, 1245), (31, 1245)],
                [(117, 1178), (144, 1180), (143, 1225), (117, 1224)]]),
    dict(name='quill', box=(118, 930, 275, 1205), front=False, shadow=(222, 1194, 46, 7), nowood=True),
    dict(name='cup', box=(778, 985, 958, 1178), front=False, shadow=(864, 1166, 86, 10), nowood=True, left=781),
    dict(name='books', box=(868, 952, 1024, 1252), front=False, shadow=None),
    dict(name='flower', box=(146, 1198, 198, 1242), front=False, shadow=None, nowood=True),
    # (The illustration's plant at the desk's front-left corner and a petal at its front-right are left out: on a phone
    # the open journal's date arrows stand exactly there.)
]
# continuous-structure.png: its desk boards (clear of the objects along its back edge).
BOARD_ROWS = (1140, 1881)

src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W = src.shape[:2]


HSV = cv2.cvtColor(src.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
# The desk's wood: orange-brown, fairly saturated, not too bright (OpenCV hue is 0..180).
WOOD = (HSV[..., 0] >= 5) & (HSV[..., 0] <= 17) & (HSV[..., 1] >= 95) & (HSV[..., 2] <= 235)


def cutout(box, extra=(), nowood=False):
    """The object inside `box`: GrabCut, plus whatever in the box is not desk wood and touches it (the brass feet, the
    glass, petals), a soft 0..1 mask over the whole illustration."""
    bx0, by0, bx1, by1 = box
    m = np.zeros((H, W), np.uint8)
    bg, fg = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(src.astype(np.uint8), m, (bx0, by0, bx1 - bx0, by1 - by0), bg, fg, 8, cv2.GC_INIT_WITH_RECT)
    obj = np.where((m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    inbox = np.zeros((H, W), bool); inbox[by0:by1, bx0:bx1] = True
    other = (~WOOD & inbox).astype(np.uint8)
    other = cv2.morphologyEx(other, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab = cv2.connectedComponents(other)
    near = cv2.dilate(obj, np.ones((7, 7), np.uint8)) > 0
    for i in range(1, n):
        piece = lab == i
        if (piece & near).any() and piece.sum() > 25: obj[piece] = 1
    if nowood:
        # Along the box's edges, desk wood GrabCut took in is put back (the object itself keeps every colour).
        edge = inbox.copy(); edge[by0 + 14:by1 - 14, bx0 + 14:bx1 - 14] = False
        obj[edge & WOOD] = 0
    for poly in extra:
        cv2.fillPoly(obj, [np.array(poly, np.int32)], 1)
    obj = cv2.morphologyEx(obj, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    obj = cv2.morphologyEx(obj, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return cv2.GaussianBlur(obj.astype(np.float32), (0, 0), 1.0)


# ---------- the new desk top ----------
F = FRONT + EXTRA                       # the deeper desk's front edge (new image rows)
depth = F - SEAM                        # rows of new desk top, from the seam to the front edge
boards = Image.open(BOARDS).convert('RGB')
bw, bh = boards.size
k = W / bw                              # one uniform scale: the boards span the width
b = np.asarray(boards.crop((0, BOARD_ROWS[0], bw, BOARD_ROWS[1])).resize((W, round((BOARD_ROWS[1] - BOARD_ROWS[0]) * k)), Image.LANCZOS)).astype(np.float32)
assert b.shape[0] >= depth, (b.shape, depth)
b = b[:depth]
# Even out the boards' dappled sunlight (keep the grain, the knots and the joints between boards)...
grain = b - cv2.GaussianBlur(b, (0, 0), 28)
# ...and light them like the illustration's desk: its own light just behind the seam, carried forward, dimming a little
# toward the reader.
# (Only the desk's own clean wood counts: not the lantern, the ink, the teacup, the cloth or the book.)
band = src[EDGE + 6:FRONT - 6]
clean = WOOD[EDGE + 6:FRONT - 6].copy()
clean[:, :170] = False; clean[:, 860:] = False
clean[cv2.ellipse(np.zeros(clean.shape, np.uint8), (531, 1272 - EDGE - 6), (360, 180), 0, 0, 360, 1, -1) > 0] = False
profile = np.zeros((W, 3), np.float32)
for x in range(W):
    col = band[clean[:, x], x]
    profile[x] = np.median(col, 0) if len(col) > 8 else np.nan
good = ~np.isnan(profile[:, 0])
for c in range(3): profile[:, c] = np.interp(np.arange(W), np.where(good)[0], profile[good, c])
profile = cv2.GaussianBlur(profile[None], (0, 0), sigmaX=60, sigmaY=0)[0]
# Its light, carried forward from just behind the seam (matched there), dimming a little toward the reader.
at_seam = cv2.GaussianBlur(src[SEAM - 24:SEAM - 4].mean(0, keepdims=True), (0, 0), sigmaX=90, sigmaY=0)[0]
match = np.clip(at_seam / np.maximum(profile, 1), .8, 1.25)
light = np.repeat((profile * match)[None], depth, 0) * (1 - .12 * np.linspace(0, 1, depth) ** 1.3)[:, None, None]
desk = light + grain * 1.05

# ---------- the scene, deeper ----------
img = np.zeros((F + (H - FRONT) + BOTTOM_PAD, W, 3), np.float32)
img[:SEAM] = src[:SEAM]
img[SEAM:F] = desk
img[F:F + (H - FRONT)] = src[FRONT:]
# The desk's front lip and drawers on the left, where the plant hung over them: their mirror image from the right (the
# drawer front is symmetric about its centre handle), blended in.
lip = src[FRONT:].copy()
mirrored = lip[:, ::-1]
fade = np.clip((np.arange(W) - 200) / 40, 0, 1)[None, :, None]             # mirrored up to x 200, blending to 240
lip = mirrored * (1 - fade) + lip * fade
img[F:F + (H - FRONT)] = lip
pad = lip[-BOTTOM_PAD:][::-1] * np.linspace(1, .55, BOTTOM_PAD)[:, None, None]
img[F + (H - FRONT):] = pad
H2 = img.shape[0]
# The illustration's desk and the new top meet in a soft cross-fade (just behind where the cloth began).
blend = 22
ramp = np.linspace(0, 1, blend)[:, None, None]
img[SEAM - blend:SEAM] = src[SEAM - blend:SEAM] * (1 - ramp) + desk[:1] * ramp
# The new top meets the desk's own front edge softly too.
img[F - 8:F] = img[F - 8:F] * np.linspace(1, .4, 8)[:, None, None] + src[FRONT - 8:FRONT] * np.linspace(0, .6, 8)[:, None, None]

# ---------- the things on the desk, back where they stood ----------
masks = {}
for prop in PROPS:
    m = cutout(prop['box'], prop.get('extra', ()), prop.get('nowood', False))
    if 'left' in prop: m[:, :prop['left']] = 0            # (nothing of it lies left of here: the saucer's rim)
    masks[prop['name']] = m
    dy = EXTRA if prop['front'] else 0
    if prop['shadow']:
        cx, cy, rx, ry = prop['shadow']
        sh = np.zeros((H2, W), np.float32)
        cv2.ellipse(sh, (cx, cy + dy), (rx, ry), 0, 0, 360, 1, -1)
        sh = cv2.GaussianBlur(sh, (0, 0), 7) * .45
        img *= (1 - sh[..., None])
    y0, y1 = prop['box'][1], prop['box'][3]
    a = m[y0:y1, :, None]
    img[y0 + dy:y1 + dy] = img[y0 + dy:y1 + dy] * (1 - a) + src[y0:y1] * a

# ---------- the desk graded like the bookshelf painting's own desk ----------
# The new desk top (and the illustration's lamplit strip behind it) came out brighter and more orange than the bookshelf
# painting (interior.png): its wood, measured in Lab, is moved to interior.png's own desk top — lightness and contrast
# (within limits), and the warmth (a, b: shifted, not scaled). Only the desk's wood: the things standing on it keep their
# colours, and the lantern's glow on the boards stays relatively brighter than the rest.
GRADE = dict(L=38.0, L_std_max=1.35, a=16.0, b=26.5)


def lab(rgb):
    x = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    return x[..., 0] * 100 / 255, x[..., 1] - 128, x[..., 2] - 128


def rgb_of(L, a, b):
    x = np.dstack([np.clip(L * 255 / 100, 0, 255), np.clip(a + 128, 0, 255), np.clip(b + 128, 0, 255)]).astype(np.uint8)
    return cv2.cvtColor(x, cv2.COLOR_LAB2RGB).astype(np.float32)


r0, r1 = EDGE - 4, F + 12
region = img[r0:r1]
L, A, B = lab(region)
hsv = cv2.cvtColor(np.clip(region, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
woodish = (hsv[..., 0] >= 4) & (hsv[..., 0] <= 24) & (hsv[..., 1] >= 60)
props_here = np.zeros(region.shape[:2], np.float32)
for prop in PROPS:
    m = masks[prop['name']]
    lo, hi = max(r0, 0), min(r1, H)
    if hi > lo: props_here[lo - r0:hi - r0] = np.maximum(props_here[lo - r0:hi - r0], m[lo:hi])
props_here = cv2.GaussianBlur(cv2.dilate(props_here, np.ones((5, 5), np.uint8)), (0, 0), 2)
sample = woodish & (props_here < .05)
sample[:24] = False
muL, sdL = L[sample].mean(), L[sample].std()
ratio = min(GRADE['L_std_max'], 13.0 / max(sdL, 1e-3))
L2 = (L - muL) * ratio + GRADE['L']
A2 = A - A[sample].mean() + GRADE['a']
B2 = B - B[sample].mean() + GRADE['b']
graded = rgb_of(L2, A2, B2)
# Fade the grade in below the desk's back edge and out into its front lip, and keep it off the things on the desk.
rows = np.arange(r0, r1)
ramp = np.clip((rows - (EDGE - 4)) / 24, 0, 1) * np.clip((F + 12 - rows) / 16, 0, 1)
weight = (ramp[:, None] * (1 - props_here))[..., None]
img[r0:r1] = region * (1 - weight) + graded * weight
print('desk graded: wood L %.1f±%.1f a %.1f b %.1f -> L %.1f a %.1f b %.1f' % (muL, sdL, A[sample].mean(), B[sample].mean(), GRADE['L'], GRADE['a'], GRADE['b']))

# ---------- back layer: the bookcase painted out (plain shelves) ----------
back = img.copy()
x0, x1 = SHELF
# Plain shelves: a strip of the illustration's own backboard and planks that holds nothing (between the decor and the
# books on every row), repeated across the bookcase, every other copy mirrored so neighbours meet on the same boards.
# Above the first compartment (the top beam behind the sign) each row's median carries the beam across.
STRIP = (400, 456, 160)                                  # x0, x1 and the first row below the sign
sx0, sx1, top = STRIP
strip = src[:EDGE, sx0:sx1].copy()
# ...with the little flowering sprigs on it painted out (so they do not repeat), and without the Flower History button's
# band at the bottom (that band is the plank wood either side of the button, carried across).
PILL = (955, 1012)
pill_row = np.median(np.concatenate([src[PILL[0]:PILL[1], 165:330], src[PILL[0]:PILL[1], 750:875]], 1), axis=1, keepdims=True)
strip[PILL[0]:PILL[1]] = np.repeat(pill_row, sx1 - sx0, 1)
sprigs = (~WOOD[:EDGE, sx0:sx1]).astype(np.uint8)
sprigs[:top] = 0; sprigs[PILL[0]:] = 0
sprigs = cv2.dilate(cv2.morphologyEx(sprigs, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)), np.ones((5, 5), np.uint8))
strip = cv2.inpaint(np.clip(strip, 0, 255).astype(np.uint8), sprigs, 5, cv2.INPAINT_TELEA).astype(np.float32)
tiles, x, flip = [], 0, False
while x < x1 - x0:
    tiles.append(strip[:, ::-1] if flip else strip); x += sx1 - sx0; flip = not flip
plain = np.concatenate(tiles, 1)[:, :x1 - x0]
beam = np.repeat(np.median(src[:EDGE, x0:x1], axis=1, keepdims=True), x1 - x0, 1)
mix = np.clip((np.arange(EDGE) - (top - 12)) / 24, 0, 1)[:, None, None]
back[:EDGE, x0:x1] = beam * (1 - mix) + plain * mix

# ---------- front layer: the room around the bookcase, the desk, and what stands in front of the bookcase ----------
alpha = np.ones((H2, W), np.float32)
feather = 8
xs = np.arange(W)
inside_x = np.clip(np.minimum(xs - x0, x1 - xs) / feather + .5, 0, 1)        # 1 well inside the bookcase, 0 outside
rows = np.arange(EDGE + feather)
inside_y = np.clip((EDGE - rows) / feather + .5, 0, 1)                          # 1 above the desk edge, 0 below
alpha[:EDGE + feather] = 1 - np.outer(inside_y, inside_x)
# The canopy and vines above the bookcase lie softly over the live shelf's top.
canopy = np.clip(1 - np.arange(CANOPY) / CANOPY, 0, 1)
alpha[:CANOPY, x0:x1] = np.maximum(alpha[:CANOPY, x0:x1], canopy[:, None])
# The quill and the teacup stand in front of the bookcase's last plank.
for name in ('quill', 'cup', 'lantern', 'books'):
    alpha[:H] = np.maximum(alpha[:H], masks[name][:H] * (np.arange(H)[:, None] < SEAM + 150))

front = np.dstack([np.clip(img, 0, 255), np.clip(alpha, 0, 1) * 255]).astype(np.uint8)
Image.fromarray(np.clip(back, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'room-back.webp'), quality=90, method=6)
Image.fromarray(front, 'RGBA').save(os.path.join(OUT, 'room-front.webp'), quality=90, method=6)
print('room layers', W, H2, '- desk', EXTRA, 'deeper; front edge at', F)
