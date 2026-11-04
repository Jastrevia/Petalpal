"""Build the Treehouse side walls (assets/bookhouse/walls) from the original interior.png.

The bookshelf the app draws is a composite of slices of interior.png, narrower than the painting. When the camera pulls
back, the room around it is the painting's own continuation, at the same scale and registration as the shelf:

  wall-right.webp  interior.png x 905..1024 unchanged (the post's vines, the ladder, the trunk with its garden window).
                   Beyond the painting's edge, everything is the painting's own pixels, moved rather than mirrored:
                   the trunk closes the round window above the ladder; the ladder's far rail (where its rungs end in
                   bolts, just past the edge) is built row by row from the near rail's cross-section at that row; and
                   the ladder-free vine wall continues behind it.
  wall-left.webp   the same edge strip (x 925..1024) with the ladder taken out, reflected so that its vine-covered post
                   stands against the shelf's carved pillar, and set lower than the right wall (so its trunk window and
                   rows of flowers do not face the right side's); its outer part continues that wall with pixels
                   shifted from the strip itself.

Nothing is scaled, blurred, sharpened or recoloured. Holes and joins are filled with OpenCV's shift-map inpainting,
which only moves pixels from elsewhere in the same image (vines, flowers, the trunk), never paints new ones.

  python scripts/buildTreehouseWalls.py        (needs opencv-contrib-python, numpy, Pillow)
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/bookhouse/interior.png'
OUT = ROOT / 'assets/bookhouse/walls'
HEIGHT = 1300          # interior.png rows used (the desk covers everything lower)
EDGE = (925, 1024)     # the painting beyond the app's shelf composite (its last slice ends at SHELF.x1 = 925)
RIGHT_FROM = 905       # the right wall starts at SHELF.postEdge, so any composite end in 905..1024 can use it
RIGHT_EXTRA = 99       # interior px the right wall reaches beyond the painting's edge
LEFT_WIDTH = 170       # interior px the left wall reaches beyond the pillar
LEFT_DROP = 120        # rows the left wall is set lower than the right one
PAD = 40               # shift-map leaves its outermost columns empty: fill extra and crop them
LADDER_TOP = 440       # the ladder's top (painting y); the trunk and window are above it
RAIL = ((1008, 440), (926, 1300))   # the ladder's near rail: centre line, top and bottom
RAIL_WIDTH = 26
FAR_RAIL = 1026        # painting x of the far rail's left edge


def rail_x(y):
    (xa, ya), (xb, yb) = RAIL
    return xa + (y - ya) * (xb - xa) / (yb - ya)


def refill(image: np.ndarray, hole: np.ndarray) -> np.ndarray:
    """Shift-map inpainting: `hole` (255) is refilled with pixels moved from the rest of `image`."""
    out = np.zeros_like(image)
    cv2.xphoto.inpaint(image, 255 - hole, out, cv2.xphoto.INPAINT_SHIFTMAP)
    return out


def ladder_mask(width: int, height: int) -> np.ndarray:
    """The ladder in the edge strip (strip coordinates): its near rail and its rungs."""
    x0 = EDGE[0]
    mask = np.zeros((height, width), np.uint8)
    rail = np.array([[985 - x0, 436], [1024 - x0, 436], [1024 - x0, 470], [948 - x0, 1300], [896 - x0, 1300]], np.int32)
    cv2.fillPoly(mask, [rail], 255)
    for top, bottom in [(458, 492), (566, 596), (684, 716), (800, 836), (914, 946), (1036, 1070), (1152, 1186)]:
        cv2.rectangle(mask, (0, top), (width, bottom), 255, -1)
    ys, xs = np.mgrid[0:height, 0:width]
    mask[(xs < rail_x(ys) - x0 - 26) & (ys > 440)] = 0   # rungs only run to the right of the rail (with its shaded edge)
    mask[ys < 436] = 0                                    # the trunk and window above the ladder are untouched
    return mask


def right_wall(bgr: np.ndarray, vines: np.ndarray) -> np.ndarray:
    genuine = EDGE[1] - RIGHT_FROM
    wall = np.zeros((HEIGHT, genuine + RIGHT_EXTRA, 3), np.uint8)
    wall[:, :genuine] = bgr[:HEIGHT, RIGHT_FROM:EDGE[1]]
    X = lambda x: x - RIGHT_FROM
    top = LADDER_TOP + 10
    wall[:top, genuine:] = bgr[:top, EDGE[0]:EDGE[0] + RIGHT_EXTRA]            # the trunk, moved along: closes the window
    wall[top:, genuine:] = vines[top:, ::-1][:, :RIGHT_EXTRA]                    # the vine wall behind the ladder
    for y in range(LADDER_TOP + 6, HEIGHT):                                      # the far rail, from the near rail's rows
        c = int(round(rail_x(y)))
        wall[y, X(FAR_RAIL):X(FAR_RAIL) + RAIL_WIDTH] = bgr[y, c - RAIL_WIDTH // 2:c - RAIL_WIDTH // 2 + RAIL_WIDTH]
        wall[y, X(EDGE[1]):X(FAR_RAIL)] = bgr[y, EDGE[1] - 2:EDGE[1]]
    for y in range(LADDER_TOP - 8, LADDER_TOP + 6):                              # its cap: the near rail's top end
        c = int(round(rail_x(LADDER_TOP + 20)))
        wall[y, X(FAR_RAIL):X(FAR_RAIL) + RAIL_WIDTH] = bgr[y + 4, c - RAIL_WIDTH // 2:c - RAIL_WIDTH // 2 + RAIL_WIDTH]
    joins = np.zeros(wall.shape[:2], np.uint8)
    joins[:LADDER_TOP - 8, X(EDGE[1]) - 2:X(EDGE[1]) + 24] = 255                  # trunk against the painting's edge
    joins[LADDER_TOP - 10:LADDER_TOP + 22, X(FAR_RAIL) + RAIL_WIDTH:] = 255        # trunk against the vine wall
    joins[LADDER_TOP + 6:, X(FAR_RAIL) + RAIL_WIDTH:X(FAR_RAIL) + RAIL_WIDTH + 8] = 255   # vine wall against the rail
    joins[:, :X(EDGE[1]) - 2] = 0                                                 # the painting itself is never touched
    return refill(wall, joins)


def left_wall(vines: np.ndarray) -> np.ndarray:
    inner = np.zeros_like(vines)
    inner[LEFT_DROP:] = vines[:HEIGHT - LEFT_DROP][:, ::-1]
    above = np.zeros(inner.shape[:2], np.uint8)
    above[:LEFT_DROP + 6] = 255
    inner = refill(inner, above)
    outer = LEFT_WIDTH - inner.shape[1] + PAD
    canvas = np.concatenate([np.zeros((HEIGHT, outer, 3), np.uint8), inner], axis=1)
    hole = np.zeros(canvas.shape[:2], np.uint8)
    hole[:, :outer] = 255
    return refill(canvas, hole)[:, PAD:]


def main() -> None:
    bgr = cv2.imread(str(SOURCE))
    assert bgr is not None and bgr.shape[:2] == (1536, 1024), 'interior.png must be the original 1024 × 1536 painting'
    strip = bgr[:HEIGHT, EDGE[0]:EDGE[1]].copy()
    vines = refill(strip, ladder_mask(strip.shape[1], strip.shape[0]))
    walls = {'wall-left.webp': left_wall(vines), 'wall-right.webp': right_wall(bgr, vines)}
    OUT.mkdir(parents=True, exist_ok=True)
    for name, image in walls.items():
        assert (image[1:].sum(axis=2) < 15).mean() < .001, f'{name} has unfilled pixels'
        Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)).save(OUT / name, 'WEBP', quality=94, method=6)
        print(name, image.shape[1], '×', image.shape[0])


if __name__ == '__main__':
    main()
