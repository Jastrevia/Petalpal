import {useCallback, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Easing} from 'react-native';
import {ENTRANCE_DURATION, entrancePhase, LoginEntrancePhase} from './entranceTimeline';

export interface LoginEntranceCallbacks {
  onReady?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  onReset?: () => void;
}

/** One native animation clock drives every visual track and phase boundary. */
export function useLoginEntrance(callbacks?: LoginEntranceCallbacks) {
  const progress = useState(() => new Animated.Value(0))[0];
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const running = useRef(false), mounted = useRef(true), runToken = useRef(0);
  const phaseRef = useRef<LoginEntrancePhase>('idle');
  const callbacksRef = useRef<LoginEntranceCallbacks | undefined>(callbacks);
  // eslint-disable-next-line react-hooks/refs -- the latest callbacks are kept as each render runs (the entrance tests drive it render by render)
  callbacksRef.current = callbacks;
  const [phase, setPhase] = useState<LoginEntrancePhase>('idle');
  const [ready, setReady] = useState(false), [failedAsset, setFailedAsset] = useState(false);
  const [reduced, setReduced] = useState(false);
  const publishPhase = useCallback((next: LoginEntrancePhase) => {
    if (mounted.current && phaseRef.current !== next) {
      phaseRef.current = next;
      setPhase(next);
    }
  }, []);
  const reset = useCallback(() => {
    const wasActiveOrComplete = running.current || phaseRef.current !== 'idle';
    runToken.current++;
    running.current = false;
    animation.current?.stop();
    animation.current = null;
    progress.setValue(0);
    publishPhase('idle');
    if (mounted.current && wasActiveOrComplete) {
      callbacksRef.current?.onReset?.();
    }
  }, [progress, publishPhase]);
  useEffect(() => {
    mounted.current = true;
    let disposed = false, preferenceVersion = 0;
    const applyMotionPreference = (value: boolean) => {
      if (!disposed && mounted.current) { reset(); setReduced(value); }
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (preferenceVersion === 0) applyMotionPreference(value);
    }, () => {
      if (preferenceVersion === 0) applyMotionPreference(true);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceVersion++;
      applyMotionPreference(value);
    });
    const listener = progress.addListener(({value}) => {
      // The native driver owns frames; React only updates at phase boundaries.
      if (running.current) publishPhase(entrancePhase(Math.min(value, ENTRANCE_DURATION - 1)));
    });
    return () => {
      disposed = true;
      mounted.current = false;
      running.current = false;
      runToken.current++;
      animation.current?.stop();
      progress.removeListener(listener);
      subscription.remove();
    };
  }, [progress, publishPhase, reset]);
  const play = useCallback(() => {
    if (!__DEV__ || !mounted.current || !ready || failedAsset || running.current || phaseRef.current !== 'idle') return;
    const token = ++runToken.current;
    running.current = true;
    progress.setValue(0);
    publishPhase('envelope_exiting');
    callbacksRef.current?.onStart?.();
    animation.current = Animated.timing(progress, {toValue: ENTRANCE_DURATION, duration: ENTRANCE_DURATION, easing: Easing.linear, useNativeDriver: true});
    animation.current.start(({finished}) => {
      if (!finished || !mounted.current || token !== runToken.current || !running.current) return;
      running.current = false;
      animation.current = null;
      publishPhase('complete');
      callbacksRef.current?.onComplete?.();
    });
  }, [progress, ready, failedAsset, publishPhase]);
  const seek = useCallback((ms: number) => {
    if (!__DEV__) return;
    reset();
    const time = Math.max(0, Math.min(ENTRANCE_DURATION, ms));
    progress.setValue(time);
    publishPhase(time === 0 ? 'idle' : entrancePhase(time));
  }, [progress, reset, publishPhase]);
  const assetsReady = useCallback(() => {
    if (mounted.current) {
      setReady(true);
      callbacksRef.current?.onReady?.();
    }
  }, []);
  const assetError = useCallback(() => { reset(); setFailedAsset(true); }, [reset]);
  return {progress, phase, active: phase !== 'idle' && phase !== 'complete', entered: phase === 'complete', ready: ready && !failedAsset, failedAsset, reduced, reset, play, seek, assetsReady, assetError};
}
