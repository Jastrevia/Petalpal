import type { PetOutfit, PetsSummary } from '@/services/gardenPets';
import { PUPPY_SET_2 } from './puppyLooks';

// The pet's ring menu (PetRingMenu.tsx, the owner's mock-up): a one-third ring (120°) standing
// beside the pet that was tapped, in three segments (feed, pat, dress up), which widens into one
// arc panel listing the foods or the wardrobe. Pure geometry and wardrobe rules, kept here so
// they can be tested.

export const RING_DEGREES = 120;
export const RING_ACTIONS = ['feed', 'pat', 'dress'] as const;
export type RingAction = typeof RING_ACTIONS[number];

// `x`, `y`: where the pet's paws stand on screen; `body`: how big it is drawn (screen pixels).
export type PetSpot = { x: number; y: number; body: number };
export type Viewport = { width: number; height: number };
// `cx`, `cy`: the ring's centre; `side` 1 to the right of the pet, -1 to its left; `inner` and
// `outer` radii; `header` room kept above it for a panel's title and tabs.
export type RingLayout = { cx: number; cy: number; side: 1 | -1; inner: number; outer: number; header: number };

const MARGIN = 8;
// Kept clear at the top and bottom of the Garden for its own buttons and the tab bar.
export const TOP_CLEAR = 48, BOTTOM_CLEAR = 92;
const SIN = Math.sin(Math.PI / 3);
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

// The ring around the pet's body, to its right (its left when the right has no room), moved just
// enough to stay whole on the screen. `panel`: the wider arc that lists foods or pieces.
export function ringLayout(pet: PetSpot, viewport: Viewport, panel = false): RingLayout {
  const { width, height } = viewport;
  // Small enough to sit beside the pet without covering the Garden (owner, 2026-11-05: big enough
  // to read, no bigger); each segment still a comfortable tap.
  const inner = clamp(pet.body * 0.5, 30, 70);
  const outer = inner + (panel ? clamp(width * 0.3, 112, 126) : 58);
  const header = panel ? 52 : 0;
  let cx = pet.x;
  const cy0 = pet.y - pet.body * 0.38;
  const right = cx + outer <= width - MARGIN, left = cx - outer >= MARGIN;
  const side: 1 | -1 = right ? 1 : left ? -1 : cx <= width / 2 ? 1 : -1;
  if (side === 1) cx = Math.max(Math.min(cx, width - MARGIN - outer), MARGIN - inner * 0.5);
  else cx = Math.min(Math.max(cx, MARGIN + outer), width - MARGIN + inner * 0.5);
  const half = outer * SIN;
  const cy = Math.max(TOP_CLEAR + header + half, Math.min(cy0, height - BOTTOM_CLEAR - half));
  return { cx, cy, side, inner, outer, header };
}

// The direction (radians, screen axes: 0 points right, y grows down) at `t` along the ring,
// -1 its top end, 1 its bottom end.
export const ringAngle = (layout: RingLayout, t: number) =>
  layout.side === 1 ? t * Math.PI / 3 : Math.PI - t * Math.PI / 3;

// A point at radius `r` and `t` along the ring.
export function ringPoint(layout: RingLayout, r: number, t: number) {
  const a = ringAngle(layout, t);
  return { x: layout.cx + r * Math.cos(a), y: layout.cy + r * Math.sin(a) };
}

// Where a screen point falls: outside the ring (null), or `t` along it and the segment (0 top).
export function ringSpot(layout: RingLayout, x: number, y: number) {
  const dx = x - layout.cx, dy = y - layout.cy, r = Math.hypot(dx, dy);
  if (r < layout.inner || r > layout.outer) return null;
  const a = Math.atan2(dy, dx); // (-π, π]
  const t = layout.side === 1 ? a / (Math.PI / 3) : (Math.PI - (a < 0 ? a + 2 * Math.PI : a)) / (Math.PI / 3);
  if (t < -1 || t > 1) return null;
  return { t, segment: Math.min(RING_ACTIONS.length - 1, Math.floor((t + 1) / 2 * RING_ACTIONS.length)) };
}

// Skia's arc: start angle and sweep in degrees (clockwise on screen).
export const ringArc = (layout: RingLayout) => ({ start: layout.side === 1 ? -60 : 120, sweep: RING_DEGREES });

// Along the panel's middle arc (radius `r`), how far from the centre sideways a card sits whose
// middle is `dy` above or below it.
export const arcOffset = (r: number, dy: number) => Math.sqrt(Math.max(0, r * r - dy * dy));

// ---- The wardrobe ----

export type Piece = PetsSummary['accessories'][number];
export const SHELVES = ['hat', 'collar', 'pendant'] as const;
export type Shelf = typeof SHELVES[number];
export const NO_OUTFIT: PetOutfit = { hat: null, collar: null, pendant: null };

// One shelf of the closet: every piece of that row, in catalog order, opened or not.
export const shelfOf = (accessories: readonly Piece[], shelf: Shelf) => accessories.filter(piece => piece.row === shelf);

// The whole outfit after choosing `piece` (the PUT sends all three slots): it goes on in its own
// slot, or comes off when it is already on. A piece not yet opened cannot be chosen (null).
export function outfitWith(outfit: PetOutfit | null, piece: Piece): PetOutfit | null {
  if (!piece.unlocked) return null;
  const now = outfit ?? NO_OUTFIT;
  return { ...now, [piece.row]: now[piece.row] === piece.id ? null : piece.id };
}

export const isWorn = (outfit: PetOutfit | null, piece: Piece) => outfit?.[piece.row] === piece.id;

// Pieces the puppy has on but does not show (puppyLooks.ts): it wears one of its sets at a time
// (the cape's set wins, else the hat's), and a cape carries its own clasp, so a pendant shows
// only without one.
export function puppyHiddenPieces(outfit: PetOutfit | null): Set<string> {
  const hidden = new Set<string>();
  if (!outfit) return hidden;
  const setOf = (id: string | null) => (id ? (PUPPY_SET_2.has(id) ? 2 : 1) : 0);
  const set = setOf(outfit.collar) || setOf(outfit.hat) || setOf(outfit.pendant);
  if (outfit.hat && setOf(outfit.hat) !== set) hidden.add(outfit.hat);
  if (outfit.pendant && (outfit.collar || setOf(outfit.pendant) !== set)) hidden.add(outfit.pendant);
  return hidden;
}
