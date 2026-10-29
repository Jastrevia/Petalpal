import { Group, Image, type SkImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type DerivedValue, type SharedValue } from 'react-native-reanimated';

// One cell of a frame sheet (frames of a painted motion in a grid, `columns` wide, each `w` × `h`
// in the sheet's pixels), drawn at the origin and `w` × `h` big: `frame` picks the cell on the UI
// thread, so changing frames never re-renders. Callers scale and place it with their transform.
export default function SheetFrame({ sheet, frame, columns, count, w, h }: {
  sheet: SkImage; frame: SharedValue<number> | DerivedValue<number>; columns: number; count: number; w: number; h: number;
}) {
  const x = useDerivedValue(() => -(frame.value % columns) * w, [columns, w]);
  const y = useDerivedValue(() => -Math.floor(frame.value / columns) * h, [columns, h]);
  const clip = useMemo(() => ({ x: 0, y: 0, width: w, height: h }), [w, h]);
  const rows = Math.ceil(count / columns);
  return <Group clip={clip}>
    <Image image={sheet} x={x} y={y} width={w * columns} height={h * rows} fit="fill" />
  </Group>;
}
