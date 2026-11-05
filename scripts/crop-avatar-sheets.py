# Cuts the tiered avatar sheets in Resources/avatar/ into the app's avatar library:
# mobile/assets/avatars/<id>.webp, 256×256 with transparency outside each medallion.
#
#   python3 scripts/crop-avatar-sheets.py            (needs numpy, scipy and Pillow)
#
# Ids are stable and follow the sheet order below, row by row from the left: l1-01 … l1-24,
# l2-01 … l2-16, l3-01 … l3-27 (lib/avatars.js lists them by tier). The original portraits
# fairy-1 … fairy-8 come from scripts/compress-avatars.mjs and are not touched here.
# Re-run only after the sheet artwork changes; existing ids must keep their artwork.
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "Resources", "avatar")
OUT = os.path.join(ROOT, "mobile", "assets", "avatars")
SIZE = 256
# (sheet, rows, columns, tier, mode): "ellipse" keeps the round/oval medallion up to its gold rim;
# "shape" keeps an irregular ornamented frame by its own outline (level3-6).
SHEETS = [
    ("level1", 4, 6, 1, "ellipse"), ("level2", 4, 4, 2, "ellipse"), ("level3-1", 4, 4, 3, "ellipse"),
    ("level3-2", 1, 1, 3, "ellipse"), ("level3-3", 1, 1, 3, "ellipse"), ("level3-4", 2, 4, 3, "ellipse"),
    ("level3-5", 1, 2, 3, "ellipse"), ("level3-6", 1, 2, 3, "shape"),
]
# Left out of Level 3 by the owner: level3-1 row 1 columns 1 and 2, row 4 column 2.
EXCLUDE = {("level3-1", 1, 1), ("level3-1", 1, 2), ("level3-1", 4, 2)}


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def foreground(im, tol=30):
    # Everything not connected to the sheet's paper colour along the border.
    border = np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]])
    paper = np.sqrt(((im - np.median(border, axis=0)) ** 2).sum(-1)) < tol
    lab, _ = ndi.label(paper)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return ndi.binary_fill_holes(~np.isin(lab, list(edge)))


def splits(proj, lo, hi, n):
    # Cell edges at the emptiest column/row near each even split.
    if n == 1:
        return [lo, hi]
    size, cuts = (hi - lo) / n, [lo]
    for k in range(1, n):
        c, w = int(lo + k * size), int(size * 0.15)
        cuts.append(c - w + int(np.argmin(proj[c - w:c + w])))
    return cuts + [hi]


def fit_ellipse(mask, iters=600, tol=2.0):
    # Axis-aligned ellipse through the medallion outline; RANSAC ignores what pokes past the
    # rim (diamond finials, wings, a raised flag).
    ys, xs = np.nonzero(mask & ~ndi.binary_erosion(mask))
    mx, my, sc = xs.mean(), ys.mean(), max(xs.std(), ys.std())
    xs, ys, tol = (xs - mx) / sc, (ys - my) / sc, tol / sc
    rng = np.random.default_rng(7)

    def solve(ix):
        X = np.stack([xs[ix] ** 2, ys[ix] ** 2, xs[ix], ys[ix]], 1)
        A, C, D, E = np.linalg.lstsq(X, np.ones(len(ix)), rcond=None)[0]
        if A <= 0 or C <= 0:
            return None
        cx, cy = -D / (2 * A), -E / (2 * C)
        F = 1 + A * cx * cx + C * cy * cy
        return (cx, cy, np.sqrt(F / A), np.sqrt(F / C)) if F > 0 else None

    def inliers(p):
        cx, cy, a, b = p
        return np.abs(np.sqrt(((xs - cx) / a) ** 2 + ((ys - cy) / b) ** 2) - 1) * min(a, b) < tol

    best, count = None, 0
    for _ in range(iters):
        p = solve(rng.choice(len(xs), 5, replace=False))
        if p is not None and inliers(p).sum() > count:
            best, count = inliers(p), inliers(p).sum()
    p = solve(np.nonzero(best)[0])
    for _ in range(3):
        p = solve(np.nonzero(inliers(p))[0])
    cx, cy, a, b = p
    return cx * sc + mx, cy * sc + my, a * sc, b * sc


def largest(mask):
    lab, n = ndi.label(mask)
    return lab == (1 + int(np.argmax(ndi.sum(mask, lab, range(1, n + 1))))) if n else None


def square(rgba):
    # Transparent padding keeps the aspect ratio; resample with premultiplied alpha.
    w, h = rgba.size
    s = max(w, h)
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(rgba, ((s - w) // 2, (s - h) // 2))
    return canvas.convert("RGBa").resize((SIZE, SIZE), Image.LANCZOS).convert("RGBA")


def cut(sheet, rows, cols, mode):
    image = Image.open(os.path.join(SRC, sheet + ".png")).convert("RGB")
    fg = foreground(np.asarray(image).astype(int))
    core = ndi.binary_opening(fg, structure=disk(10))  # drops corner sprigs and thin bridges
    lab, n = ndi.label(core)
    sizes = ndi.sum(core, lab, range(1, n + 1))
    core = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 0.2 * sizes.max()])
    ys, xs = np.nonzero(core)
    xcuts = splits(core.sum(0), xs.min(), xs.max() + 1, cols)
    ycuts = splits(core.sum(1), ys.min(), ys.max() + 1, rows)
    for r in range(rows):
        for c in range(cols):
            x0, x1, y0, y1 = xcuts[c], xcuts[c + 1], ycuts[r], ycuts[r + 1]
            if mode == "ellipse":
                cell = np.zeros_like(core)
                cell[y0:y1, x0:x1] = core[y0:y1, x0:x1]
                cx, cy, a, b = fit_ellipse(ndi.binary_opening(largest(cell), structure=disk(6)))
                bx0, by0 = max(int(np.floor(cx - a - 1.5)), 0), max(int(np.floor(cy - b - 1.5)), 0)
                bx1, by1 = min(int(np.ceil(cx + a + 1.5)), image.width), min(int(np.ceil(cy + b + 1.5)), image.height)
                ss = 4  # supersampled, anti-aliased rim
                alpha = Image.new("L", ((bx1 - bx0) * ss, (by1 - by0) * ss), 0)
                ImageDraw.Draw(alpha).ellipse([(cx - bx0 - a - 0.8) * ss, (cy - by0 - b - 0.8) * ss,
                                               (cx - bx0 + a + 0.8) * ss, (cy - by0 + b + 0.8) * ss], fill=255)
                alpha = alpha.resize((bx1 - bx0, by1 - by0), Image.LANCZOS)
            else:
                cell = np.zeros_like(fg)
                cell[y0:y1, x0:x1] = fg[y0:y1, x0:x1]
                shape = largest(cell)
                sy, sx = np.nonzero(shape)
                bx0, by0, bx1, by1 = max(sx.min() - 2, 0), max(sy.min() - 2, 0), sx.max() + 3, sy.max() + 3
                alpha = Image.fromarray((shape[by0:by1, bx0:bx1] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
            crop = image.crop((bx0, by0, bx1, by1)).convert("RGBA")
            crop.putalpha(alpha)
            yield r + 1, c + 1, square(crop)


def main():
    os.makedirs(OUT, exist_ok=True)
    counts, total = {1: 0, 2: 0, 3: 0}, 0
    for sheet, rows, cols, tier, mode in SHEETS:
        for r, c, avatar in cut(sheet, rows, cols, mode):
            if (sheet, r, c) in EXCLUDE:
                continue
            counts[tier] += 1
            path = os.path.join(OUT, f"l{tier}-{counts[tier]:02d}.webp")
            avatar.save(path, "WEBP", quality=82, method=6)
            total += os.path.getsize(path)
    print(f"tier 1: {counts[1]}, tier 2: {counts[2]}, tier 3: {counts[3]} ({total // 1024} KB)")


if __name__ == "__main__":
    main()
