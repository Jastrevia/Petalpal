"""Shot 2C camera plan: K1 -> K2, 6.0 s at 24 fps (144 frames).
Writes motion_plan.json (per-frame values) and motion_plan.png (curves).
Numbers come from measuring K1 against K2 (see README): travel ~5 m, pan right ~6 deg, tilt up ~0.7 deg,
lens ~20 mm -> 24 mm equivalent. Usage: python motion_plan.py <out_dir>
"""
import json, sys, os
import numpy as np

FPS, DUR = 24, 6.0
N = int(FPS * DUR)
TRAVEL_M = 5.0          # estimate: K1 is ~1.9x as far from the arch as K2 (K2 ~5-7 m from the arch)
PAN_DEG, TILT_DEG = 6.3, 0.7
LENS0, LENS1 = 20.0, 24.0

t = (np.arange(N) + 0.5) / FPS

def smooth(x):  # C2-continuous 0..1 ramp
    x = np.clip(x, 0, 1); return x**3 * (10 - 15 * x + 6 * x * x)

# Speed profile in m/s, shaped to the requested beats:
# 0-2 s slow creep, 2-4 s gentle acceleration, 4-~5.5 s carry through the sunlight and decelerate, settle by 6 s.
creep = 0.35 * smooth(t / 1.0)                            # eases in from rest to a slow walk
surge = 1.25 * smooth((t - 2.0) / 2.0)                    # builds through 2-4 s
brake = smooth((t - 3.9) / 1.9)                           # eases out 3.9-5.8 s
v = (creep + surge) * (1 - brake)
v[t > 5.8] = 0.0
d = np.cumsum(v) / FPS
d *= TRAVEL_M / d[-1]; v *= TRAVEL_M / (np.sum(v) / FPS)
a = np.gradient(v, 1 / FPS)
pan = PAN_DEG * smooth((t - 1.0) / 4.5)                   # turn right gradually 1.0-5.5 s
tilt = TILT_DEG * smooth((t - 1.0) / 4.5)
lens = LENS0 + (LENS1 - LENS0) * smooth((t - 0.5) / 5.0)  # slight, invisible push-zoom to match K2's framing
# exposure: camera in shade until it crosses the lit pool's edge (~4.4 s); brief over-bright bloom, eye adapts by ~5.2 s
sun = smooth((t - 4.2) / 0.5)
expo_ev = 0.6 * sun * np.exp(-np.clip(t - 4.7, 0, None) / 0.35) + 0.0
beats = [(0, 2, 'slow creep in shade'), (2, 4, 'gentle acceleration, valley opens'), (4, 6, 'into sunlight, lake + waterfall reveal, settle on K2')]

out = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(out, exist_ok=True)
rows = [dict(frame=i + 1, t=round(float(t[i]), 4), distance_m=round(float(d[i]), 4), speed_mps=round(float(v[i]), 4),
             accel_mps2=round(float(a[i]), 3), pan_right_deg=round(float(pan[i]), 3), tilt_up_deg=round(float(tilt[i]), 3),
             lens_mm=round(float(lens[i]), 2), exposure_bloom_ev=round(float(expo_ev[i]), 3)) for i in range(N)]
json.dump(dict(fps=FPS, frames=N, duration_s=DUR, travel_m=TRAVEL_M, beats=beats, frames_data=rows), open(os.path.join(out, 'motion_plan.json'), 'w'), indent=1)

import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, ax = plt.subplots(4, 1, figsize=(10, 9), sharex=True)
for x0, x1, lab in beats:
    for k in ax: k.axvspan(x0, x1, color=('#f3efe6' if x0 % 4 == 0 else '#e9eef3'), zorder=0)
    ax[0].text((x0 + x1) / 2, 0.02, lab, ha='center', va='bottom', fontsize=8, transform=ax[0].get_xaxis_transform())
ax[0].plot(t, d, color='#5a3d8a'); ax[0].set_ylabel('distance (m)')
ax[1].plot(t, v, color='#2f7f86'); ax[1].set_ylabel('speed (m/s)')
ax[2].plot(t, a, color='#a0522d'); ax[2].set_ylabel('accel (m/s²)')
ax[3].plot(t, pan, label='pan right (deg)', color='#5a3d8a'); ax[3].plot(t, lens - 18, label='lens mm − 18', color='#2f7f86')
ax[3].plot(t, expo_ev * 5, label='sun bloom (EV × 5)', color='#c99a2e'); ax[3].legend(fontsize=8, loc='upper left'); ax[3].set_xlabel('time (s)')
fig.suptitle('Shot 2C camera plan, K1 to K2: %.1f m in %.1f s, peak %.2f m/s, peak accel %.2f m/s²' % (TRAVEL_M, DUR, v.max(), np.abs(a).max()))
fig.tight_layout(); fig.savefig(os.path.join(out, 'motion_plan.png'), dpi=110)
print('peak speed %.2f m/s at %.2f s; peak |accel| %.2f m/s2; distance at 2 s %.2f m, 4 s %.2f m' % (v.max(), t[v.argmax()], np.abs(a).max(), d[int(2 * FPS) - 1], d[int(4 * FPS) - 1]))
