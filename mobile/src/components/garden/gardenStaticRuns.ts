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
