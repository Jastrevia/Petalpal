// Which pull-back scene the monthly book opens into.
//
//   reference — the illustrated Treehouse (ROOM_LAYOUT 'reference', the default): the approved illustration's room — the
//               trunk and lantern, the garden window, vines, canopy and the writing desk with its quill, ink and teacup —
//               around the live bookshelf and under the live open journal (composed.ts REF, ReferenceScene.tsx).
//   portrait  — the previous mobile portrait scene, kept as a fallback (ROOM_LAYOUT 'portrait'): the original bookshelf alone in the
//               upper part of the screen and the writing desk with the open journal below it, in the app's portrait
//               column, on a plain dark ground; no room, walls or other structures around them (composed.ts,
//               ComposedRoom.tsx, variant 'portrait').
//   composed  — the Treehouse composition: the camera pulls back the way the bookshelf's own painting frames it; the
//               room is interior.png itself (arches, hanging lanterns, garden windows, the ladder and trunk), and the
//               chair-free writing desk stands in front of the bookcase (composed.ts, ComposedRoom.tsx). ROOM_SCENE with
//               ROOM_LAYOUT 'composed' (V2: the desk at the painting's own scale, the lantern moved clear of the year
//               labels, dark boards beyond the room on wide windows) or 'composed-v1' (the previous composition).
//   treehouse — the previous Treehouse version, kept as a fallback: side walls built from the painting's edge beside
//               the receding shelf (walls.ts, TreehouseWalls.tsx). ROOM_SCENE with ROOM_LAYOUT 'walls'.
//   painted   — no room: the shelf recedes and the painted desk rises in front of it (desk.ts, DeskLayer.tsx).
//               ROOM_SCENE false.
//   room      — the separately painted room layers in assets/bookhouse/room (roomDesk.ts, RoomLayers.tsx). Their
//               palette, lighting and detail did not match the bookshelf; kept only for reference. ROOM_ARTWORK.
import { composedAt, composedOrigin, type ComposedGeometry, type ComposedState } from './composed';
import { pullAt as paintedPullAt, pullOrigin as paintedPullOrigin, type PullGeometry as PaintedGeometry, type PullState as PaintedState } from './desk';
import { pullAt as roomPullAt, pullOrigin as roomPullOrigin, type PullGeometry as RoomGeometry, type PullState as RoomState } from './roomDesk';
import type { TreehouseGeometry } from './walls';

/** The Treehouse room around the shelf (false: the painted desk alone). */
export const ROOM_SCENE = true;
/** Which Treehouse layout ROOM_SCENE uses: the illustrated scene, or (fallbacks) the plain portrait scene, composition V2,
 *  V1, or the side walls. */
export const ROOM_LAYOUT: 'reference' | 'portrait' | 'composed' | 'composed-v1' | 'walls' = 'reference';
/** The separately painted room layers (rejected artwork). */
export const ROOM_ARTWORK = false;

export type PullGeometry = (PaintedGeometry & { kind: 'painted' }) | (TreehouseGeometry & { kind: 'treehouse' })
  | (ComposedGeometry & { kind: 'composed' }) | (RoomGeometry & { kind: 'room' });
/** Every scene moves the shelf by one uniform scale `k` and a translation (`ty`; `tx` in the composed scene only). */
export type PullState = PaintedState | RoomState | ComposedState;

/** p: 0 at the shelf → 1 pulled back to the desk. */
export function pullAt(p: number, g: PullGeometry): PullState {
  'worklet';
  return g.kind === 'room' ? roomPullAt(p, g) : g.kind === 'composed' ? composedAt(p, g) : paintedPullAt(p, g);
}

/** The shelf picture's transform at `p`: one uniform scale about its top centre, then a translation. */
export function shelfTransform(p: number, g: PullGeometry | null) {
  'worklet';
  if (!g || p <= 0) return { k: 1, tx: 0, ty: 0 };
  const s = pullAt(p, g);
  return { k: s.k, tx: g.kind === 'composed' ? (s as ComposedState).tx : 0, ty: s.ty };
}

type Slot = { cam: { cx: number; cy: number; d: number }; x: number; bottom: number; height: number };
/** A shelf slot where it is at a point of the pull-back (the same uniform transform as the rest of the shelf). */
export function pullOrigin(o: Slot, s: PullState | null, g: PullGeometry | null, rootX: number, scrollY: number) {
  'worklet';
  if (!s || !g) return o;
  if (g.kind === 'room') return roomPullOrigin(o, s as RoomState, g, rootX, scrollY);
  if (g.kind === 'composed') return composedOrigin(o, s as ComposedState, g, rootX, scrollY);
  return paintedPullOrigin(o, s as PaintedState, g, rootX, scrollY);
}
