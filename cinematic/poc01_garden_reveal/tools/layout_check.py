"""Top-down composite of scene_manifest.json, drawn the way the app's 2D map draws it.
Used only to verify transforms against real app screenshots before anything is built in 3D."""
import json, sys
from PIL import Image
repo, manifest, out = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(manifest))
X0, Y0, X1, Y1, S = -400, -700, 2800, 2000, 0.5          # region of world to draw, output scale
canvas = Image.new('RGBA', (int((X1-X0)*S), int((Y1-Y0)*S)), (120, 184, 178, 255))   # GARDEN_WATER_COLOR #78b8b2
def tiled(path, x, y, w, h, rect):
    tx, ty, tw, th = rect
    im = Image.open(repo+'/'+path).convert('RGBA').resize((int(tw*S), int(th*S)), Image.LANCZOS)
    fx, fy = im.transpose(Image.FLIP_LEFT_RIGHT), im.transpose(Image.FLIP_TOP_BOTTOM)
    fxy = fx.transpose(Image.FLIP_TOP_BOTTOM)
    import math
    i0, i1 = math.floor((max(x, X0)-tx)/tw), math.ceil((min(x+w, X1)-tx)/tw)
    j0, j1 = math.floor((max(y, Y0)-ty)/th), math.ceil((min(y+h, Y1)-ty)/th)
    for i in range(i0, i1):
        for j in range(j0, j1):
            tile = [[im, fy], [fx, fxy]][i % 2][j % 2]
            canvas.alpha_composite(tile, (int((tx+i*tw-X0)*S), int((ty+j*th-Y0)*S)))
def place(path, x, y, w, h, rot, crop=None):
    im = Image.open(repo+'/'+path).convert('RGBA')
    if crop: im = im.crop(crop)
    im = im.resize((max(1, int(w*S)), max(1, int(h*S))), Image.LANCZOS)
    cx, cy = (x + w/2 - X0)*S, (y + h/2 - Y0)*S
    if rot: im = im.rotate(-rot, resample=Image.BICUBIC, expand=True)   # screen-clockwise positive, as Skia
    canvas.alpha_composite(im, (int(cx - im.width/2), int(cy - im.height/2))) if -im.width<cx<canvas.width+im.width else None
for l in m['layers']:      # manifest order IS draw order
    if l.get('tile'): tiled(l['asset'], l['x'], l['y'], l['width'], l['height'], l['tile']['rect'])
    else: place(l['asset'], l['x'], l['y'], l['width'], l['height'], l['rotationDeg'])
wf = m['waterfall']; sc = wf['scale']; cw, ch = wf['canvas']
src = Image.open(repo+'/'+wf['asset']); k = cw/src.width
for b in wf['bands']:
    crop = (0, int(b['start']/k), src.width, int(b['end']/k))
    y = wf['y'] + (b['translateY'] + b['start']*b['scaleY'])*sc
    place(wf['asset'], wf['x'], y, cw*sc, (b['end']-b['start'])*b['scaleY']*sc, 0, crop)   # rotation (-2.5 deg) omitted in this check
for c in m['landmarkCards']:
    place(c['asset'], c['x'], c['y'], c['width'], c['height'], c['rotationDeg'])
canvas.convert('RGB').save(out, quality=88)
print(canvas.size)
