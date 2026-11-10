# Bakes the Monthly Report archive book's textures (Treehouse → My Journals, the 13th book of each year) from the
# approved dark-green and gold spine artwork, with the same cover recipe as the monthly journals (bakeJournalBooks.py):
# leather in the spine's own colour, an embossed gold frame, vines, corner protectors and the title.
#
# Usage: python bakeMonthlyReportBook.py <approved spine png> <EBGaramond-MediumItalic.ttf> <out dir>
# Outputs: monthly-report-spine.webp (388 × 1252, the journals' spine size) and monthly-report-cover.webp (640 × 940).
# The approved spine is only resized (never repainted); the cover's inlaid emblem is cut from that same artwork.
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC, FONT, OUT = sys.argv[1:4]
# The journal bake reads its own arguments at import time; only its helpers are used here.
sys.argv = [sys.argv[0], OUT, FONT, OUT]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bakeJournalBooks as J  # noqa: E402

# Leather sampled from the approved spine's plain areas (mean ≈ #142409 in shadow); the leather faces in the app use
# MONTHLY_REPORT_CLOTH (book3d/assets.ts) — keep the two in step.
CLOTH = '#2F4D2A'
W, H = J.W, J.H


def spine(art):
    return art.resize((388, 1252), Image.LANCZOS)


def cover(art):
    base = np.clip(J.hexrgb(CLOTH) ** 1.12 * .92, 0, 1)
    img = J.leather(H, W, base)
    S = 2
    m = J.mask_canvas(W * S, H * S)
    d = ImageDraw.Draw(m)

    def R(x0, y0, x1, y1, r, wd):
        d.rounded_rectangle((x0 * S, y0 * S, x1 * S, y1 * S), r * S, outline=255, width=wd * S)

    R(30, 30, W - 30, H - 30, 18, 4)
    R(44, 44, W - 44, H - 44, 12, 2)
    # Vines climbing either side of the emblem, as on the journals.
    for side in (-1, 1):
        cx = W / 2 + side * 236
        pts = [((cx + side * 12 * np.sin(t * 1.3)) * S, (846 - t * 52) * S) for t in np.linspace(0, 10.6, 34)]
        J.vine(d, pts, 3 * S, 13 * S, side)
    # Title on two lines (the spine's own lettering), a flourish rule under it.
    font = ImageFont.truetype(FONT, 76 * S)
    for k, word in enumerate(('Monthly', 'Report')):
        tw = d.textlength(word, font=font)
        d.text(((W * S - tw) / 2, (100 + k * 84) * S), word, font=font, fill=255)
    d.line(((200 * S, 300 * S), (440 * S, 300 * S)), fill=255, width=2 * S)
    for x in (200, 440):
        d.ellipse(((x - 5) * S, (300 - 5) * S, (x + 5) * S, (300 + 5) * S), fill=255)
    d.regular_polygon((W / 2 * S, 300 * S, 9 * S), 4, rotation=45, fill=255)
    mask = J.to_np(m.resize((W, H), Image.LANCZOS))
    img = J.emboss_gold(img, mask, bevel=1.4, strength=7, worn=.6)

    # The emblem — the report chart in its laurel, the wax seal and ribbons — cut from the approved spine and inlaid with
    # a soft edge (the spine's leather around it fades into the cover's).
    ax0, ax1 = .07 * art.width, .93 * art.width
    ay0, ay1 = .37 * art.height, .75 * art.height
    region = art.crop((int(ax0), int(ay0), int(ax1), int(ay1)))
    ew = 380
    eh = round(region.height * ew / region.width)
    region = region.resize((ew, eh), Image.LANCZOS)
    ex, ey = (W - ew) // 2, 336
    eh = min(eh, H - 70 - ey)
    region = region.crop((0, 0, ew, eh))
    emblem = np.asarray(region, np.float32) / 255
    yy, xx = np.mgrid[0:eh, 0:ew].astype(np.float32)
    rx, ry = (xx - ew / 2) / (ew / 2), (yy - eh / 2) / (eh / 2)
    alpha = np.clip((1 - np.sqrt(rx ** 2 * .9 + np.maximum(ry, 0) ** 2 * .55 + np.minimum(ry, 0) ** 2)) * 4.5, 0, 1)
    alpha = J.gaussian_filter(alpha, 6)[..., None]
    patch = img[ey:ey + eh, ex:ex + ew]
    img[ey:ey + eh, ex:ex + ew] = patch * (1 - alpha) + emblem * alpha

    # Antique gold corner protectors (as on the journals).
    cm = J.mask_canvas(W * S, H * S)
    cd = ImageDraw.Draw(cm)
    C = 118
    for (sx, sy) in ((0, 0), (1, 0), (0, 1), (1, 1)):
        ox, oy = sx * W, sy * H
        fx, fy = (1 - 2 * sx), (1 - 2 * sy)
        P = lambda x, y: ((ox + fx * x) * S, (oy + fy * y) * S)
        cd.polygon([P(0, 0), P(C, 0), P(C * .82, C * .18), P(C * .42, C * .3), P(C * .3, C * .42), P(C * .18, C * .82), P(0, C)], fill=255)
    corner = J.to_np(cm.resize((W, H), Image.LANCZOS))
    img = J.emboss_gold(img, corner, bevel=4.2, strength=11, worn=.9, contrast=2.2, floor=.02)
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    art = Image.open(SRC).convert('RGB')
    spine(art).save(f'{OUT}/monthly-report-spine.webp', quality=90, method=6)
    cover(art).save(f'{OUT}/monthly-report-cover.webp', quality=86, method=6)
    print('baked', OUT)
