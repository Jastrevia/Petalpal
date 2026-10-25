"""S12 (5.0 s): reuse V13 (the seed glowing in the moss blooms into a crocus in gentle rain), softened toward the film's painted
look; the fairy's light drifts in and hovers quietly beside the flower."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
W, H, FPS = fx.W, fx.H, fx.FPS
F = fx.frames(fx.V1 + 'shots/V13.mp4')[:120]
mot = fx.Motes(40, seed=13, box=(1150, 250, 1550, 600), vel=(0, -0.4), spread=0.5, size=(0.5, 1.4))
def frame(i):
    t = i / FPS; f = F[i]
    e = cv2.edgePreservingFilter((f * 255).astype(np.uint8), flags=1, sigma_s=40, sigma_r=0.3).astype(np.float32) / 255
    img = f * 0.35 + e * 0.65
    img = fx.grade(img, lift=0.02, gamma=1.03, sat=0.96, warm=0.35)
    on = fx.ease((t - 2.4) / 1.2)
    if on > 0:
        p = np.array([1700 - 360 * fx.ease_out((t - 2.4) / 2.0), 230 + 150 * fx.ease_out((t - 2.4) / 2.0) + 12 * np.sin(t * 2.4)])
        img = fx.orb(img, p[0], p[1], r=8, gain=1.1 * on, t=t)
        mot.step(1.0); img = img + mot.render(t, 0.6 * on)
        # her warm light touching the petals
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        img = img + (np.exp(-(((xx - p[0]) / 420) ** 2 + ((yy - p[1]) / 380) ** 2)) * 0.07 * on)[..., None] * np.array([1.0, 0.85, 0.6])
    return fx.finish(fx.bloom(img, 0.8, 20, 0.3), i, vig=0.3, grn=0.012)
if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.2, 2.5, 4.2]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/s12_{t:.1f}.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/S12_crocus.mp4')
        for i in range(len(F)): w.put(frame(i))
        w.close()
