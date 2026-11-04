// A small 3D book renderer on Skia. Everything here runs inside Reanimated worklets (UI thread on native).
// Flat faces are drawn as images under a 4×4 perspective matrix (exact perspective texturing); curved
// surfaces — the rounded spine, the gutter curve of the open pages and a turning sheet — are meshes.
import { BlendMode, BlurStyle, FilterMode, MipmapMode, Skia, TileMode, VertexMode, type SkCanvas, type SkImage } from '@shopify/react-native-skia';
import { apply, arcAngle, hingeZ, leafAngles, leafMeanAngle, LIGHT, mul, poseMatrix, project, projection, rotY, slabMatrix, SPEC, translate, type BookState, type Camera, type M4, type Pose, type V3 } from './math';

export * from './math';
export type BookTextures = {
  cover: SkImage | null; spine: SkImage | null; grain: SkImage | null; edges: SkImage | null; parchment: SkImage | null;
  left: SkImage | null; right: SkImage | null; tint: [number, number, number];
  /** Faces of the leaves in motion (state.turns order): the page each one carries on its front. */
  leaves?: (SkImage | null)[];
  /** Back of a turning leaf (defaults to `left`, the page it becomes once it lies on the left). */
  sheetBack?: SkImage | null;
  /** Backs of the leaves in motion, one per leaf (each falls back to `sheetBack`). */
  leafBacks?: (SkImage | null)[];
  /** Layer over `left` while leaning in or out on the left page (DrawOptions.leftMix). */
  leftPreview?: SkImage | null;
  /** Layers over `right` while leaning in or out: the preview arrangement (DrawOptions.previewMix) and the reading
   *  arrangement (DrawOptions.rightMix). They are never both strong at once, so text never doubles up. */
  rightPreview?: SkImage | null;
  rightNext?: SkImage | null;
  /** Sub-rectangle of `spine` holding the spine painting (the shelf uses the original atlas). */
  spineSrc?: [number, number, number, number] | null;
  /** Draw the front cover as tinted leather (shelf books show only a sliver of it). */
  plainCover?: boolean;
};
/** desaturate: 0..1 share of grey (locked future books); lift: brightens toward paper so grey never reads as dark. */
export type DrawOptions = { desaturate?: number; lift?: number; opacity?: number; layer?: 'base' | 'sheet' | 'all';
  /** A silk ribbon marker hanging from the tail of the page block (length in book units), coloured `ribbonTint`. */
  ribbon?: number; ribbonTint?: [number, number, number];
  /** 0..1: how much of `rightNext` / `rightPreview` shows on the right page. */
  rightMix?: number; previewMix?: number; leftMix?: number };

// ---------- drawing ----------
type Face = { kind: 'flat'; depth: number; m: M4; w: number; h: number; tex: string; src: number[] | null; shade: number; tint: number }
  | { kind: 'mesh'; depth: number; pts: number[]; uv: number[]; col: number[]; idx: number[]; tex: string; tint: number; px: boolean; alpha: number };

function sub(a: V3, b: V3): V3 { 'worklet'; return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: V3, b: V3): V3 { 'worklet'; return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: V3): V3 { 'worklet'; const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
function lambert(n: V3) { 'worklet'; return .5 + .58 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]); }
/** How the light shades a page lying flat facing the reader (the close-up page), so live views can match it. */
export function pageShade() { return lambert([0, 0, 1]); }

/** A flat textured face: origin o, edge vectors u (→ image x) and v (→ image y), all in book space. */
function flat(out: Face[], world: M4, cam: Camera, o: V3, u: V3, v: V3, tex: string, src: number[] | null, tint = 1, twoSided = false) {
  'worklet';
  const w = Math.hypot(u[0], u[1], u[2]), h = Math.hypot(v[0], v[1], v[2]);
  const n = norm(cross(u, v));
  const local: M4 = [u[0] / w, v[0] / h, n[0], o[0], u[1] / w, v[1] / h, n[1], o[1], u[2] / w, v[2] / h, n[2], o[2], 0, 0, 0, 1];
  const toWorld = mul(world, local);
  const centre = apply(toWorld, [w / 2, h / 2, 0]);
  const wn = norm(sub(apply(toWorld, [w / 2, h / 2, 1]), centre));
  const facing = wn[0] * (cam.cx - centre[0]) + wn[1] * (cam.cy - centre[1]) + wn[2] * (cam.d - centre[2]);
  if (facing <= 0 && !twoSided) return;
  out.push({ kind: 'flat', depth: centre[2], m: mul(projection(cam), toWorld), w, h, tex, src, shade: lambert(facing > 0 ? wn : [-wn[0], -wn[1], -wn[2]]), tint });
}

/** A curved surface given as a grid of book-space points (rows × cols) with texture coordinates in [0, 1]. */
function mesh(out: Face[], world: M4, cam: Camera, grid: V3[], rows: number, cols: number, uv: number[], tex: string, tint = 1, side: 1 | -1 | 0 = 0, shadow?: number[], flipNormal = false,
  outward: V3 | null = null, px = false) {
  'worklet';
  const wp: V3[] = grid.map(p => apply(world, p));
  // Solid faces (block sides) are culled whole, by their outward direction at the centre.
  let out3: V3 | null = null;
  if (outward) {
    const mid = grid[Math.floor(grid.length / 2)];
    const a0 = apply(world, mid), a1 = apply(world, [mid[0] + outward[0], mid[1] + outward[1], mid[2] + outward[2]]);
    out3 = norm(sub(a1, a0));
    if (out3[0] * (cam.cx - a0[0]) + out3[1] * (cam.cy - a0[1]) + out3[2] * (cam.d - a0[2]) <= 0) return;
  }
  const pts: number[] = [], col: number[] = [], idx: number[] = [], tex2: number[] = [];
  for (let i = 0; i < wp.length; i++) {
    const [x, y] = project(cam, wp[i]); pts.push(x, y);
    const r = Math.floor(i / cols), c = i % cols;
    const a = wp[r * cols + Math.min(cols - 1, c + 1)], b = wp[r * cols + Math.max(0, c - 1)];
    const e = wp[Math.min(rows - 1, r + 1) * cols + c], f = wp[Math.max(0, r - 1) * cols + c];
    let n = norm(cross(sub(a, b), sub(e, f)));
    if (flipNormal) n = [-n[0], -n[1], -n[2]];
    if (out3 && n[0] * out3[0] + n[1] * out3[1] + n[2] * out3[2] < 0) n = [-n[0], -n[1], -n[2]];
    // A one-sided surface is only drawn where it faces the reader, so light it from the reader's side.
    if (side !== 0) { const to: V3 = [cam.cx - wp[i][0], cam.cy - wp[i][1], cam.d - wp[i][2]]; if (n[0] * to[0] + n[1] * to[1] + n[2] * to[2] < 0) n = [-n[0], -n[1], -n[2]]; }
    let l = lambert(n) * (shadow ? shadow[i] : 1);
    l = Math.max(0, Math.min(1, l));
    col.push(l, l, l); tex2.push(uv[i * 2], uv[i * 2 + 1]);
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    // Keep only triangles that face the camera on the requested side (twoSided meshes pass side = 0).
    const tri = (i: number, j: number, k: number) => {
      const cr = (pts[j * 2] - pts[i * 2]) * (pts[k * 2 + 1] - pts[i * 2 + 1]) - (pts[j * 2 + 1] - pts[i * 2 + 1]) * (pts[k * 2] - pts[i * 2]);
      if (side === 0 || cr * side > 0) idx.push(i, j, k);
    };
    tri(a, b, e); tri(a, e, d);
  }
  if (!idx.length) return;
  // Sort by the surface's geometric centre (its four corners), not the vertex mean, which leans toward denser columns.
  const corner = (r: number, c: number) => wp[r * cols + c][2];
  const centre = (corner(0, 0) + corner(0, cols - 1) + corner(rows - 1, 0) + corner(rows - 1, cols - 1)) / 4;
  out.push({ kind: 'mesh', depth: centre, pts, uv: tex2, col, idx, tex, tint, px, alpha: 1 });
}

function smooth(t: number) { 'worklet'; const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); }

/** How far the top page sinks toward the binding at book-space x (0 at the outer part of the page). */
function dipAt(state: BookState, x: number) {
  'worklet';
  const { W, T, gap: g, gutter } = SPEC;
  return state.curl * .17 * T * (1 - smooth((x - g) / (W * gutter)));
}
/** Head or tail of a page stack: the paper layers, following the top page as it curves into the gutter.
 *  side 1: right stack (top at zh − dip, bottom on the back board); side −1: left stack in slab space. */
function blockEnd(out: Face[], world: M4, cam: Camera, state: BookState, zh: number, side: 1 | -1, y: number, ih: number) {
  'worklet';
  const { W, T, board: b, over: o, gap: g } = SPEC;
  const bottom = side === 1 ? -T / 2 + b : T / 2 - b;
  const thick = Math.abs(zh - bottom);
  if (thick < .5) return;
  const cols = 7, grid: V3[] = [], uv: number[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) {
    const t = c / (cols - 1), x = g + (W - o - g) * (t * t * .55 + t * .45);
    const top = zh - side * dipAt(state, x);
    grid.push([x, y, r === 0 ? top : bottom]);
    uv.push(x * ih / thick, r === 0 ? 0 : ih);
  }
  mesh(out, world, cam, grid, 2, cols, uv, 'edges', 1, 0, undefined, false, [0, y < SPEC.H / 2 ? -1 : 1, 0], true);
}

/** The top page of a stack. side 1: right stack (faces +z); side −1: left stack's inner face (faces −z before the slab turns). */
function pageSurface(out: Face[], world: M4, cam: Camera, state: BookState, zh: number, side: 1 | -1, rightMix = 0, previewMix = 0, leftMix = 0) {
  'worklet';
  const { H, W, T, over: o, gap: g, gutter } = SPEC;
  const cols = 9, rows = 2;
  const grid: V3[] = [], uv: number[] = [], shadow: number[] = [];
  const xs: number[] = [];
  for (let c = 0; c < cols; c++) { const t = c / (cols - 1); xs.push(g + (W - o - g) * (t * t * .55 + t * .45)); }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = xs[c], y = o + (H - 2 * o) * r / (rows - 1);
    const dip = dipAt(state, x);
    grid.push([x, y, zh - side * dip]);
    // Right page texture runs left→right; the left page is seen mirrored once the slab turns over.
    const u = (x - g) / (W - o - g);
    uv.push(side === 1 ? u : 1 - u, r / (rows - 1));
    // A turning leaf darkens the page it is leaving and the one it is about to cover, most toward the binding.
    let k = 1;
    for (const turn of state.turns) {
      const s = leafMeanAngle(turn), lift = Math.sin(s);
      const near = 1 - (x - g) / (W - o - g);
      if ((side === 1 && s < Math.PI / 2 + .3) || (side === -1 && s > Math.PI / 2 - .3)) k = Math.min(k, 1 - .34 * lift * (.3 + .7 * near));
    }
    shadow.push(k * (1 - .22 * (1 - smooth((x - g) / (W * gutter))) * state.curl));
  }
  mesh(out, world, cam, grid, rows, cols, uv, side === 1 ? 'right' : 'left', 1, 0, shadow, side === -1);
  const layers: [string, number][] = side === 1 ? [['rightPreview', previewMix], ['rightNext', rightMix]] : [['leftPreview', leftMix]];
  layers.forEach(([tex, alpha], i) => {
    if (alpha <= .001) return;
    mesh(out, world, cam, grid, rows, cols, uv, tex, 1, 0, shadow, side === -1);
    const layer = out[out.length - 1];
    if (layer && layer.kind === 'mesh' && layer.tex === tex) { layer.alpha = Math.min(1, alpha); layer.depth += .01 * (i + 1); }
  });
}

/** Rounded leather spine: a fixed-length arc between the back board's and the front board's spine edges. */
function spine(out: Face[], world: M4, slab: M4, cam: Camera, state: BookState) {
  'worklet';
  const { H, T, arc } = SPEC;
  const p: V3 = [0, 0, -T / 2];
  const q = apply(slabMatrix(state), [0, 0, T / 2]);
  const chord = Math.hypot(q[0] - p[0], q[2] - p[2]);
  // Opened past upright, a rounded back throws up flat under the gutter (its leather tucks out of sight).
  const flatten = smooth((state.phi - 1.6) / (Math.PI - 1.6));
  const length = arc * (1 - flatten) + Math.max(chord * 1.04, 2) * flatten;
  const theta = arcAngle(chord, length);
  const radius = length / theta;
  // Bulge away from the page block (toward −x when closed).
  const mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2;
  let nx = -(q[2] - p[2]) / chord, nz = (q[0] - p[0]) / chord;
  if (nx > 0 || (Math.abs(nx) < 1e-6 && nz > 0)) { nx = -nx; nz = -nz; }
  const sag = Math.min(radius * (1 - Math.cos(theta / 2)), radius * 2);
  const centreX = mx - nx * (radius - sag), centreZ = mz - nz * (radius - sag);
  const a0 = Math.atan2(p[2] - centreZ, p[0] - centreX), a1 = Math.atan2(q[2] - centreZ, q[0] - centreX);
  let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  if (Math.abs(da) < theta * .5) da = da > 0 ? theta : -theta;
  const cols = 10, rows = 2, grid: V3[] = [], uv: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const t = c / (cols - 1), a = a0 + da * t;
    grid.push([centreX + radius * Math.cos(a), H * r / (rows - 1), centreZ + radius * Math.sin(a)]);
    uv.push(t, r / (rows - 1));
  }
  mesh(out, world, cam, grid, rows, cols, uv, 'spine', 1, 0);
  // Head and tail caps of the spine (seen from above on the shelf).
  for (const y of [0, H]) {
    const capGrid: V3[] = [], capUv: number[] = [];
    for (let c = 0; c < cols; c++) { const g = grid[c]; capGrid.push([g[0], y, g[2]]); capUv.push(.5, .5); }
    for (let c = 0; c < cols; c++) { const g = grid[c]; capGrid.push([Math.max(0, g[0] + 12), y, g[2] * .92]); capUv.push(.5, .5); }
    mesh(out, world, cam, capGrid, 2, cols, capUv, 'leather', .55, 0);
  }
}

/** One turning leaf (see leafAngles): a bending sheet hinged at the gutter, built as column strips so the painter's
 *  sort orders its curled parts correctly, front and back textured separately, with its paper edge along the free side. */
function leaf(out: Face[], world: M4, cam: Camera, state: BookState, zh: number, turn: { p: number; dir: 1 | -1 }, k: number, n: number, ih: number) {
  'worklet';
  const { H, over: o, gap: g, W, gutter } = SPEC;
  const len = W - o - g, segs = 21, step = len / segs;
  // Hinged at the spine like the page block: a short stub to the gutter, then the page itself. Its landed angle is
  // the open boards' angle, so a leaf at rest coincides with the page it lies on.
  const opened = state.phi / Math.PI;
  const angles = leafAngles(turn.p, turn.dir, segs).map(a => a * opened);
  // Leaves of a riffle rest a sheet apart: on the page they leave the first to go lies on top; on the page they
  // reach, each one lands on the one before (so the last leaf to land is the page left showing).
  const lift = 1.4 + (turn.p < .5 ? n - 1 - k : k) * .7;
  // At rest (just before lifting, just after landing) the leaf follows its page into the gutter and takes its shading.
  const rest = Math.max(1 - smooth(turn.p / .14), smooth((turn.p - .86) / .14));
  const pts: [number, number, number][] = []; // x, z, arc length from the spine
  let x = 0, z = zh + lift, sArc = 0;
  pts.push([x, z, 0]);
  x += Math.cos(angles[0]) * g; z += Math.sin(angles[0]) * g; sArc = g; pts.push([x, z, sArc]);
  for (let c = 0; c < segs; c++) { x += Math.cos(angles[c]) * step; z += Math.sin(angles[c]) * step; sArc += step; pts.push([x, z, sArc]); }
  const line = pts.map(([px, pz, sa]) => [px, pz - dipAt(state, Math.max(g, sa)) * rest, sa] as [number, number, number]);
  const shade = line.map(([, , sa]) => 1 - .22 * (1 - smooth((Math.max(g, sa) - g) / (W * gutter))) * state.curl * rest);
  const front = 'leaf' + k;
  for (let c = 0; c < line.length - 1; c++) {
    const grid: V3[] = [], uv: number[] = [], back: number[] = [], sh: number[] = [];
    for (let r = 0; r < 2; r++) for (let cc = c; cc <= c + 1; cc++) {
      grid.push([line[cc][0], o + (H - 2 * o) * r, line[cc][1]]);
      const u = Math.max(0, (line[cc][2] - g) / len);
      uv.push(u, r); back.push(1 - u, r); sh.push(shade[cc]);
    }
    mesh(out, world, cam, grid, 2, 2, uv, front, 1, 1, sh);
    mesh(out, world, cam, grid, 2, 2, back, 'back' + k, 1, -1, sh);
  }
  // The paper's thickness along the free edge, catching light when the leaf stands edge-on.
  const end = line[line.length - 1], a = angles[segs - 1], t = 3.2;
  const nx = -Math.sin(a) * t, nz = Math.cos(a) * t;
  const edge: V3[] = [[end[0], o, end[1]], [end[0] - nx, o, end[1] - nz], [end[0], H - o, end[1]], [end[0] - nx, H - o, end[1] - nz]];
  const run = (H - 2 * o) * ih / 120;
  if (rest < .99) mesh(out, world, cam, edge, 2, 2, [0, 0, 0, ih * .15, run, 0, run, ih * .15], 'edges', 1.1, 0, undefined, false, null, true);
}

// Worklet functions become constants once compiled (no hoisting): helpers must be defined before their callers.
/** Builds every visible face of the book for a pose and state. */
export function bookFaces(cam: Camera, pose: Pose, state: BookState, layer: 'base' | 'sheet' | 'all' = 'all', ih = 96, ribbon = 0, rightMix = 0, previewMix = 0, leftMix = 0): Face[] {
  'worklet';
  const { H, W, T, board: b, over: o, gap: g } = SPEC;
  const world = poseMatrix(pose);
  const slab = mul(world, slabMatrix(state));
  const zh = hingeZ(state);
  const out: Face[] = [];
  if (layer !== 'sheet') {
    // Back board (fixed) — outer face is the back cover.
    flat(out, world, cam, [W, 0, -T / 2], [-W, 0, 0], [0, H, 0], 'leather', null, .9);
    flat(out, world, cam, [0, 0, -T / 2 + b], [W, 0, 0], [0, H, 0], 'leather', null, .8);
    flat(out, world, cam, [W, 0, -T / 2 + b], [0, 0, -b], [0, H, 0], 'leather', null, .78);
    flat(out, world, cam, [0, 0, -T / 2], [W, 0, 0], [0, 0, b], 'leather', null, .78);
    flat(out, world, cam, [0, H, -T / 2 + b], [W, 0, 0], [0, 0, -b], 'leather', null, .78);
    // Right page block: head, tail and fore-edge show the layered paper.
    const z0 = -T / 2 + b;
    flat(out, world, cam, [W - o, o, z0], [0, H - 2 * o, 0], [0, 0, zh - z0], 'edges', null);
    blockEnd(out, world, cam, state, zh, 1, o, ih);
    blockEnd(out, world, cam, state, zh, 1, H - o, ih);
    // Right page surface (curves into the gutter once the book opens); hidden under the cover while closed.
    if (state.phi > .02) pageSurface(out, world, cam, state, zh, 1, rightMix, previewMix);
    // Front board on the left half — outer face carries the cover.
    flat(out, slab, cam, [0, 0, T / 2], [W, 0, 0], [0, H, 0], 'cover', null);
    // Inside of the front board: the leather turned in around the edges, the endpaper pasted down within.
    flat(out, slab, cam, [W, 0, T / 2 - b], [-W, 0, 0], [0, H, 0], 'leather', null, .8);
    flat(out, slab, cam, [W - 20, 26, T / 2 - b - .6], [-(W - 40), 0, 0], [0, H - 52, 0], 'endpaper', null, .92);
    flat(out, slab, cam, [W, 0, T / 2], [0, 0, -b], [0, H, 0], 'leather', null, .78);
    flat(out, slab, cam, [0, 0, T / 2 - b], [W, 0, 0], [0, 0, b], 'leather', null, .78);
    flat(out, slab, cam, [0, H, T / 2], [W, 0, 0], [0, 0, -b], 'leather', null, .78);
    // Left page block (pages already turned onto the front board).
    const z1 = T / 2 - b;
    if (z1 - zh > .5) {
      flat(out, slab, cam, [W - o, o, zh], [0, H - 2 * o, 0], [0, 0, z1 - zh], 'edges', null);
      blockEnd(out, slab, cam, state, zh, -1, o, ih);
      blockEnd(out, slab, cam, state, zh, -1, H - o, ih);
    }
    // No pages on the left until the block parts: the endpaper shows.
    if (state.phi > .02 && state.split > .004) pageSurface(out, slab, cam, state, zh, -1, 0, 0, leftMix);
    spine(out, world, slab, cam, state);
  }
  // Leaves in a turn are drawn from rest (p = 0) to landed (p = 1), so handing a page over never shows a gap.
  if (layer !== 'base') state.turns.forEach((turn, k) => leaf(out, world, cam, state, zh, turn, k, state.turns.length, ih));
  // The ribbon lies between the leaves and falls out past the tail.
  if (layer !== 'sheet' && ribbon > 1) flat(out, world, cam, [W * .58, H - 6, zh - 1.5], [26, 0, 0], [0, ribbon + 6, 0], 'ribbon', null, 1, true);
  return out;
}

// ---------- paint ----------
function imageFor(t: BookTextures, tex: string): SkImage | null {
  'worklet';
  switch (tex) {
    case 'cover': return t.plainCover ? t.grain : t.cover; case 'spine': return t.spine; case 'edges': return t.edges;
    case 'leather': return t.grain; case 'endpaper': return t.parchment; case 'left': return t.left || t.parchment;
    case 'right': return t.right || t.parchment; case 'rightNext': return t.rightNext || null; case 'rightPreview': return t.rightPreview || null;
    case 'leaf0': return (t.leaves && t.leaves[0]) || t.parchment; case 'leaf1': return (t.leaves && t.leaves[1]) || t.parchment;
    case 'leaf2': return (t.leaves && t.leaves[2]) || t.parchment;
    case 'sheetBack': return t.sheetBack || t.left || t.parchment; case 'ribbon': return t.grain;
    case 'back0': case 'back1': case 'back2': return (t.leafBacks && t.leafBacks[Number(tex.slice(4))]) || t.sheetBack || t.left || t.parchment;
    case 'leftPreview': return t.leftPreview || null;
    default: return t.parchment;
  }
}

function rgb(r: number, g: number, b: number) {
  'worklet';
  return Float32Array.of(Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b)), 1);
}

/** Colour matrix mixing toward luminance grey by `k`, then lifting toward warm paper by `lift`. */
export function desaturation(k: number, lift: number) {
  'worklet';
  const l = [.2126, .7152, .0722];
  const m: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) m.push(((1 - k) * (r === c ? 1 : 0) + k * l[c]) * (1 - lift));
    m.push(0, lift * [.93, .9, .84][r]);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
}

export function drawBook(canvas: SkCanvas, cam: Camera, pose: Pose, state: BookState, tex: BookTextures, opts: DrawOptions = {}) {
  'worklet';
  const faces = bookFaces(cam, pose, state, opts.layer || 'all', tex.edges ? tex.edges.height() : 96, opts.ribbon || 0, tex.rightNext ? opts.rightMix || 0 : 0, tex.rightPreview ? opts.previewMix || 0 : 0, tex.leftPreview ? opts.leftMix || 0 : 0);
  faces.sort((a, b) => a.depth - b.depth);
  const [tr, tg, tb] = tex.tint;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  if (opts.opacity !== undefined && opts.opacity < 1) paint.setAlphaf(Math.max(0, opts.opacity));
  const gray = opts.desaturate ? Skia.ColorFilter.MakeMatrix(desaturation(opts.desaturate, opts.lift || 0)) : null;
  for (const f of faces) {
    const img = imageFor(tex, f.tex);
    if (!img) continue;
    const iw = img.width(), ih = img.height();
    const leather = f.tex === 'leather' || f.tex === 'ribbon' || (f.tex === 'cover' && !!tex.plainCover);
    // Endpaper: the same paper as the pages, a shade deeper, pasted inside the board.
    const tint: [number, number, number] = f.tex === 'endpaper' ? [.9, .83, .7] : f.tex === 'ribbon' ? opts.ribbonTint || [.62, .2, .17] : leather ? [tr, tg, tb] : [1, 1, 1];
    if (f.kind === 'flat') {
      const s = f.shade * f.tint;
      const mod = Skia.ColorFilter.MakeBlend(rgb(s * tint[0], s * tint[1], s * tint[2]), BlendMode.Modulate);
      paint.setColorFilter(gray ? Skia.ColorFilter.MakeCompose(gray, mod) : mod);
      canvas.save();
      canvas.concat(f.m);
      if (leather || f.tex === 'edges') {
        // Tiled materials: leather grain repeats every 256 book units; the paper layers of the page edges
        // fill the face's thickness (local y) and repeat along its length (local x).
        const local = Skia.Matrix();
        if (leather) local.scale(.5, .5);
        else local.scale(f.h / ih, f.h / ih);
        const shader = img.makeShaderOptions(TileMode.Repeat, TileMode.Repeat, FilterMode.Linear, MipmapMode.Linear, local);
        local.dispose();
        paint.setShader(shader);
        canvas.drawRect(Skia.XYWHRect(0, 0, f.w, f.h), paint);
        paint.setShader(null);
      } else {
        canvas.drawImageRectOptions(img, Skia.XYWHRect(0, 0, iw, ih), Skia.XYWHRect(0, 0, f.w, f.h), FilterMode.Linear, MipmapMode.Linear, paint);
      }
      canvas.restore();
    } else {
      const uv: { x: number; y: number }[] = [], pts: { x: number; y: number }[] = [], cols: Float32Array[] = [];
      for (let i = 0; i < f.pts.length / 2; i++) {
        pts.push({ x: f.pts[i * 2], y: f.pts[i * 2 + 1] });
        const src = f.tex === 'spine' && tex.spineSrc ? tex.spineSrc : null;
        uv.push(f.px ? { x: f.uv[i * 2], y: f.uv[i * 2 + 1] } : src ? { x: src[0] + f.uv[i * 2] * src[2], y: src[1] + f.uv[i * 2 + 1] * src[3] } : { x: f.uv[i * 2] * iw, y: f.uv[i * 2 + 1] * ih });
        const l = f.col[i * 3] * f.tint;
        cols.push(rgb(l * tint[0], l * tint[1], l * tint[2]));
      }
      const verts = Skia.MakeVertices(VertexMode.Triangles, pts, uv, cols, f.idx);
      paint.setColorFilter(gray);
      const base = opts.opacity !== undefined && opts.opacity < 1 ? Math.max(0, opts.opacity) : 1;
      paint.setAlphaf(base * f.alpha);
      const tile = leather || f.tex === 'edges' ? TileMode.Repeat : TileMode.Clamp;
      paint.setShader(img.makeShaderOptions(tile, leather ? TileMode.Repeat : TileMode.Clamp, FilterMode.Linear, MipmapMode.Linear));
      canvas.drawVertices(verts, BlendMode.Modulate, paint);
      paint.setShader(null);
      // The recording keeps its own reference; release this handle now (web handles are not finalized).
      verts.dispose();
    }
  }
}


/** The book's shadow on the desk, from its projected silhouette (the convex hull of its corners): a broad soft shadow
 *  that spreads and falls further from the book the higher it is (`lift` 1), and a tight contact shadow along its
 *  edges that firms up as it touches down (`lift` 0). Light comes from the window behind and above, so both fall
 *  toward the viewer. */
export function drawFloatShadow(canvas: SkCanvas, cam: Camera, pose: Pose, state: BookState, alpha: number, lift = 1) {
  'worklet';
  if (alpha <= .01) return;
  const { W, H, T } = SPEC;
  const world = poseMatrix(pose);
  const xs = state.phi > 1.2 ? [-W, W] : [0, W];
  const pts: number[][] = [];
  for (const x of xs) for (const y of [0, H]) for (const z of [-T / 2, T / 2]) pts.push(project(cam, apply(world, [x, y, z])));
  // Convex hull (monotone chain) of the projected corners.
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [], upper: number[][] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of hull) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const size = Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)));
  const l = Math.max(0, Math.min(1, lift));
  const shape = (dx: number, dy: number) => {
    const path = Skia.Path.Make();
    hull.forEach((p, i) => (i === 0 ? path.moveTo(p[0] + dx, p[1] + dy) : path.lineTo(p[0] + dx, p[1] + dy)));
    path.close();
    return path;
  };
  const soft = Skia.Paint();
  soft.setAntiAlias(true);
  soft.setColor(Skia.Color('#0B0603'));
  soft.setAlphaf(alpha * (.46 - .12 * l));
  soft.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, size * (.02 + .035 * l), true));
  canvas.drawPath(shape(size * (.01 + .02 * l), size * (.018 + .07 * l)), soft);
  const touch = (1 - l) * (1 - l);
  if (touch > .01) {
    const contact = Skia.Paint();
    contact.setAntiAlias(true);
    contact.setColor(Skia.Color('#0B0603'));
    contact.setAlphaf(alpha * .62 * touch);
    contact.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(1.5, size * .006), true));
    canvas.drawPath(shape(size * .004, size * .01), contact);
  }
}
