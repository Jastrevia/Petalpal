import type { SharedValue } from 'react-native-reanimated';
import type { CameraFrame } from './onboardingLayout';

/** The Garden camera as GardenScene lends it to the tour. The tour never replaces the camera:
 * it asks for eased moves, which GardenScene clamps with its own camera contract. */
export interface GardenCameraApi {
  x: SharedValue<number>;
  y: SharedValue<number>;
  zoom: SharedValue<number>;
  fit: number;
  baseX: number;
  baseY: number;
  viewport: { width: number; height: number };
  /** Zoom range the camera contract allows at this viewport. */
  limits: { min: number; max: number };
  /** Counts the Garden putting its camera back to the whole view (its size settling, a new layout); a tour
   *  step that frames something frames it again when this changes. */
  resets: number;
  /** Ease to a camera frame; resolves true when it arrived, false if interrupted. */
  animateTo: (frame: CameraFrame, durationMs: number) => Promise<boolean>;
}
