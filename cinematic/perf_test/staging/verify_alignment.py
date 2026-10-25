"""Verify the three pinned frames: canvas, shared paper, and the fairy's head pose/scale/position in each
(master face template matched over scale and rotation)."""
import numpy as np, cv2, json
F = {'start': 'start_frame_poseA.png', 'middle': 'mid_frame_midglide.png', 'end': 'end_frame_reach.png'}
I = {k: cv2.imread(v) for k, v in F.items()}
res = {'canvas': {k: list(v.shape[1::-1]) for k, v in I.items()}}
g = {k: cv2.cvtColor(v, cv2.COLOR_BGR2GRAY).astype(np.float32) for k, v in I.items()}
# shared paper: compare pixels that are paper in all three frames
def figm(x):
    p = np.median(x[1100:1500, 100:600]); return cv2.dilate((np.abs(x - p) > 8).astype(np.uint8), np.ones((25, 25), np.uint8))
common = (figm(g['start']) | figm(g['middle']) | figm(g['end'])) == 0
res['paper_common_px'] = int(common.sum())
for a, b in [('start', 'middle'), ('middle', 'end'), ('start', 'end')]:
    d = np.abs(I[a].astype(np.int16) - I[b].astype(np.int16)).max(2)[common]
    res[f'paper_diff_{a}_{b}'] = {'mean': round(float(d.mean()), 2), 'p99': int(np.percentile(d, 99))}
res['paper_median_rgb'] = {k: np.median(v[common], 0)[::-1].astype(int).tolist() for k, v in I.items()}
# head pose: master face (eyes-nose-mouth) matched over scale x rotation
Mst = cv2.cvtColor(cv2.imread('/mnt/user-data/outputs/keypose_pilot/refs/master_on_paper.png'), cv2.COLOR_BGR2GRAY).astype(np.float32)
x0, y0, x1, y1 = 630, 140, 725, 215                         # eyes to mouth; master eye midpoint (677.5,160), eye dist 55.9
T0 = Mst[y0:y1, x0:x1]
for k, G in g.items():
    best = None
    for s in np.arange(0.8, 2.4, 0.02):
        for ang in (-6, -4, -2, 0, 2, 4, 6):
            R = cv2.getRotationMatrix2D(((x1 - x0) / 2, (y1 - y0) / 2), ang, s)
            w, h = int((x1 - x0) * s), int((y1 - y0) * s); R[:, 2] += [(w - (x1 - x0)) / 2, (h - (y1 - y0)) / 2]
            t = cv2.warpAffine(T0, R, (w, h), borderMode=cv2.BORDER_REPLICATE)
            r = cv2.matchTemplate(G[:900, 1300:2300], t, cv2.TM_CCOEFF_NORMED); _, v, _, loc = cv2.minMaxLoc(r)
            if best is None or v > best[0]: best = (v, s, ang, loc, w, h, R)
    v, s, ang, (lx, ly), w, h, R = best
    em = R @ np.array([677.5 - x0, 160 - y0, 1]) + [lx + 1300, ly]
    res[k] = {'match': round(float(v), 3), 'scale_vs_master': round(float(s), 2), 'eye_dist_px': round(55.9 * s, 1),
              'head_roll_vs_master_deg': ang, 'eye_mid': [round(float(em[0])), round(float(em[1]))]}
json.dump(res, open('staging/alignment_report.json', 'w'), indent=1); print(json.dumps(res, indent=1))
