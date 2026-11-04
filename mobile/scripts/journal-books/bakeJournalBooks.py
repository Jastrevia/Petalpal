# Bakes the monthly journal textures from the existing spine artwork (objects.png) and EB Garamond (OFL).
# Usage: python bake_journal.py <bake dir with spine-src-XX.png / spine-esr-XX.png> <font ttf> <out dir>
import math, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import gaussian_filter

BAKE, FONT, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261028)
# Cloth colours sampled from each spine body (same table as MonthBook.tsx); leather is a richer, deeper take.
CLOTH = ['#D6BF9B', '#86906A', '#B2735B', '#3B5E5E', '#77596A', '#C59250', '#687D8F', '#D3BB93', '#38605A', '#A5523E', '#A3879A', '#2E4428']
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
LIGHT = {0, 7}

def hexrgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255

def leather_rgb(i):
    c = hexrgb(CLOTH[i])
    if i in LIGHT:  # pale vellum-like leathers stay light but warmer
        return c * np.array([.97, .93, .86]) + .02
    hsv_boost = c ** 1.12  # a little deeper and more saturated
    return np.clip(hsv_boost * .92, 0, 1)

def noise(h, w, scales=(1.2, 3, 8, 20), weights=(.35, .3, .2, .15)):
    out = np.zeros((h, w), np.float32)
    for s, wt in zip(scales, weights):
        out += wt * gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), s, mode='wrap')
    out -= out.min(); out /= out.max() + 1e-6
    return out

def shade_from_height(height, strength, light=(-.55, -.65, .52)):
    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(height)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    l = np.array(light, np.float32); l /= np.linalg.norm(l)
    return (nx * l[0] + ny * l[1] + nz * l[2]) / n

def leather(h, w, base, seed_scale=1.0):
    grain = noise(h, w, (1.0, 2.2, 5), (.5, .35, .15))
    lit = shade_from_height(grain, 9 * seed_scale)
    mott = noise(h, w, (25, 60), (.6, .4))
    img = base[None, None, :] * (0.78 + .32 * lit[..., None]) * (0.9 + .18 * mott[..., None])
    # vignette and worn, lighter edges
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = np.minimum(xx, w - 1 - xx) / w; dy = np.minimum(yy, h - 1 - yy) / h
    edge = np.clip(np.minimum(dx, dy) * 14, 0, 1)
    img *= (0.72 + .28 * edge[..., None])
    rim = np.exp(-np.minimum(dx * w, dy * h) / 5)[..., None]
    img = img * (1 - .25 * rim) + .25 * rim * np.clip(base * 1.35, 0, 1)
    return np.clip(img, 0, 1)

GOLD = np.array([[.36, .24, .09], [.62, .45, .17], [.86, .69, .33], [.98, .9, .6], [1, .97, .82]], np.float32)
def gold_ramp(t):
    t = np.clip(t, 0, 1) * (len(GOLD) - 1); i = np.floor(t).astype(int); i = np.clip(i, 0, len(GOLD) - 2); f = (t - i)[..., None]
    return GOLD[i] * (1 - f) + GOLD[i + 1] * f

def emboss_gold(canvas, mask, bevel=2.2, strength=6, shadow=True, worn=.0, contrast=1.6, floor=.18):
    """Composite a raised, lit gold relief (mask in 0..1) onto canvas (h,w,3 float)."""
    h = gaussian_filter(mask, bevel)
    lit = shade_from_height(h, strength)
    tone = floor + .9 * np.clip(lit, 0, 1) ** contrast + .12 * noise(*mask.shape, (1.5, 6), (.6, .4))
    # darker metal toward each piece's edges reads as thickness
    tone = tone - .35 * np.clip(gaussian_filter(mask, bevel * 1.6) - mask, 0, 1) - .25 * (1 - np.clip(gaussian_filter(mask, bevel * 2.5), 0, 1))
    col = gold_ramp(tone)
    if worn: col = col * (1 - worn * noise(*mask.shape, (3, 10), (.5, .5))[..., None] * .35)
    if shadow:
        sh = gaussian_filter(np.roll(np.roll(mask, 3, 0), 2, 1), 2.5)
        canvas *= (1 - .55 * np.clip(sh, 0, 1))[..., None]
    a = np.clip(gaussian_filter(mask, .6), 0, 1)[..., None]
    return canvas * (1 - a) + col * a

def mask_canvas(w, h): return Image.new('L', (w, h), 0)
def to_np(m): return np.asarray(m, np.float32) / 255

def vine(draw, pts, width, leaf, side=1):
    """A sinuous botanical vine with alternating leaves along a polyline."""
    draw.line(pts, fill=255, width=width, joint='curve')
    for k in range(2, len(pts) - 1, 3):
        (x0, y0), (x1, y1) = pts[k - 1], pts[k + 1]
        ang = math.atan2(y1 - y0, x1 - x0) + (math.pi / 2.6) * (1 if (k // 3) % 2 else -1) * side
        cx, cy = pts[k][0] + math.cos(ang) * leaf * .9, pts[k][1] + math.sin(ang) * leaf * .9
        poly = []
        for t in np.linspace(0, 2 * math.pi, 18):
            lx, ly = math.cos(t) * leaf, math.sin(t) * leaf * .42
            poly.append((cx + lx * math.cos(ang) - ly * math.sin(ang), cy + lx * math.sin(ang) + ly * math.cos(ang)))
        draw.polygon(poly, fill=255)

def flower_centre(spine):
    """Vertical centre of the painted flower on a spine (saturation-weighted)."""
    a = np.asarray(spine.convert('HSV'), np.float32)[..., 1]
    a[:, :40] = 0; a[:, -40:] = 0
    rows = a.mean(1); rows = gaussian_filter(rows, 30)
    h = len(rows); rows[: int(h * .14)] = 0; rows[int(h * .86):] = 0
    return int(np.argmax(rows))

def opaque_spine(i):
    up = Image.open(f'{BAKE}/spine-esr-{i:02d}.png').convert('RGB')
    c = (leather_rgb(i) * .5 * 255).astype(int)
    src = Image.open(f'{BAKE}/spine-src-{i:02d}.png').convert('RGBA')
    bg = Image.new('RGBA', src.size, tuple(int(v) for v in c) + (255,)); bg.alpha_composite(src)
    lz = bg.convert('RGB').resize(up.size, Image.LANCZOS)
    return Image.blend(up, lz, .3)  # keep some of the painted grain

W, H = 640, 940
def bake_cover(i, spine):
    base = leather_rgb(i)
    img = leather(H, W, base)
    light = i in LIGHT
    # Gold work on a 2x supersampled mask.
    S = 2; m = mask_canvas(W * S, H * S); d = ImageDraw.Draw(m)
    def R(x0, y0, x1, y1, r, wd): d.rounded_rectangle((x0 * S, y0 * S, x1 * S, y1 * S), r * S, outline=255, width=wd * S)
    R(30, 30, W - 30, H - 30, 18, 4); R(44, 44, W - 44, H - 44, 12, 2)
    # Arched plate frame (outer, inner) around the flower window.
    px0, px1, py0, py1 = 195, 445, 268, 848
    def arch(inset, wd):
        x0, x1, y0, y1 = px0 - inset, px1 + inset, py0 - inset, py1 + inset
        r = (x1 - x0) / 2
        d.arc(((x0) * S, y0 * S, x1 * S, (y0 + 2 * r) * S), 180, 360, fill=255, width=wd * S)
        d.line(((x0 * S, (y0 + r) * S), (x0 * S, y1 * S)), fill=255, width=wd * S)
        d.line(((x1 * S, (y0 + r) * S), (x1 * S, y1 * S)), fill=255, width=wd * S)
        d.line(((x0 * S, y1 * S), (x1 * S, y1 * S)), fill=255, width=wd * S)
    arch(14, 6); arch(24, 2)
    # Botanical vines climbing either side of the plate.
    for side in (-1, 1):
        cx = W / 2 + side * 205
        pts = [((cx + side * 12 * math.sin(t * 1.3)) * S, (846 - t * 52) * S) for t in np.linspace(0, 10.6, 34)]
        vine(d, pts, 3 * S, 13 * S, side)
    # Title, flourish rule and a small fleuron at the foot.
    font = ImageFont.truetype(FONT, 78 * S)
    title = MONTHS[i]
    tw = d.textlength(title, font=font)
    d.text(((W * S - tw) / 2, 118 * S), title, font=font, fill=255)
    d.line(((200 * S, 232 * S), (440 * S, 232 * S)), fill=255, width=2 * S)
    for x in (200, 440): d.ellipse(((x - 5) * S, (232 - 5) * S, (x + 5) * S, (232 + 5) * S), fill=255)
    d.regular_polygon((W / 2 * S, 232 * S, 9 * S), 4, rotation=45, fill=255)
    pass  # the year is lettered at runtime in the space below the plate
    mask = to_np(m.resize((W, H), Image.LANCZOS))
    img = emboss_gold(img, mask, bevel=1.4, strength=7, worn=.6 if not light else .3)
    # Year space (drawn at runtime): a faint debossed band so the gold year sits in a cartouche.
    # Flower plate: the month's own painted spine panel, inset under glass-like varnish.
    # The whole painted flower: between the spine's top and bottom gold bands, inside its side rails.
    ix0, ix1, iy0, iy1 = 28, 360, int(spine.height * .15), int(spine.height * .765)
    pw, ph = px1 - px0, py1 - py0
    region = spine.crop((ix0, iy0, ix1, iy1))
    scale = max(pw / region.width, ph / region.height)
    region = region.resize((round(region.width * scale), round(region.height * scale)), Image.LANCZOS)
    left, top = (region.width - pw) // 2, (region.height - ph) // 2
    plate = np.asarray(region.crop((left, top, left + pw, top + ph)), np.float32) / 255
    pm = mask_canvas(W, H); pd = ImageDraw.Draw(pm)
    r = (px1 - px0) // 2; pd.pieslice((px0, py0, px1, py0 + 2 * r), 180, 360, fill=255); pd.rectangle((px0, py0 + r, px1, py1), fill=255)
    pmask = to_np(pm.filter(ImageFilter.GaussianBlur(.8)))[..., None]
    canvas_plate = np.zeros_like(img); canvas_plate[py0:py1, px0:px1] = plate
    # inner shadow at the plate's edge, then a soft varnish highlight
    inner = gaussian_filter(1 - to_np(pm), 6)[..., None]
    canvas_plate *= (1 - .5 * inner)
    yy = np.mgrid[0:H, 0:W][0].astype(np.float32)
    canvas_plate += .06 * np.clip(1 - (yy - py0) / ph, 0, 1)[..., None]
    img = img * (1 - pmask) + canvas_plate * pmask
    # Antique gold corner protectors with filigree.
    cm = mask_canvas(W * S, H * S); cd = ImageDraw.Draw(cm); cut = mask_canvas(W * S, H * S); kd = ImageDraw.Draw(cut)
    C = 118
    for (sx, sy) in ((0, 0), (1, 0), (0, 1), (1, 1)):
        ox, oy = sx * W, sy * H; fx, fy = (1 - 2 * sx), (1 - 2 * sy)
        P = lambda x, y: ((ox + fx * x) * S, (oy + fy * y) * S)
        cd.polygon([P(0, 0), P(C, 0), P(C * .82, C * .18), P(C * .42, C * .3), P(C * .3, C * .42), P(C * .18, C * .82), P(0, C)], fill=255)
        for (x, y, rr) in ((C * .26, C * .26, 13), (C * .55, C * .14, 7), (C * .14, C * .55, 7)):
            cx, cy2 = P(x, y); kd.ellipse((cx - rr * S, cy2 - rr * S, cx + rr * S, cy2 + rr * S), fill=255)
        for (x, y) in ((C * .5, C * .07), (C * .07, C * .5)):
            cx, cy2 = P(x, y); cd.ellipse((cx - 4 * S, cy2 - 4 * S, cx + 4 * S, cy2 + 4 * S), fill=0)
    corner = np.clip(to_np(cm.resize((W, H), Image.LANCZOS)) - .85 * to_np(cut.resize((W, H), Image.LANCZOS)), 0, 1)
    img = emboss_gold(img, corner, bevel=4.2, strength=11, worn=.9, contrast=2.2, floor=.02)
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))

def bake_parchment(w=800, h=1180):
    base = np.array([.955, .905, .79], np.float32)
    n = noise(h, w, (1, 4, 16, 60), (.25, .25, .25, .25))
    fib = gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), (0.6, 7))
    img = base * (0.9 + .1 * n[..., None]) + .012 * fib[..., None]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / w) ** 2 + ((yy - h / 2) / h) ** 2)
    img *= (1 - .22 * np.clip(r - .25, 0, 1) ** 1.4 * 2.2)[..., None]
    # a few soft foxing spots
    for _ in range(14):
        cx, cy, rr = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(4, 22)
        spot = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * rr * rr)))
        img *= (1 - .07 * spot[..., None] * np.array([.6, 1, 1.6]))
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))

def bake_page_edges(w=512, h=96):
    # rows = individual sheets seen edge-on (thickness direction = y), slightly irregular and aged
    row = np.zeros(h, np.float32)
    for y in range(h): row[y] = .86 + .08 * rng.random() + (.0 if y % 3 else -.1)
    img = np.tile(row[:, None], (1, w))
    img += .03 * gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), (0.3, 12))
    col = np.stack([img * .97, img * .9, img * .74], -1)
    col *= (0.86 + .14 * noise(h, w, (8, 30), (.5, .5)))[..., None]
    return Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))

def bake_grain(s=512):
    g = noise(s, s, (1.0, 2.2, 5, 18), (.4, .3, .2, .1))
    lit = shade_from_height(g, 9)
    v = np.clip(.62 + .42 * lit, 0, 1)
    return Image.fromarray((v * 255).astype(np.uint8), 'L').convert('RGB')

if __name__ == '__main__':
    for i in range(12):
        spine = opaque_spine(i)
        spine.save(f'{OUT}/spine-{i + 1:02d}.webp', quality=86, method=6)
        bake_cover(i, spine).save(f'{OUT}/cover-{i + 1:02d}.webp', quality=86, method=6)
        print('month', i + 1, flush=True)
    bake_parchment().save(f'{OUT}/parchment.webp', quality=84, method=6)
    bake_page_edges().save(f'{OUT}/page-edges.webp', quality=88, method=6)
    bake_grain().save(f'{OUT}/leather-grain.webp', quality=84, method=6)
