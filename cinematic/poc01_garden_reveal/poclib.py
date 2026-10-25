"""Pure geometry for the PetalPal garden-reveal proof of concept.

No Blender dependency (only numpy), so every transform here is unit-tested outside Blender
and shared by build_scene.py (Blender) and tools/previs.py (framing check).

Conventions
- Map/world pixels: the app's 2D garden coordinates, x right, y DOWN (north is up on screen).
- Blender metres: X east, Y north, Z up. Map point (1200, 900), the centre of the 2400x1800 world, is the origin.
- Heights are metres above the water surface (z = 0).
"""
import math
import numpy as np

ORIGIN = (1200.0, 900.0)


def world_to_bl(px, py, s):
    """Map pixel -> Blender metres (X east, Y north)."""
    return ((px - ORIGIN[0]) * s, -(py - ORIGIN[1]) * s)


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def box_blur(a, r):
    """Separable box blur, applied twice (close to Gaussian). a: 2D float array, r: radius in pixels."""
    r = int(max(0, round(r)))
    if r == 0:
        return a.astype(np.float64)
    out = a.astype(np.float64)
    for _ in range(2):
        for axis in (0, 1):
            pad = [(0, 0), (0, 0)]
            pad[axis] = (r + 1, r)
            p = np.pad(out, pad, mode='edge')
            c = np.cumsum(p, axis=axis)
            if axis == 0:
                out = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
            else:
                out = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
    return out


def relief_heights(alpha, layer):
    """Height field (metres) for a layer from its painted alpha.

    alpha: 2D array (rows top->bottom, as the image appears), values 0..1.
    The alpha edge is blurred into a slope; opaque paint rises to 'top', transparent paint sinks to 'base'.
    """
    rel = layer['relief']
    h, w = alpha.shape
    blur_img_px = rel['blur'] * (w / float(layer['width']))
    soft = smoothstep(0.15, 0.85, box_blur(alpha, blur_img_px))
    top = np.full(h, float(rel['top']))
    ramp = rel.get('northRamp')
    if ramp:
        rows_y = layer['y'] + (np.arange(h) + 0.5) / h * layer['height']
        top = top + (ramp['top'] - rel['top']) * smoothstep(ramp['yFrom'], ramp['yTo'], rows_y)
    return rel['base'] + (top[:, None] - rel['base']) * soft


def bilinear(arr, u, v):
    """Sample a top-down 2D array at normalised u (0 left..1 right), v (0 top..1 bottom)."""
    h, w = arr.shape
    x = np.clip(np.asarray(u) * (w - 1), 0, w - 1)
    y = np.clip(np.asarray(v) * (h - 1), 0, h - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    x1 = np.minimum(x0 + 1, w - 1); y1 = np.minimum(y0 + 1, h - 1)
    fx = x - x0; fy = y - y0
    top = arr[y0, x0] * (1 - fx) + arr[y0, x1] * fx
    bot = arr[y1, x0] * (1 - fx) + arr[y1, x1] * fx
    return top * (1 - fy) + bot * fy


def layer_frame(layer, s):
    """Centre (Blender metres), size (metres) and Blender Z rotation (radians) of a map layer.
    The app rotates layers clockwise on screen about their rect centre; on a y-up ground that is a negative Z rotation."""
    cx_px = layer['x'] + layer['width'] / 2.0
    cy_px = layer['y'] + layer['height'] / 2.0
    cx, cy = world_to_bl(cx_px, cy_px, s)
    return (cx, cy), (layer['width'] * s, layer['height'] * s), -math.radians(layer.get('rotationDeg', 0.0))


def grid_mesh(layer, s, nx, ny, heights=None, z=0.0, v_range=(0.0, 1.0)):
    """Grid over a layer's rect. Returns verts (N,3), faces (list of 4-tuples), loop_uvs (4*F, 2).
    heights: optional top-down height array (metres) sampled per vertex; otherwise a flat plane at z."""
    (cx, cy), (wm, hm), rz = layer_frame(layer, s)
    us = np.linspace(0.0, 1.0, nx + 1)
    vs = np.linspace(0.0, 1.0, ny + 1)          # Blender UV v: 0 bottom .. 1 top
    U, V = np.meshgrid(us, vs)                   # rows follow v
    lx = (U - 0.5) * wm
    ly = (V - 0.5) * hm
    c, sn = math.cos(rz), math.sin(rz)
    X = cx + lx * c - ly * sn
    Y = cy + lx * sn + ly * c
    Z = bilinear(heights, U, 1.0 - V) if heights is not None else np.full_like(X, z)
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
    faces, uvs = [], []
    row = nx + 1
    for j in range(ny):
        for i in range(nx):
            a = j * row + i
            quad = (a, a + 1, a + 1 + row, a + row)
            faces.append(quad)
            uvs.extend([(us[i], vs[j]), (us[i + 1], vs[j]), (us[i + 1], vs[j + 1]), (us[i], vs[j + 1])])
    uvs = np.array(uvs)
    uvs[:, 1] = v_range[0] + uvs[:, 1] * (v_range[1] - v_range[0])
    return verts, faces, uvs


def tile_uv_scale(layer):
    """UV scale/offset so a texture tiles at its own rect inside a larger plane (used for mirrored lake bed)."""
    tx, ty, tw, th = layer['tile']['rect']
    sx = layer['width'] / tw
    sy = layer['height'] / th
    ox = (layer['x'] - tx) / tw
    oy = -((layer['y'] + layer['height']) - (ty + th)) / th    # v measured from the bottom edge
    return (sx, sy), (ox, oy)


def waterfall_bands(wf, s, heights):
    """Three textured quads for the approved short-r1 waterfall bands.

    The app draws bands top-down on the ground; here the pool lies on the water, the fall band stands
    at waterfallFallDeg, and the source band sits flat on the cliff top, shifted to meet the fall's lip.
    Returns list of dict(corners=[4 x (x,y,z)] in order BL,BR,TR,TL, v0, v1) with UV v in image space (0 bottom)."""
    sc = wf['scale']
    cw, ch = wf['canvas']
    x0 = wf['x']
    xw = cw * sc
    rows = []
    for b in wf['bands']:
        top = wf['y'] + (b['translateY'] + b['start'] * b['scaleY']) * sc
        rows.append(dict(shape=b['shape'], top=top, bottom=top + (b['end'] - b['start']) * b['scaleY'] * sc,
                         v0=1.0 - b['end'] / ch, v1=1.0 - b['start'] / ch))
    pool, fall, src = [r for r in rows if r['shape'] == 'pool'][0], [r for r in rows if r['shape'] == 'fall'][0], \
        [r for r in rows if r['shape'] == 'source_top'][0]
    ztop = heights['waterfallTop']
    run_px = ztop / math.tan(math.radians(heights['waterfallFallDeg'])) / s
    base_y = pool['top']                    # foot of the fall = top edge of the pool band
    lip_y = base_y - run_px                 # lip of the fall
    src_h = src['bottom'] - src['top']
    out = []
    z_pool = 0.02
    def quad(y_bottom, y_top, z_bottom, z_top, r):
        bl = world_to_bl(x0, y_bottom, s); br = world_to_bl(x0 + xw, y_bottom, s)
        tr = world_to_bl(x0 + xw, y_top, s); tl = world_to_bl(x0, y_top, s)
        return dict(corners=[(bl[0], bl[1], z_bottom), (br[0], br[1], z_bottom), (tr[0], tr[1], z_top), (tl[0], tl[1], z_top)],
                    v0=r['v0'], v1=r['v1'], shape=r['shape'])
    out.append(quad(pool['bottom'], pool['top'], z_pool, z_pool, pool))
    out.append(quad(base_y, lip_y, z_pool, ztop, fall))
    out.append(quad(lip_y, lip_y - src_h, ztop, ztop, src))
    # rotation about the full canvas centre, as WaterfallV2Entity / LandmarkLayer do
    ccx, ccy = world_to_bl(x0 + xw / 2.0, wf['y'] + ch * sc / 2.0, s)
    rz = -math.radians(wf['rotationDeg'])
    c, sn = math.cos(rz), math.sin(rz)
    for q in out:
        q['corners'] = [(ccx + (x - ccx) * c - (y - ccy) * sn, ccy + (x - ccx) * sn + (y - ccy) * c, z) for x, y, z in q['corners']]
    return out


def card_anchor(card, s):
    """Ground anchor (Blender metres) and size (metres) for a standing landmark card.
    The card pivots at the point where the painted object meets the ground (groundV of the image height)."""
    ax = card['x'] + card['width'] / 2.0
    ay = card['y'] + card['groundV'] * card['height']
    X, Y = world_to_bl(ax, ay, s)
    return (X, Y), (card['width'] * s, card['height'] * s)


def camera_pose(key, s):
    """Camera location and Euler XYZ rotation (radians) from a manifest key.
    A Blender camera looks down -Z; rotation X = 90 deg looks north (+Y). Heading east is clockwise seen from above."""
    X, Y = world_to_bl(key['x'], key['y'], s)
    return (X, Y, key['z']), (math.radians(90.0 + key['pitch']), 0.0, -math.radians(key['heading']))


def camera_forward(key):
    h, p = math.radians(key['heading']), math.radians(key['pitch'])
    return (math.sin(h) * math.cos(p), math.cos(h) * math.cos(p), math.sin(p))


def interp_keys(keys, f):
    """Smooth (cubic Hermite, Catmull-Rom tangents, clamped ends) interpolation of camera keys; approximates
    Blender's auto-clamped Bezier for clearance checks and previs."""
    fs = [k['f'] for k in keys]
    f = min(max(f, fs[0]), fs[-1])
    i = max(0, min(len(keys) - 2, int(np.searchsorted(fs, f, side='right')) - 1))
    k0, k1 = keys[i], keys[i + 1]
    t = (f - k0['f']) / float(k1['f'] - k0['f'])
    out = {'f': f}
    for name in ('x', 'y', 'z', 'heading', 'pitch', 'focus', 'fstop'):
        def tangent(j):
            if j == 0 or j == len(keys) - 1:
                return 0.0
            return (keys[j + 1][name] - keys[j - 1][name]) / float(keys[j + 1]['f'] - keys[j - 1]['f'])
        span = k1['f'] - k0['f']
        m0, m1 = tangent(i) * span, tangent(i + 1) * span
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t
        h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
        out[name] = h00 * k0[name] + h10 * m0 + h01 * k1[name] + h11 * m1
    return out


class HeightSampler:
    """Ground height (metres) at map points, from terrain/land relief layers. Max over layers covering the point."""

    def __init__(self, s):
        self.s = s
        self.items = []

    def add(self, layer, heights):
        self.items.append((layer, heights))

    def at(self, px, py):
        best = -1e9
        for layer, hts in self.items:
            cx = layer['x'] + layer['width'] / 2.0
            cy = layer['y'] + layer['height'] / 2.0
            r = math.radians(layer.get('rotationDeg', 0.0))
            dx, dy = px - cx, py - cy
            lx = dx * math.cos(-r) - dy * math.sin(-r)     # undo clockwise screen rotation
            ly = dx * math.sin(-r) + dy * math.cos(-r)
            u = lx / layer['width'] + 0.5
            v = ly / layer['height'] + 0.5
            if 0.0 <= u <= 1.0 and 0.0 <= v <= 1.0:
                best = max(best, float(bilinear(hts, u, v)))
        return best


def scatter_flowers(scatter, cam_key, sampler, n_sprites):
    """Deterministic foreground flower placements in a fan in front of the first camera key, on dry ground only.
    Returns list of dict(px, py, z, height_m, sprite_index, yaw_jitter)."""
    rng = np.random.default_rng(scatter['seed'])
    s = sampler.s
    out, tries = [], 0
    while len(out) < scatter['count'] and tries < scatter['count'] * 40:
        tries += 1
        d = scatter['distMin'] + (scatter['distMax'] - scatter['distMin']) * rng.random() ** 1.6   # denser near the lens
        a = math.radians(cam_key['heading'] + (rng.random() * 2 - 1) * scatter['halfAngleDeg'])
        px = cam_key['x'] + math.sin(a) * d / s
        py = cam_key['y'] - math.cos(a) * d / s
        z = sampler.at(px, py)
        if z < scatter['minGroundAboveWater']:
            continue
        out.append(dict(px=px, py=py, z=z,
                        height_m=scatter['heightMin'] + (scatter['heightMax'] - scatter['heightMin']) * rng.random(),
                        sprite_index=int(rng.integers(0, n_sprites)), yaw_jitter=float((rng.random() * 2 - 1) * 0.25)))
    return out


def auto_ground_v(alpha, coverage=0.25):
    """Fraction of image height (from the top) of the lowest row whose painted coverage exceeds `coverage`.
    Used as the pivot of matte panels so the painted base, not the empty canvas below it, meets the ground."""
    rows = np.nonzero(alpha.mean(axis=1) > coverage)[0]
    return float((rows.max() + 1) / alpha.shape[0]) if rows.size else 1.0


def matte_panel(layer, ground_v, final_key, s, z=0.0):
    """Fixed matte panel for a 3/4-painted cliff/backdrop layer.
    Returns base (pivot, metres), right and up unit vectors, width and height (metres) and the pivot fraction.
    The panel is perpendicular to the final camera's view, so the reveal frame reproduces the app painting;
    its height is scaled by sin(|final pitch|) to match the ground's foreshortening in that frame."""
    fwd = np.array(camera_forward(final_key))
    h = math.radians(final_key['heading'])
    right = np.array([math.cos(h), -math.sin(h), 0.0])
    up = np.cross(right, fwd)
    up /= np.linalg.norm(up)
    k = math.sin(abs(math.radians(final_key['pitch'])))
    X, Y = world_to_bl(layer['x'] + layer['width'] / 2.0, layer['y'] + ground_v * layer['height'], s)
    return dict(base=(X, Y, z), right=tuple(right), up=tuple(up), width=layer['width'] * s,
                height=layer['height'] * s * k, ground_v=ground_v)


def matte_ground_v(layer, alpha):
    """Pivot fraction for a matte: explicit pivotY (map px) when the app's draw order requires it, else the painted base."""
    if 'pivotY' in layer:
        return (layer['pivotY'] - layer['y']) / float(layer['height'])
    return auto_ground_v(alpha)


def final_view_basis(final_key):
    """Right and up unit vectors of a plane perpendicular to the final camera's view (used for every landmark and matte)."""
    fwd = np.array(camera_forward(final_key))
    h = math.radians(final_key['heading'])
    right = np.array([math.cos(h), -math.sin(h), 0.0])
    up = np.cross(right, fwd)
    return right, up / np.linalg.norm(up)


GROUND_SPLIT_RELIEF = dict(base=-0.4, top=1.0, blur=40)


def split_ground(layer, alpha, ground_v):
    """The part of a matte painting SOUTH of its pivot, kept flat on the ground where the app paints it.
    Returns (sub-layer dict, cropped top-down alpha, Blender UV v-range)."""
    h = alpha.shape[0]
    r0 = int(round(ground_v * h))
    sub = dict(layer)
    sub['id'] = layer['id'] + '_ground'
    sub['role'] = 'terrain'
    sub['y'] = layer['y'] + ground_v * layer['height']
    sub['height'] = layer['height'] * (1.0 - ground_v)
    sub['relief'] = GROUND_SPLIT_RELIEF
    return sub, alpha[r0:, :], (0.0, 1.0 - ground_v)


def _catmull(points, t):
    """Centripetal-free uniform Catmull-Rom through `points` (N x D) at parameter t in [0, N-1]."""
    n = len(points)
    i = int(min(max(math.floor(t), 0), n - 2))
    u = t - i
    p0 = points[max(i - 1, 0)]; p1 = points[i]; p2 = points[i + 1]; p3 = points[min(i + 2, n - 1)]
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)


def speed_profile(n, ease_in, ease_out):
    """Normalised distance s(frame) with a smooth cosine ramp-up, steady cruise and long cosine ramp-down.
    Velocity and acceleration are continuous, so the camera starts and settles without a jolt."""
    t = np.linspace(0.0, 1.0, n)
    v = np.ones(n)
    a, b = ease_in, ease_out
    v = np.where(t < a, 0.5 - 0.5 * np.cos(np.pi * t / a), v)
    v = np.where(t > 1 - b, 0.5 - 0.5 * np.cos(np.pi * (1 - t) / b), v)
    s = np.concatenate([[0.0], np.cumsum((v[1:] + v[:-1]) / 2)])
    return s / s[-1]


def _centripetal_curve(pts, samples=4000, alpha=0.5):
    """Centripetal Catmull-Rom (Barry-Goldman) through pts: no cusps or overshoot when waypoint spacing varies."""
    ext = np.vstack([2 * pts[0] - pts[1], pts, 2 * pts[-1] - pts[-2]])
    out, owner = [], []
    per = max(8, samples // (len(pts) - 1))
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0), 1e-6) ** alpha
        t2 = t1 + max(np.linalg.norm(p2 - p1), 1e-6) ** alpha
        t3 = t2 + max(np.linalg.norm(p3 - p2), 1e-6) ** alpha
        for t in np.linspace(t1, t2, per, endpoint=(i == len(ext) - 3)):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
            owner.append(i - 1 + (t - t1) / (t2 - t1))
    return np.array(out), np.array(owner)


def camera_track(path, frames, limits, key_step, s):
    """Dense camera keys from waypoints: centripetal Catmull-Rom path, timed by an acceleration-limited speed
    profile (slows through bends, starts and settles at rest) stretched to `frames`; orientation and focus are
    interpolated along the same distance. Returns keys every `key_step` frames (+ last) and the profile's natural time."""
    pts = np.array([[*world_to_bl(p['x'], p['y'], s), p['z']] for p in path])
    curve, fine = _centripetal_curve(pts)
    arc_m, vel, t_needed = limited_speed_profile(curve, limits['aLat'], limits['aLong'], limits['vMax'])
    arc = arc_m / arc_m[-1]
    wp_arc = np.interp(np.arange(len(pts)), fine, arc)              # arc fraction at each waypoint
    seg = np.diff(arc_m)
    tcum = np.concatenate([[0.0], np.cumsum(seg / np.maximum((vel[1:] + vel[:-1]) / 2, 1e-3))])
    tcum /= tcum[-1]
    prof = np.interp(np.linspace(0, 1, frames), tcum, arc)          # arc fraction per frame
    keys = []
    for fi in sorted(set(range(0, frames, key_step)) | {frames - 1}):
        a = prof[fi]
        x, y, z = (np.interp(a, arc, curve[:, c]) for c in range(3))
        k = dict(f=fi + 1, x=round(x / s + ORIGIN[0], 2), y=round(-y / s + ORIGIN[1], 2), z=round(float(z), 3))
        tw = np.interp(a, wp_arc, np.arange(len(pts)))                # waypoint-space parameter for scalars
        for name in ('heading', 'pitch', 'focus', 'fstop'):
            vals = np.array([[p[name]] for p in path], dtype=float)
            k[name] = round(float(_catmull(vals, tw)[0]), 3)
        keys.append(k)
    return keys, t_needed


def limited_speed_profile(curve, a_lat, a_long, v_max):
    """Time-optimal speed along a sampled curve under lateral (curvature) and longitudinal acceleration limits,
    starting and ending at rest. Returns (cumulative arc length per sample, speed per sample, total time s)."""
    seg = np.linalg.norm(np.diff(curve, axis=0), axis=1)
    arc = np.concatenate([[0.0], np.cumsum(seg)])
    d1 = np.gradient(curve, arc, axis=0)
    d2 = np.gradient(d1, arc, axis=0)
    kappa = np.linalg.norm(np.cross(d1, d2), axis=1) / np.maximum(np.linalg.norm(d1, axis=1) ** 3, 1e-9)
    kappa = np.convolve(kappa, np.ones(25) / 25, mode='same')          # smooth numerical noise
    v = np.minimum(v_max, np.sqrt(a_lat / np.maximum(kappa, 1e-6)))
    v[0] = v[-1] = 0.0
    for i in range(1, len(v)):                                          # forward pass: accelerate within limits
        v[i] = min(v[i], math.sqrt(v[i - 1] ** 2 + 2 * a_long * seg[i - 1]))
    for i in range(len(v) - 2, -1, -1):                                 # backward pass: brake within limits
        v[i] = min(v[i], math.sqrt(v[i + 1] ** 2 + 2 * a_long * seg[i]))
    dt = seg / np.maximum((v[1:] + v[:-1]) / 2, 1e-3)
    return arc, v, float(np.sum(dt))
