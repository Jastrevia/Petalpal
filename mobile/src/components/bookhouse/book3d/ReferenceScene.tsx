import { StyleSheet } from 'react-native';
import Reanimated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { Canvas, Picture, Skia, createPicture, useImage } from '@shopify/react-native-skia';
import { composedAt, REF, referenceAt, referenceScale, type ComposedGeometry } from './composed';
import { Scrollkeeper } from '../Scrollkeeper';

// The illustrated Treehouse (ROOM_LAYOUT 'reference'; composed.ts REF): the approved illustration's room drawn around the
// live bookshelf and under the live journal, built from that illustration by scripts/buildTreehouseReference.py with
// everything interactive painted out (no books, year labels, sign, button or closed book).
//   room-back.webp  — the whole room, its bookcase painted as plain shelves: behind the live bookshelf.
//   room-front.webp — the same room with the bookcase cut away (soft edges): in front of the live bookshelf, so the
//                     trunk, the window, the canopy and the desk with its lantern, quill, ink and teacup frame it. The
//                     live journal lies on this desk.
// Both are one picture with the shelf: they move with the camera exactly as the shelf does (referenceAt).
const BACK = require('../../../../assets/bookhouse/reference/room-back.webp');
const FRONT = require('../../../../assets/bookhouse/reference/room-front.webp');
/** Beyond the illustration (wide windows): the room's own darkest wood tone. */
export const REFERENCE_GROUND = '#1C1008';
const GROUND = REFERENCE_GROUND;

function useRoomPicture(source: number, pull: SharedValue<number>, geometry: ComposedGeometry, ground: boolean) {
  const image = useImage(source);
  return useDerivedValue(() => createPicture(canvas => {
    const p = pull.value;
    if (!image || p <= 0) return;
    const s = composedAt(p, geometry), r = referenceAt(s, geometry);
    const w = image.width(), h = image.height();
    // Beyond the illustration (tablets, computers; phones are filled, composed.ts PHONE_WIDTH): plain dark wood.
    if (ground) {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(GROUND));
      paint.setAlphaf(Math.min(1, p * 6));
      canvas.drawRect(Skia.XYWHRect(0, 0, geometry.view.width, geometry.view.height), paint);
    }
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    canvas.drawImageRect(image, Skia.XYWHRect(0, 0, w, h), Skia.XYWHRect(r.x, r.y, w * r.k, h * r.k), paint);
  }), [image, geometry]);
}

/** Behind the live bookshelf: the illustrated room with plain shelves (seen only around and through the receding shelf). */
export function ReferenceRoom({ pull, geometry }: { pull: SharedValue<number>; geometry: ComposedGeometry }) {
  const picture = useRoomPicture(BACK, pull, geometry, true);
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}

/** In front of the live bookshelf (under the journal): the illustrated room around it and the writing desk below it. */
export function ReferenceFront({ pull, geometry }: { pull: SharedValue<number>; geometry: ComposedGeometry }) {
  const picture = useRoomPicture(FRONT, pull, geometry, false);
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}

/** Scrollkeeper on the illustrated desk (reference art px): its feet on the band behind the open journal, roaming between
 *  the quill and ink on the left and the teacup on the right. */
export const DESK_SQUIRREL = { x: 520, y: REF.edge + 46, height: 150, from: 300, to: 740 };

/** Scrollkeeper, the Treehouse squirrel, on the writing desk: one picture with the room (it moves with the camera exactly
 *  as referenceAt does) and appears as the camera settles on the desk. Above the room's front, under the journal. */
export function ReferenceSquirrel({ pull, geometry, still }: { pull: SharedValue<number>; geometry: ComposedGeometry; still: boolean }) {
  const sr = referenceScale(geometry);
  const style = useAnimatedStyle(() => {
    const p = pull.value;
    if (p <= 0) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] };
    const r = referenceAt(composedAt(p, geometry), geometry);
    return { opacity: Math.max(0, Math.min(1, (p - .82) / .14)),
      transform: [{ translateX: r.x + DESK_SQUIRREL.x * r.k }, { translateY: r.y + DESK_SQUIRREL.y * r.k }, { scale: r.k / sr }] };
  });
  // A 0 × 0 anchor at its feet, so the scale is about them; the squirrel is drawn at the pulled-back scale.
  return <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }, style]}>
    <Scrollkeeper x={0} y={0} height={DESK_SQUIRREL.height * sr} still={still}
      roam={{ from: (DESK_SQUIRREL.from - DESK_SQUIRREL.x) * sr, to: (DESK_SQUIRREL.to - DESK_SQUIRREL.x) * sr }} />
  </Reanimated.View>;
}
