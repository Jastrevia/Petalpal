import { runOnUI } from 'react-native-reanimated';
import { restingFrameSkipped } from './gardenRenderQuality';

// The app's canvas belongs to Skia, which paints whenever an animated value changes. Our patch to its
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

type Gate = ReturnType<typeof createFrameGate>;
type UiGlobal = { __skiaFrameGate?: Gate; _getAnimationTimestamp(): number; requestAnimationFrame(run: () => void): void };
// A worklet must name globalThis itself: a reference kept outside it would be copied to the UI thread, and cannot be.
const uiGlobal = () => {
  'worklet';
  return globalThis as unknown as UiGlobal;
};

export function installFrameGate(gardenId: number) {
  runOnUI(() => {
    'worklet';
    uiGlobal().__skiaFrameGate = createFrameGate(gardenId, () => uiGlobal()._getAnimationTimestamp(), run => uiGlobal().requestAnimationFrame(run));
  })();
}
export function removeFrameGate() { runOnUI(() => { 'worklet'; uiGlobal().__skiaFrameGate = undefined; })(); }
export function noteGardenTouch(down: boolean) { runOnUI(() => { 'worklet'; uiGlobal().__skiaFrameGate?.touch(down); })(); }
// The camera moving, by a gesture or on its own, counts as being touched.
export function noteGardenMotion() { 'worklet'; uiGlobal().__skiaFrameGate?.moved(); }
