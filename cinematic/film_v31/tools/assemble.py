"""PetalPal Film V3.1: ordered review cut, storyboard order, NO reference images used as footage.
Same timeline as First Cut v2 (so its score and sound design stay in sync); A01 and the touch now take place in the rainy
room; the crocus keeps the original flower with restyled surroundings; PetalPal watermark lower right, title only at the end."""
import json, subprocess, numpy as np, cv2, os
W, H = 1920, 1080
O = '/mnt/user-data/outputs/'; R = O + 'film_v31'; V1 = O + 'film_v1/'; V2 = O + 'film_v2/'; V3 = O + 'film_v3/'
EDL = [  # storyboard beat, label, source, start frame, frames, note
    (1, 'Dreamy rainy night (V01)', V1 + 'shots/V01.mp4', 0, 84, ''),
    (2, 'Phone notification, viewer opens the invitation (S02)', V2 + 'shots/S02_phone.mp4', 0, 209, 'dissolve in 12f from V01'),
    (4, 'Fairy emerges from the invitation into the room (A01, accepted performance, in the room)', R + '/shots/A01_room.mp4', 0, 168, ''),
    (6, 'First-person touch in the room (S06)', R + '/shots/S06_room.mp4', 0, 72, ''),
    (7, 'Magic swirl into the wisteria passage (S07)', V2 + 'shots/S07_swirl.mp4', 0, 62, ''),
    (7, 'Wisteria passage, her light leads (K03orb, approved Kling 03)', V1 + 'vfx/K03orb.mp4', 0, 126, ''),
    (8, 'Garden reveal (S09a)', V2 + 'shots/S09a_garden.mp4', 0, 72, ''),
    (8, 'Pavilion over the water (S09b)', V2 + 'shots/S09b_garden.mp4', 0, 74, ''),
    (9, 'Journal entry; words become a seed (S10)', V2 + 'shots/S10_journal.mp4', 0, 96, ''),
    (10, 'Seed and preserved crocus bloom (V13 flower, restyled surroundings)', V3 + 'shots/V3_crocus.mp4', 0, 120, ''),
    (11, 'Treehouse mailbox, the letter glows (S13)', V2 + 'shots/S13_mailbox.mp4', 0, 72, ''),
    (11, 'The letter comes to the viewer and opens (S14)', V2 + 'shots/S14_letter.mp4', 0, 120, 'fade to warm light, last 10f'),
    (12, 'Return to the real world at dawn (S15)', V2 + 'shots/S15_dawn.mp4', 0, 72, 'from warm light, first 10f'),
    (13, 'PetalPal logo and slogan (S19)', V1 + 'vfx/S19.mp4', 28, 93, 'dissolve in 12f over the end of the previous shot'),
]
WM = cv2.imread(V3 + 'tools/watermark_rgba.png', cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
wh, ww = WM.shape[:2]; WMX, WMY = W - ww - 46, H - wh - 34; WMA = WM[..., 3:4] * 0.78; WMC = WM[..., :3] * 255
def watermark(f, a):
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
    out = R + '/edit/PetalPal_Film_V3_1_picture.mp4'
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '24', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
                          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    WARM = np.array([224, 242, 255], np.float32); log = []; t = 0; last = None
    for kk, (beat, lab, src, s0, n, note) in enumerate(EDL):
        rd = reader(src, s0)
        tail = reader(EDL[kk - 1][2], EDL[kk - 1][3] + EDL[kk - 1][4]) if 'dissolve in 12f from' in note else None
        nxt_dis = kk + 1 < len(EDL) and 'dissolve in 12f over' in EDL[kk + 1][5]
        head = reader(EDL[kk + 1][2], EDL[kk + 1][3] - 12) if nxt_dis else None
        title = beat == 13
        for j in range(n):
            f = rd()
            if f is None: f = last.copy(); print('WARNING short source', lab, j)
            wa = 0.0 if title else 1.0
            if tail is not None and j < 12: g = tail(); a = (j + 1) / 13; f = g * (1 - a) + f * a
            if 'fade to warm' in note and j >= n - 10: a = (j - (n - 10) + 1) / 10; f = f * (1 - 0.85 * a) + WARM * 0.85 * a
            if 'from warm' in note and j < 10: a = 1 - (j + 1) / 11; f = f * (1 - 0.85 * a) + WARM * 0.85 * a
            if head is not None and j >= n - 12: g = head(); a = (j - (n - 12) + 1) / 13; f = f * (1 - a) + g * a; wa = 1 - a
            if wa > 0: f = watermark(f, wa)
            p.stdin.write(np.clip(f + 0.5, 0, 255).astype(np.uint8).tobytes()); last = f
        log.append(dict(beat=beat, label=lab, source=src.replace(O, ''), start_frame=t, frames=n, start_s=round(t / 24, 3), end_s=round((t + n) / 24, 3), note=note)); t += n
    p.stdin.close(); p.wait()
    json.dump(dict(fps=24, total_frames=t, seconds=t / 24, shots=log), open(R + '/edit/edl_v3_1.json', 'w'), indent=1)
    print('wrote', out, t, 'frames', t / 24, 's')
