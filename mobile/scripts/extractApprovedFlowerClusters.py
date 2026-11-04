"""Extract the approved Small/Medium/Large flower clusters from Resources/flower-updated.

Usage: python scripts/extractApprovedFlowerClusters.py [--project <mobile>] [--source <dir>]
Requires Pillow + numpy only. Source sheets are read, never modified.

Each sheet holds three clusters of one species. They are separated by their solid
bodies (alpha >= 128 gives exactly three large 8-connected components on every
approved sheet; checked, not assumed), never by equal-width thirds. Every other
visible pixel joins the body it is connected to through visible pixels; detached
fragments (e.g. Dandelion seed fluff) join the nearest body. Pixels are copied
unchanged (no resize, recolor or alpha edits); pixels of the other two clusters
become fully transparent. Each crop is the bounding box of all its visible pixels.

Outputs:
  assets/garden/flowers/clusters/<species>_<size>.png       (78 files)
  src/components/garden/planting/approvedFlowerClusterAssets.ts (generated metadata)
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--project', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--source', type=Path)
args = parser.parse_args()
root = args.project.resolve()
source = (args.source or root.parent / 'Resources' / 'flower-updated').resolve()
out_dir = root / 'assets/garden/flowers/clusters'
out_ts = root / 'src/components/garden/planting/approvedFlowerClusterAssets.ts'

CORE_ALPHA = 128      # solid body threshold used for separation and ground anchor
HIT_ALPHA = 96        # visible-enough pixels for the tap silhouette
HIT_CELL = 16         # silhouette grid cell, source pixels
SIZES = ('SMALL', 'MEDIUM', 'LARGE')


def species_code(stem: str) -> str:
    return stem.strip().upper().replace('-', '_').replace(' ', '_')


def label(mask: np.ndarray):
    """8-connected component labels via row runs + union-find."""
    height, _ = mask.shape
    parent = [0]

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    runs, previous = [], []
    for y in range(height):
        d = np.diff(np.concatenate(([0], mask[y].astype(np.int8), [0])))
        current, j = [], 0
        for s, e in zip(np.where(d == 1)[0], np.where(d == -1)[0]):
            lab = len(parent)
            parent.append(lab)
            while j < len(previous) and previous[j][1] < s:
                j += 1
            k = j
            while k < len(previous) and previous[k][0] <= e:
                a, b = find(lab), find(previous[k][2])
                if a != b:
                    parent[max(a, b)] = min(a, b)
                k += 1
            current.append((s, e, lab))
            runs.append((y, s, e, lab))
        previous = current
    labels, roots = np.zeros(mask.shape, np.int32), {}
    for y, s, e, lab in runs:
        labels[y, s:e] = roots.setdefault(find(lab), len(roots) + 1)
    return labels, len(roots)


def grow(labels: np.ndarray, allowed: np.ndarray) -> np.ndarray:
    """Breadth-first (8-neighbour) growth of labels into allowed, unlabelled pixels."""
    labels = labels.copy()
    while True:
        frontier = (labels == 0) & allowed
        if not frontier.any():
            return labels
        changed = False
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                shifted = np.zeros_like(labels)
                ys = slice(max(dy, 0), labels.shape[0] + min(dy, 0))
                yd = slice(max(-dy, 0), labels.shape[0] + min(-dy, 0))
                xs = slice(max(dx, 0), labels.shape[1] + min(dx, 0))
                xd = slice(max(-dx, 0), labels.shape[1] + min(-dx, 0))
                shifted[ys, xs] = labels[yd, xd]
                take = (labels == 0) & allowed & (shifted > 0)
                if take.any():
                    labels[take] = shifted[take]
                    changed = True
        if not changed:
            return labels


def hit_rows(alpha: np.ndarray):
    rows = []
    cols = (alpha.shape[1] + HIT_CELL - 1) // HIT_CELL
    for top in range(0, alpha.shape[0], HIT_CELL):
        band = alpha[top:top + HIT_CELL] >= HIT_ALPHA
        bits = ''.join('1' if band[:, c * HIT_CELL:(c + 1) * HIT_CELL].any() else '0' for c in range(cols))
        rows.append(format(int(bits[::-1], 2), 'x') if '1' in bits else '0')
    return cols, rows


sheets = sorted(p for p in source.glob('*.png'))
if len(sheets) != 26:
    raise SystemExit(f'Expected 26 approved sheets, found {len(sheets)} in {source}')
out_dir.mkdir(parents=True, exist_ok=True)
entries, report = {}, []
for sheet in sheets:
    code = species_code(sheet.stem)
    rgba = np.array(Image.open(sheet).convert('RGBA'))
    alpha = rgba[..., 3]
    core, count = label(alpha >= CORE_ALPHA)
    sizes = np.bincount(core.ravel())[1:]
    order = np.argsort(sizes)[::-1]
    big = order[:3]
    if count < 3 or sizes[big[2]] < 20 * max(1, sizes[order[3]] if count > 3 else 1):
        raise SystemExit(f'{sheet.name}: expected exactly three solid cluster bodies')
    centers = []
    for index in big:
        ys, xs = np.nonzero(core == index + 1)
        centers.append((xs.mean(), index, len(xs)))
    centers.sort()  # left -> right
    # The approved sheet layout (left -> right = Small, Medium, Large) is authoritative.
    # Solid area is only reported: Hydrangea's Large has less solid area than its Medium.
    if [c[2] for c in centers] != sorted(c[2] for c in centers):
        report.append(f'NOTE {code}: solid areas left->right {[int(c[2]) for c in centers]} are not increasing')
    seeds = np.zeros_like(core)
    for size_index, (_, index, _) in enumerate(centers):
        seeds[core == index + 1] = size_index + 1
    owned = grow(seeds, alpha > 0)                     # connected through visible pixels
    owned = grow(owned, np.ones_like(alpha, bool))     # detached fragments: nearest body
    owned[alpha == 0] = 0
    species = {}
    for size_index, size in enumerate(SIZES):
        mine = owned == size_index + 1
        ys, xs = np.nonzero(mine)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        crop = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        region = mine[y0:y1, x0:x1]
        crop[region] = rgba[y0:y1, x0:x1][region]
        name = f'{code.lower()}_{size.lower()}.png'
        Image.fromarray(crop, 'RGBA').save(out_dir / name, optimize=False)
        solid = crop[..., 3] >= CORE_ALPHA
        sy, sx = np.nonzero(solid)
        bottom = sy.max()
        foot = sx[sy >= bottom - max(4, int((bottom - sy.min()) * 0.06))]
        lower = sx[sy >= sy.min() + (bottom - sy.min()) * 0.65]
        cols, rows = hit_rows(crop[..., 3])
        clipped = bool(solid[0].any() or solid[-1].any() or solid[:, 0].any() or solid[:, -1].any())
        edge = bool(x0 == 0 or y0 == 0 or x1 == rgba.shape[1] or y1 == rgba.shape[0])
        species[size] = {
            'file': name, 'width': int(crop.shape[1]), 'height': int(crop.shape[0]),
            'anchorX': round(float(foot.mean()), 1), 'anchorY': int(bottom) + 1,
            'solid': [int(sx.min()), int(sy.min()), int(sx.max()) + 1, int(bottom) + 1],
            'baseHalfWidth': round(float((np.percentile(lower, 97) - np.percentile(lower, 3)) / 2), 1),
            'hitCell': HIT_CELL, 'hitCols': cols, 'hitRows': rows,
        }
        report.append(f'{code:24s} {size:6s} {crop.shape[1]:4d}x{crop.shape[0]:<4d} '
                      f'sheetEdge={edge} solidTouchesCrop={clipped}')
    entries[code] = {'sheet': sheet.name, 'sheetWidth': int(rgba.shape[1]),
                     'sheetHeight': int(rgba.shape[0]), 'clusters': species}

lines = ['// GENERATED by mobile/scripts/extractApprovedFlowerClusters.py. Do not edit by hand.',
         '// Source: Resources/flower-updated (26 approved sheets). Pixels copied unchanged.',
         "import type { ApprovedClusterArt } from './approvedFlowerClusters';",
         '',
         'export const APPROVED_CLUSTER_ART: Readonly<Record<string, Readonly<Record<\'SMALL\' | \'MEDIUM\' | \'LARGE\', ApprovedClusterArt>>>> = {']
for code, entry in entries.items():
    lines.append(f'  {code}: {{')
    for size, c in entry['clusters'].items():
        meta = {k: v for k, v in c.items() if k != 'file'}
        lines.append(f"    {size}: {{ source: require('../../../../assets/garden/flowers/clusters/{c['file']}'), "
                     f"...{json.dumps(meta, separators=(',', ':'))} }},")
    lines.append('  },')
lines.append('};')
lines.append('')
out_ts.write_text('\r\n'.join(lines), encoding='utf-8', newline='')
print('\n'.join(report))
print(f'{len(entries)} species, {sum(len(e["clusters"]) for e in entries.values())} clusters -> {out_dir}')
