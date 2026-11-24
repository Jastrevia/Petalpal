import { useEffect } from 'react';
import { Easing, cancelAnimation, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

// Lightning over a stormy Garden. Nothing is drawn on top: the flash value re-lights the whole
// painting through the scene grade (a cold white sky for an instant), lights every raindrop in the
// air and flares on the water, then the storm goes dark again. Strikes come at irregular gaps, some
// close (a hard double or triple flicker), some far off (a dim sheet of light behind the clouds).
// Reduced motion: no flashes at all.

function strike(near: boolean) {
  'worklet';
  const peak = near ? 1 : 0.32 + Math.random() * 0.16;
  const flicker = near ? (Math.random() < 0.6 ? 2 : 3) : 1;
  const steps = [];
  for (let i = 0; i < flicker; i++) {
    steps.push(withTiming(peak * (i === 0 ? 1 : 0.7 + Math.random() * 0.3), { duration: near ? 45 : 140, easing: Easing.out(Easing.quad) }));
    steps.push(withTiming(peak * (i === flicker - 1 ? 0 : 0.18), { duration: i === flicker - 1 ? (near ? 650 : 900) : 70, easing: Easing.in(Easing.quad) }));
  }
  return steps;
}

export function useLightning(active: boolean) {
  const reduced = useReducedMotion();
  const flash = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) { flash.value = 0; return; }
    let timer: ReturnType<typeof setTimeout>;
    const next = (first: boolean) => {
      timer = setTimeout(() => {
        const near = Math.random() < 0.55;
        const steps = strike(near);
        flash.value = withSequence(...(steps as [number, ...number[]]));
        next(false);
      }, first ? 2500 + Math.random() * 2000 : 4500 + Math.random() * 9000);
    };
    next(true);
    return () => { clearTimeout(timer); cancelAnimation(flash); flash.value = 0; };
  }, [active, reduced, flash]);
  return flash;
}
