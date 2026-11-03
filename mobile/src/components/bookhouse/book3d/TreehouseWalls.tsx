import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { BlurStyle, Canvas, Picture, Skia, createPicture, useImage } from '@shopify/react-native-skia';
import { pullAt } from './desk';
import { wallRects, WALLS, type TreehouseGeometry } from './walls';

const LEFT = require('../../../../assets/bookhouse/walls/wall-left.webp');
const RIGHT = require('../../../../assets/bookhouse/walls/wall-right.webp');

/** The Treehouse around the bookshelf, behind it: the painting's own trunks, garden windows, vines and ladder beyond
 *  the shelf's two ends, revealed as the camera pulls back (book3d/walls.ts). The bookcase stands slightly proud of
 *  the wall, so it casts a soft shadow onto it along its sides. */
export function TreehouseWalls({ pull, geometry }: { pull: SharedValue<number>; geometry: TreehouseGeometry }) {
  const left = useImage(LEFT);
  const right = useImage(RIGHT);
  const picture = useDerivedValue(() => createPicture(canvas => {
    const p = pull.value;
    if (!left || !right || p <= 0) return;
    const s = pullAt(p, geometry);
    const w = wallRects(s, geometry);
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    // Beside the shelf at rest on wide windows: the walls arrive with the camera rather than popping in.
    paint.setAlphaf(Math.min(1, p * 6));
    canvas.drawImageRect(left, Skia.XYWHRect(0, 0, left.width(), left.height()), Skia.XYWHRect(w.left.x, w.left.y, w.left.width, w.left.height), paint);
    const k = right.width() / WALLS.right.width;
    canvas.drawImageRect(right, Skia.XYWHRect(w.skip * k, 0, right.width() - w.skip * k, right.height()), Skia.XYWHRect(w.right.x, w.right.y, w.right.width, w.right.height), paint);
    const shade = Skia.Paint();
    shade.setAntiAlias(true);
    shade.setColor(Skia.Color('#1E0E04'));
    shade.setAlphaf(.5 * Math.min(1, p * 4));
    shade.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(2, 7 * w.f), true));
    const b = w.bookcase;
    canvas.drawRect(Skia.XYWHRect(b.x - 2, b.y + 3, b.width + 4, b.height), shade);
  }), [left, right, geometry]);
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}
