"""Packs an arrival clip (frames extracted from a green-screen video, e.g.
`ffmpeg -i arrive.mp4 frames/f%03d.png`) into a frame sheet in the same cells as the animal's
other sheets: the whole video frame, keyed (oil-motion's dominance-v2 chroma key, so loose petals,
ribbons and sparkles stay, unlike video-frames.py which keeps only the animal's largest region),
scaled to the cell size, every `step`-th frame. Used for the Silktail Fox's arrival (2026-11-23,
~/dev/petalpal-motion/silktail/arrive), whose cells are the whole 1024x768 frame at 240x180, like
its sit sheet, so its last frame is the sit sheet's last frame.

python3 pack-arrival.py <frames dir> <out.png> <cell w> <cell h> <columns> [--step 2] [--oil-motion DIR]
Needs numpy and Pillow (oil-motion's .venv has both).
"""
import argparse, glob, os, sys
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("frames"); parser.add_argument("out")
parser.add_argument("cell_w", type=int); parser.add_argument("cell_h", type=int); parser.add_argument("columns", type=int)
parser.add_argument("--step", type=int, default=2)
parser.add_argument("--oil-motion", default=os.path.expanduser("~/tools/oil-motion"))
args = parser.parse_args()
sys.path.insert(0, os.path.join(args.oil_motion, "scripts"))
from chroma_key import apply_key, default_parameters  # noqa: E402

files = sorted(glob.glob(os.path.join(args.frames, "*.png")))[:: args.step]
rows = (len(files) + args.columns - 1) // args.columns
sheet = Image.new("RGBA", (args.cell_w * args.columns, args.cell_h * rows), (0, 0, 0, 0))
for i, path in enumerate(files):
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
    # The backdrop green of this frame, from its corners (generated video drifts a little).
    corners = np.concatenate([rgb[:8, :8].reshape(-1, 3), rgb[:8, -8:].reshape(-1, 3), rgb[-8:, -8:].reshape(-1, 3)])
    key = tuple(int(v) for v in np.rint(np.median(corners, axis=0) * 255))
    color, alpha, _ = apply_key(rgb, default_parameters(key))
    frame = Image.fromarray(np.dstack((np.rint(color * 255).astype(np.uint8), np.rint(alpha * 255).astype(np.uint8))), "RGBA")
    cell = frame.convert("RGBa").resize((args.cell_w, args.cell_h), Image.LANCZOS).convert("RGBA")
    sheet.alpha_composite(cell, ((i % args.columns) * args.cell_w, (i // args.columns) * args.cell_h))
sheet.save(args.out)
print(f"{len(files)} frames, {args.columns}x{rows} cells of {args.cell_w}x{args.cell_h} -> {args.out}")
