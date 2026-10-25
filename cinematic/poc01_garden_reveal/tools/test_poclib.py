"""Checks of poclib against the real approved assets (run outside Blender: python tools/test_poclib.py <repo>)."""
import json, math, os, sys
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import poclib as P
repo = sys.argv[1]
m = json.load(open(os.path.join(os.path.dirname(HERE), 'scene_manifest.json')))
s = m['units']['metersPerWorldPixel']
sampler = P.HeightSampler(s)
for l in m['layers']:
    if 'relief' in l:
        a = np.asarray(Image.open(os.path.join(repo, l['asset'])).convert('RGBA'), dtype=np.float64)[:, :, 3] / 255.0
        if a.shape[1] > 700:   # speed: tests use a downsampled alpha
            k = a.shape[1] // 600
            a = a[::k, ::k]
        sampler.add(l, P.relief_heights(a, l))
fails = []
def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + (' - ' + detail if detail else ''))
    if not ok: fails.append(name)

keys = m['camera']['keys']
# 1. camera clearance above ground along the whole move
worst = (1e9, None)
for f in range(1, m['camera']['frames'] + 1):
    k = P.interp_keys(keys, f)
    g = max(sampler.at(k['x'], k['y']), 0.0)
    c = k['z'] - g
    if c < worst[0]: worst = (c, f)
check('camera stays >= 0.35 m above ground/water on every frame', worst[0] >= 0.35, 'min clearance %.2f m at frame %d' % worst)
# 2. start among flowers on dry ground, mid over open water
g0 = sampler.at(keys[0]['x'], keys[0]['y'])
check('start is on dry ground', g0 > 0.6, 'ground %.2f m' % g0)
mid = P.interp_keys(keys, 30); gm = sampler.at(mid['x'], mid['y'])
check('frame 30 skims over open water', gm <= 0.0, 'ground %.2f m (water surface = 0)' % gm)
# 3. final framing: pavilion, waterfall lip and treehouse trunk inside the frame
def project(key, X, Y, Z, w=1920, h=1080):
    (cx, cy, cz), _ = P.camera_pose(key, s)
    fwd = np.array(P.camera_forward(key))
    right = np.array([math.cos(math.radians(key['heading'])), -math.sin(math.radians(key['heading'])), 0.0])
    up = np.cross(right, fwd)
    d = np.array([X - cx, Y - cy, Z - cz])
    zc = d @ fwd
    if zc <= 0: return None
    fpx = m['camera']['lensMm'] / m['camera']['sensorMm'] * w
    return (w / 2 + fpx * (d @ right) / zc, h / 2 - fpx * (d @ up) / zc)
last = keys[-1]
cards = {c['id']: c for c in m['landmarkCards']}
targets = {}
frt, fup = P.final_view_basis(last)          # landmark panels stand perpendicular to the final view
for cid in ('pavilion', 'treehouse_tree-base'):
    (X, Y), (wm, hm) = P.card_anchor(cards[cid], s)
    base = np.array([X, Y, m['heights']['landTop']])
    targets[cid + ' base'] = tuple(base)
    targets[cid + ' top'] = tuple(base + fup * hm * cards[cid]['groundV'])
bands = P.waterfall_bands(m['waterfall'], s, m['heights'])
fall = [b for b in bands if b['shape'] == 'fall'][0]
lip = np.mean([fall['corners'][2], fall['corners'][3]], axis=0)
targets['waterfall lip'] = tuple(lip)
for name, (X, Y, Z) in targets.items():
    p = project(last, X, Y, Z)
    ok = p is not None and 0 <= p[0] <= 1920 and 0 <= p[1] <= 1080
    check('final frame shows ' + name, ok, 'screen %s' % (None if p is None else '(%d, %d)' % p))
# 4. waterfall bands are continuous (pool top edge meets fall foot; fall lip meets source band)
pool, fall_, src = bands
check('waterfall foot joins pool', np.allclose(pool['corners'][3], fall_['corners'][0], atol=1e-6))
check('waterfall lip joins source band', np.allclose(fall_['corners'][3], src['corners'][0], atol=1e-6))
# 5. flower scatter
fl = P.scatter_flowers(m['scatter'], keys[0], sampler, len(m['foregroundFlowers']))
check('flower scatter fills its count on dry ground', len(fl) == m['scatter']['count'], '%d placed' % len(fl))
# 6. lake bed tiling maps its own 2400x1800 rect to UV 0..1
lb = [l for l in m['layers'] if l['id'] == 'lakebed'][0]
(sx, sy), (ox, oy) = P.tile_uv_scale(lb)
check('lake bed mirror tiling covers 3x3.67 tiles', abs(sx - 3) < 1e-9 and abs(sy - 6600 / 1800) < 1e-9, 'scale %.3f x %.3f offset %.3f, %.3f' % (sx, sy, ox, oy))
# 7. smooth motion: no jolts (peak acceleration and jerk limits for a stabilised aerial camera)
pos = []
for f in range(1, m['camera']['frames'] + 1):
    k = P.interp_keys(keys, f); pos.append(P.camera_pose(k, s)[0])
pos = np.array(pos); fps = m['camera']['fps']
v = np.diff(pos, axis=0) * fps; acc = np.diff(v, axis=0) * fps
check('peak camera acceleration <= 10 m/s^2 (about 1 g)', np.linalg.norm(acc, axis=1).max() <= 10.0, '%.1f m/s^2, peak speed %.1f m/s' % (np.linalg.norm(acc, axis=1).max(), np.linalg.norm(v, axis=1).max()))
check('camera settles: last-frame speed <= 0.5 m/s', np.linalg.norm(v[-1]) <= 0.5, '%.2f m/s' % np.linalg.norm(v[-1]))
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
