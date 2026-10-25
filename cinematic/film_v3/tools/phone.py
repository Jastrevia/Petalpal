"""Illustrated phone (body + screen contents), rendered with PIL at 2x and downsampled. Screen UI uses real PetalPal art."""
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import fx

PW, PH, R, BZ = 440, 920, 66, 15                 # phone size on canvas (px), corner radius, bezel
SW, SH = PW - 2 * BZ, PH - 2 * BZ

def _rr(size, r, fill):
    im = Image.new('L', size, 0); ImageDraw.Draw(im).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], r, fill=fill); return im

def body():
    """RGBA phone body with a transparent screen hole; returns (rgb, alpha, screen_mask)."""
    k = 2; w, h = PW * k, PH * k
    a = _rr((w, h), R * k, 255)
    im = Image.new('RGB', (w, h), (28, 26, 34)); d = ImageDraw.Draw(im)
    # metallic rim: lighter outer ring, gradient
    rim = np.asarray(_rr((w, h), R * k, 255)).astype(np.float32) / 255 - np.asarray(_rr((w - 10 * k, h - 10 * k), (R - 5) * k, 255).resize((w, h))).astype(np.float32) / 255 * 0
    base = np.asarray(im).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    shade = 0.75 + 0.5 * (1 - yy / h) * 0.6 + 0.25 * np.exp(-((xx - w * 0.15) / (w * 0.1)) ** 2)
    base = base * shade[..., None]
    inner = Image.new('L', (w, h), 0); ImageDraw.Draw(inner).rounded_rectangle([5 * k, 5 * k, w - 5 * k, h - 5 * k], (R - 5) * k, fill=255)
    inner = np.asarray(inner).astype(np.float32) / 255
    ring = np.asarray(a).astype(np.float32) / 255 - inner
    base = base * (1 - ring[..., None]) + ring[..., None] * np.array([150, 146, 160], np.float32) * (0.6 + 0.6 * (1 - yy / h))[..., None]
    scr = Image.new('L', (w, h), 0); ImageDraw.Draw(scr).rounded_rectangle([BZ * k, BZ * k, w - BZ * k, h - BZ * k], (R - BZ + 4) * k, fill=255)
    scr = np.asarray(scr).astype(np.float32) / 255
    rgb = cv2.resize(np.clip(base / 255, 0, 1), (PW, PH), interpolation=cv2.INTER_AREA)
    al = cv2.resize(np.asarray(a).astype(np.float32) / 255, (PW, PH), interpolation=cv2.INTER_AREA)
    sm = cv2.resize(scr, (PW, PH), interpolation=cv2.INTER_AREA)
    return rgb, al, sm

def island(img):
    """dynamic island pill drawn on a screen-sized image (in place)."""
    h, w = img.shape[:2]; m = Image.new('L', (w * 2, h * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle([w - 70, 26, w + 70, 26 + 42], 21, fill=255)
    m = cv2.resize(np.asarray(m).astype(np.float32) / 255, (w, h), interpolation=cv2.INTER_AREA)
    img[:] = img * (1 - m[..., None]); return img

def ui_text(img, items):
    """items: (text, font, size, (x,y) in screen px, rgb 0-255, alpha, anchor)"""
    h, w = img.shape[:2]; k = 2
    for txt, fnt, size, (x, y), col, al, anchor in items:
        L = Image.new('L', (w * k, h * k), 0); d = ImageDraw.Draw(L)
        d.text((x * k, y * k), txt, font=fx.font(fnt, size * k), fill=255, anchor=anchor)
        a = cv2.resize(np.asarray(L).astype(np.float32) / 255, (w, h), interpolation=cv2.INTER_AREA) * al
        img[:] = img * (1 - a[..., None]) + np.array(col, np.float32)[None, None] / 255 * a[..., None]
    return img

def rounded_card(img, box, r, col, alpha):
    h, w = img.shape[:2]; k = 2; m = Image.new('L', (w * k, h * k), 0)
    x0, y0, x1, y1 = box; ImageDraw.Draw(m).rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], r * k, fill=255)
    a = cv2.resize(np.asarray(m).astype(np.float32) / 255, (w, h), interpolation=cv2.INTER_AREA) * alpha
    img[:] = img * (1 - a[..., None]) + np.array(col, np.float32)[None, None] * a[..., None]; return a
