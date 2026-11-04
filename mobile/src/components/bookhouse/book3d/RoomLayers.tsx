import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { BlurStyle, Canvas, ClipOp, Picture, Skia, createPicture, useImage, type SkCanvas, type SkImage } from '@shopify/react-native-skia';
import { pullAt, QUILL, roomMapping, ROOM, type Mapping, type PullGeometry } from './roomDesk';

const ROOM_BACK = require('../../../../assets/bookhouse/room/room-back.webp');
const ROOM_FRAME = require('../../../../assets/bookhouse/room/room-frame.webp');
const DESK = require('../../../../assets/bookhouse/room/desk.webp');
const QUILL_ART = require('../../../../assets/bookhouse/room/quill.webp');
/** How much nearer the camera the botanical frame is than the shelf (it starts this much larger, beyond the screen). */
const FRAME_DEPTH = 2.6;

function drawCanvasLayer(canvas: SkCanvas, image: SkImage, m: Mapping, alpha = 1) {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  if (alpha < 1) paint.setAlphaf(alpha);
  // The whole artwork, uniformly scaled: never stretched or cropped differently per axis.
  canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(m.ox, m.oy, ROOM.width * m.c, ROOM.height * m.c), paint);
}

/** The room behind the bookshelf: walls, side windows and the wall panel the bookcase stands against. It is registered
 *  to the shelf throughout the pull-back (they are at the same depth), so it opens up around the shelf as it recedes. */
export function RoomBack({ pull, geometry }: { pull: SharedValue<number>; geometry: PullGeometry }) {
  const back = useImage(ROOM_BACK);
  const picture = useDerivedValue(() => createPicture(canvas => {
    const p = pull.value;
    if (!back || p <= 0) return;
    const s = pullAt(p, geometry);
    // Only visible where the shelf does not already fill the window (wide windows): it arrives as the camera starts back.
    drawCanvasLayer(canvas, back, roomMapping(s, geometry), Math.min(1, p * 8));
    // The bookcase stands against the wall: a soft shadow around it gives it depth and softens its sides.
    const g = geometry, b = g.bookcase;
    const x0 = g.rootX + g.ax - g.ax * s.k, w = b.width * s.k;
    const y0 = g.ay + (b.top - g.ay) * s.k + s.ty - g.scrollY, h = (b.bottom - b.top) * s.k;
    const shade = Skia.Paint();
    shade.setAntiAlias(true);
    shade.setColor(Skia.Color('#1E0E04'));
    shade.setAlphaf(.55 * s.e);
    shade.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(3, 9 * s.k), true));
    canvas.drawRect(Skia.XYWHRect(x0 - 3, y0 + 2, w + 6, h), shade);
  }), [back, geometry]);
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}

/** In front of the bookshelf: the botanical frame (trunks, wisteria, lanterns) sweeping in from beyond the screen as
 *  the camera passes it, the writing desk rising into the foreground, and the quill lying on the desk's right. */
export function RoomFront({ pull, geometry, height }: { pull: SharedValue<number>; geometry: PullGeometry; height: number }) {
  const back = useImage(ROOM_BACK);
  const frame = useImage(ROOM_FRAME);
  const desk = useImage(DESK);
  const quill = useImage(QUILL_ART);
  const picture = useDerivedValue(() => createPicture(canvas => {
    const p = pull.value;
    if (!frame || !desk || p <= 0) return;
    const s = pullAt(p, geometry);
    // The shelf picture reaches above the bookcase (the painted arch of its own room). Once the camera is back that
    // part belongs to this room: the wall behind takes its place, above the bookcase's top beam only.
    if (back) {
      const g = geometry, b = g.bookcase;
      const x0 = g.rootX + g.ax - g.ax * s.k, w = b.width * s.k;
      const top = g.ay + (b.top - g.ay) * s.k + s.ty - g.scrollY;
      if (top > 0) {
        canvas.save();
        canvas.clipRect(Skia.XYWHRect(x0 - 1, 0, w + 2, top), ClipOp.Intersect, true);
        drawCanvasLayer(canvas, back, roomMapping(s, geometry), s.e);
        canvas.restore();
      }
    }
    drawCanvasLayer(canvas, frame, roomMapping(s, geometry, FRAME_DEPTH));
    const dy = (1 - s.rise) * geometry.deskDrop;
    const d = geometry.desk;
    if (d.oy + dy + (ROOM.deskProps - 20) * d.c >= height) return;
    drawCanvasLayer(canvas, desk, { c: d.c, ox: d.ox, oy: d.oy + dy });
    if (!quill) return;
    const q = geometry.quill;
    const w = q.h * QUILL.width / QUILL.height;
    // A soft contact shadow where it rests on the desk, then the quill itself.
    const shadow = Skia.Paint();
    shadow.setAntiAlias(true);
    shadow.setColor(Skia.Color('#2A1406'));
    shadow.setAlphaf(.35);
    shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 5, true));
    canvas.save();
    canvas.translate(q.x, q.y + dy);
    canvas.rotate(q.angle * 180 / Math.PI, 0, 0);
    canvas.drawOval(Skia.XYWHRect(-w * .18, -q.h * .42, w * .36, q.h * .84), shadow);
    canvas.drawImageRect(quill, Skia.XYWHRect(0, 0, quill.width(), quill.height()), Skia.XYWHRect(-w / 2, -q.h / 2, w, q.h), Skia.Paint());
    canvas.restore();
  }), [back, frame, desk, quill, geometry, height]);
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}
