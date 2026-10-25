"""7.0 s comparison version made ONLY by re-timing the existing drawings (Kling rendered both segments on threes:
a new drawing every 3rd frame). No frame is invented, blended, interpolated or held longer than generated.
1) Join stall: frames 87-99 (13 frames with no new drawing: seg1 settling into the keyframe, seg2 waiting) are
   cut to one normal 3-frame exposure (frames 95, 96 = pinned Mid-Glide, 97).
2) Every 4th drawing is shown for 2 frames instead of 3 (its third frame dropped), spread evenly over the shot.
Result: 168 frames = 7.00 s at 24 fps."""
import cv2, json, subprocess, numpy as np
cap = cv2.VideoCapture('glide_v1_8s_join.mp4'); J = []
while True:
    ok, f = cap.read()
    if not ok: break
    J.append(f)
assert len(J) == 193
drawings = [list(range(s, s + 3)) for s in range(0, 87, 3)] + [[95, 96, 97]] + [list(range(s, s + 3)) for s in range(100, 193, 3)]
assert sum(len(d) for d in drawings) == 183
JOIN = 29                                         # index of the join drawing in the list
others = [i for i in range(len(drawings)) if i != JOIN]
need = 183 - 168
pick = [others[int(round(k))] for k in np.linspace(2, len(others) - 3, need)]   # evenly spread, not at the very ends
for i in pick: drawings[i] = drawings[i][:2]
order = [f for d in drawings for f in d]; assert len(order) == 168
json.dump(dict(frame_order=order, twos=[drawings[i][0] for i in pick]), open('retime_7s_order.json', 'w'))
# encode straight from the ORIGINAL segments (seg1 frames 0-96, then seg2 frames 1-96), selecting frames in this order
sel = '+'.join('eq(n\\,%d)' % (i if i <= 96 else i + 1) for i in order)
open('_sel.txt', 'w').write("[0:v][1:v]concat=n=2:v=1:a=0[c];[c]select='%s',setpts=N/24/TB[v]" % sel)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', '../glide_seg1.mp4', '-i', '../glide_seg2.mp4', '-filter_complex_script', '_sel.txt', '-map', '[v]', '-r', '24',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'glide_v1_7s_retimed.mp4'], check=True)
print('drawings on twos (first frame of each):', [drawings[i][0] for i in pick]); print('join neighbourhood:', order[order.index(96) - 6: order.index(96) + 7])
