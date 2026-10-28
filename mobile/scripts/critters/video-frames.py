"""Builds a Garden walker's frame sheet from a generated walking video (frames already
extracted, e.g. `ffmpeg -i walk.mp4 frames/f%03d.png`): keys out the flat green backdrop,
finds the stretch that loops best (the legs at its end closest to its start), measures how fast
a planted paw slides back (the ground speed, so the Garden can move the animal exactly that much
per loop and its paws do not skid), and packs the loop into a grid.

python3 video-frames.py <frames dir> <out.png> <cell height> <columns> [--frames N] [--start S --period P]
  --frames: how many frames to keep from the loop (evenly spaced); default all.
  --start/--period: the loop to use (e.g. one stride), instead of the best-matching one.
Prints the cell size, frame count and the loop's ground distance in cell pixels. Needs numpy
and Pillow.
"""
import argparse
import glob
import numpy as np
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument("frames"); parser.add_argument("out"); parser.add_argument("cell_h", type=int); parser.add_argument("columns", type=int)
parser.add_argument("--frames", type=int, default=0, dest="keep")
parser.add_argument("--min-period", type=int, default=10)
parser.add_argument("--start", type=int, help="use this loop (with --period) instead of searching")
parser.add_argument("--period", type=int)
args = parser.parse_args()

paths = sorted(glob.glob(f"{args.frames}/*.png"))
rgb = [np.asarray(Image.open(p).convert("RGB")).astype(np.float32) / 255 for p in paths]
H, W, _ = rgb[0].shape

# The backdrop: the median colour of the borders of every frame.
border = np.concatenate([np.concatenate([f[:6].reshape(-1, 3), f[-6:].reshape(-1, 3), f[:, :6].reshape(-1, 3), f[:, -6:].reshape(-1, 3)]) for f in rgb[::8]])
key = np.median(border, axis=0)

def keyed(f):
    # Alpha from the distance to the backdrop colour; then take the green cast off soft edges.
    d = np.linalg.norm(f - key, axis=2)
    a = np.clip((d - 0.16) / 0.22, 0, 1)
    a = a * a * (3 - 2 * a)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255
    c = f.copy()
    excess = c[..., 1] - np.maximum(c[..., 0], c[..., 2])
    c[..., 1] -= np.clip(excess, 0, None) * np.clip(1.4 - a, 0, 1)
    # Un-mix the backdrop from partly covered edge pixels.
    c = np.clip((c - (1 - a[..., None]) * key) / np.maximum(a[..., None], 0.25), 0, 1)
    return np.dstack([c, a])

frames = [keyed(f) for f in rgb]
alpha = [f[..., 3] > 0.5 for f in frames]

# The body's box over the whole clip, and the rows where the legs are.
ys, xs = np.where(np.logical_or.reduce(alpha))
top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
legs_from = top + int((bottom - top) * 0.6)

def legs(i):
    m = alpha[i][legs_from:bottom, left:right]
    return np.asarray(Image.fromarray(m.astype(np.uint8) * 255).resize((96, 32))).astype(np.float32) / 255

leg = [legs(i) for i in range(len(frames))]
best = None
if args.start is not None and args.period:
    best = (0, args.start, args.period, float(np.abs(leg[args.start] - leg[args.start + args.period]).mean()))
for start in ([] if best else range(0, len(frames) // 3)):
    for period in range(args.min_period, len(frames) - start):
        diff = np.abs(leg[start] - leg[start + period]).mean()
        # Prefer longer loops a little: a whole stride rather than a half one.
        score = diff - period * 0.00015
        if best is None or score < best[0]:
            best = (score, start, period, diff)
_, start, period, seam = best
loop = list(range(start, start + period))

# Ground speed: planted paws (touching the lowest rows) slide back frame to frame.
def paw_xs(i):
    band = alpha[i][bottom - max(6, (bottom - top) // 30):bottom, left:right]
    cols = band.any(axis=0)
    runs, x = [], 0
    while x < len(cols):
        if cols[x]:
            s = x
            while x < len(cols) and cols[x]: x += 1
            if x - s > 4: runs.append((s + x) / 2)
        x += 1
    return runs
shifts = []
for i in loop:
    a, b = paw_xs(i), paw_xs(i + 1 if i + 1 < len(frames) else i)
    for x in a:
        near = [y - x for y in b if abs(y - x) < (right - left) * 0.08]
        if near: shifts.append(min(near, key=abs))
backward = [-s for s in shifts if s < -0.2]
speed = float(np.median(backward)) if backward else 0.0

keep = loop if not args.keep or args.keep >= len(loop) else [loop[round(k * len(loop) / args.keep)] for k in range(args.keep)]
pad = 6
crop = (left - pad, top - pad, right + pad, bottom + pad)
scale = args.cell_h / (crop[3] - crop[1])
cell_w = round((crop[2] - crop[0]) * scale)
rows = int(np.ceil(len(keep) / args.columns))
sheet = Image.new("RGBA", (cell_w * args.columns, args.cell_h * rows))
for k, i in enumerate(keep):
    img = Image.fromarray((frames[i] * 255).astype(np.uint8), "RGBA").crop(crop).resize((cell_w, args.cell_h), Image.LANCZOS)
    sheet.alpha_composite(img, ((k % args.columns) * cell_w, (k // args.columns) * args.cell_h))
sheet.save(args.out)
ground = round((bottom + 0 - crop[1]) * scale)
print(f"cell {cell_w}x{args.cell_h} frames {len(keep)} of loop {start}..{start + period - 1} (seam {seam:.3f})")
print(f"ground row {ground}; paw slide {speed:.2f} px/frame -> loop distance {speed * period * scale:.1f} cell px")
