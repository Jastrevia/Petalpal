"""Assemble PetalPal Film V3 (picture only), 24 fps, 1920x1080, with the PetalPal watermark lower right on every shot except
the title (which carries the brand itself). A01 (accepted) and the V13 flower pixels are used unmodified apart from scaling
to the canvas and the global watermark layer."""
import json, subprocess, numpy as np, cv2, sys
sys.path.insert(0, '/mnt/user-data/outputs/film_v3/tools'); import fx
W, H, FPS = 1920, 1080, 24
R = fx.ROOT; V1 = fx.V1; V2 = fx.V2
A01 = '/mnt/user-data/outputs/perf_test/glide_review/glide_v1_7s_retimed.mp4'   # same video stream as accepted/A01 (MD5 205a57d2...)
EDL = [  # label, source, src_start_frame, frames, note
    ('01 rain at night (V01, kept)', V1 + 'shots/V01.mp4', 0, 84, ''),
    ('02 phone notification and tap (R2)', R + '/shots/V3_phone.mp4', 0, 156, 'dissolve in 12f from V01'),
    ('03 A01 fairy opening (ACCEPTED, unmodified)', A01, 0, 168, ''),
    ('04 she presents the invitation (R1)', R + '/shots/V3_present.mp4', 0, 72, 'from light, first 8f'),
    ('05 reach and touch (R3)', R + '/shots/V3_reach.mp4', 0, 84, ''),
    ('06 into the wisteria passage (R4)', R + '/shots/V3_passage.mp4', 0, 72, ''),
    ('07 garden reveal (S09a, kept)', V2 + '/shots/S09a_garden.mp4', 0, 72, 'from light, first 8f'),
    ('08 pavilion over the water (S09b, kept)', V2 + '/shots/S09b_garden.mp4', 0, 74, ''),
    ('09 journal: words become a seed (S10, kept)', V2 + '/shots/S10_journal.mp4', 0, 96, ''),
    ('10 crocus blooms (V13 flower preserved; surroundings after R5)', R + '/shots/V3_crocus.mp4', 0, 120, ''),
    ('11 treehouse letter (R6)', R + '/shots/V3_letter.mp4', 0, 192, 'fade to warm light, last 10f'),
    ('12 morning (R2 at dawn)', R + '/shots/V3_dawn.mp4', 0, 84, ''),
    ('13 title (S19, kept)', V1 + 'vfx/S19.mp4', 0, 121, 'dissolve in 12f over the end of 12'),
]
WM = cv2.imread(R + '/tools/watermark_rgba.png', cv2.IMREAD_UNCHANGED).astype(np.float32) / 255     # BGRA
wh, ww = WM.shape[:2]; WMX, WMY = W - ww - 46, H - wh - 34; WMA = WM[..., 3:4] * 0.78; WMC = WM[..., :3] * 255
def watermark(f, a=1.0):
    roi = f[WMY:WMY + wh, WMX:WMX + ww]; roi[:] = roi * (1 - WMA * a) + WMC * WMA * a; return f
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
if __name__ == '__main__':
    out = R + '/edit/PetalPal_Film_V3_picture.mp4'
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '24', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
                          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    WARM = np.array([216, 242, 255], np.float32)
    log = []; t = 0; last = None
    for kk, (lab, src, s0, n, note) in enumerate(EDL):
        rd = reader(src, s0)
        tail = reader(EDL[0][1], EDL[0][2] + EDL[0][3]) if 'dissolve in 12f from' in note else None
        nxt_dis = kk + 1 < len(EDL) and 'dissolve in 12f over' in EDL[kk + 1][4]
        head_next = reader(EDL[kk + 1][1], EDL[kk + 1][2]) if nxt_dis else None
        is_title = kk == len(EDL) - 1
        for j in range(n):
            f = rd()
            if f is None: f = last.copy(); print('WARNING short source', lab, j)
            wa = 1.0
            if tail is not None and j < 12: g = tail(); a = (j + 1) / 13; f = g * (1 - a) + f * a
            if 'fade to warm' in note and j >= n - 10: a = (j - (n - 10) + 1) / 10; f = f * (1 - 0.85 * a) + WARM * 0.85 * a
            if 'from light' in note and j < 8: a = 1 - (j + 1) / 9; f = f * (1 - 0.9 * a) + WARM * 0.9 * a
            if head_next is not None and j >= n - 12: g = head_next(); a = (j - (n - 12) + 1) / 13; f = f * (1 - a) + g * a; wa = 1 - a
            if is_title: wa = 0.0
            if wa > 0: f = watermark(f, wa)
            p.stdin.write(np.clip(f + 0.5, 0, 255).astype(np.uint8).tobytes()); last = f
        log.append(dict(label=lab, source=src.replace('/mnt/user-data/outputs/', ''), src_start_frame=s0, start_frame=t, frames=n, start_s=round(t / 24, 3), dur_s=round(n / 24, 3), note=note)); t += n
    p.stdin.close(); p.wait()
    json.dump(dict(fps=24, total_frames=t, seconds=t / 24, shots=log), open(R + '/edit/edl_v3.json', 'w'), indent=1)
    print('wrote', out, t, 'frames', t / 24, 's')
