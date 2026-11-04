"""Build the Treehouse writing desk (assets/bookhouse/composed/desk-cutout.webp) from continuous-structure.png.

continuous-structure.png is the bookshelf's own painting with a chair-free writing desk (registered to interior.png:
cs = (x + 2) * 0.815, y * 0.815). In the composed Treehouse scene the desk stands in front of the bookcase, so its
backboard must not hide the shelf: below the desk's back edge (row 1031) the painting is kept whole; above it only the
objects standing on the desk are kept (the lantern and its flowers on the left, the vase of flowers on the right), cut
from the backboard behind them with OpenCV's GrabCut. Nothing is scaled, recoloured or repainted.

  python scripts/buildTreehouseDesk.py        (needs opencv-python, numpy, Pillow)
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/bookhouse/continuous-structure.png'
OUT = ROOT / 'assets/bookhouse/composed/desk-cutout.webp'
TOP = 860        # first row kept (above the props)
EDGE = 1031      # the desk top's back edge
PAD = 160        # continuous-structure px the desk top carries on past each end of the painting
CUP_OUTLINE = [(1078, 807), (1114, 820), (10 ** 6, 770)]   # (below row, first column the boards take over): beside the
#   cup and handle, beside the saucer, then (below the teacup) well inside the painting so the join fades over open boards
RIGHT_BOARDS = 500   # plain boards (same rows) the right-hand continuation is taken from
LEFT_BOARDS = 230    # plain boards (same rows) the left-hand continuation is taken from, right of the lantern's books
FADE = 28            # cross-fade width at the left join
LANTERN = (0, 270, 1190)   # the lantern group's box: x0, x1, bottom row (continuous-structure px)
LANTERN_SHIFT = 110  # how far it moves left (into the desk's own left-hand boards)
# On the desk: the outline of the two books and the lantern's base; and the zone where its leaves and blossoms lie.
LANTERN_BOOKS = [(38, 1031), (106, 1031), (106, 1050), (132, 1051), (141, 1098), (139, 1123), (36, 1126), (22, 1092), (24, 1054), (38, 1050)]
LANTERN_PLANTS = [(0, 1031), (214, 1031), (214, 1066), (64, 1068), (70, 1175), (0, 1175)]
REFILL_FROM = 300   # the vacated spot takes the boards this far to its right (same rows; plain boards, no petals)
WALL_TILE = (260, 1000, 790, 1150)   # interior.png: plain boards and the rail below them


def cut(rgb: np.ndarray, alpha: np.ndarray, box, background=()):
    """GrabCut the objects in `box` (x0, y0, x1) above the desk's edge; `background` rects are known backboard."""
    x0, y0, x1 = box
    bgr = cv2.cvtColor(rgb[y0:EDGE + 40, x0:x1], cv2.COLOR_RGB2BGR).copy()
    mask = np.full(bgr.shape[:2], cv2.GC_PR_FGD, np.uint8)
    mask[EDGE - y0:, :] = cv2.GC_FGD
    for a0, b0, a1, b1 in background:
        mask[b0 - y0:b1 - y0, a0 - x0:a1 - x0] = cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    keep = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    keep = cv2.morphologyEx(keep, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    keep = cv2.GaussianBlur(keep, (3, 3), 0)
    alpha[y0:EDGE, x0:x1] = np.maximum(alpha[y0:EDGE, x0:x1], keep[:EDGE - y0])


def move_lantern(wide: np.ndarray, edge: int) -> None:
    """Move the lantern group (the lantern, the books it stands on, the blossoms beside it) LANTERN_SHIFT px left on the
    desk, so it no longer stands in front of the shelf's lowest year labels. Only the objects move (cut from the desk
    with GrabCut), sideways only; where they stood is refilled from the desk's own boards (shift-map), so the planks
    stay row-aligned and nothing else on the desk moves."""
    x0, x1, y1 = PAD + LANTERN[0], PAD + LANTERN[1], LANTERN[2] - TOP
    rgb = np.ascontiguousarray(wide[:y1, x0:x1, :3])
    h, w = rgb.shape[:2]
    # Which pixels belong to the group. Above the desk's edge: what the cut-out already kept. On the desk: the books and
    # the lantern's base (their outline), and, within the group's box, the leaves and blossoms — green, pink or white
    # (anything in its zone that is not the desk's brown wood).
    obj = np.zeros((h, w), np.uint8)
    obj[:edge] = np.where(wide[:edge, x0:x1, 3] > 128, 255, 0)
    solid = np.zeros((h, w), np.uint8)
    cv2.fillPoly(solid, [np.array([[x - LANTERN[0], y - TOP] for x, y in LANTERN_BOOKS], np.int32)], 255)
    hsv = cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2HSV).astype(np.int32)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    wood = (H >= 5) & (H <= 24) & (S >= 85) & (V >= 45)
    plant = ~wood
    zone = np.zeros((h, w), np.uint8)
    cv2.fillPoly(zone, [np.array([[x - LANTERN[0], y - TOP] for x, y in LANTERN_PLANTS], np.int32)], 255)
    plants = np.where(plant & (zone > 0), 255, 0).astype(np.uint8)
    plants = cv2.morphologyEx(plants, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    plants = cv2.morphologyEx(plants, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    obj[edge:] = np.maximum(solid[edge:], plants[edge:])
    group = np.dstack([rgb, obj])
    # Where it stood: above the edge nothing; on the desk, the same rows of plain boards from just to its right (the
    # planks run straight across), blended in through the group's own soft outline.
    wide[:edge, x0:x1, 3] = 0
    gone = np.clip(cv2.GaussianBlur(cv2.dilate(obj, np.ones((15, 15), np.uint8)), (21, 21), 0).astype(np.float32) / 255 * 1.6, 0, 1)[:, :, None]
    here = wide[edge:y1, x0:x1, :3].astype(np.float32)
    boards = wide[edge:y1, x0 + REFILL_FROM:x1 + REFILL_FROM, :3].astype(np.float32)
    wide[edge:y1, x0:x1, :3] = np.clip(here * (1 - gone[edge:]) + boards * gone[edge:], 0, 255).astype(np.uint8)
    # Set it down LANTERN_SHIFT px to the left, edges feathered.
    a = cv2.GaussianBlur(obj, (3, 3), 0).astype(np.float32)[:, :, None] / 255
    d0 = x0 - LANTERN_SHIFT
    dst = wide[:y1, d0:d0 + w].astype(np.float32)
    # its contact shadow on the desk where it now stands (the books' own footprint, softened)
    shadow = np.zeros((h, w), np.uint8)
    cv2.fillPoly(shadow, [np.array([[x - LANTERN[0] - 3, y - TOP + 4] for x, y in LANTERN_BOOKS], np.int32)], 255)
    shadow[:edge] = 0
    sh = cv2.GaussianBlur(shadow, (21, 21), 0).astype(np.float32)[:, :, None] / 255 * .45
    dst[:, :, :3] = dst[:, :, :3] * (1 - sh * (1 - a))
    dst[:, :, :3] = dst[:, :, :3] * (1 - a) + rgb * a
    dst[:, :, 3:] = np.maximum(dst[:, :, 3:], a * 255)
    wide[:y1, d0:d0 + w] = np.clip(dst, 0, 255).astype(np.uint8)


def build_wall() -> None:
    """The dark wooden wall beyond the room on wide windows: the plain boards and rail below the bookcase in
    interior.png (not the shelf), as a tile the scene repeats and darkens."""
    src = np.asarray(Image.open(ROOT / 'assets/bookhouse/interior.png').convert('RGB'))
    x0, y0, x1, y1 = WALL_TILE
    Image.fromarray(src[y0:y1, x0:x1]).save(OUT.parent / 'wood-wall.webp', 'WEBP', quality=90, method=6)
    print('wood-wall.webp', x1 - x0, '×', y1 - y0)


def main() -> None:
    rgba = np.asarray(Image.open(SOURCE).convert('RGBA')).copy()
    assert rgba.shape[:2] == (1881, 836), 'continuous-structure.png must be the original 836 × 1881 painting'
    rgb = rgba[:, :, :3]
    alpha = np.zeros(rgba.shape[:2], np.uint8)
    alpha[EDGE:] = 255
    # the lantern, the flowers around it and the vines at the painting's edge (not the pillar or the planks behind)
    cut(rgb, alpha, (0, 918, 215), background=[(118, 918, 215, 952), (165, 952, 215, 985), (9, 918, 26, 975)])
    # (The tall vase of flowers at the far right is left out: at the painting's scale it crowds the bookmarks.)
    rgba[:, :, 3] = alpha
    rgba = rgba[TOP:]
    # The desk is wider than the painting it stands in: its top carries on past both ends with its own boards. The planks
    # run straight across, so each row is continued with the same row of plain boards from nearby (the plank lines stay
    # aligned), cross-faded in over a few px. On the right this starts just past the teacup's outline, so the left-out
    # vase's glass base goes too; the teacup, its handle and saucer are untouched.
    edge = EDGE - TOP
    w = rgba.shape[1]
    wide = np.zeros((rgba.shape[0], PAD * 2 + w, 4), np.uint8)
    wide[:, PAD:PAD + w] = rgba
    rows = wide[edge:, :, :3].astype(np.float32)
    src = rgba[edge:, :, :3].astype(np.float32)
    for r in range(rows.shape[0]):
        y = EDGE + r
        start = next(x for y1, x in CUP_OUTLINE if y < y1)              # where the boards take over on this row
        n = PAD + w - start
        boards = src[r, RIGHT_BOARDS:RIGHT_BOARDS + n]
        ramp = np.clip(np.arange(n) / (6 if start > 800 else 40), 0, 1)[:, None]
        rows[r, PAD + start:] = rows[r, PAD + start:] * (1 - ramp) + boards * ramp
        left = src[r, LEFT_BOARDS:LEFT_BOARDS + PAD + FADE]
        lramp = np.clip((PAD + FADE - 1 - np.arange(PAD + FADE)) / FADE, 0, 1)[:, None]
        rows[r, :PAD + FADE] = rows[r, :PAD + FADE] * (1 - lramp) + left * lramp
    wide[edge:, :, :3] = np.clip(rows, 0, 255).astype(np.uint8)
    wide[edge:, :PAD, 3] = 255
    wide[edge:, PAD + w:, 3] = 255
    wide[:edge, PAD + CUP_OUTLINE[0][1]:, 3] = 0                        # nothing above the edge right of the teacup
    move_lantern(wide, edge)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(wide).save(OUT, 'WEBP', quality=94, method=6)
    print(OUT.name, wide.shape[1], '×', wide.shape[0], '(pad', PAD, ')')
    build_wall()


if __name__ == '__main__':
    main()
