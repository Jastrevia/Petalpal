"""The accepted A01 performance (every frame, its own timing) in the contact-scene room above the phone portal; motes and
3D petals. Frame 0 = take B's end frame, frame 167 = take C's start frame."""
import sys, numpy as np
sys.path.insert(0, '/mnt/user-data/outputs/contact/tools'); import contact_comp as cc
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
MOT = fx.Motes(80, seed=91, box=(600, 80, 1500, 900), vel=(0, -0.45), spread=0.6, size=(0.5, 1.5))
w = fx.Writer('/mnt/user-data/outputs/contact/takes/A01_contactroom.mp4', crf=12)
for i in range(168):
    f, _ = cc.a01_frame(i)
    MOT.step(1.0); f = f + MOT.render(i / 24, 0.35 * min(1, i / 12) * min(1, (167 - i) / 12))   # motes fade at both pinned ends
    w.put(np.clip(f, 0, 1))
w.close()
