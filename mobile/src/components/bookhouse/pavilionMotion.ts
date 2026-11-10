// Pavilion-only framing; choreography and perspective are shared with the Treehouse.
import { bookLayout, openingFrame, projectPoint, mixPose, OPEN_PHI, READ_SPLIT, type BookLayout, type ShelfOrigin } from './book3d/motion';
import { CLOSED, hingeZ, SPEC, type Pose } from './book3d/math';
import type { Rect } from './bookMotion';

export type PavilionBookId = 'weekly' | 'monthly' | 'notes' | 'collection';
export const PAVILION = { width: 1363, height: 1154 };
export const PAVILION_SLOTS: Record<PavilionBookId, Rect> = {
  weekly: { x: 751, y: 0, width: 108, height: 267 },
  monthly: { x: 861, y: 0, width: 107, height: 267 },
  notes: { x: 970, y: 0, width: 107, height: 267 },
  collection: { x: 1078, y: 0, width: 106, height: 267 },
};
export const PAVILION_LANTERN: Rect = { x: 1208, y: 12, width: 90, height: 238 };
/** Phones: where the book lies on the wooden board, in painting pixels (its width; the height follows the open book's
 *  proportions). Fixed in the painting, so the book stays attached to the board on every phone width. */
export const PAVILION_PHONE_BOOK = { x: 714.8, y: 346.2, width: 500.4 };
export const PAVILION_CLOTH: Record<PavilionBookId, string> = {
  weekly: '#3E5742', monthly: '#244B70', notes: '#6C4772', collection: '#D9C49D',
};
export function pavilionScene(width: number, height: number) {
  const compact = width < 640;
  // Portrait crops toward the shelf, keeping all four books on screen. Wide views
  // contain the entire painting. Both the hit targets and origins use this camera.
  const k = compact ? Math.max(width / PAVILION.width, height / PAVILION.height)
    : Math.min(width / PAVILION.width, height / PAVILION.height);
  const artWidth = PAVILION.width * k, artHeight = PAVILION.height * k;
  const x = compact ? Math.min(0, Math.max(width - artWidth, width / 2 - artWidth * .708)) : (width - artWidth) / 2;
  const y = compact ? 0 : (height - artHeight) / 2;
  const slot = (id: PavilionBookId): Rect => {
    const r = PAVILION_SLOTS[id];
    return { x: x + r.x * k, y: y + r.y * k, width: r.width * k, height: r.height * k };
  };
  const bookWidth = compact ? PAVILION_PHONE_BOOK.width * k : Math.min(artWidth * .76, (height * .63) * 2 * SPEC.W / SPEC.H);
  const bookHeight = bookWidth * SPEC.H / (2 * SPEC.W);
  const bookX = compact ? x + PAVILION_PHONE_BOOK.x * k : x + artWidth * .56 - bookWidth / 2;
  const bookY = compact ? y + PAVILION_PHONE_BOOK.y * k
    : Math.max(slot('weekly').y + slot('weekly').height + 18, Math.min(y + artHeight * .30, height - bookHeight - 42));
  const col = slot('collection');
  const rawLanternLeft = x + PAVILION_LANTERN.x * k;
  const rawLanternRight = x + (PAVILION_LANTERN.x + PAVILION_LANTERN.width) * k;
  const rawLanternTop = y + PAVILION_LANTERN.y * k;
  const rawLanternBottom = y + (PAVILION_LANTERN.y + PAVILION_LANTERN.height) * k;
  const colRight = col.x + col.width;
  const lanternLeft = Math.max(0, compact ? Math.max(colRight + 2, rawLanternLeft - 24) : rawLanternLeft);
  const lanternRight = Math.min(width, Math.max(lanternLeft, rawLanternRight));
  const lanternTop = Math.max(0, rawLanternTop);
  const lanternBottom = Math.min(height, Math.max(lanternTop, rawLanternBottom));
  const lantern: Rect = {
    x: lanternLeft,
    y: lanternTop,
    width: Math.max(0, lanternRight - lanternLeft),
    height: Math.max(0, lanternBottom - lanternTop),
  };
  return { width, height, compact, art: { x, y, width: artWidth, height: artHeight }, k, slot,
    table: { x: bookX, y: bookY, width: bookWidth, height: bookHeight }, lantern };
}
export type PavilionScene = ReturnType<typeof pavilionScene>;

export function pavilionGeometry(scene: PavilionScene, id: PavilionBookId) {
  const { W, H } = SPEC, rect = scene.table;
  const L = bookLayout(scene.width, scene.height, { top: 0, bottom: 0 });
  const zh = hingeZ({ ...CLOSED, split: READ_SPLIT });
  L.cam = { cx: scene.width / 2, cy: scene.height * .45, d: Math.max(2000, scene.height * 8) };
  L.read = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, z: 0, s: rect.height / H,
    yaw: 0, pitch: 0, roll: 0, px: 0, py: H / 2, pz: zh };
  L.rest = { ...L.read, x: L.read.x + W / 2 * L.read.s, px: W / 2, pz: 0, pitch: .16 };
  L.closed = { ...L.rest, y: L.rest.y - rect.height * .12, s: L.rest.s * 1.06, yaw: .5, pitch: .22, roll: -.045 };
  const focusTop = scene.slot(id).y + scene.slot(id).height + 22;
  const focusBottom = scene.height - 60;
  const fs = Math.min((scene.width - 40) / (W - 2 * SPEC.over), (focusBottom - focusTop) / (H - 2 * SPEC.over));
  L.lean = { ...L.read, x: scene.width / 2, y: (focusTop + focusBottom) / 2, s: fs, px: W / 2 };
  const shelf = scene.slot(id);
  const origin: ShelfOrigin = { x: shelf.x + shelf.width / 2, bottom: shelf.y + shelf.height, height: shelf.height, cam: L.cam };
  return { layout: L, origin, shelf };
}
export type PavilionGeometry = ReturnType<typeof pavilionGeometry>;

/** Reuse the Treehouse's unmodified six-stage book pose, cover hinge and flyleaf. */
export function pavilionFrame(t: number, g: PavilionGeometry, focus = 0) {
  'worklet';
  const f = openingFrame(t, g.origin, g.layout);
  // The painting is already in camera space; correct its shelf centre once rather
  // than applying a second camera projection to the painted source slot.
  const first = openingFrame(0, g.origin, g.layout);
  const start = projectPoint(first.cam, first.pose, [SPEC.W / 2, SPEC.H / 2, 0]);
  const k = first.cam.d / (first.cam.d - first.pose.z);
  const u = Math.min(1, Math.max(0, t / .42));
  const correction = 1 - (u * u * (3 - 2 * u));
  f.pose = { ...f.pose,
    x: f.pose.x + (g.shelf.x + g.shelf.width / 2 - start[0]) / k * correction,
    y: f.pose.y + (g.shelf.y + g.shelf.height / 2 - start[1]) / k * correction };
  if (focus > 0) f.pose = mixPose(f.pose, g.layout.lean, focus);
  return f;
}

/** Content stays inside the flat part of each actual 3D leaf, clear of its gutter. */
/** The full physical paper page from the central book spine to the outer fore-edge. */
export function pavilionFullLeaves(L: BookLayout, focused = false) {
  const pose: Pose = focused ? L.lean : L.read;
  const zh = hingeZ({ ...CLOSED, split: READ_SPLIT });
  const page = (left: boolean): Rect => {
    const pts = [0, SPEC.W - SPEC.over].flatMap(x => [SPEC.over, SPEC.H - SPEC.over].map(y => projectPoint(L.cam, pose,
      left ? [Math.cos(OPEN_PHI) * x, y, zh + Math.sin(OPEN_PHI) * x] : [x, y, zh])));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min(...xs);
    return { x, y: Math.min(...ys), width: Math.max(...xs) - x, height: Math.max(...ys) - Math.min(...ys) };
  };
  return { left: page(true), right: page(false) };
}

export function pavilionPages(L: BookLayout, focused = false) {
  const pose: Pose = focused ? L.lean : L.read;
  const zh = hingeZ({ ...CLOSED, split: READ_SPLIT });
  const page = (left: boolean): Rect => {
    const pts = [70, SPEC.W - 58].flatMap(x => [64, SPEC.H - 100].map(y => projectPoint(L.cam, pose,
      left ? [Math.cos(OPEN_PHI) * x, y, zh + Math.sin(OPEN_PHI) * x] : [x, y, zh])));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min(...xs);
    return { x, y: Math.min(...ys), width: Math.max(...xs) - x, height: Math.max(...ys) - Math.min(...ys) };
  };
  return { left: page(true), right: page(false) };
}

/** Every page is laid out once at this paper size (CSS px) and only ever scaled onto the book: it never reflows, so a
 *  page that fits here fits at any size. It is the paper of the 1280 × 800 desktop spread. */
export const PAVILION_PAGE = { width: 336, height: 491 };
/** Below this scale of the reference page (body text 13.5 px → 12.5 px) two pages are too small to read comfortably. */
export const PAVILION_READABLE = .926;
const READING_MAX = 1.25, READING_GUTTER = 12;

/** Close reading of one page: the camera zooms about (ox, oy) by `scale`, which brings that page to `window`. */
export type PavilionReadingSide = { scale: number; ox: number; oy: number; window: Rect };
export type PavilionReading =
  | { fit: true; sigma: number }
  | { fit: false; sigma: number; magnification: number; left: PavilionReadingSide; right: PavilionReadingSide; chrome: 'side' | 'above';
      /** The camera brings the whole spread close (a short, wide screen): both pages show, so they read as two. */
      spread: boolean };

/** Whether the spread is read as two pages, or one page at a time through the reading camera. Only the book layer is
 *  magnified; the painting, the shelf and the book's anchor never move. `leaves` are the anchored paper rectangles. */
export function pavilionReading(width: number, height: number, leaves: { left: Rect; right: Rect },
  safe: { top: number; bottom: number; closeAtBottom: boolean }): PavilionReading {
  const sigma = leaves.right.width / PAVILION_PAGE.width;
  if (sigma >= PAVILION_READABLE) return { fit: true, sigma };
  const g = READING_GUTTER, minTop = safe.top + 8, maxBottom = height - safe.bottom - (safe.closeAtBottom ? 60 : 8);
  const pageTop = Math.min(leaves.left.y, leaves.right.y);
  // Height of a page per unit of width (the leaves' own projected proportions, a hair off the reference page's).
  const aspect = Math.max(leaves.left.height / leaves.left.width, leaves.right.height / leaves.right.width);
  const fitScale = (top: number) => Math.min((width - 2 * g) / PAVILION_PAGE.width, (maxBottom - top) / (PAVILION_PAGE.width * aspect), READING_MAX);
  // The page grows down from its own top edge, so the shelf stays in view; if that leaves it too small to read, the
  // page may rise over the shelf instead (a short landscape screen). It always shows whole: no scrolling.
  let top = Math.max(minTop, pageTop), m = fitScale(top);
  if (m < PAVILION_READABLE) { top = minTop; m = fitScale(top); }
  if (m <= sigma * 1.001) return { fit: true, sigma };
  const scale = m * PAVILION_PAGE.width / Math.max(leaves.left.width, leaves.right.width);
  const side = (p: Rect): PavilionReadingSide => {
    // Zooming about o maps an edge e to o + (e − o)·scale. Prefer o at the page's centre (x) and top (y), moved
    // only as far as needed to keep the whole page inside [lo, hi].
    const about = (e0: number, e1: number, lo: number, hi: number, prefer: number) =>
      Math.min((e0 * scale - lo) / (scale - 1), Math.max((e1 * scale - hi) / (scale - 1), prefer));
    const ox = about(p.x, p.x + p.width, g, width - g, p.x + p.width / 2);
    const oy = about(p.y, p.y + p.height, top, maxBottom, p.y);
    return { scale, ox, oy, window: { x: ox + (p.x - ox) * scale, y: oy + (p.y - oy) * scale, width: p.width * scale, height: p.height * scale } };
  };
  const spreadRect: Rect = { x: leaves.left.x, y: pageTop, width: leaves.right.x + leaves.right.width - leaves.left.x,
    height: Math.max(leaves.left.height, leaves.right.height) };
  const spread = spreadRect.width * scale <= width - 2 * g;
  const left = side(spread ? spreadRect : leaves.left), right = spread ? left : side(leaves.right);
  const room = Math.min(width - left.window.x - left.window.width, width - right.window.x - right.window.width);
  return { fit: false, sigma, magnification: m, left, right, chrome: room >= 84 ? 'side' : 'above', spread };
}

/** The reading camera at `zoom` (0 the anchored book … 1 one page close up) and `side` (−1 left page … 1 right page):
 *  a uniform zoom by s about (ox, oy). At zoom 0 it is the identity, so the book lies exactly at its anchor. */
export function readingCamera(r: PavilionReading, zoom: number, side: number) {
  'worklet';
  if (r.fit || zoom <= 0) return { s: 1, ox: 0, oy: 0 };
  const u = Math.min(1, Math.max(0, (side + 1) / 2));
  const scale = r.left.scale + (r.right.scale - r.left.scale) * u;
  return { s: Math.pow(scale, Math.min(1, zoom)), ox: r.left.ox + (r.right.ox - r.left.ox) * u, oy: r.left.oy + (r.right.oy - r.left.oy) * u };
}
