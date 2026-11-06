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
  const bookWidth = Math.min(compact ? width - 24 : artWidth * .76, (height * .63) * 2 * SPEC.W / SPEC.H);
  const bookHeight = bookWidth * SPEC.H / (2 * SPEC.W);
  const bookX = compact ? (width - bookWidth) / 2 : x + artWidth * .56 - bookWidth / 2;
  const bookY = Math.max(slot('weekly').y + slot('weekly').height + 18, Math.min(y + artHeight * .30, height - bookHeight - 42));
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

// A phone while a book is open (owner, 2026-11-06): the whole painting across the screen's width,
// window and lake on the left and the shelf on the right, as the wide view shows it above the book.
export function pavilionReadingCamera(width: number) {
  const k = width / PAVILION.width;
  const slot = (id: PavilionBookId): Rect => {
    const r = PAVILION_SLOTS[id];
    return { x: r.x * k, y: r.y * k, width: r.width * k, height: r.height * k };
  };
  return { art: { x: 0, y: 0, width: PAVILION.width * k, height: PAVILION.height * k }, slot };
}

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
