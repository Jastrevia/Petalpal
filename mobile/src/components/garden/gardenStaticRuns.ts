import type { SkImage, SkPicture } from '@shopify/react-native-skia';
import { createContext } from 'react';

// Artwork that does not move (the islands, roads and shores) costs most of each frame. While the camera
// rests, each such run of layers is kept as a snapshot at the screen's exact pixels, so it looks identical
// and every frame only has to paste it. As soon as the camera moves the layers are drawn as they always were.
export type GardenCamera = { x: number; y: number; zoom: number };
export type StaticRun<Picture> = {
  camera(): GardenCamera;
  picture(): Picture | null;
  // The camera the current snapshot shows, or null.
  snapshotCamera(): GardenCamera | null;
  capture(picture: Picture, camera: GardenCamera): void;
  invalidate(): boolean;
};
type Tracked = { still: GardenCamera; since: number };
export const SETTLE_MS = 250;
// A frame being recorded may still name the old picture or image: let the next one replace it first.
export const afterNextFrames = (action: () => void) => { requestAnimationFrame(() => requestAnimationFrame(action)); };
export function sameCamera(a: GardenCamera | null, b: GardenCamera | null) {
  'worklet';
  return !!a && !!b && a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

// How far a snapshot reaches past each edge of the screen, in whole points, so a drag only slides it along.
export type SnapshotReach = { left: number; right: number; top: number; bottom: number };
// A snapshot may be this many screens of pixels. The camera cannot leave the Garden, so no pixel is spent
// past the place it stops: on a phone at its widest view the whole reachable Garden fits, and no drag
// there ever draws these layers again. Zoomed in, the same budget is shared out around the screen.
export const SNAPSHOT_SCREENS = 2.5;
// `camera` is the scene's own transform (its zoom is the full scale), `bounds` the Garden in world units.
export function planSnapshotReach(camera: GardenCamera, width: number, height: number,
  bounds: { x: number; y: number; width: number; height: number }): SnapshotReach {
  'worklet';
  // One point more than the camera can travel, so rounding never leaves the last point uncovered.
  const want = (travel: number) => Math.ceil(Math.max(0, travel)) + 1;
  const left = want(-bounds.x * camera.zoom - camera.x), right = want(camera.x - (width - (bounds.x + bounds.width) * camera.zoom));
  const top = want(-bounds.y * camera.zoom - camera.y), bottom = want(camera.y - (height - (bounds.y + bounds.height) * camera.zoom));
  const area = SNAPSHOT_SCREENS * width * height;
  let extraX = left + right, extraY = top + bottom;
  if ((width + extraX) * (height + extraY) > area) {
    extraY = Math.min(extraY, Math.floor(height * (Math.sqrt(SNAPSHOT_SCREENS) - 1)));
    extraX = Math.max(0, Math.min(extraX, Math.floor(area / (height + extraY) - width)));
    extraY = Math.max(0, Math.min(top + bottom, Math.floor(area / (width + extraX) - height)));
  }
  // Each side takes its half, and what one side cannot use goes to the other.
  const share = (first: number, second: number, extra: number) => {
    const other = Math.min(second, extra - Math.min(first, Math.floor(extra / 2)));
    return { first: Math.min(first, extra - other), second: other };
  };
  const x = share(left, right, extraX), y = share(top, bottom, extraY);
  return { left: x.first, right: x.second, top: y.first, bottom: y.second };
}
// What is left of a snapshot's reach once the camera has slid to `camera`; null when it no longer covers the screen.
export function snapshotReachAt(taken: GardenCamera, reach: SnapshotReach, camera: GardenCamera): SnapshotReach | null {
  'worklet';
  if (taken.zoom !== camera.zoom) return null;
  const dx = camera.x - taken.x, dy = camera.y - taken.y;
  const left = reach.left - dx, right = reach.right + dx, top = reach.top - dy, bottom = reach.bottom + dy;
  // Half a point to spare: the slide lands on whole device pixels.
  return left >= .5 && right >= .5 && top >= .5 && bottom >= .5 ? { left, right, top, bottom } : null;
}
// True when a new snapshot here would reach no further than the one held, so taking it would be wasted work.
export function snapshotStillBest(left: SnapshotReach | null, plan: SnapshotReach) {
  'worklet';
  return !!left && left.left >= plan.left - 1 && left.right >= plan.right - 1 && left.top >= plan.top - 1 && left.bottom >= plan.bottom - 1;
}

export function createStaticRunHost<Picture>() {
  const runs = new Map<StaticRun<Picture>, Tracked | null>();
  return {
    add(run: StaticRun<Picture>) { runs.set(run, null); return () => { runs.delete(run); }; },
    // Snapshots belong to one GPU surface. True when one was showing, so its frame must be recorded anew.
    invalidateAll() { let any = false; for (const run of runs.keys()) any = run.invalidate() || any; return any; },
    // At most one snapshot per frame, and only once the camera has rested, so taking them never adds up.
    step(now: number) {
      for (const [run, tracked] of runs) {
        const camera = run.camera();
        if (!tracked || !sameCamera(tracked.still, camera)) { runs.set(run, { still: camera, since: now }); continue; }
        if (sameCamera(run.snapshotCamera(), camera) || now - tracked.since < SETTLE_MS) continue;
        const picture = run.picture();
        if (picture) { run.capture(picture, camera); return; }
      }
    },
  };
}
export const StaticRunContext = createContext<{
  host: ReturnType<typeof createStaticRunHost<SkPicture>>;
  snapshot(picture: SkPicture, camera: GardenCamera): { image: SkImage; width: number; height: number } | null;
  register(id: number, onPicture: (picture: SkPicture) => void): () => void;
} | null>(null);
