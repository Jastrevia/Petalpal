import type { PetId, PetOutfit, PetsSummary } from '@/services/gardenPets';
import { MALTESE_NOBLE, PUPPY_SET_2 } from './puppyLooks';

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
// enough to stay whole on the screen. `panel`: the same plate listing foods or pieces, with room
// for its title above and its page dots just outside it.
export function ringLayout(pet: PetSpot, viewport: Viewport, panel = false): RingLayout {
  const { width, height } = viewport;
  // Small enough to sit beside the pet without covering the Garden (owner, 2026-11-05: big enough
  // to read, no bigger); each segment still a comfortable tap. The food and wardrobe panels are
  // the very same plate as the ring (owner: the same size), their cards along its middle.
  const inner = clamp(pet.body * 0.5, 30, 70);
  const outer = inner + 58;
  const header = panel ? 52 : 0;
  const room = outer + (panel ? 24 : 0);
  let cx = pet.x;
  const cy0 = pet.y - pet.body * 0.38;
  const right = cx + room <= width - MARGIN, left = cx - room >= MARGIN;
  const side: 1 | -1 = right ? 1 : left ? -1 : cx <= width / 2 ? 1 : -1;
  if (side === 1) cx = Math.max(Math.min(cx, width - MARGIN - room), MARGIN - inner * 0.5);
  else cx = Math.min(Math.max(cx, MARGIN + room), width - MARGIN + inner * 0.5);
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
  // (A press with no position, as from a keyboard, is outside: NaN fails every comparison.)
  if (!(r >= layout.inner && r <= layout.outer)) return null;
  const a = Math.atan2(dy, dx); // (-π, π]
  const t = layout.side === 1 ? a / (Math.PI / 3) : (Math.PI - (a < 0 ? a + 2 * Math.PI : a)) / (Math.PI / 3);
  if (!(t >= -1 && t <= 1)) return null;
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

// A pet with its own pieces (the server's PET_OWN_PIECES): its closet holds only those, each under
// the catalog id it is kept as (it opens with that piece), shown with its own name and painting.
// The Maltese (Xiaobai), per shelf its light set's piece then its Noble set's: its flower clip,
// its lilac capelet with a gold clasp, its pink bow; the Noble headpiece, violet capelet and
// crystal clasp (puppyLooks.ts MALTESE_NOBLE).
export type OwnPiece = { id: string; name: { en: string; 'zh-Hans': string } };
// The golden puppy (owner, 2026-11-06): the same two pieces per shelf, its set 2 then set 1, named
// and painted as its design sheets show them (Refined: flower sprig, petal capelet, crystal drop;
// Noble: golden circlet, midnight cape, crystal spire).
export const PET_OWN_PIECES: Partial<Record<PetId, Record<Shelf, readonly OwnPiece[]>>> = {
  puppy: {
    hat: [{ id: 'flower-sprig', name: { en: 'Flower Sprig', 'zh-Hans': '鬓边花枝' } },
      { id: 'golden-circlet', name: { en: 'Golden Circlet', 'zh-Hans': '金叶头环' } }],
    collar: [{ id: 'petal-capelet', name: { en: 'Petal Capelet', 'zh-Hans': '花瓣小披肩' } },
      { id: 'midnight-cape', name: { en: 'Midnight Cape', 'zh-Hans': '午夜披风' } }],
    pendant: [{ id: 'crystal-drop', name: { en: 'Crystal Drop', 'zh-Hans': '水晶坠' } },
      { id: 'crystal-spire', name: { en: 'Crystal Spire', 'zh-Hans': '水晶尖坠' } }],
  },
  maltese: {
    hat: [{ id: 'flower-sprig', name: { en: 'Flower Clip', 'zh-Hans': '小花夹' } },
      { id: 'golden-circlet', name: { en: 'Noble Headpiece', 'zh-Hans': '紫藤金叶头饰' } }],
    collar: [{ id: 'petal-capelet', name: { en: 'Lilac Capelet', 'zh-Hans': '紫色小披肩' } },
      { id: 'midnight-cape', name: { en: 'Noble Capelet', 'zh-Hans': '星夜紫披肩' } }],
    pendant: [{ id: 'crystal-drop', name: { en: 'Pink Bow', 'zh-Hans': '粉色蝴蝶结' } },
      { id: 'crystal-spire', name: { en: 'Noble Clasp', 'zh-Hans': '紫晶扣链' } }],
  },
};
// The catalog as `petId` has it: each pet's pieces open on their own (lib/garden-pets.js
// unlockedPetPieces: from Lv 4 one random piece per level over both pets' twelve), so a piece the
// other pet has is still locked here. A server from before that says only `unlocked` for both.
export function forPet(pets: Pick<PetsSummary, 'accessories' | 'petPieces'>, petId: PetId): Piece[] {
  const mine = pets.petPieces?.[petId];
  if (!mine) return [...pets.accessories];
  return pets.accessories.map(piece => (piece.id in mine
    ? { ...piece, unlocked: mine[piece.id] !== null, unlockedAtLevel: mine[piece.id] } : { ...piece, unlocked: false, unlockedAtLevel: null }));
}
// The shelf as `petId` sees it: its own pieces (renamed) when it has its own, else the whole row.
export function petShelf(accessories: readonly Piece[], shelf: Shelf, petId: PetId, locale: 'en' | 'zh-Hans'): Piece[] {
  const own = PET_OWN_PIECES[petId]?.[shelf];
  if (!own) return shelfOf(accessories, shelf);
  const ids = own.map(item => item.id);
  return accessories.filter(piece => ids.includes(piece.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    .map(piece => ({ ...piece, name: own[ids.indexOf(piece.id)].name[locale] }));
}

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
// The same for the Maltese (puppyLooks.ts malteseLookOfOutfit): one of its sets at a time, and its
// Noble capelet carries its own clasp (its light capelet does not: the bow shows over it).
export function malteseHiddenPieces(outfit: PetOutfit | null): Set<string> {
  const hidden = new Set<string>();
  if (!outfit) return hidden;
  const setOf = (id: string | null) => (id ? (MALTESE_NOBLE.has(id) ? 2 : 1) : 0);
  const set = setOf(outfit.collar) || setOf(outfit.hat) || setOf(outfit.pendant);
  for (const id of [outfit.hat, outfit.collar, outfit.pendant]) if (id && setOf(id) !== set) hidden.add(id);
  if (set === 2 && outfit.collar && outfit.pendant) hidden.add(outfit.pendant);
  return hidden;
}
export function puppyHiddenPieces(outfit: PetOutfit | null): Set<string> {
  const hidden = new Set<string>();
  if (!outfit) return hidden;
  const setOf = (id: string | null) => (id ? (PUPPY_SET_2.has(id) ? 2 : 1) : 0);
  const set = setOf(outfit.collar) || setOf(outfit.hat) || setOf(outfit.pendant);
  if (outfit.hat && setOf(outfit.hat) !== set) hidden.add(outfit.hat);
  if (outfit.pendant && (outfit.collar || setOf(outfit.pendant) !== set)) hidden.add(outfit.pendant);
  return hidden;
}
