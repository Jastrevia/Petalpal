"""3D petals for V3: each petal is a textured quad in camera space with its own position, 3D rotation, lighting, depth of
field and motion blur, projected through a pinhole camera (optionally dollying forward)."""
import numpy as np, cv2
import fx
W, H = fx.W, fx.H
F = 1150.0; CX, CY = W / 2, H / 2

def petal_tex(size=96, seed=0):
    rgb, a = fx.petal_sprite(size, seed); return rgb, a

def rotm(rx, ry, rz):
    cx, sx, cy, sy, cz, sz = np.cos(rx), np.sin(rx), np.cos(ry), np.sin(ry), np.cos(rz), np.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx

class Petals3D:
    def __init__(self, n, seed=1, xr=(-1.6, 1.6), yr=(-1.0, 1.0), zr=(0.5, 5.0), vel=(0.03, 0.05, 0.0), spread=0.02,
                 size=(0.05, 0.09), dolly=0.0, focus=2.0, dof=6.0, light=(0.3, -0.6, 0.75), tint=(1.0, 0.95, 0.88), mblur=3, sway=0.02):
        r = np.random.default_rng(seed); self.r = r
        self.p = np.stack([r.uniform(*xr, n), r.uniform(*yr, n), r.uniform(*zr, n)], 1)
        self.v = np.array(vel, float)[None] + r.normal(0, spread, (n, 3))
        self.ang = r.uniform(0, 2 * np.pi, (n, 3)); self.av = r.normal(0, 1.6, (n, 3))
        self.s = r.uniform(*size, n); self.kind = r.integers(0, 4, n); self.ph = r.uniform(0, 6.28, n)
        self.tex = [petal_tex(96, k) for k in range(4)]
        self.xr, self.yr, self.zr = xr, yr, zr; self.dolly = dolly; self.focus = focus; self.dof = dof
        self.L = np.array(light, float); self.L /= np.linalg.norm(self.L); self.tint = np.array(tint, np.float32); self.mb = mblur; self.sway = sway; self.n = n

    def _respawn(self, k):
        r = self.r; self.p[k] = [r.uniform(*self.xr), r.uniform(*self.yr), self.zr[1] * r.uniform(0.85, 1.0)]

    def step(self, t, dt):
        self.p += self.v * dt * 24 / 24
        self.p[:, 0] += self.sway * np.sin(t * 1.3 + self.ph) * dt
        self.p[:, 2] -= self.dolly * dt
        self.ang += self.av * dt
        for k in range(self.n):
            x, y, z = self.p[k]
            if z < 0.25 or abs(x) > abs(self.xr[1]) * 1.8 + z * 0.9 or abs(y) > abs(self.yr[1]) * 1.8 + z * 0.6: self._respawn(k)
            elif y > self.yr[1] * 1.6 + 0.4 * z:                 # fell below view: back to the top
                self.p[k, 1] = self.yr[0] * 1.2

    def _draw(self, img, k, p, ang, alpha_scale):
        x, y, z = p
        if z < 0.2: return
        R = rotm(*ang); s = self.s[k]
        loc = np.array([[-s / 2, -s / 2, 0], [s / 2, -s / 2, 0], [s / 2, s / 2, 0], [-s / 2, s / 2, 0]])
        wc = loc @ R.T + p
        if (wc[:, 2] < 0.15).any(): return
        scr = np.stack([CX + F * wc[:, 0] / wc[:, 2], CY + F * wc[:, 1] / wc[:, 2]], 1).astype(np.float32)
        x0, y0 = np.floor(scr.min(0)).astype(int) - 8; x1, y1 = np.ceil(scr.max(0)).astype(int) + 8
        if x1 < 0 or y1 < 0 or x0 > W or y0 > H or (x1 - x0) > 1500: return
        blur = min(self.dof * abs(1 / z - 1 / self.focus) * 2.2, 22)
        pad = int(blur * 2.5) + 2; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
        X0, Y0, X1, Y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if X1 <= X0 or Y1 <= Y0: return
        rgb, a = self.tex[self.kind[k]]; S = rgb.shape[0]
        Hm = cv2.getPerspectiveTransform(np.float32([[0, 0], [S, 0], [S, S], [0, S]]), scr - np.float32([X0, Y0]))
        sr = cv2.warpPerspective(rgb, Hm, (X1 - X0, Y1 - Y0), flags=cv2.INTER_LINEAR)
        sa = cv2.warpPerspective(a, Hm, (X1 - X0, Y1 - Y0), flags=cv2.INTER_LINEAR)
        if blur > 0.6: sr = cv2.GaussianBlur(sr, (0, 0), blur); sa = cv2.GaussianBlur(sa, (0, 0), blur)
        n = R @ np.array([0, 0, 1.0]); facing = abs(n @ self.L); back = max(0.0, -(n @ np.array([0, 0, 1.0])))
        shade = 0.72 + 0.32 * facing + 0.18 * back                 # lit face + translucent glow when backlit
        far = np.clip((z - 1.0) / (self.zr[1] * 1.2), 0, 1) * 0.35  # aerial perspective: farther petals paler, softer
        col = sr * shade * self.tint
        roi = img[Y0:Y1, X0:X1]; aa = (sa * alpha_scale * (1 - 0.4 * far))[..., None]
        roi[:] = roi * (1 - aa) + (col * (1 - far) + roi * far) * aa

    def render(self, img, t, dt=1 / 24):
        order = np.argsort(-self.p[:, 2])
        for k in order:
            for j in range(self.mb):                        # motion blur: sub-frame samples along this frame's motion
                f = j / max(self.mb, 1)
                p = self.p[k] - (self.v[k] + np.array([0, 0, -self.dolly])) * dt * f
                ang = self.ang[k] - self.av[k] * dt * f
                self._draw(img, k, p, ang, 1.0 / self.mb * (1.25 if j == 0 else 0.9))
        return img
