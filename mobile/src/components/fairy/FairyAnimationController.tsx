import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { FairyGlide, FairyPortrait, Hover, glideWidth, portraitWidth } from '../onboarding/FairyArt';

// The first-time tour's Fairy, drawn only from her approved paintings (onboarding/FairyArt): the
// glide pose while she flies, the layered portrait (wings breathing) otherwise. The intro branch
// expected an animated controller that was never pushed; this keeps its interface, so the
// tour runs unchanged and that controller can replace this file as is.
export type FairyAnimationState = 'fly' | 'greet' | 'idle' | 'celebrate';

/** Her visible height as a share of the box she is drawn in. */
export const FAIRY_CHARACTER_CANVAS_RATIO = 1;
/** The box's width over its height: wide enough for the glide pose, the widest one. */
export const FAIRY_CANVAS_ASPECT = 0.75;

// How long a one-off state plays before it reports back (looping states never report).
const DURATION: Record<FairyAnimationState, number> = { fly: 1100, greet: 900, celebrate: 1400, idle: 0 };

export function FairyAnimationController({ state, characterHeight, loop = false, onAnimationComplete }: {
  state: FairyAnimationState;
  characterHeight: number;
  loop?: boolean;
  onAnimationComplete?: (state: FairyAnimationState) => void;
}) {
  const reduced = useReducedMotion();
  const done = useRef(onAnimationComplete);
  done.current = onAnimationComplete;
  useEffect(() => {
    if (loop || state === 'idle' || !done.current) return;
    const timer = setTimeout(() => done.current?.(state), reduced ? 0 : DURATION[state]);
    return () => clearTimeout(timer);
  }, [state, loop, reduced]);

  const height = characterHeight;
  const flying = state === 'fly';
  const width = flying ? glideWidth(height * .8) : portraitWidth(height);
  return <View pointerEvents="none" style={{ width: height * FAIRY_CANVAS_ASPECT, height, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
    <Hover amplitude={flying ? 3 : state === 'celebrate' ? 8 : 5} period={state === 'celebrate' ? 1400 : 2600}>
      <View style={{ width, alignItems: 'center' }}>
        {flying ? <FairyGlide height={height * .8} /> : <FairyPortrait height={height} />}
      </View>
    </Hover>
  </View>;
}
