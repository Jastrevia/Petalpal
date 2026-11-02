import { Group, type Transforms3d } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import type { DerivedValue } from 'react-native-reanimated';

// Native draws the same layers in place; only the web keeps a snapshot of them for now.
export default function GardenStaticRun({ cameraTransform, children }: { cameraTransform: DerivedValue<Transforms3d>; children: ReactNode }) {
  return <Group transform={cameraTransform}>{children}</Group>;
}
