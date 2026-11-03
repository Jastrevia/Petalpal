// The room scene: the camera pull-back from the bookshelf into a painted room (assets/bookhouse/room). Pure worklets
// (no Skia, no React): unit-tested in Node, run on the UI thread on native.
//
// DISABLED (book3d/scene.ts, ROOM_ARTWORK): the first room artwork did not match the bookshelf's painting. Kept
// so that matched artwork can replace it; the pull-back then uses the painted desk (desk.ts) instead.
//
// The scene is four layers sharing one master coordinate system, the 2048 × 2732 room canvas (assets/bookhouse/room):
//   room-back  — walls, side windows and wall panel, behind everything;
//   bookshelf  — the existing interactive shelf (TreehouseShelf), one rigid picture: its own layout is computed once,
//                at rest, and never changes; the pull-back only applies one uniform scale and a translation to it;
//   room-frame — tree trunks, wisteria and lanterns in front of the shelf, hiding its straight edges;
//   desk       — the writing desk in the foreground, with the quill on its right.
// Once pulled back, room-back, room-frame and the shelf sit at one uniform canvas scale. On the way there each layer
// moves as its depth implies: the back wall stays registered to the shelf; the frame is nearer the camera, so it starts
// far larger (beyond the edges of the screen) and sweeps in as the camera passes it; the desk, nearest, rises into the
// frame from below. No layer is ever stretched or re-laid out — every transform is a uniform scale plus a translation.

import { easePull, SHELF } from './desk';

/** The bookcase itself on interior.png: from the top beam (where the title sign hangs) to below the last year carving. */
export const BOOKCASE = { top: 178, bottom: 1125 };
/** The room canvas (all room artwork shares it). */
export const ROOM = { width: 2048, height: 2732,
  /** Row where the desk's top surface begins (desk.webp), and the top of the props standing on it. */
  deskTop: 1888, deskProps: 1760 };
/** The quill (quill.webp, 380 × 650): lying on the desk to the right, its nib toward the journal. */
export const QUILL = { width: 380, height: 650 };
/** Lowest reach of the frame's hanging wisteria (room canvas y) above the title sign (centre) and above the year rail
 *  (left, where the longest strand hangs). */
const FRAME_CLEAR = { sign: 232, label: 480 };
/** How much of the desk shows between the shelf and the journal's head (screen px), where the quill lies. */
export const DESK_STRIP = 34;

export type Mapping = { c: number; ox: number; oy: number };
/** Window coordinates, except where noted (the shelf's own transform is in its scroll content's coordinates). */
export type PullGeometry = {
  /** Shelf: uniform scale (1 at rest) about its top centre (ax, ay: shelf-local), and its final translation. */
  k1: number; ax: number; ay: number; ty1: number;
  /** Scroll offset while the book is open, and the shelf's left edge in the window. */
  scrollY: number; rootX: number;
  /** The room canvas → window once pulled back (back wall and frame). */
  room: Mapping;
  /** The desk art → window once pulled back, and how far below its place it starts. */
  desk: Mapping; deskDrop: number;
  /** The quill once in place: centre, length on screen, rotation (radians). */
  quill: { x: number; y: number; h: number; angle: number };
  /** Window y of the desk's top edge, and of the shelf's centre once pulled back (the frame's anchor). */
  deskEdge: number; centre1: { x: number; y: number };
  /** The bookcase's top and bottom in shelf-local coordinates (its sides are the shelf picture's own edges). */
  bookcase: { top: number; bottom: number; width: number };
};
export type PullState = { k: number; ty: number; e: number; rise: number };

function clamp01(t: number) { 'worklet'; return Math.max(0, Math.min(1, t)); }
function mix(a: number, b: number, t: number) { 'worklet'; return a + (b - a) * t; }

/** The pulled-back composition for a window. `rest` is the shelf as laid out at rest (shelf-local coordinates:
 *  its width, the cabinet's top and its painting scale, and the scene height); `bookTop` is the open journal's head
 *  (window y, from the book layout); `top` the first window y below the status bar. */
export function pullTarget(rest: { width: number; cabinetTop: number; scale: number; sceneHeight: number }, view: { width: number; height: number },
  bookTop: number, top: number, scrollY: number): PullGeometry {
  const W = view.width, H = view.height;
  const rootX = (W - rest.width) / 2;
  const deskEdge = bookTop - DESK_STRIP;
  // The bookcase (shelf-local y): the top beam down to below the last year carving (or the bottom of the picture).
  const yTop = rest.cabinetTop + (BOOKCASE.top - SHELF.top) * rest.scale;
  const yBottom = Math.min(rest.cabinetTop + (BOOKCASE.bottom - SHELF.top) * rest.scale, rest.sceneHeight);
  // Its foot stands just behind the desk's top edge; its top sits below the status bar and clear of the wisteria
  // hanging from the frame (the title sign and the first year label must stay visible). Solved by a few iterations,
  // since the room's scale follows the shelf's width.
  let shelfTop = top + 30, k1 = 1, c = 1;
  for (let i = 0; i < 6; i++) {
    k1 = Math.max(.2, Math.min(1, (deskEdge + 8 - shelfTop) / (yBottom - yTop)));
    // Room: the bookcase fills the wall panel's opening (928 canvas px), and the canvas always covers the window's
    // width; its top edge at the top of the window.
    c = Math.max(W / ROOM.width, rest.width * k1 / 928, (deskEdge + 12) / ROOM.height);
    const label = (SHELF.carvings[0].bottom - BOOKCASE.top) * rest.scale * k1;
    shelfTop = Math.max(top + 30, FRAME_CLEAR.sign * c + 6, FRAME_CLEAR.label * c + 6 - label);
  }
  k1 = Math.max(.2, Math.min(1, (deskEdge + 8 - shelfTop) / (yBottom - yTop)));
  const ty1 = shelfTop + scrollY - yTop * k1;
  const room: Mapping = { c, ox: W / 2 - ROOM.width / 2 * c, oy: 0 };
  // Desk: its top surface at deskEdge, reaching the bottom of the window.
  // (deskBookLayout keeps this within 1.25× the room's scale wherever the desk's props are in view.)
  const cd = Math.max(c, (H - deskEdge) / (ROOM.height - ROOM.deskTop));
  const desk: Mapping = { c: cd, ox: W / 2 - ROOM.width / 2 * cd, oy: deskEdge - ROOM.deskTop * cd };
  // The quill lies on the desk to the right, behind the journal's head, nib toward the book.
  const qh = Math.min(W * .34, 190);
  const quill = { x: W / 2 + Math.min(W * .27, 270), y: deskEdge + 12, h: qh, angle: .95 };
  return { k1, ax: rest.width / 2, ay: 0, ty1, scrollY, rootX, room, desk, deskDrop: H + 40 - (deskEdge - (ROOM.deskTop - ROOM.deskProps) * cd), quill, deskEdge,
    centre1: { x: W / 2, y: shelfTop + (deskEdge + 8 - shelfTop) / 2 }, bookcase: { top: yTop, bottom: yBottom, width: rest.width } };
}

/** p: 0 at the shelf → 1 pulled back to the desk. */
export function pullAt(p: number, g: PullGeometry): PullState {
  'worklet';
  const e = easePull(p);
  // The desk is nearest the camera: it enters from below and arrives as the shelf settles.
  // Tied to the shelf's own recession (so it never arrives before the camera has moved), easing in at the end.
  const rise = 1 - Math.pow(1 - clamp01((e - .02) / .9), 2);
  return { k: mix(1, g.k1, e), ty: g.ty1 * e, e, rise };
}

/** Where a point of the shelf picture at rest (shelf-local coordinates) is at `s`. */
export function pullPoint(x: number, y: number, s: PullState, g: PullGeometry): [number, number] {
  'worklet';
  return [g.ax + (x - g.ax) * s.k, g.ay + (y - g.ay) * s.k + s.ty];
}

/** The room canvas → window at `s`. The back wall stays registered to the shelf; the frame (`depth` > 0) starts larger,
 *  about the shelf's centre, and reaches the same registration at the end. Uniform in every case. */
export function roomMapping(s: PullState, g: PullGeometry, depth = 0): Mapping {
  'worklet';
  // The shelf's own transform, relative to its final one: window = A + (window1 − A1) · k/k1 …
  const r = s.k / g.k1;
  // … where the shelf's top centre moves from A1 (final) to A (now), in window coordinates.
  const a1x = g.rootX + g.ax, a1y = g.ay + g.ty1 - g.scrollY;
  const ax = g.rootX + g.ax, ay = g.ay + s.ty - g.scrollY;
  let c = g.room.c * r, ox = ax + (g.room.ox - a1x) * r, oy = ay + (g.room.oy - a1y) * r;
  if (depth > 0) {
    // Nearer than the shelf: scaled further about the shelf's centre (as it is now), collapsing to 1 at the end.
    const f = 1 + depth * (1 - s.e);
    const cx = ax + (g.centre1.x - a1x) * r, cy = ay + (g.centre1.y - a1y) * r;
    c *= f; ox = cx + (ox - cx) * f; oy = cy + (oy - cy) * f;
  }
  return { c, ox, oy };
}

/** A shelf slot (window coordinates, with the shelf camera) where it is at a point of the pull-back: the same uniform
 *  transform as the rest of the shelf, so the book leaves exactly the slot the shelf shows. */
export function pullOrigin(o: { cam: { cx: number; cy: number; d: number }; x: number; bottom: number; height: number }, s: PullState | null, g: PullGeometry | null, rootX: number, scrollY: number) {
  'worklet';
  if (!s || !g) return o;
  const f = (x: number, y: number) => { const q = pullPoint(x - rootX, y + scrollY, s, g); return [q[0] + rootX, q[1] - scrollY]; };
  const c = f(o.cam.cx, o.cam.cy), b = f(o.x, o.bottom);
  return { cam: { cx: c[0], cy: c[1], d: o.cam.d * s.k }, x: b[0], bottom: b[1], height: o.height * s.k };
}
