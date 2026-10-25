"""(1) Fairy-light orb leading through Kling 03 (sped 1.15x to ~5.25 s), ending where the fairy appears in V09a.
   (2) End title: champagne text keyed from S19title over the V19 petal plate."""
import numpy as np, cv2, os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W, H = 1920, 1080
# ---- (1) orb over Kling 03
cap = cv2.VideoCapture('/mnt/user-data/outputs/poc03/takes/2C_kling_03.mp4'); src = []
while True:
    ok, f = cap.read()
    if not ok: break
    src.append(cv2.resize(f, (W, H), interpolation=cv2.INTER_LANCZOS4))
n_src = len(src); n_out = int(round(n_src / 1.15))
ease = lambda u: u*u*(3-2*u)
p0 = np.array([0.555*W, 0.43*H]); p1 = np.array([0.594*W, 0.535*H])   # far ahead in the passage -> fairy's position in V09a frame 0
rng = np.random.default_rng(3); trail = []
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
os.makedirs('vfx/K03orb', exist_ok=True)
for i in range(n_out):
    f = src[min(n_src-1, int(round(i*1.15)))].astype(np.float32)
    t = i / (n_out-1)
    vis = ease(np.clip((t-0.06)/0.12, 0, 1))
    u = ease(np.clip((t-0.05)/0.95, 0, 1))
    p = p0 + (p1-p0)*u + np.array([np.sin(t*9)*10, np.sin(t*13)*6])*(1-u)
    core = 3.0 + 4.0*u + 10*ease(np.clip((t-0.88)/0.12, 0, 1))
    if rng.random() < 0.9 and vis > 0:
        for _ in range(3): trail.append([p[0]+rng.normal(0,4), p[1]+rng.normal(0,4), 1.0, rng.normal(0,1.2), rng.normal(0.6,0.5)])
    glow = np.zeros((H, W), np.float32)
    r2 = (xx-p[0])**2 + (yy-p[1])**2
    glow += vis*(np.exp(-r2/(2*core**2))*1.6 + np.exp(-r2/(2*(core*5)**2))*0.35 + np.exp(-r2/(2*(core*16)**2))*0.08)
    nt = []
    for s in trail:
        s[0] += s[3] + (s[0]-W/2)*0.004; s[1] += s[4] + (s[1]-H/2)*0.004; s[2] *= 0.93   # drift outward with the camera's forward motion
        if s[2] > 0.05 and 0 <= s[0] < W and 0 <= s[1] < H:
            glow[int(s[1]), int(s[0])] += s[2]*1.4; nt.append(s)
    trail = nt
    g = cv2.GaussianBlur(glow, (0,0), 1.2) + cv2.GaussianBlur(glow, (0,0), 4)*0.6
    out = f + g[..., None]*np.array([150, 215, 255], np.float32)
    cv2.imwrite(f'vfx/K03orb/{i:03d}.png', np.clip(out, 0, 255).astype(np.uint8))
print('K03 orb frames', n_out)
# ---- (2) title keyed onto the petal plate
T = cv2.resize(cv2.imread('keyframes/S19title.png'), (W, H), interpolation=cv2.INTER_AREA).astype(np.float32)
bg = np.median(T.reshape(-1, 3), axis=0)
d = np.clip((np.abs(T - bg).max(axis=2) - 10) / 60, 0, 1)[..., None]
cap = cv2.VideoCapture('shots/V19.mp4'); k = 0; os.makedirs('vfx/S19', exist_ok=True)
while True:
    ok, f = cap.read()
    if not ok: break
    f = cv2.resize(f, (W, H), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
    t = k / 24.0
    a = ease(np.clip((t-0.5)/1.2, 0, 1))
    # darken the plate slightly behind the title for legibility
    vign = 1 - 0.35*a*np.exp(-(((xx-W/2)/(W*0.32))**2 + ((yy-H/2)/(H*0.3))**2))[..., None]
    out = f*vign*(1-d*a) + T*(d*a)
    cv2.imwrite(f'vfx/S19/{k:03d}.png', np.clip(out, 0, 255).astype(np.uint8)); k += 1
print('title frames', k)
