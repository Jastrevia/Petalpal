"""Bakes PPL's walking stride from her original painting (assets/garden/fairy/walk-v2/walk_04.png):
no AI redraw, the same canvas and foot pivot as the standing pose, so walking and standing are one
picture. Only the frames are baked here; the Garden just plays the sheet.

The motion follows how a person walks (one stride = phase 0..1, near foot lands at 0, far foot at .5):
  - each foot spends 60% of the stride planted, sliding back under the body, and 40% swinging forward
    with the heel rising first and the toes coming up just before it lands;
  - each arm swings against the leg on its own side, so the near arm is back when the near foot is
    forward; the swing starts at the shoulder, the forearm trails it and bends most at the front;
  - the body is lowest when both feet are down and highest as one leg passes the other (two bobs a
    stride); the dress trails a little and sways with each step, wings breathe with it.

python3 fairy-walk-rig.py <walk_04.png> <out dir> [--preview sheet.png]   (needs numpy, scipy, Pillow)
Writes <out dir>/walk.png; convert with cwebp -q 82 -alpha_q 95.
"""
import argparse
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

parser = argparse.ArgumentParser()
parser.add_argument("source"); parser.add_argument("out")
parser.add_argument("--frames", type=int, default=25); parser.add_argument("--columns", type=int, default=5)
parser.add_argument("--cell", default="280,420"); parser.add_argument("--preview")
args = parser.parse_args()

source = Image.open(args.source).convert("RGBA")
W, H = source.size
art = np.asarray(source).astype(np.float32) / 255
art[..., :3] *= art[..., 3:]  # premultiplied from here on


def polygon_mask(points, feather=0.0):
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    if feather: mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(mask).astype(np.float32) / 255


def layer(mask):
    return art * mask[..., None]


# ---- Near arm: the sleeve and upper arm from the shoulder, then the forearm and hand. ----
SHOULDER, ELBOW = (548.0, 440.0), (556.0, 648.0)
ARM = [(522, 498), (594, 498), (600, 610), (586, 650), (598, 700), (620, 755), (632, 800), (642, 835), (642, 862), (632, 886), (610, 888),
       (596, 870), (588, 835), (580, 802), (566, 755), (546, 702), (530, 655), (524, 620)]
arm_all = polygon_mask(ARM, 1.2)
split = np.clip((np.arange(H, dtype=np.float32) - 628) / 40, 0, 1)[:, None]  # blends across the elbow
upper_arm = layer(arm_all * (1 - split) * np.clip((np.arange(H, dtype=np.float32) - 492) / 26, 0, 1)[:, None])
fore_arm = layer(arm_all * np.clip((np.arange(H, dtype=np.float32) - 618) / 26, 0, 1)[:, None])

# ---- Far arm: its visible forearm, and a painted upper arm for when it swings clear of the dress. ----
FAR_SHOULDER, FAR_ELBOW = (598.0, 478.0), (664.0, 640.0)
FAR = [(703, 692), (716, 700), (738, 745), (778, 780), (798, 815), (795, 840), (782, 840), (772, 832), (756, 838), (746, 822), (736, 800), (722, 772), (708, 754), (703, 748)]
far_hand = polygon_mask([(704, 688), (850, 688), (850, 846), (724, 846), (708, 800), (706, 750)], 0.8) * (art[..., 3] > 0.01)
far_visible = art * far_hand[..., None]


def limb(joints, widths, colour=(246, 220, 206), edge=(222, 186, 172)):
    """A painted limb through its joints, one soft shape with no seams at them, in premultiplied RGBA."""
    pic = Image.new("RGBA", (W, H), (0, 0, 0, 0)); draw = ImageDraw.Draw(pic)
    for shrink, fill in ((0, edge), (2.5, colour)):
        for (p, wp), (q, wq) in zip(zip(joints, widths), zip(joints[1:], widths[1:])):
            dx, dy = q[0] - p[0], q[1] - p[1]; n = max(1e-3, math.hypot(dx, dy)); nx, ny = -dy / n, dx / n
            ra, rb = wp - shrink, wq - shrink
            draw.polygon([(p[0] + nx * ra, p[1] + ny * ra), (q[0] + nx * rb, q[1] + ny * rb), (q[0] - nx * rb, q[1] - ny * rb), (p[0] - nx * ra, p[1] - ny * ra)], fill=fill + (255,))
        for (cx, cy), w in zip(joints, widths):
            r = w - shrink; draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill + (255,))
    pic = pic.filter(ImageFilter.GaussianBlur(1.6))
    out = np.asarray(pic).astype(np.float32) / 255
    out[..., :3] *= out[..., 3:]
    return out


FAR_WRIST = (712.0, 724.0)

# ---- Feet: each shoe and its ankle, with a shin that runs up under the dress. ----
NEAR_FOOT = [(464, 1320), (480, 1312), (504, 1296), (516, 1300), (536, 1358), (548, 1344), (574, 1370), (574, 1384), (500, 1384), (482, 1350), (482, 1374), (464, 1374)]
FAR_FOOT = [(582, 1278), (596, 1262), (640, 1284), (664, 1306), (682, 1306), (702, 1336), (702, 1350), (632, 1342), (604, 1312), (598, 1340), (582, 1340)]


def foot_mask(points):
    m = polygon_mask(points, 0.6)
    rgb = np.where(art[..., 3:] > 0.01, art[..., :3] / np.maximum(art[..., 3:], 0.01), 1.0)
    # The pale petals lying over the ankle stay with the dress; shoes and skin come away.
    petal = (rgb.min(axis=2) > 0.72) & (art[..., 3] > 0.5)
    return m * ndimage.gaussian_filter((~petal).astype(np.float32), 0.8)


near_mask, far_mask = foot_mask(NEAR_FOOT), foot_mask(FAR_FOOT)
near_foot = layer(near_mask)
far_foot = layer(far_mask)
NEAR_ANKLE, FAR_ANKLE = (516.0, 1322.0), (626.0, 1288.0)
HIP = {"near": (560.0, 860.0), "far": (610.0, 860.0)}
NEAR_HEEL, NEAR_TOE = (500.0, 1378.0), (566.0, 1378.0)
FAR_HEEL, FAR_TOE = (612.0, 1340.0), (692.0, 1344.0)

# ---- The body: the painting without those parts. Under the near arm, the dress beside it fills in. ----
holes = np.clip(near_mask + far_mask + far_hand, 0, 1)
body = art * (1 - holes[..., None])
fill_mask = polygon_mask(ARM, 3.5)[..., None] * np.clip((np.arange(H, dtype=np.float32) - 505) / 18, 0, 1)[:, None, None]
xs, ys = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))


def warp(picture, sx, sy):
    return np.stack([ndimage.map_coordinates(picture[..., c], [sy, sx], order=1, mode="constant") for c in range(4)], axis=-1)


# The dress beside the arm (to its right by the waist, to its left lower down), moved over and softly
# blended, reads as more of the same dress.
side = np.clip((ys - 610) / 50, 0, 1)
filler = warp(body, (1 - side) * (1204 - xs) + side * (xs - 82), ys + 8)
filler[..., :3] = ndimage.gaussian_filter(filler[..., :3], (1.5, 1.5, 0))
# Where that would reach past the dress's edge, the painting stays as it is.
fill_mask = fill_mask * np.clip(filler[..., 3:] * 1.5 - 0.5, 0, 1)
body = body * (1 - fill_mask) + filler * fill_mask

WING = polygon_mask([(0, 0), (540, 0), (540, 250), (505, 330), (515, 510), (470, 620), (300, 800), (0, 800)], 40)
HIP_Y = 700.0
HEM_Y = 1340.0


def rotation(picture, pivot, angle, to):
    """Rotates `picture` about `pivot` by `angle` degrees (forward = the hand goes towards +x) and lands the pivot on `to`."""
    a = math.radians(angle); c, s = math.cos(a), math.sin(a)
    # Inverse map: output point -> source point.
    ox, oy = xs - to[0], ys - to[1]
    sx = pivot[0] + c * ox - s * oy
    sy = pivot[1] + s * ox + c * oy
    return warp(picture, sx, sy)


def turned(point, pivot, angle):
    a = math.radians(angle); c, s = math.cos(a), math.sin(a)
    x, y = point[0] - pivot[0], point[1] - pivot[1]
    return (pivot[0] + c * x + s * y, pivot[1] - s * x + c * y)


def composite(bottom, top):
    return top + bottom * (1 - top[..., 3:])


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


STANCE = 0.6
def foot_pose(phase, reach):
    """Where a foot is at this phase of its own stride: offset along the ground, lift, and tilt (+ toes up)."""
    p = phase % 1
    if p < STANCE:
        t = p / STANCE
        x = reach * (1 - 2 * t)
        tilt = 12 * (1 - smooth(t / 0.16)) - 30 * smooth((t - 0.72) / 0.28)
        lift = 0.0
    else:
        t = (p - STANCE) / (1 - STANCE)
        x = reach * (-1 + 2 * smooth(t))
        tilt = -30 + 42 * smooth(t / 0.92)
        lift = 40 * math.sin(math.pi * min(1.0, t * 1.04)) ** 1.25
    return x, lift, tilt


def place_foot(picture, heel, toe, ankle, hip, phase, reach):
    x, lift, tilt = foot_pose(phase, reach)
    # Heel strike turns about the heel, toe-off about the toe.
    pivot = toe if tilt < 0 else heel
    shoe = rotation(picture, pivot, -tilt, (pivot[0] + x, pivot[1] - lift))
    # The leg runs from under the dress to wherever the ankle is now; only its end ever shows.
    at = turned(ankle, pivot, -tilt)
    at = (at[0] + x, at[1] - lift)
    leg = limb([hip, at], [26, 14])
    return composite(leg, shoe)


def frame(phase):
    tau = 2 * math.pi
    bob = -9.0 * (0.5 - 0.5 * math.cos(tau * 2 * (phase - 0.05)))  # lowest with both feet down
    lean = 1.1  # she leans into the walk

    # Arms: against the same-side leg; the swing lags the legs a touch.
    swing = math.cos(tau * (phase - 0.03))
    near_angle = -8 - 21 * swing
    far_angle = -10 + 16 * swing
    near_flex = 5 + 20 * smooth((near_angle + 29) / 42)
    far_flex = 3 + 18 * smooth((far_angle + 26) / 32)

    feet = np.zeros_like(art)
    feet = composite(feet, place_foot(far_foot, FAR_HEEL, FAR_TOE, FAR_ANKLE, HIP["far"], phase + 0.5, 140))
    feet = composite(feet, place_foot(near_foot, NEAR_HEEL, NEAR_TOE, NEAR_ANKLE, HIP["near"], phase, 165))

    # The dress: trails the walk, swings with each step, tips ripple. Above the hips it holds still.
    depth = np.clip((ys - HIP_Y) / (HEM_Y - HIP_Y), 0, 1.2)
    sway = 15 * math.sin(tau * 2 * (phase - 0.18))
    dx = (sway - 12) * depth ** 2 + 5 * np.sin(tau * (xs / 210 + 2 * phase)) * depth ** 3
    dy = 7 * np.sin(tau * (xs / 170 - 2 * phase + 0.25)) * depth ** 3
    # Wings breathe slowly about their root.
    wing_a = math.radians(2.4 * math.sin(tau * 2 * (phase + 0.12)))
    wx, wy = xs - 512, ys - 498
    dx = dx + WING * (np.cos(wing_a) * wx - np.sin(wing_a) * wy - wx)
    dy = dy + WING * (np.sin(wing_a) * wx + np.cos(wing_a) * wy - wy)
    # Lean and bob, about the feet.
    l = math.radians(lean); up = np.clip((1390 - ys) / 900, 0, 1)
    dx = dx + np.sin(l) * (1390 - ys) * up
    dressed = warp(body, xs + dx, ys + dy - bob)

    def carried(point):
        return (point[0] + math.sin(l) * (1390 - point[1]), point[1] + bob)

    far_elbow_at = carried(turned(FAR_ELBOW, FAR_SHOULDER, far_angle))
    far_wrist_at = turned(FAR_WRIST, FAR_ELBOW, far_angle + far_flex)
    far_wrist_at = (far_wrist_at[0] - FAR_ELBOW[0] + far_elbow_at[0], far_wrist_at[1] - FAR_ELBOW[1] + far_elbow_at[1])
    far = limb([carried(FAR_SHOULDER), far_elbow_at, far_wrist_at], [20, 18, 15])
    far = composite(far, rotation(far_visible, FAR_ELBOW, far_angle + far_flex, far_elbow_at))

    near_elbow_at = turned(ELBOW, SHOULDER, near_angle)
    near = rotation(fore_arm, ELBOW, near_angle + near_flex, carried(near_elbow_at))
    near = composite(near, rotation(upper_arm, SHOULDER, near_angle, carried(SHOULDER)))

    out = composite(far, feet)
    out = composite(out, dressed)
    return composite(out, near)


cell_w, cell_h = (int(v) for v in args.cell.split(","))
rows = math.ceil(args.frames / args.columns)
sheet = Image.new("RGBA", (cell_w * args.columns, cell_h * rows), (0, 0, 0, 0))
for i in range(args.frames):
    pic = frame(i / args.frames)
    alpha = np.maximum(pic[..., 3:], 1e-4)
    rgba = np.concatenate([np.clip(pic[..., :3] / alpha, 0, 1), np.clip(pic[..., 3:], 0, 1)], axis=-1)
    small = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").resize((cell_w, cell_h), Image.LANCZOS)
    sheet.paste(small, ((i % args.columns) * cell_w, (i // args.columns) * cell_h))
sheet.save(f"{args.out}/walk.png")
if args.preview:
    back = Image.new("RGBA", sheet.size, (120, 160, 120, 255)); back.alpha_composite(sheet)
    back.convert("RGB").save(args.preview)
print("cell", cell_w, cell_h, "frames", args.frames, "sheet", sheet.size)
