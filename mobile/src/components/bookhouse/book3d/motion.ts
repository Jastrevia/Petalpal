// The monthly book's choreography: one continuous camera + pose + book-state function of time, shared by the
// opening (shelf → reading), closing (the same path backwards, into the slot it came from), page turns and lean-in.
// Pure worklets, no Skia: unit-tested in Node and run on the UI thread on native.
import { DESK_STRIP, ROOM } from './roomDesk';
import { apply, CLOSED, hingeZ, poseMatrix, project, shelfPose, SPEC, type BookState, type Camera, type Pose, type V3 } from './math';

// ---------- timing ----------
// The opening is one path through t (0 on the shelf → 1 open on the desk; openingFrame), and closing is the same path
// backwards. Its stages fall at these points of t: slid out of the shelf by .13, over the desk by .42, landed by .56,
// open by .92, settled by 1. Each stage gets its own duration (ms) below, and a smooth monotone curve through those
// points maps time to t, so the book's path, turn and opening are unchanged — only how long each stage takes — and its
// speed never jumps between stages (each stage keeps its own ease in and out within openingFrame).
export const STAGE_T = [0, .13, .42, .56, .92, 1] as const;
/** Opening: slide out of the shelf, fly toward the desk, land, open the cover, pages settle. */
export type OpenStages = { extract: number; fly: number; land: number; open: number; settle: number };
/** Closing: pages gather, the cover closes, lift off the desk, fly back, slide into the slot. */
export type CloseStages = { settle: number; close: number; lift: number; fly: number; slot: number };
/** From the bookshelf (the camera pulls back to the desk on the way). */
export const OPEN_STAGES: OpenStages = { extract: 400, fly: 340, land: 140, open: 400, settle: 60 };
export const CLOSE_STAGES: CloseStages = { settle: 40, close: 320, lift: 100, fly: 240, slot: 150 };
/** Switching months at the desk: the camera stays pulled back and the bookcase is close by, so each stage is shorter.
 *  The chosen month's book starts out of its slot while the closed one is sliding home (DESK_HANDOFF_T). */
export const DESK_OPEN_STAGES: OpenStages = { extract: 180, fly: 240, land: 90, open: 280, settle: 30 };
export const DESK_CLOSE_STAGES: CloseStages = { settle: 25, close: 230, lift: 70, fly: 210, slot: 100 };
/** Closing at the desk: once the book is this far home (t), the next month's book may start out of its slot. */
export const DESK_HANDOFF_T = .2;
const openTotal = (s: OpenStages) => s.extract + s.fly + s.land + s.open + s.settle;
const closeTotal = (s: CloseStages) => s.settle + s.close + s.lift + s.fly + s.slot;
export const OPEN_MS = openTotal(OPEN_STAGES);
export const CLOSE_MS = closeTotal(CLOSE_STAGES);
export const DESK_OPEN_MS = openTotal(DESK_OPEN_STAGES);
export const DESK_CLOSE_MS = closeTotal(DESK_CLOSE_STAGES);

/** A smooth monotone curve through (x[i], y[i]) (Fritsch–Carlson): continuous speed, never overshooting. */
function monotone(x: number[], y: number[]) {
  const n = x.length, d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (v: number) => {
    'worklet';
    const u = Math.max(x[0], Math.min(x[n - 1], v));
    let i = 0;
    while (i < n - 2 && u > x[i + 1]) i++;
    const w = x[i + 1] - x[i], s = (u - x[i]) / w, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * w * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * w * m[i + 1];
  };
}
/** Easing for t: 0 → 1 over the opening (time share → t). */
export function openTiming(s: OpenStages) {
  const total = openTotal(s);
  let at = 0;
  const x = [0, ...[s.extract, s.fly, s.land, s.open, s.settle].map(v => (at += v) / total)];
  return monotone(x, [...STAGE_T]);
}
/** Easing for t: 1 → 0 over the closing (time share → share of the way back to the shelf, i.e. 1 − t). */
export function closeTiming(s: CloseStages) {
  const total = closeTotal(s);
  let at = 0;
  const x = [0, ...[s.settle, s.close, s.lift, s.fly, s.slot].map(v => (at += v) / total)];
  return monotone(x, [...STAGE_T].reverse().map(t => 1 - t));
}
/** One leaf's turn; a riffle of n leaves takes TURN_MS × (1 + (n − 1) × stagger). */
export const TURN_MS = 940;
export const LEAN_MS = 520;
/** Slightly short of flat: an open book's boards rest in a shallow V. */
export const OPEN_PHI = Math.PI - .045;
/** Share of the pages lying on the left once the book is open. */
export const READ_SPLIT = .5;

/** Where the book came from: its slot on the shelf (window coordinates) and the shelf's camera. */
export type ShelfOrigin = { cam: Camera; x: number; bottom: number; height: number };
export type Insets = { top: number; bottom: number };
export type BookLayout = {
  width: number; height: number; column: number; side: number;
  cam: Camera; closed: Pose; rest: Pose; read: Pose; lean: Pose; leanLeft: Pose;
  /** Screen y of the desk's back edge (just above the open journal's head) and the bottom of the book. */
  deskEdge: number;
  /** Reading-pose band for the controls row under the book, and the page-turn bookmarks' column. */
  below: number; tabLeft: number; tabTop: number; tabHeight: number;
  /** Either page on screen once leaned in (the page lies flat in the screen plane: exact rectangle). */
  page: { x: number; y: number; width: number; height: number };
};
/** rightMix: share of the reading layout on the right page (0 preview, 1 reading); see MonthBook's page faces. */
/** `lift`: how high above the desk the book is (1 in the air, 0 resting on it); its shadow tightens as it lands. */
export type Frame = { cam: Camera; pose: Pose; state: BookState; shadow: number; lift: number; dim: number; leftBlank: boolean; flyleaf: boolean; ribbon: number; rightMix: number; previewMix: number };
/** Leaves in a riffle across many entries, and how far each one starts behind the previous (share of the turn). */
export const RIFFLE_MAX = 3;
export const RIFFLE_STAGGER = .26;
/** Length of the ribbon marker hanging from the tail (book units). */
export const RIBBON = 150;

const TAB = 36;
const MARGIN = 6;
function clamp01(t: number) { 'worklet'; return Math.max(0, Math.min(1, t)); }
function ease(t: number) { 'worklet'; const x = clamp01(t); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function easeOut(t: number) { 'worklet'; const x = clamp01(t); return 1 - Math.pow(1 - x, 3); }
function span(t: number, a: number, b: number) { 'worklet'; return clamp01((t - a) / (b - a)); }
function mix(a: number, b: number, t: number) { 'worklet'; return a + (b - a) * t; }
export function mixPose(a: Pose, b: Pose, t: number): Pose {
  'worklet';
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t), s: mix(a.s, b.s, t), yaw: mix(a.yaw, b.yaw, t),
    pitch: mix(a.pitch, b.pitch, t), roll: mix(a.roll, b.roll, t), px: mix(a.px, b.px, t), py: mix(a.py, b.py, t), pz: mix(a.pz, b.pz, t) };
}
function mixCam(a: Camera, b: Camera, t: number): Camera {
  'worklet';
  return { cx: mix(a.cx, b.cx, t), cy: mix(a.cy, b.cy, t), d: mix(a.d, b.d, t) };
}

/** The open journal lies on the desk, seen from a reader sitting in front of it. */
export const DESK_PITCH = .64;

/** Portrait-first layout: the open journal lies on the desk in the lower part of the screen, the bookshelf behind
 *  it, bookmarks to its right and the controls row beneath it. */
/** `maxColumn`: a narrower column than the window's (the portrait Treehouse sizes the desk scene to the bookcase).
 *  `footer`: extra room kept under the controls row (the portrait Treehouse's Flower History button). */
export function bookLayout(width: number, height: number, insets: Insets, minTop = 0, maxColumn = Infinity, footer = 0): BookLayout {
  const { H, W, T, over: o, gap: g } = SPEC;
  const column = Math.min(width, 560, maxColumn), side = (width - column) / 2;
  const bottom = height - insets.bottom - 66 - footer;
  const zh = hingeZ({ ...CLOSED, split: READ_SPLIT });
  const spineX = side + MARGIN + (column - MARGIN * 2 - TAB) / 2;
  const cam: Camera = { cx: spineX, cy: height * .4, d: height * 1.9 };
  // Fit the spread to the column (perspective widens its near edge), then rest its tail on `bottom`.
  let s = (column - MARGIN * 2 - TAB) / (2 * W + 24);
  let read: Pose = { x: spineX, y: height * .7, z: 0, s, yaw: 0, pitch: DESK_PITCH, roll: 0, px: 0, py: H / 2, pz: zh };
  const extent = (pose: Pose) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const x of [-W, W]) for (const y of [0, H]) for (const z of [-T / 2, T / 2]) {
      const [px, py] = projectPoint(cam, pose, [x, y, z]);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { x0, x1, y0, y1 };
  };
  for (let i = 0; i < 4; i++) {
    const e = extent(read);
    s *= Math.min(1, (column - MARGIN * 2 - TAB) / (e.x1 - e.x0));
    read = { ...read, s, y: read.y + (bottom - e.y1) };
  }
  // Never so tall that the shelf behind has no room: shrink until the head sits below 40 % of the screen.
  for (let i = 0; i < 4; i++) {
    const e = extent(read);
    const limit = Math.max(height * .4, minTop);
    if (e.y0 >= limit - .5) break;
    s *= (e.y1 - limit) / (e.y1 - e.y0);
    read = { ...read, s, y: read.y + (bottom - extent({ ...read, s }).y1) };
  }
  const box = extent(read);
  // Closed, cover up, lying where its right half will be once open; and floating above the desk on its way there.
  const rest: Pose = { ...read, x: spineX + W / 2 * s, px: W / 2, pz: 0 };
  const closed: Pose = { x: side + column / 2, y: box.y0 - H * s * .05, z: 0, s: s * 1.18, yaw: .5, pitch: .22, roll: -.045, px: W / 2, py: H / 2, pz: 0 };
  // Lean in: one page fills the column, flat in the screen plane.
  const pageW = W - o - g, pageH = H - 2 * o;
  const leanTop = insets.top + 58, leanBottom = height - insets.bottom - 62;
  const leanS = Math.min((column - 16) / pageW, (leanBottom - leanTop) / pageH);
  const leanCy = (leanTop + leanBottom) / 2;
  const lean: Pose = { x: side + column / 2, y: leanCy, z: 0, s: leanS, yaw: 0, pitch: 0, roll: 0, px: g + pageW / 2, py: H / 2, pz: zh };
  // The left page lies on the front board, turned over the spine: face it to the screen about its own centre.
  const mid = g + pageW / 2;
  const leanLeft: Pose = { ...lean, yaw: OPEN_PHI - Math.PI, px: Math.cos(OPEN_PHI) * mid, pz: zh + Math.sin(OPEN_PHI) * mid };
  const page = { x: side + column / 2 - pageW * leanS / 2, y: leanCy - pageH * leanS / 2, width: pageW * leanS, height: pageH * leanS };
  // Bookmarks stand out past the right board's fore-edge, within the top and bottom of the page block: the whole rail
  // (and its scroll controls) always lies inside the book's own height.
  const edge = (y: number) => projectPoint(cam, read, [W - o, y, zh]);
  const [, ty0] = edge(o + 6), [, ty1] = edge(H - o - 6);
  const board = [0, H].flatMap(y => [-T / 2, -T / 2 + SPEC.board].map(z => projectPoint(cam, read, [W, y, z])[0]));
  return { width, height, column, side, cam, closed, rest, read, lean, leanLeft, deskEdge: box.y0 - 12, below: box.y1,
    tabLeft: Math.max(...board) - 3, tabTop: ty0, tabHeight: ty1 - ty0, page };
}

/** Where the open book is on screen once it lies on the desk (L.read), with its bookmarks and the date controls under it:
 *  a tap inside never counts as a tap off the book (closing it). `pad`: a margin around the book itself. */
export function openBookZone(L: BookLayout, pad = 8) {
  const { H, W, T } = SPEC;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const x of [-W, W]) for (const y of [0, H]) for (const z of [-T / 2, T / 2]) {
    const [px, py] = projectPoint(L.cam, L.read, [x, y, z]);
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  return [
    { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad },
    // The bookmarks standing out of the fore-edge (and their scroll arrows).
    { x0: L.tabLeft - pad, x1: L.tabLeft + 46 + pad, y0: L.tabTop - pad, y1: L.tabTop + L.tabHeight + pad },
    // The date controls row under the book (arrows, date, Today).
    { x0: L.side + 4, x1: L.side + L.column - 4, y0: L.below, y1: L.below + 64 },
  ];
}
export function inOpenBookZone(L: BookLayout, x: number, y: number) {
  return openBookZone(L).some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
}

/** The book's layout on the writing desk. On a phone the open journal decides where the desk's edge is (the desk art,
 *  plain wood there, is drawn as large as that needs). On a wider window the desk's props (lamp, books, teacup) are in
 *  view, so the desk keeps close to the room's own scale (at most 1.25×, a subtle depth difference) and the journal
 *  lies lower and a little smaller, below the desk's edge. */
export function deskBookLayout(width: number, height: number, insets: Insets): BookLayout {
  const free = bookLayout(width, height, insets);
  const deskEdge = free.deskEdge + 12 - DESK_STRIP;
  const needed = (height - deskEdge) / (ROOM.height - ROOM.deskTop);
  // Half the window's width in desk-art pixels: the props stand beyond 556 px from the centre.
  if (width / 2 / needed <= 556) return free;
  const capped = 1.25 * width / ROOM.width;
  return bookLayout(width, height, insets, height - (ROOM.height - ROOM.deskTop) * capped + DESK_STRIP);
}

export function projectPoint(cam: Camera, pose: Pose, p: V3): [number, number] {
  'worklet';
  return project(cam, apply(poseMatrix(pose), p));
}

/** The shelf pose re-expressed about the book's centre, so every closed pose shares one pivot. */
export function shelfCentrePose(origin: ShelfOrigin): Pose {
  'worklet';
  const { W, H } = SPEC;
  const p = shelfPose(origin.x, origin.bottom, origin.height);
  const c = apply(poseMatrix(p), [W / 2, H / 2, 0]);
  return { ...p, x: c[0], y: c[1], z: c[2], px: W / 2, py: H / 2, pz: 0 };
}

/** Share of the opening timeline over which the camera pulls back from the shelf to the desk. */
export function pullOf(t: number) { 'worklet'; return clamp01((t - .03) / .5); }

/** t: 0 on the shelf → 1 open on the desk. Played backwards to close. `origin` is the slot where it is at this
 *  moment of the pull-back (the shelf recedes while the book leaves it). */
export function openingFrame(t: number, origin: ShelfOrigin, L: BookLayout): Frame {
  'worklet';
  const { W } = SPEC;
  const shelf = shelfCentrePose(origin);
  // 1. Slide straight out of the shelf toward the reader.
  const out = { ...shelf, z: shelf.z + W * shelf.s * .9, y: shelf.y - origin.height * .03 };
  // 2–3. Float forward and down toward the desk, turning to show the cover, spine and page block in three-quarter
  //      view; 4. settle onto the desk, cover up; 5. open.
  let pose: Pose;
  const a = easeOut(span(t, 0, .13)), b = ease(span(t, .1, .42)), c = ease(span(t, .42, .56)), d = ease(span(t, .56, .92));
  if (t < .1) pose = mixPose(shelf, out, a);
  else if (t < .42) pose = mixPose(mixPose(shelf, out, a), L.closed, b);
  else if (t < .56) {
    // Lowered onto the desk: a little arc so it lands rather than slides.
    const settle = mixPose(L.closed, L.rest, c);
    pose = { ...settle, y: settle.y - Math.sin(Math.PI * c) * L.rest.s * 40 };
  } else {
    // Scale and centring follow the cover itself, so the boards stay on the desk as they open out.
    const o = ease(span(t, .56, .82));
    pose = { ...mixPose(L.rest, L.read, d), x: mix(L.rest.x, L.read.x, o), px: mix(L.rest.px, L.read.px, o), pz: mix(L.rest.pz, L.read.pz, o) };
  }
  const cam = mixCam(origin.cam, L.cam, ease(span(t, .04, .42)));
  // 6. The cover swings round the spine; 7. a flyleaf turns over as the page block parts and settles.
  const phi = OPEN_PHI * ease(span(t, .56, .82));
  const leaf = span(t, .74, .92);
  const state: BookState = { phi, split: READ_SPLIT * ease(span(t, .74, .9)), curl: ease(span(t, .66, .94)),
    // The flyleaf lies on the right page from the moment the cover lifts, then turns over onto the left.
    turns: phi > .02 && leaf < 1 ? [{ p: leaf, dir: 1 }] : [] };
  // The ribbon slips out of the page block as the book leaves the shelf (it would hang into the plank there).
  return { cam, pose, state, shadow: easeOut(span(t, .12, .5)), lift: t < .42 ? 1 : 1 - c, dim: 0, leftBlank: leaf < .5, flyleaf: true, ribbon: RIBBON * easeOut(span(t, .08, .3)), rightMix: 0, previewMix: 0 };
}

/** The pages a turn from `from` to `to` lifts, top-most first: the page being left, then (for a long jump) evenly
 *  spaced pages between; turning back, the pages are taken off the left pile and the last to land is the target. */
export function turnPages(from: number, to: number) {
  const forward = to > from;
  const between = forward ? Array.from({ length: to - from }, (_, i) => from + i) : Array.from({ length: from - to }, (_, i) => from - 1 - i);
  const n = Math.min(RIFFLE_MAX, between.length);
  if (n === between.length) return between;
  // Keep the first and the last; spread the rest.
  return Array.from({ length: n }, (_, k) => between[Math.round(k * (between.length - 1) / (n - 1))]);
}
/** Progress of each leaf in a turn of `count` leaves (top-most first) at overall progress `turn` (0..1). */
export function riffle(turn: number, count: number): number[] {
  'worklet';
  const n = Math.max(1, Math.min(RIFFLE_MAX, count));
  const total = 1 + (n - 1) * RIFFLE_STAGGER;
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(clamp01(turn * total - k * RIFFLE_STAGGER));
  return out;
}

/** Close up, panning across the open book: side −1 the left page faces the screen (L.leanLeft), 1 the right page
 *  (L.lean); in between the book slides sideways under the camera from one to the other (both poses share the same
 *  place and scale, so only the pivot and the slight turn of the left board change). */
export function focusPose(L: BookLayout, side: number): Pose {
  'worklet';
  if (side <= -1) return L.leanLeft;
  if (side >= 1) return L.lean;
  return mixPose(L.leanLeft, L.lean, (side + 1) / 2);
}
/** The centre of each page in book coordinates (where a close-up's live page lies): right, then left. */
export function pageCentres(): [V3, V3] {
  'worklet';
  const { W, H, over: o, gap: g } = SPEC;
  const zh = hingeZ({ ...CLOSED, split: READ_SPLIT }), mid = g + (W - o - g) / 2;
  return [[mid, H / 2, zh], [Math.cos(OPEN_PHI) * mid, H / 2, zh + Math.sin(OPEN_PHI) * mid]];
}
/** Close up at `side` (−1..1): how far each live page lies from the page rectangle (L.page) on screen — [right dx, dy,
 *  left dx, dy] — so the live pages move exactly with the 3D pages under them. */
export function focusOffsets(L: BookLayout, side: number): [number, number, number, number] {
  'worklet';
  const pose = focusPose(L, side), [rc, lc] = pageCentres();
  const cx = L.page.x + L.page.width / 2, cy = L.page.y + L.page.height / 2;
  const r = projectPoint(L.cam, pose, rc), l = projectPoint(L.cam, pose, lc);
  return [r[0] - cx, r[1] - cy, l[0] - cx, l[1] - cy];
}

/** On the desk: lean 0 (whole spread) → 1 (one page close up, flat in the screen plane; `side` 1 right, −1 left, or in
 *  between while panning from one page to the other). turn 0..1 turns `count` leaves in direction dir (±1; 0 for
 *  none). Only the leaves move: the book keeps its pose. */
export function readingFrame(L: BookLayout, lean: number, turn: number, dir: number, count = 1, side = 1): Frame {
  'worklet';
  const k = ease(lean);
  const turns = dir === 0 ? [] : riffle(turn, count).map(p => ({ p, dir: (dir > 0 ? 1 : -1) as 1 | -1 }));
  // Close up the page lies nearly flat, so the text is not shaded or bent by the gutter curve.
  return { cam: L.cam, pose: mixPose(L.read, focusPose(L, side), k), state: { phi: OPEN_PHI, split: READ_SPLIT, curl: 1 - .85 * k, turns },
    // The spread's arrangement leaves the paper before the close-up arrives (and the reverse leaning out): never both.
    shadow: 1 - k, lift: 0, dim: k, leftBlank: false, flyleaf: false, ribbon: RIBBON,
    previewMix: 1 - ease(span(lean, .08, .42)), rightMix: ease(span(lean, .58, .92)) };
}
