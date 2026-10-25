"""S07 (2.6 s): from the white-gold light of the touch, petals and light swirl around the viewer and the room is gone; the light
clears onto the wisteria passage (approved K1), landing exactly on the first frame of K03orb (approved Kling 03 with the
fairy's light)."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 2.6; N = int(round(DUR * FPS))
c = cv2.VideoCapture(fx.V1 + 'vfx/K03orb.mp4'); ok, f0 = c.read()
K1F = cv2.cvtColor(f0, cv2.COLOR_BGR2RGB).astype(np.float32) / 255           # K03orb frame 0 (1920x1080)
rng = np.random.default_rng(21); NP = 70
ang0 = rng.uniform(0, 2 * np.pi, NP); rad0 = rng.uniform(20, 260, NP); spd = rng.uniform(1.6, 3.2, NP); out = rng.uniform(260, 900, NP)
sz = rng.uniform(26, 70, NP); kind = rng.integers(0, 4, NP); spin = rng.normal(0, 4, NP); ph = rng.uniform(0, 6.28, NP)
SPR = [fx.petal_sprite(64, k) for k in range(4)]
CX, CY = W * 0.5, H * 0.47

def frame(i):
    t = i / FPS; u = t / DUR
    clear = fx.ease((t - 0.5) / 1.7)                   # light clears onto K1
    zoom = 1.12 - 0.12 * fx.ease(t / DUR)             # settle exactly on the K03orb framing
    plate = fx.cam(K1F, 0.5, 0.5, zoom, rot=-2.0 * (1 - fx.ease(t / DUR)), border=cv2.BORDER_REPLICATE)
    light = np.array([1.0, 0.95, 0.85], np.float32)
    img = plate * clear + light * (1 - clear) * 0.95 + plate * (1 - clear) * 0.05
    # petal vortex: spiral outward past the camera
    for k in range(NP):
        r = rad0[k] + out[k] * fx.ease_in(u * 1.1) + 60 * u
        a = ang0[k] + spd[k] * t * (1.2 - 0.5 * u)
        x, y = CX + r * np.cos(a) * 1.25, CY + r * np.sin(a) * 0.8
        s = (sz[k] / 64) * (0.7 + 1.6 * u)
        fl = abs(np.cos(t * 3 + ph[k])) * 0.7 + 0.3
        op = fx.win(t, 0.0, 0.25, 1.8, 2.5)
        rgb, al = SPR[kind[k]]
        fx.place(img, rgb * (0.62 + 0.38 * clear), al * op, fx.affine(s * fl, s, np.degrees(a) + spin[k] * t * 20, x, y, 32, 32))
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    swirl_glow = np.exp(-(((xx - CX) / 700) ** 2 + ((yy - CY) / 450) ** 2)) * 0.35 * fx.win(t, 0, 0.2, 1.2, 2.2)
    img = img + swirl_glow[..., None] * np.array([1.0, 0.86, 0.62])
    if i >= N - 3:                                     # last frames: exactly the K03orb first frame (clean cut)
        w8 = (i - (N - 3) + 1) / 3; img = img * (1 - w8) + K1F * w8
    return fx.finish(fx.bloom(img, 0.85, 20, 0.3 * (1 - clear)), i, vig=0.18 * clear, grn=0.0 if i >= N - 1 else 0.01)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'stills':
        for t in [0.1, 0.7, 1.3, 1.9, 2.55]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/s07_{t:.2f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/S07_swirl.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
