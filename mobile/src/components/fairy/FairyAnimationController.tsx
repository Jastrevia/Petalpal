import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { FairyAnimationStage } from './FairyAnimationStage';
import { FAIRY_ANIMATION_ASSETS, type FairyAnimationState, type FairyPlay } from './fairyAnimationAssets';

// The first-time tour's Fairy: the approved onboarding suite (transparent animated WebP, and
// WebM on web where the browser shows its alpha). How each platform draws it lives in
// FairyAnimationStage(.web).tsx; this file owns timing, so every platform reports the same way.
export { FAIRY_ANIMATION_ASSETS, type FairyAnimationState } from './fairyAnimationAssets';

// Visual dimensions & normalization constants from 1112x834 master canvas
export const FAIRY_CANVAS_ASPECT = 1112 / 834; // 1.3333 (4:3)
export const FAIRY_CHARACTER_CANVAS_RATIO = 636 / 834; // 0.7626 (character Y: 96..732 = 636px)

/** If playback never reports that it began (a slow first load, a decode error), a one-shot still
 *  finishes this long after its natural length, so the tour can never stall on her. */
const START_GRACE_MS = 1500;

export interface FairyAnimationControllerProps {
  /** Desired animation state. Actions (greet, celebrate, fly) play once then return to idle unless loop is true. */
  state?: FairyAnimationState;
  /** Visual height of the fairy character in pixels (e.g. 340). */
  characterHeight: number;
  /** Fired exactly once when a one-shot action finishes (immediately under reduced motion). */
  onAnimationComplete?: (completedState: FairyAnimationState) => void;
  /** Outer container style. */
  style?: StyleProp<ViewStyle>;
  /** Force looping behavior for the current state. */
  loop?: boolean;
}

export function FairyAnimationController({
  state = 'idle',
  characterHeight,
  onAnimationComplete,
  style,
  loop,
}: FairyAnimationControllerProps) {
  const reduced = useReducedMotion();
  // Callers pass a fresh function each render; keeping it in a ref means a re-render never
  // restarts the timer (which could otherwise delay or skip the report).
  const done = useRef(onAnimationComplete);
  done.current = onAnimationComplete;

  // Each state asked for is a new request; a one-shot request plays once, then she rests in idle.
  const [request, setRequest] = useState<FairyPlay>({ state, id: 0 });
  if (request.state !== state) setRequest({ state, id: request.id + 1 });
  const [settled, setSettled] = useState(-1);
  const oneShot = !(loop ?? FAIRY_ANIMATION_ASSETS[request.state].loops);
  // Under reduced motion an action is not played: she is shown resting and the action reports at once.
  const shown: FairyAnimationState = settled === request.id || (reduced && oneShot) ? 'idle' : request.state;

  const reported = useRef(-1);
  const started = useRef<{ id: number; at: number } | null>(null);
  const begin = useRef<((id: number) => void) | null>(null);
  const handleStart = useCallback((id: number) => {
    if (started.current?.id === id) return;
    started.current = { id, at: Date.now() };
    begin.current?.(id);
  }, []);

  useEffect(() => {
    if (!oneShot) return;
    const { id, state: played } = request;
    const finish = () => {
      if (reported.current === id) return; // once per request, StrictMode re-runs included
      reported.current = id;
      setSettled(id);
      done.current?.(played);
    };
    if (reduced) { finish(); return; }
    const duration = FAIRY_ANIMATION_ASSETS[played].durationMs;
    // Count her length from the moment the animation is actually on screen, not from the request.
    const from = (at: number) => setTimeout(finish, Math.max(0, duration - (Date.now() - at)));
    let timer = started.current?.id === id ? from(started.current.at) : setTimeout(finish, START_GRACE_MS + duration);
    begin.current = startedId => {
      if (startedId !== id || !started.current) return;
      clearTimeout(timer);
      timer = from(started.current.at);
    };
    return () => { clearTimeout(timer); begin.current = null; };
  }, [request, oneShot, reduced]);

  // Sizing: Canvas preserves exact 1112:834 aspect ratio so character is never stretched
  const canvasHeight = characterHeight / FAIRY_CHARACTER_CANVAS_RATIO;
  const canvasWidth = canvasHeight * FAIRY_CANVAS_ASPECT;

  return (
    <View pointerEvents="none" style={[styles.container, { width: canvasWidth, height: canvasHeight }, style]}>
      <FairyAnimationStage
        play={{ state: shown, id: request.id }}
        loop={!oneShot}
        reduced={reduced}
        onStart={handleStart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
});
