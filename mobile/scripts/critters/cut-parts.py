"""Cuts the Garden rabbit's painting into puppet parts for its skeleton (critters/gaits.ts):
<name>-body.webp, the painting without its legs below the belly, and <name>-legs.webp, its near
legs, each cut along the painted outline and fading in at the top so it grows out of the body's
fur. The far legs are drawn as darker copies of the near legs, so their painted pixels are
removed from the body too. Coordinates are the painting's pixels.

python3 cut-parts.py <painting.webp> <out-dir> <name>   (needs numpy and Pillow)
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FADE = 26  # pixels over which a leg fades in below the top edge of its outline

# Per walker: the near legs' outlines (the first two points are the top edge, where the leg
# fades in), and the far legs' painted areas to take out of the body.
PARTS = {
    "rabbit": {
        "near": [
            [(64, 424), (252, 440), (256, 491), (56, 491)],
            [(256, 384), (312, 384), (318, 440), (374, 460), (376, 491), (282, 491), (262, 442)],
        ],
        "far": [
            [(314, 372), (362, 372), (398, 448), (398, 472), (338, 472), (318, 440)],
        ],
    },
}


def polygon_mask(size, points, fade):
    """1 inside the outline, fading in over `fade` pixels below its top edge (points 0–1)."""
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    if fade:
        (x0, y0), (x1, y1) = points[0], points[1]
        ys, xs = np.mgrid[0:size[1], 0:size[0]]
        # Distance below the top edge line (positive inside the leg).
        nx, ny = -(y1 - y0), (x1 - x0)
        length = np.hypot(nx, ny)
        below = ((xs - x0) * nx + (ys - y0) * ny) / length
        t = np.clip(below / fade, 0, 1)
        m = m * (t * t * (3 - 2 * t))
    return m


def main(src, out_dir, name):
    image = Image.open(src).convert("RGBA")
    rgba = np.asarray(image).astype(np.float32) / 255
    size = image.size
    parts = PARTS[name]
    near = [polygon_mask(size, p, FADE) for p in parts["near"]]
    full = [polygon_mask(size, p, 0) for p in parts["near"]]
    far = [polygon_mask(size, p, FADE) for p in parts["far"]]
    legs = np.clip(sum(near), 0, 1)
    # The body keeps the fade band (the leg lies over it at rest), losing only what is fully leg.
    taken = np.clip(sum(np.clip((m - 0.98) / 0.02, 0, 1) for m in near) + sum(far), 0, 1)
    del full
    body = rgba.copy(); body[..., 3] *= 1 - taken
    leg_layer = rgba.copy(); leg_layer[..., 3] *= legs
    for part, data in (("body", body), ("legs", leg_layer)):
        Image.fromarray((data * 255).astype(np.uint8), "RGBA").save(f"{out_dir}/{name}-{part}.png")
    print(name, size)


if __name__ == "__main__":
    main(*sys.argv[1:4])
