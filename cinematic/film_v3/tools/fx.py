"""PetalPal film v2: shared compositing helpers (free, local). Float RGB images in 0..1, canvas 1920x1080 @ 24 fps."""
import os, subprocess, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
W, H, FPS = 1920, 1080, 24
ROOT = '/mnt/user-data/outputs/film_v3'
V2 = '/mnt/user-data/outputs/film_v2'
U = '/mnt/user-data/uploads/Petalpal/'
V1 = '/mnt/user-data/outputs/film_v1/'
FONTS = V2 + '/fonts/'
PAPER = np.array([253, 246, 238], np.float32) / 255      # A01 paper colour (RGB)

# ---------------------------------------------------------------- io
def load(path, alpha=False):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im.ndim == 2: im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGR)
    if im.shape[2] == 4:
        rgb = cv2.cvtColor(im[..., :3], cv2.COLOR_BGR2RGB).astype(np.float32) / 255; a = im[..., 3].astype(np.float32) / 255
        return (rgb, a) if alpha else rgb
    rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    return (rgb, np.ones(rgb.shape[:2], np.float32)) if alpha else rgb

def frames(path, size=(W, H)):
    c = cv2.VideoCapture(path); out = []
    while True:
        ok, f = c.read()
        if not ok: break
        if size and (f.shape[1], f.shape[0]) != size: f = cv2.resize(f, size, interpolation=cv2.INTER_AREA)
        out.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32) / 255)
    return out

class Writer:
    def __init__(self, path, crf=14):
        os.makedirs(os.path.dirname(path), exist_ok=True); self.path = path; self.n = 0
        self.p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                                   '-c:v', 'libx264', '-preset', 'medium', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path], stdin=subprocess.PIPE)
    def put(self, img):
        self.p.stdin.write((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()); self.n += 1
    def close(self):
        self.p.stdin.close(); self.p.wait(); print('wrote', self.path, self.n, 'frames', '%.2fs' % (self.n / FPS))

def save(img, path): Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, quality=92)

# ---------------------------------------------------------------- timing
def clamp01(x): return np.clip(x, 0, 1)
def ease(x): x = clamp01(x); return x * x * (3 - 2 * x)
def ease_out(x): x = clamp01(x); return 1 - (1 - x) ** 3
def ease_in(x): x = clamp01(x); return x ** 3
def win(t, a, b, c, d): return ease((t - a) / max(b - a, 1e-6)) * (1 - ease((t - c) / max(d - c, 1e-6)))
def lerp(a, b, t): return a + (b - a) * t

# ---------------------------------------------------------------- camera
def cam(img, cx=0.5, cy=0.5, zoom=1.0, rot=0.0, out=(W, H), border=cv2.BORDER_REFLECT):
    """View of img: centre (cx,cy) in normalised image coords, zoom 1 = cover the frame."""
    img = np.ascontiguousarray(img, dtype=np.float32); ih, iw = img.shape[:2]; ow, oh = out
    s = zoom * max(ow / iw, oh / ih)
    if rot == 0:                                   # keep the view inside the image (no border smear)
        hx, hy = ow / (2 * s * iw), oh / (2 * s * ih)
        cx = float(np.clip(cx, min(hx, 0.5), max(1 - hx, 0.5))); cy = float(np.clip(cy, min(hy, 0.5), max(1 - hy, 0.5)))
    M = cv2.getRotationMatrix2D((cx * iw, cy * ih), rot, s); M[:, 2] += [ow / 2 - cx * iw, oh / 2 - cy * ih]
    interp = cv2.INTER_AREA if s < 0.7 else cv2.INTER_CUBIC
    return cv2.warpAffine(img, M, (ow, oh), flags=interp, borderMode=border)

def place(dst, src, alpha, M, mode='over'):
    """Warp src (+alpha) with 2x3 affine M (or 3x3 homography) into dst (in place) and return the warped alpha.
    Small sprites are warped only into their bounding box (fast path)."""
    h, w = dst.shape[:2]; src = np.ascontiguousarray(src, dtype=np.float32); alpha = np.ascontiguousarray(alpha, dtype=np.float32)
    sh, sw = alpha.shape[:2]
    if M.shape == (2, 3) and sh * sw < 0.25 * h * w:
        c = np.float32([[0, 0], [sw, 0], [sw, sh], [0, sh]]) @ M[:, :2].T + M[:, 2]
        x0, y0 = np.floor(c.min(0)).astype(int) - 2; x1, y1 = np.ceil(c.max(0)).astype(int) + 2
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, w), min(y1, h)
        full = np.zeros((h, w), np.float32)
        if x1 <= x0 or y1 <= y0: return full
        M2 = M.copy(); M2[:, 2] -= [x0, y0]; rw, rh = x1 - x0, y1 - y0
        s_ = cv2.warpAffine(src, M2, (rw, rh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        a_ = cv2.warpAffine(alpha, M2, (rw, rh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        roi = dst[y0:y1, x0:x1]
        if mode == 'over': roi[:] = s_ * a_[..., None] + roi * (1 - a_[..., None])
        elif mode == 'add': roi[:] = roi + s_ * a_[..., None]
        full[y0:y1, x0:x1] = a_; return full
    if M.shape == (3, 3):
        s = cv2.warpPerspective(src, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        a = cv2.warpPerspective(alpha, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    else:
        s = cv2.warpAffine(src, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        a = cv2.warpAffine(alpha, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    if mode == 'over': dst[:] = s * a[..., None] + dst * (1 - a[..., None])
    elif mode == 'add': dst[:] = dst + s * a[..., None]
    return a

def affine(sx, sy, angle_deg, tx, ty, ox=0, oy=0):
    """scale about (ox,oy) in source px, rotate, then translate so (ox,oy) lands at (tx,ty)."""
    c, s = np.cos(np.radians(angle_deg)), np.sin(np.radians(angle_deg))
    A = np.array([[c * sx, -s * sy], [s * sx, c * sy]], np.float32)
    t = np.array([tx, ty], np.float32) - A @ np.array([ox, oy], np.float32)
    return np.hstack([A, t[:, None]]).astype(np.float32)

# ---------------------------------------------------------------- looks
def grade(img, lift=0.0, gamma=1.0, gain=1.0, sat=1.0, warm=0.0, tint=None):
    x = img * gain + lift * (1 - img)
    x = np.clip(x, 0, 1) ** (1 / gamma)
    if warm: x = x * np.array([1 + 0.06 * warm, 1 + 0.01 * warm, 1 - 0.07 * warm], np.float32)
    if tint is not None: x = x * np.array(tint, np.float32)
    if sat != 1:
        g = x @ np.array([0.299, 0.587, 0.114], np.float32); x = g[..., None] + (x - g[..., None]) * sat
    return np.clip(x, 0, 1)

def bloom(img, thresh=0.75, sigma=18, amount=0.5, tint=(1.0, 0.92, 0.8)):
    br = np.clip(img - thresh, 0, 1)
    small = cv2.resize(br, (img.shape[1] // 4, img.shape[0] // 4), interpolation=cv2.INTER_AREA)
    b = cv2.resize(cv2.GaussianBlur(small, (0, 0), sigma / 4), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
    return img + b * amount * np.array(tint, np.float32)

def blur(img, sigma):
    if sigma <= 0.3: return img
    if sigma > 6:
        k = 4; small = cv2.resize(img, (img.shape[1] // k, img.shape[0] // k), interpolation=cv2.INTER_AREA)
        return cv2.resize(cv2.GaussianBlur(small, (0, 0), sigma / k), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(img, (0, 0), sigma)

_vig = {}
def vignette(img, strength=0.35, power=2.2):
    k = (img.shape[1], img.shape[0], strength, power)
    if k not in _vig:
        yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]].astype(np.float32)
        r = np.hypot((xx / img.shape[1] - 0.5) * 1.0, (yy / img.shape[0] - 0.5) * 0.9) / 0.62
        _vig[k] = (1 - strength * np.clip(r, 0, 1.4) ** power)[..., None].astype(np.float32)
    return img * _vig[k]

_grain = None
def grain(img, i, amount=0.018):
    global _grain
    if _grain is None:
        rng = np.random.default_rng(7); _grain = [cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 0.7) for _ in range(8)]
    g = _grain[i % 8][:img.shape[0], :img.shape[1]]
    return img + g[..., None] * amount

def finish(img, i, vig=0.3, grn=0.016, blm=None):
    img = img.astype(np.float32, copy=False)
    if blm: img = bloom(img, *blm)
    return np.clip(grain(vignette(img, vig), i, grn), 0, 1)

# ---------------------------------------------------------------- noise
def value_noise(shape, scale, seed=0, octaves=3):
    rng = np.random.default_rng(seed); out = np.zeros(shape, np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        s = max(2, int(max(shape) / (scale / 2 ** o)))
        g = rng.random((s, s)).astype(np.float32)
        out += amp * cv2.resize(g, (shape[1], shape[0]), interpolation=cv2.INTER_CUBIC); tot += amp; amp *= 0.5
    out /= tot; return (out - out.min()) / (out.max() - out.min() + 1e-6)

# ---------------------------------------------------------------- particles
class Motes:
    """Warm floating light motes (additive)."""
    def __init__(self, n, seed=1, box=(0, 0, W, H), vel=(0.0, -0.25), spread=0.35, size=(0.6, 1.8), color=(1.0, 0.86, 0.55)):
        r = np.random.default_rng(seed); x0, y0, x1, y1 = box
        self.p = r.uniform([x0, y0], [x1, y1], (n, 2)).astype(np.float32); self.v = (r.normal(0, spread, (n, 2)) + vel).astype(np.float32)
        self.s = r.uniform(*size, n).astype(np.float32); self.ph = r.uniform(0, 6.28, n); self.box = box; self.col = np.array(color, np.float32)
    def step(self, dt=1.0): self.p += self.v * dt
    def render(self, t, gain=1.0, out=None):
        layer = np.zeros((H, W), np.float32)
        for (x, y), s, ph in zip(self.p, self.s, self.ph):
            xi, yi = int(x), int(y)
            if 0 <= xi < W and 0 <= yi < H: layer[yi, xi] += s * (0.55 + 0.45 * np.sin(t * 2.7 + ph))
        layer = cv2.GaussianBlur(layer, (0, 0), 1.4) * 4 + blur(layer, 7) * 9
        return layer[..., None] * self.col * gain

def burst(n, seed, origin, speed=(2, 9), life=40):
    r = np.random.default_rng(seed); ang = r.uniform(0, 2 * np.pi, n); sp = r.uniform(*speed, n)
    return dict(p=np.tile(np.array(origin, np.float32), (n, 1)), v=np.stack([np.cos(ang) * sp, np.sin(ang) * sp], 1).astype(np.float32), s=r.uniform(0.6, 2.0, n), age=0, life=life)

def render_burst(b, col=(1.0, 0.85, 0.55)):
    layer = np.zeros((H, W), np.float32); f = max(0, 1 - b['age'] / b['life'])
    for (x, y), s in zip(b['p'], b['s']):
        xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H: layer[yi, xi] += s * f
    b['p'] += b['v']; b['v'] *= 0.94; b['v'][:, 1] -= 0.04; b['age'] += 1
    return (cv2.GaussianBlur(layer, (0, 0), 1.5) * 5 + blur(layer, 8) * 10)[..., None] * np.array(col, np.float32)

def petal_sprite(size=48, seed=0, col=None):
    """wisteria/crocus-like petal: rounded teardrop with a soft notch, lavender gradient and a faint central vein."""
    S = size * 4; yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S
    v = yy; u = (xx - 0.5)
    halfw = 0.40 * np.clip(np.sin(np.pi * np.clip(v, 0, 1)), 0, 1) ** 0.55 * (1 - 0.35 * v)
    notch = 0.05 * np.exp(-((u) / 0.05) ** 2) * (v < 0.12)
    inside = (np.abs(u) < halfw) & (v > 0.02 + notch * 2) & (v < 0.98)
    a = cv2.GaussianBlur(inside.astype(np.float32), (0, 0), S * 0.012)
    base = np.array(col or [(0.80, 0.70, 0.93), (0.86, 0.76, 0.95), (0.90, 0.84, 0.97), (0.74, 0.62, 0.89)][seed % 4], np.float32)
    edge = np.clip(np.abs(u) / np.maximum(halfw, 1e-3), 0, 1)
    rgb = base[None, None] * (0.86 + 0.22 * edge[..., None]) * (0.92 + 0.12 * v[..., None])
    vein = np.exp(-(u / 0.012) ** 2) * (v > 0.15) * (v < 0.8) * 0.10
    rgb = rgb - vein[..., None] * np.array([0.1, 0.12, 0.05])
    rgb = cv2.resize(np.clip(rgb, 0, 1), (size, size), interpolation=cv2.INTER_AREA)
    a = cv2.resize(a, (size, size), interpolation=cv2.INTER_AREA) * 0.94
    return rgb.astype(np.float32), a.astype(np.float32)

class Petals:
    def __init__(self, n, seed=3, box=(0, -200, W, H), vel=(0.6, 1.6), size=(22, 46), sway=1.4, depth_blur=True):
        r = np.random.default_rng(seed); x0, y0, x1, y1 = box
        self.p = r.uniform([x0, y0], [x1, y1], (n, 2)).astype(np.float32)
        self.v = np.stack([r.normal(vel[0], 0.4, n), r.normal(vel[1], 0.4, n)], 1).astype(np.float32)
        self.sz = r.uniform(*size, n); self.ang = r.uniform(0, 360, n); self.spin = r.normal(0, 2.0, n); self.ph = r.uniform(0, 6.28, n)
        self.flip = r.uniform(0.5, 2.0, n); self.sway = sway
        self.spr = [petal_sprite(64, k) for k in range(4)]; self.kind = r.integers(0, 4, n); self.n = n; self.box = box
    def step(self, t):
        self.p[:, 0] += self.v[:, 0] + self.sway * np.sin(t * 1.3 + self.ph); self.p[:, 1] += self.v[:, 1]; self.ang += self.spin
        wrap = self.p[:, 1] > H + 60; self.p[wrap, 1] = -60; self.p[self.p[:, 0] > W + 60, 0] = -60; self.p[self.p[:, 0] < -60, 0] = W + 60
    def render(self, dst, t, opacity=1.0, vortex=None):
        for k in range(self.n):
            rgb, al = self.spr[self.kind[k]]; s = self.sz[k] / 64; fx = abs(np.cos(t * self.flip[k] + self.ph[k])) * 0.75 + 0.25
            x, y = self.p[k]
            M = affine(s * fx, s, self.ang[k], x, y, 32, 32)
            x0, y0 = int(x - 50), int(y - 50)
            if x0 < -60 or y0 < -60 or x0 > W or y0 > H: continue
            place(dst, rgb, al * opacity * 0.92, M)

def orb(dst, x, y, r=10, gain=1.0, col=(1.0, 0.9, 0.7), t=0.0):
    """The fairy's light: bright core, halo and soft cross glint (additive)."""
    x0, y0 = int(max(0, x - r * 14)), int(max(0, y - r * 14)); x1, y1 = int(min(W, x + r * 14)), int(min(H, y + r * 14))
    if x1 <= x0 or y1 <= y0: return dst
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32); d2 = (xx - x) ** 2 + (yy - y) ** 2
    flick = 1 + 0.08 * np.sin(t * 9.0) + 0.05 * np.sin(t * 23.0)
    g = (np.exp(-d2 / (2 * (r * 0.5) ** 2)) * 1.6 + np.exp(-d2 / (2 * (r * 1.8) ** 2)) * 0.55 + np.exp(-d2 / (2 * (r * 6) ** 2)) * 0.22) * gain * flick
    sx = np.exp(-((yy - y) ** 2) / (2 * (r * 0.12) ** 2)) * np.exp(-np.abs(xx - x) / (r * 3.2)); sy = np.exp(-((xx - x) ** 2) / (2 * (r * 0.12) ** 2)) * np.exp(-np.abs(yy - y) / (r * 3.2))
    g = g + (sx + sy) * 0.5 * gain
    dst[y0:y1, x0:x1] += g[..., None] * np.array(col, np.float32)
    return dst

# ---------------------------------------------------------------- text
def font(name, size):
    return ImageFont.truetype(FONTS + name if os.path.exists(FONTS + name) else name, size)

def text_layer(lines, fnt, size, color=(60, 40, 50), spacing=1.25, w=None, h=None, align='center', variation=None):
    """Render text lines to (rgb, alpha) float arrays; returns arrays sized to content."""
    f = font(fnt, size)
    if variation:
        try: f.set_variation_by_axes(variation)
        except Exception: pass
    asc, desc = f.getmetrics(); lh = int((asc + desc) * spacing)
    widths = [f.getbbox(l)[2] for l in lines]; tw = w or max(widths) + 40; th = h or lh * len(lines) + 40
    im = Image.new('L', (tw, th), 0); d = ImageDraw.Draw(im)
    for k, l in enumerate(lines):
        x = (tw - widths[k]) // 2 if align == 'center' else 20
        d.text((x, 20 + k * lh), l, font=f, fill=255)
    a = np.asarray(im).astype(np.float32) / 255
    rgb = np.ones(a.shape + (3,), np.float32) * np.array(color, np.float32) / 255
    return rgb, a

def decontam(rgb, a, grow=3.0, choke=0.12):
    """Remove dark/grey fringes on cut-out art: edge colours are re-filled from the solid interior; alpha choked slightly."""
    core = (a > 0.97).astype(np.float32)
    num = cv2.GaussianBlur(rgb * core[..., None], (0, 0), grow); den = cv2.GaussianBlur(core, (0, 0), grow)[..., None]
    fill = num / np.maximum(den, 1e-4)
    edge = (a < 0.97) & (den[..., 0] > 0.02)
    out = rgb.copy(); out[edge] = fill[edge]
    return out, np.clip((a - choke) / (1 - choke), 0, 1)

def hand_alpha(rgb, a0, k=1.0):
    """Solid hand matte from PetalPal's palm art: drops the dark halo band and the golden aura (returned separately)."""
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    solid = ((a0 > 0.9) & (lum > 0.42)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid)
    big = np.isin(lab, 1 + np.nonzero(st[1:, cv2.CC_STAT_AREA] > 5000 * k * k)[0]).astype(np.uint8)
    big = cv2.morphologyEx(big, cv2.MORPH_CLOSE, np.ones((int(5 * k) | 1, int(5 * k) | 1), np.uint8))
    big = cv2.erode(big, np.ones((max(3, int(3 * k)) | 1,) * 2, np.uint8))
    a = cv2.GaussianBlur(big.astype(np.float32), (0, 0), 1.0 * k)
    aura = np.clip(a0 - a, 0, 1) * (lum > 0.5)
    fixed, _ = decontam(rgb, (a > 0.97).astype(np.float32), grow=4 * k, choke=0)
    return fixed, a, aura.astype(np.float32)
