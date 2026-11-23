import { runOnUI } from 'react-native-reanimated';
import { createFrameGate } from './gardenFrameGate';

export { createFrameGate } from './gardenFrameGate';

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
