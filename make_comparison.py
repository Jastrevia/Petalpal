import os
from PIL import Image, ImageDraw, ImageFont

ARTIFACTS_DIR = r"C:\Users\cjysu\.gemini\antigravity\brain\29c68174-3514-4da4-a283-62d907ccd0b5"

img1_path = os.path.join(ARTIFACTS_DIR, ".user_uploaded", "media_1792126299893_ef94e1f7.jpg")
img2_path = os.path.join(ARTIFACTS_DIR, ".user_uploaded", "media_1792126302440_6e5f673a.jpg")
img3_path = os.path.join(ARTIFACTS_DIR, "screen_1_login_preview_mobile.png")

im1 = Image.open(img1_path).convert("RGB")
im2 = Image.open(img2_path).convert("RGB")
im3 = Image.open(img3_path).convert("RGB")

target_h = 1000

def resize_to_h(im, h):
    w = int(im.width * (h / im.height))
    return im.resize((w, h), Image.Resampling.LANCZOS)

im1_r = resize_to_h(im1, target_h)
im2_r = resize_to_h(im2, target_h)
im3_r = resize_to_h(im3, target_h)

header_h = 60
total_w = im1_r.width + im2_r.width + im3_r.width + 40
total_h = target_h + header_h + 30

comp = Image.new("RGB", (total_w, total_h), (245, 240, 230))
draw = ImageDraw.Draw(comp)

try:
    font = ImageFont.truetype("arial.ttf", 22)
    font_sub = ImageFont.truetype("arial.ttf", 15)
except:
    font = ImageFont.load_default()
    font_sub = font

panels = [
    (im1_r, 10, "IMAGE 1: BEFORE", "Flat UI Card / Stretched PNG / No Physical Layers", (140, 60, 60)),
    (im2_r, 20 + im1_r.width, "IMAGE 2: APPROVED TARGET", "Authoritative Reference (Physical Layers, Deckle Edge, Drape)", (40, 100, 70)),
    (im3_r, 30 + im1_r.width + im2_r.width, "FINAL IMPLEMENTATION: AFTER", "5-Layer Assembly + Clean Interactive React Native UI", (20, 80, 120))
]

for im, x, title, sub, col in panels:
    comp.paste(im, (x, header_h))
    draw.rectangle([x, 10, x + im.width, header_h - 6], fill=(255, 255, 255), outline=col, width=2)
    draw.text((x + 12, 14), title, fill=col, font=font)
    draw.text((x + 12, 38), sub, fill=(90, 85, 80), font=font_sub)

out_path = os.path.join(ARTIFACTS_DIR, "comparison_3way_a_b_after.jpg")
comp.save(out_path, quality=94)
print("Saved comparison:", out_path)
