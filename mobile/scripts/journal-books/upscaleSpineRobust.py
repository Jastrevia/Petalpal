# Robust spine upscaling: opaque input (spine over its own darkened cloth colour), three Real-ESRGAN passes,
# per-pixel median, then a sanity check against a Lanczos upscale (flags any tile that still diverges).
import sys, numpy as np
from PIL import Image
sys.argv = [sys.argv[0], sys.argv[1]] + sys.argv[2:]
import importlib.util
spec = importlib.util.spec_from_file_location('up', __file__.replace('upscaleSpineRobust.py', 'upscaleSpine.py'))
MODEL, SRC, DST, BG = sys.argv[1:5]
sys.argv = ['upscaleSpine.py', MODEL]
up = importlib.util.module_from_spec(spec); spec.loader.exec_module(up)
src = Image.open(SRC).convert('RGBA')
bg = Image.new('RGBA', src.size, tuple(int(BG[i:i + 2], 16) for i in (1, 3, 5)) + (255,)); bg.alpha_composite(src)
runs = [np.asarray(up.upscale(bg.convert('RGB')).convert('RGB'), np.float32) for _ in range(3)]
med = np.median(np.stack(runs), 0)
ref = np.asarray(bg.convert('RGB').resize((med.shape[1], med.shape[0]), Image.LANCZOS), np.float32)
worst = 0
for y in range(0, med.shape[0], 64):
    for x in range(0, med.shape[1], 64):
        worst = max(worst, np.abs(med[y:y + 64, x:x + 64] - ref[y:y + 64, x:x + 64]).mean())
Image.fromarray(med.astype(np.uint8)).save(DST)
print(SRC, 'worst tile diff', round(float(worst), 1))
