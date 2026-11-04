# Real-ESRGAN x4plus (ncnn, CPU) upscaler for the existing spine artwork. Alpha is upscaled with Lanczos.
import sys, numpy as np, ncnn
from PIL import Image
MODEL = sys.argv[1]
net = ncnn.Net(); net.opt.use_vulkan_compute = False; net.opt.num_threads = 1
for flag in ('use_fp16_packed', 'use_fp16_storage', 'use_fp16_arithmetic', 'use_bf16_storage', 'use_int8_inference'):
    if hasattr(net.opt, flag): setattr(net.opt, flag, False)
net.load_param(MODEL + '.param'); net.load_model(MODEL + '.bin')
def run(rgb):
    pad = 8; rgbp = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)), mode='reflect')
    mat = ncnn.Mat(np.ascontiguousarray(rgbp.transpose(2, 0, 1)))
    ex = net.create_extractor(); ex.input('data', mat); _, out = ex.extract('output')
    return np.clip(np.array(out).transpose(1, 2, 0), 0, 1)[pad * 4:-pad * 4, pad * 4:-pad * 4]
def upscale(img: Image.Image, tile=64, overlap=8) -> Image.Image:
    # Row tiles with overlap keep each inference small (large single passes corrupted on CPU).
    rgba = img.convert('RGBA'); rgb = np.asarray(rgba.convert('RGB')).astype(np.float32) / 255.
    h = rgb.shape[0]; out = np.zeros((h * 4, rgb.shape[1] * 4, 3), np.float32)
    y = 0
    while y < h:
        y0 = max(0, y - overlap); y1 = min(h, y + tile + overlap)
        part = run(rgb[y0:y1])
        top = (y - y0) * 4; take = min(tile, h - y) * 4
        out[y * 4:y * 4 + take] = part[top:top + take]
        y += tile
    up = Image.fromarray((out * 255 + .5).astype(np.uint8), 'RGB')
    alpha = rgba.split()[3].resize(up.size, Image.LANCZOS)
    up.putalpha(alpha); return up
if __name__ == '__main__':
    src, dst = sys.argv[2], sys.argv[3]
    upscale(Image.open(src)).save(dst)
