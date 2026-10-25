"""A01 in the room (7.0 s): the ACCEPTED fairy performance (glide_v1_7s_retimed, every frame, its own timing) lifted off the
ivory paper and placed in the rainy-night room, close to the viewer. She emerges from the invitation's light at the start.
The accepted file itself is untouched; this is a derived composite."""
import sys, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v31/tools'); import roomkey as rk
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
W, H, FPS = fx.W, fx.H, fx.FPS
SRC = '/mnt/user-data/outputs/perf_test/glide_review/glide_v1_7s_retimed.mp4'
MOT = fx.Motes(90, seed=81, box=(900, 100, 1700, 950), vel=(0, -0.5), spread=0.6, size=(0.5, 1.6))
def canvas(f):
    s = max(W / f.shape[1], H / f.shape[0]); f = cv2.resize(f, (int(round(f.shape[1] * s)), int(round(f.shape[0] * s))), interpolation=cv2.INTER_CUBIC)
    x0 = (f.shape[1] - W) // 2; y0 = (f.shape[0] - H) // 2; return cv2.cvtColor(f[y0:y0 + H, x0:x0 + W], cv2.COLOR_BGR2RGB).astype(np.float32) / 255
def frame(i, f):
    t = i / FPS
    fg, a = rk.fairy_key(f)
    out = rk.composite(fg, a, rk.room(i), glow=0.22, rim=0.5)
    MOT.step(1.0); out = out + MOT.render(t, 0.45)
    emerge = 1 - fx.ease(t / 0.75)                                   # out of the invitation's light (S02 ends in this light)
    if emerge > 0:
        out = out * (1 - emerge) + fx.PAPER[None, None] * emerge
        out = fx.orb(out, 1300, 470, r=14, gain=1.2 * emerge, t=t)
    return fx.finish(fx.bloom(out, 0.88, 18, 0.18), i, vig=0.25, grn=0.010)
if __name__ == '__main__':
    c = cv2.VideoCapture(SRC); i = 0
    if len(sys.argv) > 1:
        for want in [10, 90, 167]:
            c.set(cv2.CAP_PROP_POS_FRAMES, want); ok, f = c.read(); fx.save(frame(want, canvas(f)), f'/mnt/user-data/outputs/film_v31/review/a01room_{want:03d}.jpg')
    else:
        w = fx.Writer('/mnt/user-data/outputs/film_v31/shots/A01_room.mp4')
        while True:
            ok, f = c.read()
            if not ok: break
            w.put(frame(i, canvas(f))); i += 1
        w.close()
