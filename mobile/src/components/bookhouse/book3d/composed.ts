// The composed Treehouse scene (book3d/scene.ts): the camera pulls back from the bookshelf to the writing desk the way
// the bookshelf's own painting frames it. Pure worklets, unit-tested in Node.
//
//  - The shelf stays one rigid picture: a single uniform scale k and a translation (tx, ty), nothing else.
//  - The room around it is interior.png itself, drawn exactly as the shelf draws it (the same slices, the same scale and
//    registration), continued above the shelf (the arches, the two hanging lanterns, the garden windows) and beyond its
//    right end (the ladder, the trunk and its window) up to the painting's edge. Pulled back, the painting fills the
//    window's width, its carved pillar at the left edge as in the painting.
//  - The writing desk is continuous-structure.png's chair-free desk, sliced the same way and at the painting's own scale
//    (assets/bookhouse/composed/desk-cutout.webp: only the objects standing on it are kept above its back edge), standing
//    in front of the bookcase: the shelf continues down behind it, so no edge of the shelf picture is ever seen.
import { SHELF } from './desk';
import { bookLayout, type Insets } from './motion';

export const PAINTING = { width: 1024, height: 1536 };
/** Painting rows the room draws (below them the desk always covers the window). */
export const ROOM_ROWS = 1110;
/** continuous-structure.png → interior.png: cs = (x + 2) · K, y · K. */
export const CS = { K: .815, dx: 2, width: 836, height: 1881 };
/** desk-cutout.webp: continuous-structure.png rows `top`..1881, the desk top's back edge at row `edge`; its top carries
 *  on `pad` px past each end of the painting with its own boards (scripts/buildTreehouseDesk.py). */
export const DESK_CUT = { top: 860, edge: 1031, pad: 160 };
/** The previous composition's desk (desk-cutout-v1.webp): no board extension; scaled up to span the window. */
export const DESK_CUT_V1 = { top: 860, edge: 1031, pad: 0 };
/** The nearer desk starts this much larger and settles to the painting's scale (a subtle parallax). */
export const DESK_DEPTH = .12;

export type Slice = { sx: number; from: number; to: number };
export type DeskShelf = { width: number; scale: number; slices: Slice[]; x: number; cabinetTop: number; cabinetBottom: number; railBottom: number };
/** The shelf at rest (shelf-local coordinates) and where it sits in the window. */
export type ComposedRest = { width: number; scale: number; cabinetTop: number; sceneHeight: number; rootX: number; slices: Slice[] };
export type ComposedGeometry = {
  k1: number; tx1: number; ty1: number;
  /** The shelf's transform origin (shelf-local: its top centre) and the scroll offset while the book is open. */
  ax: number; ay: number; scrollY: number;
  rest: ComposedRest;
  /** Painting x where the shelf's last slice ends (the room continues from there), and the window size. */
  xEnd: number; view: { width: number; height: number };
  /** Window y of the desk top's back edge once pulled back (the open journal lies just in front of it). */
  deskEdge: number;
  /** 'portrait': only the original bookshelf above and the writing desk below, in the app's portrait column; no
   *  room around them (a plain dark ground). 'v2': the desk at the painting's own scale, its boards carried on to the window's edges, and a dark wooden wall
   *  beyond the room on wide windows. 'v1' (fallback): the desk scaled up to span the window. */
  variant: 'v1' | 'v2' | 'portrait' | 'reference';
  /** Portrait: the bookcase as seen from the desk once pulled back — the same painting at the same scale as the
   *  receding shelf, laid out as wide as the column (shelfLayout with `fill`), and where it stands in the window.
   *  The desk below is cut and placed to match it, so their outer edges line up. */
  deskShelf?: DeskShelf;
};
export type ComposedState = { k: number; tx: number; ty: number; e: number };

function clamp01(t: number) { 'worklet'; return Math.max(0, Math.min(1, t)); }
function mix(a: number, b: number, t: number) { 'worklet'; return a + (b - a) * t; }
function easePull(t: number) { 'worklet'; const x = clamp01(t); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

/** Where the shelf's last slice ends in the painting. */
export function sliceEnd(rest: { width: number; scale: number; slices: Slice[] }) {
  const last = rest.slices[rest.slices.length - 1];
  return last.sx + (rest.width - last.from) / rest.scale;
}

/** The bookcase's last plank, just below its front face (painting y): it rests on the desk's back edge. */
export const BOTTOM_ROW = 985;
/** The side walls (assets/bookhouse/walls, the painting's own continuation past both its edges): wall-left.webp runs
 *  from painting x SHELF.x0 − 170 to SHELF.x0, wall-right.webp from 905 to 1123. Both use the painting's rows 0..1300. */
export const WALLS = { left: 170, rightFrom: 905, rightTo: 1123, rows: 1300 };

/** The pulled-back composition for a window, framed on what matters there: the title sign, all four rows of books and
 *  the open journal. `deskEdge`: the desk's back edge (window y, just above the open journal's head); `title.top`: the
 *  sign's top (shelf-local y) and `title.safeTop`: the window y it sits at (below the top controls and safe area).
 *  The camera pulls back (one uniform scale, centred) until the whole bookcase, sign to bottom plank, fits between the
 *  two, so the bottom plank rests on the desk; the canopy above the sign is left out of frame. The room around the
 *  bookcase is the painting itself, carried on past its edges by the side walls; the desk, nearer the camera, spans the
 *  window's width. */
export function composedTarget(rest: ComposedRest, view: { width: number; height: number }, deskEdge: number, scrollY: number,
  title: { top: number; safeTop: number }, variant: 'v1' | 'v2' | 'portrait' | 'reference' = 'v2'): ComposedGeometry {
  const xEnd = sliceEnd(rest);
  // (The reference scene shows a little of the compartment under the last row, as its painting does.)
  const yBottom = rest.cabinetTop + ((variant === 'reference' ? REF.bottomRow : BOTTOM_ROW) - SHELF.top) * rest.scale;      // shelf-local
  const k1 = Math.max(.15, Math.min(1, (deskEdge - title.safeTop) / (yBottom - title.top)));
  // Shelf-local point (x, y) → window: rootX + ax + (x − ax)·k + tx, ay + (y − ay)·k + ty − scrollY. The shelf stays
  // centred (it is centred at rest); its sign arrives at safeTop.
  const ax = rest.width / 2, ay = 0;
  const tx1 = 0;
  const ty1 = title.safeTop + scrollY - title.top * k1;
  return { k1, tx1, ty1, ax, ay, scrollY, rest, xEnd, view, deskEdge, variant };
}

/** The desk's width in continuous-structure px: sliced exactly like the shelf (its left part up to the shelf's join,
 *  then from the join's other side to the painting's right edge). */
export function deskWidth(rest: { width: number; scale: number; slices: Slice[] }) {
  'worklet';
  const csx = (x: number) => (x + CS.dx) * CS.K;
  const r = rest.slices;
  const a = r[1].sx + (r[1].to - r[1].from) / rest.scale;
  return csx(a) - csx(r[0].sx) + CS.width - csx(r[2].sx);
}

/** Where the desk-view bookcase stands (portrait): the receding shelf's cabinet top and bottom and its year rail's
 *  bottom, once pulled back (window y), so the two pictures share rows, scale and centre. `layout` is the result of
 *  shelfLayout(column, cabinetTop, cabinetBottom, true) for those values. */
export function deskShelfFrame(g: ComposedGeometry, rest: { cabinetTop: number; cabinetBottom: number; railBottom: number }) {
  const end = composedAt(1, g);
  const y = (v: number) => composedPoint(0, v, end, g)[1];
  return { cabinetTop: y(rest.cabinetTop), cabinetBottom: y(rest.cabinetBottom), railBottom: y(rest.railBottom) };
}

/** Portrait: room kept under the open journal's date controls. */
export const PORTRAIT_FOOTER = 46;

/** The portrait scene's column (window px): the width the bookcase, the desk and the open journal all share once the
 *  camera has pulled back. The bookcase is the painting itself at the scale that fits its four rows above the desk, so
 *  it is only so wide (SHELF.x1 − x0 painting px at that scale); a narrower column makes a smaller journal, a lower
 *  desk and so a larger bookcase. This is the widest column (up to the window's, 560 at most) that the bookcase
 *  still fills: phones get the whole width; wider windows a centred column, never a bookcase narrower than its desk. */
export function portraitColumn(view: { width: number; height: number }, insets: Insets, rest: ComposedRest, title: { top: number; safeTop: number }) {
  const full = Math.min(view.width, 560);
  const fills = (c: number) => {
    const L = bookLayout(view.width, view.height, insets, 0, c, PORTRAIT_FOOTER);
    const g = composedTarget(rest, view, L.deskEdge, 0, title, 'portrait');
    return (SHELF.x1 - SHELF.x0) * rest.scale * g.k1 >= c - .01;
  };
  if (fills(full)) return full;
  let lo = Math.min(160, full), hi = full;
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (fills(mid)) lo = mid; else hi = mid; }
  return Math.floor(lo);
}

/** How far the desk-view bookcase has faded in at `s` (portrait): it takes over as the camera settles. The illustrated
 *  scene's bookcase takes over later and more quickly — its book labels are drawn larger than the receding shelf's (to
 *  stay readable) and its pillar stands elsewhere, so the two are only shown together while the camera is nearly
 *  still. */
export function deskShelfFade(s: ComposedState, g?: ComposedGeometry) {
  'worklet';
  return g && g.variant === 'reference' ? clamp01((s.e - .72) / .16) : clamp01((s.e - .3) / .5);
}

/** p: 0 at the shelf → 1 pulled back to the desk. */
export function composedAt(p: number, g: ComposedGeometry): ComposedState {
  'worklet';
  const e = easePull(p);
  return { k: mix(1, g.k1, e), tx: g.tx1 * e, ty: g.ty1 * e, e };
}

/** A shelf-local point → window. */
export function composedPoint(x: number, y: number, s: ComposedState, g: ComposedGeometry): [number, number] {
  'worklet';
  return [g.rest.rootX + g.ax + (x - g.ax) * s.k + s.tx, g.ay + (y - g.ay) * s.k + s.ty - g.scrollY];
}

/** Window y of a painting row, and window x of the shelf's left edge, at `s`. */
export function paintingRowY(row: number, s: ComposedState, g: ComposedGeometry) {
  'worklet';
  return composedPoint(0, g.rest.cabinetTop + (row - SHELF.top) * g.rest.scale, s, g)[1];
}

/** The desk at `s`: its scale (window px per continuous-structure px), the window x of the painting's left edge on it
 *  and y of its back edge. Once pulled back it is at the painting's own scale and registration (continuous-structure is
 *  the same treehouse with its desk), so its lantern and teacup keep the size the painter gave them beside the shelf;
 *  nearer the camera, it starts a little larger and settles. It rises with the camera: its edge never above the
 *  painting's row ROOM_ROWS (so nothing below the room ever shows), arriving at `deskEdge`. */
export function composedDesk(s: ComposedState, g: ComposedGeometry) {
  'worklet';
  const sh = g.deskShelf || g.rest;
  const width = deskWidth(sh);
  const own = g.rest.scale * g.k1 / CS.K;
  const final = g.variant === 'v1' ? Math.max(own, g.view.width / width) : own;
  const m = 1 + DESK_DEPTH * (1 - s.e);
  const scale = final * m;
  const rise = 1 - Math.pow(1 - clamp01((s.e - .05) / .9), 2);
  const edge = Math.min(mix(g.view.height + 40 + (DESK_CUT.edge - DESK_CUT.top) * scale, g.deskEdge, rise), paintingRowY(ROOM_ROWS, s, g));
  // v2: under the shelf's left end once pulled back (as the painting registers them), about the window's centre on the
  // way. v1: centred on the window.
  const x1 = g.deskShelf ? g.deskShelf.x : composedPoint(0, 0, { k: g.k1, tx: g.tx1, ty: g.ty1, e: 1 }, g)[0];
  const cx = g.view.width / 2;
  const x = g.variant === 'v1' ? (g.view.width - width * scale) / 2 : cx + (x1 - cx) * m;
  return { scale, x, edge, width };
}

/** A shelf slot (window coordinates, with the shelf camera) where it is at `s`: the same transform as the shelf. */
export function composedOrigin(o: { cam: { cx: number; cy: number; d: number }; x: number; bottom: number; height: number }, s: ComposedState | null, g: ComposedGeometry | null, rootX: number, scrollY: number) {
  'worklet';
  if (!s || !g) return o;
  const f = (x: number, y: number) => composedPoint(x - rootX, y + scrollY, s, g);
  const c = f(o.cam.cx, o.cam.cy), b = f(o.x, o.bottom);
  return { cam: { cx: c[0], cy: c[1], d: o.cam.d * s.k }, x: b[0], bottom: b[1], height: o.height * s.k };
}

/** The inverse of composedOrigin once pulled back: a slot seen in the desk-view bookcase (window rect, with its shelf
 *  camera) → the same slot on the bookshelf at rest. A book opened from the desk (switching months) still closes all the
 *  way back into its place on the bookshelf. */
export function composedRestRect<R extends { x: number; y: number; width: number; height: number; camera: { cx: number; cy: number; d: number } }>(r: R, g: ComposedGeometry): R {
  const s = composedAt(1, g);
  const R0 = g.rest.rootX, S = g.scrollY;
  const X = (x: number) => R0 + g.ax + (x - R0 - g.ax - s.tx) / s.k;
  const Y = (y: number) => g.ay - S + (y + S - g.ay - s.ty) / s.k;
  return { ...r, x: X(r.x), y: Y(r.y), width: r.width / s.k, height: r.height / s.k,
    camera: { cx: X(r.camera.cx), cy: Y(r.camera.cy), d: r.camera.d / s.k } };
}

// ---------- the illustrated Treehouse (ROOM_LAYOUT 'reference') ----------
// (Defined last: its worklets use composedAt and composedPoint above.)
// The approved illustration's room — the trunk and lantern on the left, the garden window on the right, the vines and
// canopy above and the writing desk with its quill, ink and teacup below (assets/bookhouse/reference, built by
// scripts/buildTreehouseReference.py with everything interactive painted out: no books, labels, sign, button or closed
// book) — drawn around the live bookshelf and under the live journal, at the scale that lines its shelves up with ours.
/** Reference art (its own px): the bookcase's outer edges, the desk's back edge (where the live shelf's REF.bottomRow
 *  rests), the scale of its shelves against interior.png's (ref px per interior px), and the live shelf's painting row
 *  at the desk's edge (a little of the compartment under the last row shows, as in the illustration). `room`: the
 *  desk band (window px) kept above the open journal for the quill, ink and teacup (the shelf scale follows from it). */
export const REF = { width: 1024, shelfX0: 160, shelfX1: 880, edge: 1058, rowRatio: 1.067, bottomRow: 1070, room: 48,
  /** The deeper desk's front edge and the art's height (rows of room-front.webp; scripts/buildTreehouseReference.py). */
  front: 2002, height: 2210 };
/** The reference art's scale (window px per ref px) once pulled back. */
export function referenceScale(g: ComposedGeometry) {
  'worklet';
  return g.rest.scale * g.k1 / REF.rowRatio;
}
/** The live bookcase's width in the reference scene: exactly the illustration's bookcase (it covers it). */
export function referenceShelfWidth(g: ComposedGeometry) {
  return (REF.shelfX1 - REF.shelfX0) * referenceScale(g);
}
/** Where the reference art lies at `s`: the window position of its top-left corner and its scale. Once pulled back its
 *  bookcase is centred on the window over the live one and its desk edge is under the live shelf's last plank; on the
 *  way it moves with the camera exactly as the shelf does (one picture). */
export function referenceAt(s: ComposedState, g: ComposedGeometry) {
  'worklet';
  const sr = referenceScale(g), end = composedAt(1, g);
  const x1 = g.view.width / 2 - (REF.shelfX0 + REF.shelfX1) / 2 * sr, y1 = g.deskEdge - REF.edge * sr;
  // Window (pulled back) → shelf-local → window at s.
  const xl = g.ax + (x1 - g.rest.rootX - g.ax - end.tx) / end.k, yl = g.ay + (y1 + g.scrollY - g.ay - end.ty) / end.k;
  const [x, y] = composedPoint(xl, yl, s, g);
  return { x, y, k: sr * s.k / end.k };
}
/** The reference scene's journal column: the widest (up to the window's, 560 at most) that the illustrated desk still
 *  spans with a little of it showing beside the journal — phones get the whole width. */
export function referenceColumn(view: { width: number; height: number }, insets: Insets, rest: ComposedRest, title: { top: number; safeTop: number }) {
  const full = Math.min(view.width, 560);
  const fits = (c: number) => {
    const L = bookLayout(view.width, view.height, insets, 0, c, PORTRAIT_FOOTER);
    const g = composedTarget(rest, view, L.deskEdge - REF.room, 0, title, 'reference');
    return REF.width * referenceScale(g) >= Math.min(view.width, c + 48) - .01;
  };
  if (fits(full)) return full;
  let lo = Math.min(160, full), hi = full;
  for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  return Math.floor(lo);
}
