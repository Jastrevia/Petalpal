"""Geometry and camera PREVIS for poc01 - NOT a render of the Blender scene.

A small numpy ray-marcher that uses exactly the same manifest, relief, cards, waterfall bands, flower scatter and
camera keys as build_scene.py. It answers: what does the camera see, what occludes what, does the move have parallax,
is anything clipping. It does NOT show the Blender lighting, water optics, volumetrics, depth of field or motion blur.

python tools/previs.py <repo> <out_dir> [--frames 1,20,46,68,108] [--size 640x360] [--all]
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import poclib as P

repo, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
args = sys.argv[3:]
frames = None
if '--frames' in args: frames = [int(x) for x in args[args.index('--frames') + 1].split(',')]
W, Hh = [int(x) for x in (args[args.index('--size') + 1] if '--size' in args else '640x360').split('x')]
m = json.load(open(os.path.join(ROOT, 'scene_manifest.json')))
N = m['camera']['frames']
if frames is None: frames = sorted({1, round(N * 0.2), round(N * 0.4), round(N * 0.67), N})
if '--all' in args: frames = list(range(1, N + 1))
S = m['units']['metersPerWorldPixel']; HT = m['heights']; cam = m['camera']; L = m['light']

# ---------------------------------------------------------------- world rasters: ground colour and height
GX0, GY0, GX1, GY1, G = -900, -1500, 3300, 2700, 0.5          # map px region, cells per map px
NX, NY = int((GX1 - GX0) * G), int((GY1 - GY0) * G)
color = np.zeros((NY, NX, 3), np.float32); alpha_acc = np.zeros((NY, NX), np.float32)
canvas = Image.new('RGBA', (NX, NY), (120, 184, 178, 255))
def paste(path, x, y, w, h, rot):
    im = Image.open(os.path.join(repo, path)).convert('RGBA').resize((max(1, int(w * G)), max(1, int(h * G))), Image.LANCZOS)
    cx, cy = (x + w / 2 - GX0) * G, (y + h / 2 - GY0) * G
    if rot: im = im.rotate(-rot, resample=Image.BICUBIC, expand=True)
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))
def tiled(path, x, y, w, h, rect):
    tx, ty, tw, th = rect
    im = Image.open(os.path.join(repo, path)).convert('RGBA').resize((int(tw * G), int(th * G)), Image.LANCZOS)
    fx = im.transpose(Image.FLIP_LEFT_RIGHT); fy = im.transpose(Image.FLIP_TOP_BOTTOM); fxy = fx.transpose(Image.FLIP_TOP_BOTTOM)
    for i in range(math.floor((max(x, GX0) - tx) / tw), math.ceil((min(x + w, GX1) - tx) / tw)):
        for j in range(math.floor((max(y, GY0) - ty) / th), math.ceil((min(y + h, GY1) - ty) / th)):
            canvas.alpha_composite([[im, fy], [fx, fxy]][i % 2][j % 2], (int((tx + i * tw - GX0) * G), int((ty + j * th - GY0) * G)))
height = np.full((NY, NX), -0.4, np.float32)
gy, gx = np.mgrid[0:NY, 0:NX]
wx = GX0 + (gx + 0.5) / G; wy = GY0 + (gy + 0.5) / G
mattes = []
for l in m['layers']:
    if l['role'] == 'matte':
        a = np.asarray(Image.open(os.path.join(repo, l['asset'])).convert('RGBA'), dtype=np.float64)[:, :, 3] / 255.0
        gv = P.matte_ground_v(l, a)
        mattes.append((l, P.matte_panel(l, gv, cam['keys'][-1], S)))
        if l.get('groundSplit'):
            sub, sa, _ = P.split_ground(l, a, gv)
            im = Image.open(os.path.join(repo, l['asset'])).convert('RGBA')
            crop = im.crop((0, int(round(gv * im.height)), im.width, im.height)).resize((max(1, int(sub['width'] * G)), max(1, int(sub['height'] * G))), Image.LANCZOS)
            canvas.alpha_composite(crop, (int((sub['x'] - GX0) * G), int((sub['y'] - GY0) * G)))
            k_ = max(1, sa.shape[1] // 640); hts = P.relief_heights(sa[::k_, ::k_], sub)
            u = (wx - sub['x']) / sub['width']; vv = (wy - sub['y']) / sub['height']
            inside = (u >= 0) & (u <= 1) & (vv >= 0) & (vv <= 1)
            hv = np.full(u.shape, -1e9); hv[inside] = P.bilinear(hts, u[inside], vv[inside])
            height = np.maximum(height, hv.astype(np.float32))
        continue
    if l.get('tile'): tiled(l['asset'], l['x'], l['y'], l['width'], l['height'], l['tile']['rect'])
    else: paste(l['asset'], l['x'], l['y'], l['width'], l['height'], l['rotationDeg'])
    if 'relief' in l:
        a = np.asarray(Image.open(os.path.join(repo, l['asset'])).convert('RGBA'), dtype=np.float64)[:, :, 3] / 255.0
        k = max(1, a.shape[1] // 640); hts = P.relief_heights(a[::k, ::k], l)
        cx, cy = l['x'] + l['width'] / 2, l['y'] + l['height'] / 2; r = math.radians(l['rotationDeg'])
        dx, dy = wx - cx, wy - cy
        lx = dx * math.cos(-r) - dy * math.sin(-r); ly = dx * math.sin(-r) + dy * math.cos(-r)
        u = lx / l['width'] + 0.5; v = ly / l['height'] + 0.5
        inside = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
        hv = np.full(u.shape, -1e9); hv[inside] = P.bilinear(hts, u[inside], v[inside])
        height = np.maximum(height, hv.astype(np.float32))
ground = np.asarray(canvas, dtype=np.float32)[:, :, :3] / 255.0
# heightfield normals for a simple sun term
gzy, gzx = np.gradient(height, 1.0 / G * S)
nrm = np.dstack([-gzx, gzy, np.ones_like(height)]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
el, az = math.radians(L['sunElevationDeg']), math.radians(L['sunAzimuthDeg'])
sun = np.array([math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)])
lambert = np.clip(nrm @ sun, 0, 1).astype(np.float32)
print('rasters ready', NX, NY)

def cell(X, Y):
    """Blender metres -> raster indices (clamped)."""
    px = X / S + P.ORIGIN[0]; py = -Y / S + P.ORIGIN[1]
    ix = np.clip(((px - GX0) * G).astype(np.int64), 0, NX - 1); iy = np.clip(((py - GY0) * G).astype(np.int64), 0, NY - 1)
    return iy, ix

# ---------------------------------------------------------------- cards (same data as build_scene.py)
class Card:
    def __init__(self, path, size_m=None):
        im = np.asarray(Image.open(os.path.join(repo, path)).convert('RGBA'), dtype=np.float32) / 255.0
        k = max(1, im.shape[1] // 700); self.img = im[::k, ::k]
_cache = {}
def tex(path):
    if path not in _cache: _cache[path] = Card(path).img
    return _cache[path]
sampler = P.HeightSampler(S)
for l in m['layers']:
    if 'relief' in l and l['role'] != 'matte':
        a = np.asarray(Image.open(os.path.join(repo, l['asset'])).convert('RGBA'), dtype=np.float64)[:, :, 3] / 255.0
        k = max(1, a.shape[1] // 640); sampler.add(l, P.relief_heights(a[::k, ::k], l))
flowers = P.scatter_flowers(m['scatter'], cam['keys'][0], sampler, len(m['foregroundFlowers']))
bands = P.waterfall_bands(m['waterfall'], S, HT)

def render(f):
    k = P.interp_keys(cam['keys'], f)
    (cx, cy, cz), _ = P.camera_pose(k, S)
    o = np.array([cx, cy, cz])
    fwd = np.array(P.camera_forward(k)); right = np.array([math.cos(math.radians(k['heading'])), -math.sin(math.radians(k['heading'])), 0.0])
    up = np.cross(right, fwd)
    fpx = cam['lensMm'] / cam['sensorMm'] * W
    jj, ii = np.mgrid[0:Hh, 0:W]
    d = fwd[None, None] * fpx + right[None, None] * (ii[..., None] - W / 2 + 0.5) - up[None, None] * (jj[..., None] - Hh / 2 + 0.5)
    d = (d / np.linalg.norm(d, axis=2, keepdims=True)).reshape(-1, 3)
    n = d.shape[0]
    # --- heightfield march
    t = np.full(n, 0.05); hit_t = np.full(n, np.inf); active = np.ones(n, bool)
    prev = np.zeros(n)
    for _ in range(420):
        idx = np.nonzero(active)[0]
        if idx.size == 0: break
        pos = o + d[idx] * t[idx, None]
        iy, ix = cell(pos[:, 0], pos[:, 1])
        surf = np.maximum(height[iy, ix], 0.0)
        hit = pos[:, 2] <= surf
        hi = idx[hit]
        # refine by bisection between previous and current t
        lo_t, hi_t = prev[hi].copy(), t[hi].copy()
        for _b in range(6):
            mid = (lo_t + hi_t) / 2; pm = o + d[hi] * mid[:, None]; a_, b_ = cell(pm[:, 0], pm[:, 1])
            below = pm[:, 2] <= np.maximum(height[a_, b_], 0.0)
            hi_t = np.where(below, mid, hi_t); lo_t = np.where(below, lo_t, mid)
        hit_t[hi] = hi_t; active[hi] = False
        prev[idx] = t[idx]
        t[idx] = t[idx] + np.maximum(0.03, 0.012 * t[idx])
        active[idx[t[idx] > 900]] = False
    pos = o + d * np.where(np.isfinite(hit_t), hit_t, 0)[:, None]
    iy, ix = cell(pos[:, 0], pos[:, 1])
    g = ground[iy, ix]; hgt = height[iy, ix]
    lit = 0.62 + 0.55 * lambert[iy, ix][:, None]
    col = g * lit * np.array(L['sunColor'])[None] ** 0.35
    water = np.isfinite(hit_t) & (hgt <= 0.0)
    cosv = np.clip(-d[:, 2], 0, 1)
    fres = 0.02 + 0.98 * (1 - cosv) ** 5
    depth = np.clip(-hgt, 0, 2) / 2
    tint = np.array(m['water']['absorbColor'])
    wcol = g * (1 - 0.55 * depth[:, None]) * (0.55 + 0.45 * tint[None]) + 0.08 * tint[None]
    skyc = np.array([0.80, 0.86, 0.90])
    col = np.where(water[:, None], wcol * (1 - fres[:, None]) + skyc[None] * fres[:, None], col)
    sky = np.clip(0.55 + 0.45 * d[:, 2:3], 0, 1) * np.array([0.72, 0.84, 0.95])[None] + (1 - np.clip(d[:, 2:3] * 4, 0, 1)) * np.array([0.25, 0.18, 0.10])[None]
    col = np.where(np.isfinite(hit_t)[:, None], col, sky)
    depthbuf = np.where(np.isfinite(hit_t), hit_t, 1e9)
    # --- cards: (path, centre, right, up, w, h, v range), drawn far -> near with alpha
    items = []
    def billboard(pos3, wm, hm, g, path, upright, off=0.0):
        to = o - np.array(pos3);
        if upright: to[2] = 0
        nn = to / (np.linalg.norm(to) + 1e-9)
        rt = np.cross(np.array([0, 0, 1.0]), nn); rt /= np.linalg.norm(rt) + 1e-9
        upv = np.cross(nn, rt)
        base = np.array(pos3) + nn * off
        items.append((np.linalg.norm(to), path, base, rt, upv, wm, hm, g, (0.0, 1.0)))
    frt, fup = P.final_view_basis(cam['keys'][-1]); fn = np.cross(frt, fup)
    for c in m['landmarkCards']:
        (X, Y), (wm, hm) = P.card_anchor(c, S)
        grp = [x for x in m['landmarkCards'] if x['group'] == c['group']]
        base = np.array([X, Y, HT['landTop']]) + fn * 0.03 * grp.index(c)
        items.append((np.linalg.norm(o - base), c['asset'], base, frt, fup, wm, hm, c['groundV'], (0.0, 1.0)))
    for fl in flowers:
        im = tex(m['foregroundFlowers'][fl['sprite_index']]); asp = im.shape[1] / im.shape[0]
        X, Y = P.world_to_bl(fl['px'], fl['py'], S)
        billboard((X, Y, fl['z']), fl['height_m'] * asp, fl['height_m'], 0.0, m['foregroundFlowers'][fl['sprite_index']], True)
    for l, mp in mattes:
        base = np.array(mp['base']); rt = np.array(mp['right']); upv = np.array(mp['up'])
        items.append((np.linalg.norm(o - base), l['asset'], base, rt, upv, mp['width'], mp['height'], mp['ground_v'], (0.0, 1.0)))
    for b in bands:
        bl, br, tr, tl = [np.array(p) for p in b['corners']]
        rt = br - bl; wm = np.linalg.norm(rt); rt /= wm; upv = tl - bl; hm = np.linalg.norm(upv); upv /= hm
        items.append((np.linalg.norm(o - (bl + tr) / 2), m['waterfall']['asset'], bl + rt * wm / 2, rt, upv, wm, hm, 0.0, (b['v0'], b['v1'])))
    items.sort(key=lambda it: -it[0])
    for dist, path, base, rt, upv, wm, hm, g, (v0, v1) in items:
        nrmv = np.cross(rt, upv); denom = d @ nrmv
        ok = np.abs(denom) > 1e-6
        tt = np.where(ok, ((base - o) @ nrmv) / np.where(ok, denom, 1), -1)
        hp = o + d * tt[:, None] - base
        u = (hp @ rt) / wm + 0.5; vv = (hp @ upv) / hm + (1 - g) if g else (hp @ upv) / hm
        sel = ok & (tt > 0.04) & (tt < depthbuf) & (u >= 0) & (u <= 1) & (vv >= 0) & (vv <= 1)
        if not sel.any(): continue
        im = tex(path); ih, iw = im.shape[:2]
        vimg = v0 + vv[sel] * (v1 - v0)
        px_ = np.clip((u[sel] * (iw - 1)).astype(int), 0, iw - 1); py_ = np.clip(((1 - vimg) * (ih - 1)).astype(int), 0, ih - 1)
        rgba = im[py_, px_]
        a = rgba[:, 3:4]
        shade = 0.85
        col[sel] = col[sel] * (1 - a) + rgba[:, :3] * shade * a
        solid = np.zeros(n, bool); solid[np.nonzero(sel)[0][rgba[:, 3] > 0.5]] = True
        depthbuf = np.where(solid, tt, depthbuf)
    # haze
    hz = 1 - np.exp(-np.minimum(depthbuf, 600) * 0.0045)
    col = col * (1 - hz[:, None]) + np.array(L['hazeColor'])[None] * 0.85 * hz[:, None]
    img = Image.fromarray((np.clip(col, 0, 1) ** (1 / 1.1) * 255).astype(np.uint8).reshape(Hh, W, 3))
    return img, k

shots = []
for f in frames:
    img, k = render(f)
    img.save(os.path.join(outdir, 'previs_f%03d.png' % f))
    shots.append((f, img, k))
    print('frame', f, 'z %.1f m pitch %.0f' % (k['z'], k['pitch']))
if len(shots) <= 6:
    cols = 2 if len(shots) > 2 else len(shots)
    rows = math.ceil(len(shots) / cols)
    sheet = Image.new('RGB', (cols * W + (cols + 1) * 12, rows * (Hh + 30) + 50), (24, 24, 28))
    dr = ImageDraw.Draw(sheet)
    dr.text((12, 12), 'POC01 previs - geometry, occlusion and camera only (numpy ray-march, not Blender; no lighting/water optics/DOF/blur)', fill=(230, 230, 230))
    for i, (f, img, k) in enumerate(shots):
        x = 12 + (i % cols) * (W + 12); y = 40 + (i // cols) * (Hh + 30)
        sheet.paste(img, (x, y)); dr.text((x, y + Hh + 6), 'frame %d  |  %.1f m  |  pitch %d deg  |  24 mm' % (f, k['z'], round(k['pitch'])), fill=(200, 200, 200))
    sheet.save(os.path.join(outdir, 'previs_contact_sheet.jpg'), quality=90)
else:
    shots[0][1].save(os.path.join(outdir, 'previs_move.gif'), save_all=True, append_images=[s[1] for s in shots[1:]], duration=int(1000 / cam['fps']), loop=0)

