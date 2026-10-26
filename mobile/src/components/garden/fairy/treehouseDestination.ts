import { TREEHOUSE_MAP_X, TREEHOUSE_MAP_Y, TREEHOUSE_MAP_SCALE } from '../treehouseMapPlacement';
import type { Point } from './walkNetwork';
import { nearMailbox } from './mailboxDestination';
import type { FairyState } from './FairyNavigation';

// Source pixels share TreehouseEntity's untrimmed 1448 x 1086 registration.
const world = (x: number, y: number): Point => ({
  x: TREEHOUSE_MAP_X + x * TREEHOUSE_MAP_SCALE,
  y: TREEHOUSE_MAP_Y + y * TREEHOUSE_MAP_SCALE,
});
export const treehouseApproachAnchor = world(970, 950);
export const treehouseDoorAnchor = world(874, 780);
// Continue past the open doorway behind its left trunk, not upward through a body mask.
export const treehouseInteriorAnchor = world(700, 730);

// The opening already used by the treehouse's interior-light pass.
export const TREEHOUSE_DOOR_APERTURE = 'M 854 613 C 886 605 916 621 931 653 C 940 682 931 720 912 749 L 863 774 C 836 770 810 750 799 726 C 788 699 797 660 816 637 C 827 625 839 617 854 613 Z';
export function hitsTreehouse(p: Point, placement = {
  x: TREEHOUSE_MAP_X, y: TREEHOUSE_MAP_Y, scale: TREEHOUSE_MAP_SCALE,
}) {
  const x = (p.x - placement.x) / placement.scale;
  const y = (p.y - placement.y) / placement.scale;
  // The mailbox sits inside the trunk region; leave it and the ring around it alone.
  if (nearMailbox(p, placement)) return false;
  // Follow canopy/trunk silhouette rather than capturing nearby water/path taps.
  return ((x - 710) / 630) ** 2 + ((y - 365) / 325) ** 2 <= 1 ||
    ((x - 860) / 220) ** 2 + ((y - 745) / 285) ** 2 <= 1;
}

// A tap on the treehouse. With a Bookhouse to open she goes straight in and it opens once she is
// inside (no extra button); without one (a friend's Garden, previews) the tap sends her in or out.
export type TreehouseTap = 'enter' | 'openOnEntry' | 'openBookhouse' | 'callOut';
export function treehouseTap(state: FairyState, bookhouse: boolean): TreehouseTap {
  const inside = state === 'insideTreehouse', entering = state === 'enteringTreehouse';
  if (!bookhouse) return inside || entering ? 'callOut' : 'enter';
  return inside ? 'openBookhouse' : entering ? 'openOnEntry' : 'enter';
}
