// The Treehouse around the bookshelf (the room scene, book3d/scene.ts): the painting's own continuation beyond the
// shelf, revealed as the camera pulls back. Pure worklets, unit-tested in Node.
//
// The shelf is a composite of slices of interior.png, narrower than the painting. The walls (assets/bookhouse/walls,
// built by scripts/buildTreehouseWalls.py) are interior.png columns beyond its two ends, so they are drawn exactly as
// the shelf draws the painting: the same uniform scale (the shelf's painting scale × the pull-back's k), the same rows,
// and joined to the shelf's left edge (painting x = SHELF.x0) and right edge (where its last slice ends). They are at
// the shelf's depth, so they move with it as one rigid picture; nothing is stretched or re-laid out.
import { SHELF, type PullGeometry as PaintedGeometry, type PullState } from './desk';

/** The wall images: their rows are interior.png rows 0..height; columns in interior.png coordinates. */
export const WALLS = {
  height: 1300,
  /** wall-left.webp: painting x (SHELF.x0 − width) .. SHELF.x0 (the painting's right edge, ladder-free, set lower). */
  left: { width: 170 },
  /** wall-right.webp: painting x `from` .. from + width (genuine to x 1024, then the painting's own pixels moved on). */
  right: { width: 218, from: 905 },
  /** The bookcase's top beam (painting y); its shadow on the walls starts here. */
  beam: 178,
} as const;

/** How much nearer the camera the desk is than the shelf and walls (book3d/desk.ts, deskParallax): subtle. */
export const DESK_DEPTH = .14;

/** The shelf as laid out at rest (shelf-local coordinates) and where it sits in the window. */
export type WallRest = { width: number; scale: number; cabinetTop: number; rootX: number; xEnd: number };
export type TreehouseGeometry = PaintedGeometry & { rest: WallRest };
export type Rect = { x: number; y: number; width: number; height: number };

/** Where the shelf's last slice ends in the painting (its right edge, painting x), from TreehouseShelf's shelfLayout. */
export function compositeEnd(layout: { scale: number; width: number; slices: readonly { sx: number; from: number }[] }) {
  const last = layout.slices[layout.slices.length - 1];
  return last.sx + (layout.width - last.from) / layout.scale;
}

/** Window rectangles of both walls (and the bookcase they stand beside) at a point of the pull-back. */
export function wallRects(s: PullState, g: TreehouseGeometry) {
  'worklet';
  const r = g.rest;
  const f = r.scale * s.k; // window px per painting px
  // A shelf-local point → window (the shelf's own transform: uniform k about its top centre).
  const X = (x: number) => r.rootX + g.ax + (x - g.ax) * s.k;
  const Y = (y: number) => g.ay + (y - g.ay) * s.k + s.ty - g.scrollY;
  const rowY = (row: number) => Y(r.cabinetTop + (row - SHELF.top) * r.scale);
  const top = rowY(0), height = WALLS.height * f;
  const skip = Math.max(0, r.xEnd - WALLS.right.from);
  const left: Rect = { x: X(0) - WALLS.left.width * f, y: top, width: WALLS.left.width * f, height };
  const right: Rect = { x: X(r.width), y: top, width: (WALLS.right.width - skip) * f, height };
  const bookcase: Rect = { x: X(0), y: rowY(WALLS.beam), width: r.width * s.k, height: (g.sceneHeight - (r.cabinetTop + (WALLS.beam - SHELF.top) * r.scale)) * s.k };
  return { left, right, skip, bookcase, f };
}
