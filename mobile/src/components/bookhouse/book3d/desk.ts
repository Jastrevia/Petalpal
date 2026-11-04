// The camera pull-back from the bookshelf to the writing desk. Pure worklets (no Skia, no React): unit-tested in Node,
// run on the UI thread on native.
//
// The bookshelf is one rigid picture: its own layout (slices of interior.png, books, year rail, title) is computed
// once, at rest, and never changes. Pulling the camera back applies a single uniform scale to that whole picture
// about the top centre of the shelf, so every proportion and relative position inside it is kept. The desk is a
// separate foreground layer (continuous-structure.png: the same treehouse painted with a chair-free desk), which rises
// into the frame from below as the shelf recedes, its top edge staying just under the shelf's bottom edge.

/** Measurements on interior.png (1024 × 1536). */
export const SHELF = {
  top: 245, bottom: 976, // first compartment top → last plank's front face
  x0: 10, x1: 925, pillarEdge: 118, postEdge: 905, decorLeft: 214, decorRight: 812, pillar: [16, 118] as const,
  // Compartment ceiling and the line where a book's base rests on each plank's top surface.
  rows: [{ top: 248, base: 397 }, { top: 412, base: 579 }, { top: 600, base: 773 }, { top: 790, base: 962 }],
  carvings: [{ top: 265, bottom: 352 }, { top: 472, bottom: 552 }, { top: 620, bottom: 736 }, { top: 815, bottom: 886 }, { top: 997, bottom: 1082 }],
} as const;
/** continuous-structure.png (836 × 1881): pixel = (interior x + 2, interior y) × 0.815 (registered on the shelves).
 *  `top` is just under its lowest plank, `edge` the desk's back edge, both in its own pixels. */
export const DESK_ART = { width: 836, height: 1881, k: .815, dx: 2, top: 930, edge: 1032 };
/** The desk art's height above its back edge (the strip of backboard, lantern and books behind the desk), in its own pixels. */
export const DESK_BAND = DESK_ART.edge - DESK_ART.top;

/** Scene coordinates (the shelf's scroll content), except `deskTop1`, which is window y. */
export type PullGeometry = {
  /** Scale of the whole shelf once pulled back (1 at rest). */
  k1: number;
  /** The fixed point of the pull-back: the shelf's top centre (scene coordinates, relative to the shelf's left edge). */
  ax: number; ay: number;
  /** Scene height of the shelf picture at rest, and the scroll offset while the book is open. */
  sceneHeight: number; scrollY: number;
  /** Window y of the desk art's top row once pulled back, and its scale (window px per desk-art px). */
  deskTop1: number; deskScale: number;
};
/** `ty` (the shelf's translation) is always 0 here: this pull-back only scales the shelf about its top centre. */
export type PullState = { k: number; ty: number; deskTop: number };

function clamp01(t: number) { 'worklet'; return Math.max(0, Math.min(1, t)); }
function mix(a: number, b: number, t: number) { 'worklet'; return a + (b - a) * t; }
export function easePull(t: number) { 'worklet'; const x = clamp01(t); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

/** The shelf's composite (the same recipe as TreehouseShelf's shelfLayout), for tests and measurements. */
export function compositeSlices(width: number, scale: number) {
  const { x0, x1, pillarEdge, postEdge, decorLeft, decorRight } = SHELF;
  const span = Math.min(width / scale, x1 - x0);
  const a = (decorLeft + decorRight + span - (x1 - x0)) / 2;
  const c = decorLeft + decorRight - a;
  const s1to = (a - x0) * scale;
  const slices = [
    { sx: x0, from: 0, to: (pillarEdge - x0) * scale },
    { sx: pillarEdge, from: (pillarEdge - x0) * scale, to: s1to },
    { sx: c, from: s1to, to: s1to + (postEdge - c) * scale },
  ];
  slices.push({ sx: postEdge, from: slices[2].to, to: width });
  return { slices, seam: s1to };
}

/** Pulled-back target for a window: the desk's back edge lies just above the open journal (`deskEdge`, window y, from
 *  the book layout); the shelf's last plank sits just behind the top of the desk art. */
export function pullTarget(rest: { width: number; cabinetBottom: number; sceneHeight: number }, viewWidth: number, deskEdge: number, scrollY: number): PullGeometry {
  // The desk art fills the window's width.
  const deskScale = viewWidth / DESK_ART.width;
  const deskTop1 = deskEdge - DESK_BAND * deskScale;
  const k1 = Math.min(1, Math.max(.25, (deskTop1 + scrollY + 10 * deskScale) / rest.cabinetBottom));
  return { k1, ax: rest.width / 2, ay: 0, sceneHeight: rest.sceneHeight, scrollY, deskTop1, deskScale };
}

/** p: 0 at the shelf → 1 pulled back to the desk. */
export function pullAt(p: number, g: PullGeometry): PullState {
  'worklet';
  const e = easePull(p);
  const k = mix(1, g.k1, e);
  // The desk's top edge stays just under the shelf's bottom edge (window y), overlapping it more as it settles.
  const shelfBottom = g.ay + (g.sceneHeight - g.ay) * k - g.scrollY;
  const shelfBottom1 = g.ay + (g.sceneHeight - g.ay) * g.k1 - g.scrollY;
  return { k, ty: 0, deskTop: shelfBottom - (shelfBottom1 - g.deskTop1) * e };
}

/** The desk's own extra scale during the pull-back (Treehouse scene): it is `depth` nearer the camera than the shelf,
 *  so it starts that much larger and shrinks with the camera's recession, reaching exactly 1 when the camera stops. */
export function deskParallax(s: PullState, g: PullGeometry, depth: number) {
  'worklet';
  if (depth <= 0 || g.k1 >= 1) return 1;
  const e = Math.max(0, Math.min(1, (1 - s.k) / (1 - g.k1)));
  return 1 + depth * (1 - e);
}

/** Where a point of the shelf picture at rest (scene coordinates relative to the shelf's left edge) is at `s`. */
export function pullPoint(x: number, y: number, s: PullState, g: PullGeometry): [number, number] {
  'worklet';
  return [g.ax + (x - g.ax) * s.k, g.ay + (y - g.ay) * s.k];
}

/** A shelf slot (window coordinates, with the shelf camera) where it is at a point of the pull-back: the same uniform
 *  scale as the rest of the shelf, so the book leaves exactly the slot the shelf shows. `rootX` is the shelf's left
 *  edge in the window, `scrollY` the shelf's scroll offset. */
export function pullOrigin(o: { cam: { cx: number; cy: number; d: number }; x: number; bottom: number; height: number }, s: PullState | null, g: PullGeometry | null, rootX: number, scrollY: number) {
  'worklet';
  if (!s || !g) return o;
  const f = (x: number, y: number) => { const q = pullPoint(x - rootX, y + scrollY, s, g); return [q[0] + rootX, q[1] - scrollY]; };
  const c = f(o.cam.cx, o.cam.cy), b = f(o.x, o.bottom);
  return { cam: { cx: c[0], cy: c[1], d: o.cam.d * s.k }, x: b[0], bottom: b[1], height: o.height * s.k };
}
