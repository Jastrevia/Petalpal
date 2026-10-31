import { useEffect, useState } from 'react';
import { cancelAnimation, runOnJS, useDerivedValue, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const IDENTITY = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0];
const MIDNIGHT = [.28,.03,.03,0,.008, 0,.37,.03,0,.018, .03,.08,.62,0,.055, 0,0,0,1,0];
export function nightColorMatrix(amount: number) {
  'worklet';
  const t = Math.max(0, Math.min(1, amount));
  return IDENTITY.map((value, i) => value + (MIDNIGHT[i] - value) * t);
}
/** One transition for scene and lanterns, driven only by the Treehouse condition. */
export function useNightLighting(enabled: boolean) {
  const reduced = useReducedMotion();
  const amount = useSharedValue(enabled ? 1 : 0);
  const [active, setActive] = useState(enabled);
  useEffect(() => {
    if (enabled) setActive(true);
    amount.value = withTiming(enabled ? 1 : 0, { duration: reduced ? 0 : enabled ? 1000 : 800 }, finished => {
      if (finished && !enabled) runOnJS(setActive)(false);
    });
    return () => cancelAnimation(amount);
  }, [enabled, reduced, amount]);
  const matrix = useDerivedValue(() => nightColorMatrix(amount.value));
  return { amount, matrix, active };
}
