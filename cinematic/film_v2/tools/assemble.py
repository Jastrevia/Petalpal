"""Assemble PetalPal First Cut v2 (picture only): frame-exact edit at 24 fps, 1920x1080.
A01 (accepted) is used unmodified: its frames are only scaled to the canvas (cover-fit 1928x1072 -> 1920x1080)."""
import json, subprocess, numpy as np, cv2, sys
sys.path.insert(0, '/mnt/user-data/outputs/film_v2/tools'); import fx
W, H, FPS = 1920, 1080, 24
R = fx.ROOT; V1 = fx.V1
A01 = '/mnt/user-data/outputs/perf_test/glide_review/glide_v1_7s_retimed.mp4'
EDL = [  # label, source, src_start_frame, frames, notes
    ('01 rain at night (reused V01)', V1 + 'shots/V01.mp4', 0, 84, ''),
    ('02 phone: invitation arrives', R + '/shots/S02_phone.mp4', 0, 209, 'dissolve in 12f from V01'),
    ('03 A01 fairy opening (ACCEPTED, unmodified)', A01, 0, 168, ''),
    ('04 touch', R + '/shots/S06_touch.mp4', 0, 72, ''),
    ('05 petal swirl to the passage', R + '/shots/S07_swirl.mp4', 0, 62, ''),
    ('06 passage (reused K03orb / Kling 03)', V1 + 'vfx/K03orb.mp4', 0, 126, ''),
    ('07 garden reveal', R + '/shots/S09a_garden.mp4', 0, 72, ''),
    ('08 pavilion over the water', R + '/shots/S09b_garden.mp4', 0, 74, ''),
    ('09 journal: words become a seed', R + '/shots/S10_journal.mp4', 0, 96, ''),
    ('10 crocus blooms (reused V13)', R + '/shots/S12_crocus.mp4', 0, 120, ''),
    ('11 treehouse mailbox', R + '/shots/S13_mailbox.mp4', 0, 72, ''),
    ('12 the letter', R + '/shots/S14_letter.mp4', 0, 120, 'fade to warm light, last 10f'),
    ('13 morning', R + '/shots/S15_dawn.mp4', 0, 72, 'from warm light, first 10f'),
    ('14 title (reused S19)', V1 + 'vfx/S19.mp4', 28, 93, 'dissolve in 12f over the end of 13'),
]
def reader(path, start):
    c = cv2.VideoCapture(path); c.set(cv2.CAP_PROP_POS_FRAMES, start)
    def nxt():
        ok, f = c.read()
        if not ok: return None
        if (f.shape[1], f.shape[0]) != (W, H):
            s = max(W / f.shape[1], H / f.shape[0]); f = cv2.resize(f, (int(round(f.shape[1] * s)), int(round(f.shape[0] * s))), interpolation=cv2.INTER_CUBIC if s > 1 else cv2.INTER_AREA)
            x0 = (f.shape[1] - W) // 2; y0 = (f.shape[0] - H) // 2; f = f[y0:y0 + H, x0:x0 + W]
        return f.astype(np.float32)
    return nxt
out = R + '/edit/PetalPal_FirstCut_v2_picture.mp4'
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '24', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
                      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
WARM = np.array([224, 242, 255], np.float32)          # warm white (BGR)
log = []; t = 0; last = None
for k, (lab, src, s0, n, note) in enumerate(EDL):
    rd = reader(src, s0)
    if k == 1: tail = reader(EDL[0][1], EDL[0][2] + EDL[0][3])                   # V01 handle for the dissolve
    if k == len(EDL) - 1: pass
    head_next = reader(EDL[k + 1][1], EDL[k + 1][2] - 12) if k == len(EDL) - 2 else None   # S19 head handle
    for j in range(n):
        f = rd()
        if f is None: f = last.copy(); print('WARNING short source', lab, j)
        if k == 1 and j < 12:
            g = tail(); a = (j + 1) / 13; f = g * (1 - a) + f * a
        if 'fade to warm' in note and j >= n - 10: a = (j - (n - 10) + 1) / 10; f = f * (1 - 0.85 * a) + WARM * 0.85 * a
        if 'from warm' in note and j < 10: a = 1 - (j + 1) / 11; f = f * (1 - 0.85 * a) + WARM * 0.85 * a
        if head_next is not None and j >= n - 12:
            g = head_next(); a = (j - (n - 12) + 1) / 13; f = f * (1 - a) + g * a
        p.stdin.write(np.clip(f + 0.5, 0, 255).astype(np.uint8).tobytes()); last = f
    log.append(dict(label=lab, source=src.replace('/mnt/user-data/outputs/', ''), src_start_frame=s0, start_frame=t, frames=n, start_s=round(t / 24, 3), dur_s=round(n / 24, 3), note=note)); t += n
p.stdin.close(); p.wait()
json.dump(dict(fps=24, total_frames=t, seconds=t / 24, shots=log), open(R + '/edit/edl_v2.json', 'w'), indent=1)
print('wrote', out, t, 'frames', t / 24, 's')
