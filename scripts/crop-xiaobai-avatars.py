# Cuts Xiaobai's three portraits (one framed medallion per image, Level 1, 2 and 3 from the owner's art) into the
# avatar library, the same way scripts/crop-avatar-sheets.py cuts the sheets: 256×256 WebP, transparent outside
# the gold rim (an ellipse fitted to the medallion outline, anti-aliased).
#
#   python3 scripts/crop-xiaobai-avatars.py <folder with 1.jpg 2.jpg 3.jpg>     (needs numpy, scipy and Pillow)
#
# 1.jpg → l1-25, 2.jpg → l2-17, 3.jpg → l3-28 (lib/avatars.js). Ids are stable: re-run only if the art changes.
import importlib.util
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "mobile", "assets", "avatars")
spec = importlib.util.spec_from_file_location("crop", os.path.join(ROOT, "scripts", "crop-avatar-sheets.py"))
crop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crop)
IDS = {1: "l1-25", 2: "l2-17", 3: "l3-28"}


def medallion(path):
    image = Image.open(path).convert("RGB")
    fg = crop.foreground(np.asarray(image).astype(int), tol=40)
    core = ndi.binary_opening(fg, structure=crop.disk(8))
    cx, cy, a, b = crop.fit_ellipse(ndi.binary_opening(crop.largest(core), structure=crop.disk(6)))
    bx0, by0 = max(int(np.floor(cx - a - 1.5)), 0), max(int(np.floor(cy - b - 1.5)), 0)
    bx1, by1 = min(int(np.ceil(cx + a + 1.5)), image.width), min(int(np.ceil(cy + b + 1.5)), image.height)
    ss = 4  # supersampled, anti-aliased rim
    alpha = Image.new("L", ((bx1 - bx0) * ss, (by1 - by0) * ss), 0)
    ImageDraw.Draw(alpha).ellipse([(cx - bx0 - a - 0.8) * ss, (cy - by0 - b - 0.8) * ss,
                                   (cx - bx0 + a + 0.8) * ss, (cy - by0 + b + 0.8) * ss], fill=255)
    cut = image.crop((bx0, by0, bx1, by1)).convert("RGBA")
    cut.putalpha(alpha.resize((bx1 - bx0, by1 - by0), Image.LANCZOS))
    return crop.square(cut)


def main(source):
    for n, avatar_id in IDS.items():
        medallion(os.path.join(source, f"{n}.jpg")).save(os.path.join(OUT, f"{avatar_id}.webp"), "WEBP", quality=82, method=6)
        print(avatar_id)


if __name__ == "__main__":
    main(sys.argv[1])
