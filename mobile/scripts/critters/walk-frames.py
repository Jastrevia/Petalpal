"""Builds a Garden walker's frame sheet from a painted locomotion study (one picture with the
same animal painted several times mid-walk): cuts out each figure, scales them to one height,
lines them up on the torso so the body does not jump, orders them so each pose leads into the
nearest next one (legs change least frame to frame, round the loop), and packs them into a grid.

python3 walk-frames.py <study.jpg> <mask.png> <out.png> <frame height> <columns> [skip ...]
  mask: the study's cut-out mask (rembg -om); skip: indices of figures to leave out.
Prints the frame size and order. Needs numpy and Pillow.
"""
import itertools
import sys
import numpy as np
from PIL import Image, ImageFilter

study, mask_path, out_path, frame_h, columns = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
skip = {int(s) for s in sys.argv[6:]}
rgb = np.asarray(Image.open(study).convert("RGB")).astype(np.float32) / 255
mask = np.asarray(Image.open(mask_path).convert("L")).astype(np.float32) / 255
solid = mask > 0.4
H, W = solid.shape

# Figures: connected parts of the mask big enough to be an animal (4-neighbour flood fill).
label = np.zeros((H, W), np.int32)
figures = []
for y in range(0, H, 2):
    for x in range(0, W, 2):
        if solid[y, x] and not label[y, x]:
            n = len(figures) + 1; stack = [(y, x)]; label[y, x] = n; ys, xs = [], []
            while stack:
                cy, cx = stack.pop(); ys.append(cy); xs.append(cx)
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < H and 0 <= nx < W and solid[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = n; stack.append((ny, nx))
            figures.append((n, min(xs), min(ys), max(xs) + 1, max(ys) + 1, len(ys)))
figures = [f for f in figures if f[5] > 3000]
figures.sort(key=lambda f: (round(f[2] / 150), f[1]))
figures = [f for i, f in enumerate(figures) if i not in skip]

# Paper colour, to take out of soft edges.
paper = np.median(np.concatenate([rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3)]), axis=0)
cuts = []
for n, x0, y0, x1, y1, _ in figures:
    a = mask[y0:y1, x0:x1] * (label[y0:y1, x0:x1] == n).astype(np.float32)
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255
    a = np.minimum(a, mask[y0:y1, x0:x1])
    a = np.clip((a - 0.08) / 0.5, 0, 1)
    c = np.clip((rgb[y0:y1, x0:x1] - (1 - a[..., None]) * paper) / np.maximum(a[..., None], 0.2), 0, 1)
    img = Image.fromarray((np.dstack([c, a]) * 255).astype(np.uint8), "RGBA")
    # One height for all: the top of the head to the ground.
    scale = frame_h * 0.92 / img.height
    cuts.append(img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS))

# Line up on the torso: the centre of the upper half of the figure.
def torso_x(img):
    a = np.asarray(img)[..., 3].astype(np.float32)
    top = a[: a.shape[0] // 2]
    return (top.sum(axis=0) * np.arange(top.shape[1])).sum() / max(1, top.sum())
anchors = [torso_x(c) for c in cuts]
left = max(anchors); right = max(c.width - a for c, a in zip(cuts, anchors))
frame_w = int(np.ceil(left + right)) + 8
frames = []
for c, a in zip(cuts, anchors):
    f = Image.new("RGBA", (frame_w, frame_h))
    f.alpha_composite(c, (int(round(left - a)) + 4, frame_h - c.height - 2))
    frames.append(f)

# Order: the loop through all poses whose legs (lower 45%) change least from frame to frame.
legs = [np.asarray(f)[int(frame_h * 0.55):, :, 3] > 100 for f in frames]
def cost(i, j):
    union = np.logical_or(legs[i], legs[j]).sum()
    return 1 - np.logical_and(legs[i], legs[j]).sum() / max(1, union)
best = None
for rest in itertools.permutations(range(1, len(frames))):
    loop = (0,) + rest
    total = sum(cost(loop[k], loop[(k + 1) % len(loop)]) for k in range(len(loop)))
    if best is None or total < best[0]: best = (total, loop)
order = best[1]

rows = int(np.ceil(len(frames) / columns))
sheet = Image.new("RGBA", (frame_w * columns, frame_h * rows))
for k, index in enumerate(order):
    sheet.alpha_composite(frames[index], ((k % columns) * frame_w, (k // columns) * frame_h))
sheet.save(out_path)
print("frames", len(frames), "size", frame_w, frame_h, "order", order, "cost", round(best[0], 3))
