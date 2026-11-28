"""Packs the dogs' going-into-their-house clip into a frame sheet of the dogs alone, to draw over the
Garden's dog house (critters/DogHouseOccupants.tsx). The clip (oil-motion, 2026-11-21,
~/dev/petalpal-motion/dog-house/enter-v4/frames-oil/clean: 63 frames at 12 a second) is the whole
painted courtyard on a 1344 x 768 key frame with the house 648 px wide at (650, 70)
(dogHouseState.ts CLIP_KEY); only the two dogs move, so a pixel is dog (or its soft shadow) where the
frame differs from the still plate (enter-v4/source/bg-with-house.png). Inside the house the front
walls never change, so the dogs show only through the doorway, as in the clip.

python3 pack-dog-house.py <frames dir> <plate.png> <out.webp> [--first-mask K0-alpha.png] [--scale 0.55] [--columns 8]
Prints the crop (key-frame pixels), cell size and frame count for DogHouseOccupants.tsx.
Needs numpy and Pillow (oil-motion's .venv has both).
"""
import argparse, glob
import numpy as np
from PIL import Image, ImageFilter

p = argparse.ArgumentParser()
p.add_argument("frames"); p.add_argument("plate"); p.add_argument("out")
p.add_argument("--first-mask", help="the clip's first-frame dog mask (enter-v4/source/K0-alpha.png), for frames where the dogs have not moved yet")
p.add_argument("--still", type=int, default=8, help="how many first frames use --first-mask")
p.add_argument("--scale", type=float, default=0.55); p.add_argument("--columns", type=int, default=8)
a = p.parse_args()

HX, HY, HOUSE_H = 650, 70, 639
DOGS_X = (380, 1160)  # the dogs never leave this band (Maltese starts at ~440, the house ends at 1298)
plate = np.asarray(Image.open(a.plate).convert("RGB"), dtype=np.float32)
paths = sorted(glob.glob(f"{a.frames}/*.png"))
first = np.asarray(Image.open(a.first_mask).convert("RGBA").split()[3], dtype=np.float32) / 255 if a.first_mask else None
if first is not None:  # (that mask holds the house too: keep only where the dogs sit at the start)
    first[:450] = 0; first[:, 800:] = 0; first[:, :DOGS_X[0]] = 0
    # Grown a little, so the golden standing up in its first frames stays covered (the paving it
    # also takes is the same painting as the Garden's own around the door).
    first = np.asarray(Image.fromarray((first * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255
frames, alphas = [], []
for index, path in enumerate(paths):
    f = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    diff = Image.fromarray(np.clip(np.abs(f - plate).mean(axis=2), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    d = np.asarray(diff, dtype=np.float32)
    # Soft edge: video noise stays under ~10; a dog is far over 40; its shadow in between.
    alpha = np.clip((d - 12) / 26, 0, 1)
    alpha[: HY + int(HOUSE_H * 0.44)] = 0  # never on the roof
    alpha[:, :DOGS_X[0]] = 0; alpha[:, DOGS_X[1]:] = 0  # the wisteria and lantern at the left edge flicker
    # Drop specks: keep only what survives a small open, then grow back softly.
    solid = Image.fromarray((alpha > 0.35).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(15))
    alpha *= np.asarray(solid.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255
    # Fill the holes inside each dog: tan fur over tan paving differs only a little, so close the
    # dog's own silhouette (grow, then shrink back) and keep it solid there.
    body = Image.fromarray((alpha > 0.5).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.MinFilter(25))
    alpha = np.maximum(alpha, np.asarray(body.filter(ImageFilter.GaussianBlur(2)), dtype=np.float32) / 255)
    if first is not None and index < a.still:
        # Only near where a dog is in this frame, so no patch stays where the golden sat.
        near = np.asarray(Image.fromarray((alpha > 0.3).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(2)), dtype=np.float32) / 255
        alpha = np.maximum(alpha, first * near)
    frames.append(f); alphas.append(alpha)

union = np.max(np.stack(alphas), axis=0) > 0.05
ys, xs = np.nonzero(union)
pad = 6
x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
x1, y1 = min(1344, xs.max() + pad + 1), min(768, ys.max() + pad + 1)
cw, ch = round((x1 - x0) * a.scale), round((y1 - y0) * a.scale)
rows = (len(frames) + a.columns - 1) // a.columns
sheet = Image.new("RGBA", (cw * a.columns, ch * rows), (0, 0, 0, 0))
for i, (f, al) in enumerate(zip(frames, alphas)):
    rgba = np.dstack([f, al * 255])[y0:y1, x0:x1].astype(np.uint8)
    cell = Image.fromarray(rgba, "RGBA").convert("RGBa").resize((cw, ch), Image.LANCZOS).convert("RGBA")
    sheet.paste(cell, ((i % a.columns) * cw, (i // a.columns) * ch))
sheet.save(a.out, quality=82, method=6)
print(f"crop x={x0} y={y0} w={x1 - x0} h={y1 - y0}; cell {cw}x{ch}; frames {len(frames)}; columns {a.columns} rows {rows}; sheet {sheet.size}")
