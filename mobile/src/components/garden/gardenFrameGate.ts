import { restingFrameSkipped } from './gardenRenderQuality';

// Shared by native (gardenNativeFrames.ts) and web (GardenCanvas.web.tsx). The app's canvas belongs to Skia, which paints whenever an animated value changes. Our patch to its
// container asks this gate first (patches/@shopify+react-native-skia), so a Garden left alone paints at
// 30 frames a second, as on the web. A frame held back is painted next, so the last one is never lost.
export function createFrameGate(gardenId: number, clock: () => number, nextFrame: (run: () => void) => void) {
  'worklet';
  let lastPaint = 0, lastTouch = clock(), touching = false, held: (() => void) | null = null, waiting = false;
  const flush = () => {
    waiting = false;
    if (!held) return;
    const now = clock();
    if (restingFrameSkipped(now, lastTouch, lastPaint, touching)) { waiting = true; nextFrame(flush); return; }
    const paint = held;
    held = null;
    lastPaint = now;
    paint();
  };
  return {
    // True when the frame was held back.
    hold(id: number, paint: () => void) {
      if (id !== gardenId) return false;
      const now = clock();
      if (restingFrameSkipped(now, lastTouch, lastPaint, touching)) {
        held = paint;
        if (!waiting) { waiting = true; nextFrame(flush); }
        return true;
      }
      held = null;
      lastPaint = now;
      return false;
    },
    touch(down: boolean) { touching = down; lastTouch = clock(); },
    moved() { lastTouch = clock(); },
  };
}

