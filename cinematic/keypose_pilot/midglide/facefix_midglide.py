"""Free master-face transplant on the cleaned Mid-Glide (same transplant_native as Reach; smile 1.2 as Reach).
Landmarks measured on 4x/6x grids: eyes (iris centres), mouth centre, chin; jaw contour points."""
import sys; sys.path.insert(0, 'facefix')
from transplant_native import run
s = run('midglide/midglide_1_clean.png',
        [[1801, 287], [1873, 274], [1856, 332], [1858, 368]],
        [[1780, 346], [1803, 356], [1831, 364], [1856, 369], [1874, 356], [1887, 338]],
        'midglide/midglide_1', smile=1.2)
print('master face upscale factor', round(s, 2))
