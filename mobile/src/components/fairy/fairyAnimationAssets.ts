// The approved onboarding suite (1112x834 transparent animated WebP). WebM copies are required
// only by FairyAnimationStage.web.tsx, so iOS builds do not carry them. The .mov copies (HEVC with
// alpha, from the same WebM frames) live in FairyAnimationStage.ios.tsx, so only iOS carries them.
export type FairyAnimationState = 'idle' | 'greet' | 'celebrate' | 'fly';

// Canonical mapping
export const FAIRY_ANIMATION_ASSETS = {
  idle: {
    webp: require('@/assets/garden/fairy/onboarding-suite/fairy-idle.webp'),
    durationMs: 2500, // 2.50s seamless living hover loop
    loops: true,
  },
  greet: {
    webp: require('@/assets/garden/fairy/onboarding-suite/fairy-greet.webp'),
    durationMs: 5040, // 121 frames @ 24fps = 5.04s
    loops: false,
  },
  celebrate: {
    webp: require('@/assets/garden/fairy/onboarding-suite/fairy-celebrate.webp'),
    durationMs: 5040, // 121 frames @ 24fps = 5.04s
    loops: false,
  },
  fly: {
    webp: require('@/assets/garden/fairy/onboarding-suite/fairy-fly.webp'),
    // The tour's guide is drawn 123 pt tall, 370 px on a 3x phone: this copy has exactly those
    // pixels (Lanczos from the same frames), so the phone decodes a fifth of the pixels and never
    // rescales a frame, and the picture on screen is the same.
    compact: { webp: require('@/assets/garden/fairy/onboarding-suite/fairy-fly-guide.webp'), pixelHeight: 370 },
    durationMs: 5040, // 121 frames @ 24fps = 5.04s
    loops: false,
  },
} as const;

/** One request of a state: `id` changes every time the controller is asked for a state anew. */
export type FairyPlay = { state: FairyAnimationState; id: number };

export type FairyAnimationStageProps = {
  play: FairyPlay;
  /** Whether the current request loops (web video `loop`); one-shots end on the controller's timer. */
  loop: boolean;
  reduced: boolean;
  /** Called once when an action's first frame is on screen, with `play.id`. */
  onStart: (id: number) => void;
  /** Called when a one-shot action has played to its last frame, with `play.id` (stages that can tell). */
  onEnd?: (id: number) => void;
  /** The stage's height in points, so native can use a copy made at exactly the pixels shown. */
  height: number;
};
