"""V3 passage entry (3.0 s), reference R4: after the touch the light clears onto the wisteria passage and the camera moves
forward toward the garden. The viewer's hand stays with the camera (its own layer) while the passage moves past with
depth-dependent parallax; 3D petals rush past with depth of field and motion blur. Ends in the arch's light."""
import sys, os, numpy as np, cv2
sys.path.insert(0, '/mnt/user-data/outputs/film_v3/tools'); import fx, fx3, plates
W, H, FPS = fx.W, fx.H, fx.FPS
DUR = 3.0; N = int(DUR * FPS)
P = plates.load('R4_passage'); k = plates.to_canvas_scale(P); ph_, pw_ = P.shape[:2]
P = cv2.resize(P, (int(1920 * 1.25), int(1080 * 1.25)), interpolation=cv2.INTER_AREA); k = P.shape[1] / 1672; ph_, pw_ = P.shape[:2]
yy, xx = np.mgrid[0:ph_, 0:pw_].astype(np.float32)
u8 = (P * 255).astype(np.uint8); hsv = cv2.cvtColor(u8, cv2.COLOR_RGB2HSV).astype(np.float32); h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
HAND_POLY = np.float32([[0, 600], [150, 640], [245, 690], [300, 640], [380, 560], [440, 470], [500, 440], [560, 450], [600, 470], [640, 520],
                        [700, 560], [745, 640], [770, 760], [720, 815], [600, 845], [500, 880], [470, 941], [0, 941]]) * k
hm = np.zeros((ph_, pw_), np.uint8); cv2.fillPoly(hm, [np.int32(HAND_POLY)], 1)
HM = cv2.GaussianBlur(hm.astype(np.float32), (0, 0), 8 * k)
BGP = cv2.inpaint(cv2.resize(u8, (pw_ // 4, ph_ // 4)), (cv2.resize(HM, (pw_ // 4, ph_ // 4)) > 0.2).astype(np.uint8), 10, cv2.INPAINT_TELEA)
BGP = cv2.GaussianBlur(cv2.resize(BGP, (pw_, ph_), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255, (0, 0), 14 * k)
PLATE_BG = P * (1 - HM[..., None]) + BGP * HM[..., None]           # passage without the hand (revealed behind it as it moves)
VP = np.array([1235.0, 470.0]) * k                                  # vanishing point: the bright arch / pavilion
r = np.hypot(xx - VP[0], yy - VP[1]); RMAX = r.max()
PET = fx3.Petals3D(60, seed=51, xr=(-1.6, 1.6), yr=(-1.0, 1.0), zr=(0.35, 5.5), vel=(0.0, 0.015, 0.0), spread=0.03, size=(0.05, 0.10),
                   dolly=1.7, focus=2.4, dof=7, mblur=4)
for _ in range(30): PET.step(0, 1 / FPS)
MOT = fx.Motes(150, seed=52, box=(0, 0, W, H), vel=(0, -0.3), spread=0.8, size=(0.5, 1.8))
vpx, vpy = (VP[0] - (pw_ - W) / 2) , (VP[1] - (ph_ - H) / 2)

def frame(i):
    t = i / FPS; u = t / DUR
    # dolly: each pixel's apparent depth grows toward the frame edges (near) -> stronger outward motion there
    travel = 0.42 * fx.ease_in(u) * 0.6 + 0.42 * u * 0.4
    sc = 1 + travel * (0.35 + 1.15 * (r / RMAX) ** 1.3)
    mx = (VP[0] + (xx - VP[0]) / sc).astype(np.float32); my = (VP[1] + (yy - VP[1]) / sc).astype(np.float32)
    bg = cv2.remap(PLATE_BG, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    # the hand moves with the camera: slight forward reach and drift outward-left as the passage opens
    reach = fx.ease(u)
    Mh = np.float32([[1 + 0.04 * reach, 0, -60 * k * reach], [0, 1 + 0.04 * reach, 30 * k * reach + 4 * k * np.sin(t * 2.4)]])
    hand = cv2.warpAffine(P, Mh, (pw_, ph_), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE); ha = cv2.warpAffine(HM, Mh, (pw_, ph_))
    lightfade = 1 - 0.85 * fx.ease((t - 2.2) / 0.7)
    img = bg * (1 - ha[..., None] * lightfade) + hand * (ha * lightfade)[..., None]
    out = img[(ph_ - H) // 2:(ph_ - H) // 2 + H, (pw_ - W) // 2:(pw_ - W) // 2 + W].copy()
    # magic travelling from the contact point: starts as the light from the touch, spreads into the space
    clear = fx.ease(t / 0.55)
    out = out * clear + np.array([1.0, 0.95, 0.84]) * (1 - clear)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    rays = np.exp(-np.hypot(gx - vpx, gy - vpy) / 700) * (0.5 + 0.5 * np.sin(np.arctan2(gy - vpy, gx - vpx) * 17 + t * 0.6)) * 0.12
    out = out + (rays * clear)[..., None] * np.array([1.0, 0.9, 0.7])
    PET.step(t, 1 / FPS); PET.render(out, t)
    MOT.step(1.0); out = out + MOT.render(t, 0.7)
    end = fx.ease((t - 2.35) / 0.65)                                   # into the arch's light
    out = out * (1 - end) + (np.array([1.0, 0.96, 0.88]) * (0.92 + 0.08 * np.exp(-np.hypot(gx - vpx, gy - vpy) / 400))[..., None]) * end
    return fx.finish(fx.bloom(out, 0.84, 22, 0.35), i, vig=0.2 * (1 - end), grn=0.010)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        for t in [0.3, 1.0, 1.8, 2.5]: fx.save(frame(int(t * FPS)), f'{fx.ROOT}/review/passage_{t:.1f}.jpg')
        fx.save(np.dstack([HM] * 3)[::2, ::2], f'{fx.ROOT}/review/passage_mask.jpg')
    else:
        w = fx.Writer(fx.ROOT + '/shots/V3_passage.mp4')
        for i in range(N): w.put(frame(i))
        w.close()
