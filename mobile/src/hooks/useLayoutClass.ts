import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layoutClassFor, type LayoutClass } from './layoutClass';

export type { LayoutClass, Orientation, SizeClass } from './layoutClass';

/** Size class, orientation and safe-area-aware usable size of the current window. */
export function useLayoutClass(): LayoutClass {
  const { width, height } = useWindowDimensions();
  const { top, right, bottom, left } = useSafeAreaInsets();
  return useMemo(() => layoutClassFor(width, height, { top, right, bottom, left }), [width, height, top, right, bottom, left]);
}
