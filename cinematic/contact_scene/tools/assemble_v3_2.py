"""PetalPal Film V3.2 = V3.1 with the new contact scene (takes A-E around the accepted A01 performance). Joins between the new
shots are frame-continuous (each take was pinned to the previous shot's last frame; the duplicate frame is dropped).
Also writes the scene-only review (rainy night -> contact scene -> approved passage). Original takes are never modified."""
import json, subprocess, numpy as np, cv2, sys
W, H = 1920, 1080
O = '/mnt/user-data/outputs/'; C = O + 'contact/'; V1 = O + 'film_v1/'; V2 = O + 'film_v2/'; V3 = O + 'film_v3/'; T = C + 'takes/'
EDL = [  # beat, label, source, start frame, frames, note
    (1, 'Dreamy rainy night (V01)', V1 + 'shots/V01.mp4', 0, 84, ''),
    (2, 'Phone notification and tap (take A)', T + 'contact_A.mp4', 0, 121, ''),
    (3, 'Invitation opens a portal; the fairy emerges from the phone (take B)', T + 'contact_B.mp4', 1, 120, ''),
    (4, 'Accepted A01 performance in the room above the phone portal', T + 'A01_contactroom.mp4', 1, 167, ''),
    (5, 'She takes the invitation and reaches toward the viewer (take C)', T + 'contact_C.mp4', 1, 120, ''),
    (6, "The viewer's hand meets hers; golden light (take D)", T + 'contact_D.mp4', 1, 96, ''),
    (7, 'She guides the viewer through the portal into the passage (take E)', T + 'contact_E.mp4', 1, 120, ''),
    (7, 'Wisteria passage, her light leads (K03orb)', V1 + 'vfx/K03orb.mp4', 1, 48, ''),
    (8, 'Garden reveal (S09a)', V2 + 'shots/S09a_garden.mp4', 0, 72, ''),
    (8, 'Pavilion over the water (S09b)', V2 + 'shots/S09b_garden.mp4', 0, 48, ''),
    (9, 'Journal entry; words become a seed (S10)', V2 + 'shots/S10_journal.mp4', 0, 96, ''),
    (10, 'Seed and preserved crocus bloom', V3 + 'shots/V3_crocus.mp4', 0, 120, ''),
    (11, 'Treehouse mailbox, the letter glows (S13)', V2 + 'shots/S13_mailbox.mp4', 24, 48, ''),
    (11, 'The letter comes to the viewer and opens (S14)', V2 + 'shots/S14_letter.mp4', 0, 120, 'fade to warm light, last 10f'),
    (12, 'Return to the real world at dawn (S15)', V2 + 'shots/S15_dawn.mp4', 0, 60, 'from warm light, first 10f'),
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
def build(edl, out, edl_json):
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '24', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
                          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    WARM = np.array([224, 242, 255], np.float32); log = []; t = 0; last = None
    for kk, (beat, lab, src, s0, n, note) in enumerate(edl):
        rd = reader(src, s0)
        nxt_dis = kk + 1 < len(edl) and 'dissolve in 12f over' in edl[kk + 1][5]
        head = reader(edl[kk + 1][2], edl[kk + 1][3] - 12) if nxt_dis else None
        for j in range(n):
            f = rd()
            if f is None: f = last.copy(); print('WARNING short source', lab, j)
            wa = 0.0 if beat == 13 else 1.0
            if 'fade to warm' in note and j >= n - 10: a = (j - (n - 10) + 1) / 10; f = f * (1 - 0.85 * a) + WARM * 0.85 * a
            if 'from warm' in note and j < 10: a = 1 - (j + 1) / 11; f = f * (1 - 0.85 * a) + WARM * 0.85 * a
            if head is not None and j >= n - 12: g = head(); a = (j - (n - 12) + 1) / 13; f = f * (1 - a) + g * a; wa = 1 - a
            if wa > 0: f = watermark(f, wa)
            p.stdin.write(np.clip(f + 0.5, 0, 255).astype(np.uint8).tobytes()); last = f
        log.append(dict(beat=beat, label=lab, source=src.replace(O, ''), src_start_frame=s0, start_frame=t, frames=n, start_s=round(t / 24, 3), end_s=round((t + n) / 24, 3))); t += n
    p.stdin.close(); p.wait()
    json.dump(dict(fps=24, total_frames=t, seconds=t / 24, shots=log), open(edl_json, 'w'), indent=1)
    print('wrote', out, t, 'frames', round(t / 24, 2), 's')
if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'both'
    if which in ('scene', 'both'):
        scene = EDL[:7] + [(7, 'Wisteria passage (K03orb)', V1 + 'vfx/K03orb.mp4', 1, 125, '')]
        build(scene, C + 'edit/Contact_Scene_picture.mp4', C + 'edit/edl_scene.json')
    if which in ('film', 'both'):
        build(EDL, C + 'edit/PetalPal_Film_V3_2_picture.mp4', C + 'edit/edl_v3_2.json')
