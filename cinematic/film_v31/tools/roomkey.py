"""Put fairy footage that was rendered on warm-ivory paper (A01, the Reach plate) into the rainy-night room.
fairy_key(): paper-difference matte with colour un-mixing (the paper is near-uniform), interior filled so skin and dress are
solid; wings keep a little translucency. room(): the existing rainy-window plates (V01 footage for living rain, S01 for
the warm interior), defocused because she is close to the viewer."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
W, H = fx.W, fx.H

def fairy_key(img, paper=None):
    """img: float RGB 0..1 on ivory paper -> (fg RGB, alpha). Paper = per-frame border median (the paper is uniform)."""
    h, w = img.shape[:2]
    if paper is None:
        border = np.concatenate([img[:20].reshape(-1, 3), img[-20:].reshape(-1, 3), img[:, :20].reshape(-1, 3), img[:, -20:].reshape(-1, 3)])
        paper = np.median(border, 0)
    bg = np.broadcast_to(paper, img.shape).astype(np.float32)
    d = np.clip((paper - img) / paper, 0, 1).max(2)                              # darker than paper in any channel
    sat = (img.max(2) - img.min(2)) - (paper.max() - paper.min())
    d = np.maximum(d, np.clip(sat * 1.6, 0, 1))                                  # pale but coloured (lavender wings, skin)
    a = np.clip((d - 0.045) * 7.0, 0, 1)
    sil = cv2.morphologyEx((a > 0.5).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    ff = sil.copy(); m = np.zeros((h + 2, w + 2), np.uint8); cv2.floodFill(ff, m, (0, 0), 1)
    holes = (1 - ff).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(holes)
    for k in range(1, n):
        if st[k, cv2.CC_STAT_AREA] < 60000: sil[lab == k] = 1                       # face, arms, legs, dress interiors
    sil = cv2.erode(sil, np.ones((3, 3), np.uint8))
    inside = cv2.GaussianBlur(sil.astype(np.float32), (0, 0), 1.0)
    a_in = np.clip((d - 0.006) * 30.0, 0, 1)                                      # inside her silhouette almost anything is her
    wingish = np.clip((sat - 0.0) * 6, 0, 1) * (img.mean(2) > 0.78)                # translucent pale-lavender wing membrane
    a = np.maximum(a, inside * np.maximum(a_in, 0.97 - 0.12 * wingish))
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0.3).astype(np.uint8))
    keep = np.isin(lab, 1 + np.nonzero(st[1:, cv2.CC_STAT_AREA] > 1500)[0])
    a = a * cv2.GaussianBlur(cv2.dilate(keep.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 1.5)
    a = cv2.GaussianBlur(a, (0, 0), 0.6)
    fg = np.clip((img - bg * (1 - a[..., None])) / np.maximum(a[..., None], 0.08), 0, 1)
    return fg.astype(np.float32), a.astype(np.float32)

_V01 = None; _S01 = None
def room(i, defocus=10.0, warm=0.6):
    """rainy-night room behind the fairy at frame i (living rain from V01, ping-pong)."""
    global _V01, _S01
    if _V01 is None:
        c = cv2.VideoCapture(fx.V1 + 'shots/V01.mp4'); _V01 = []
        while True:
            ok, f = c.read()
            if not ok: break
            _V01.append(cv2.resize(f, (W // 2, H // 2), interpolation=cv2.INTER_AREA))          # uint8, half-res (it is defocused)
        _S01 = cv2.resize(fx.cam(fx.load(fx.V1 + 'keyframes/S01.png'), 0.5, 0.5, 1.0), (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    n = len(_V01); k = i % (2 * n - 2); k = k if k < n else 2 * n - 2 - k
    f = cv2.cvtColor(_V01[k], cv2.COLOR_BGR2RGB).astype(np.float32) / 255 * 0.6 + _S01 * 0.4
    f = cv2.resize(cv2.GaussianBlur(f, (0, 0), defocus / 2), (W, H), interpolation=cv2.INTER_LINEAR)
    f = fx.grade(f, gain=0.9, gamma=1.05, sat=1.0, warm=warm)
    return f

def composite(fg, a, bg, glow=0.35, rim=0.6):
    """fairy over the room with soft light wrap and a warm magical rim so she sits in the light of the scene."""
    out = bg * (1 - a[..., None]) + fg * a[..., None]
    halo = fx.blur(a, 18)
    out = out + (halo * (1 - a))[..., None] * np.array([1.0, 0.86, 0.62]) * glow
    edge = np.clip(a - cv2.erode(a, np.ones((5, 5), np.uint8)), 0, 1)
    out = out + fx.blur(edge, 1.5)[..., None] * np.array([1.0, 0.9, 0.72]) * rim * 0.25
    wrap = fx.blur(bg, 14) * (fx.blur(a, 6) * (1 - fx.blur(a, 2)))[..., None]
    return out + wrap * 0.25
