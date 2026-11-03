import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { Canvas, Picture, Skia, createPicture, useImage } from '@shopify/react-native-skia';
import { composedAt, referenceAt, type ComposedGeometry } from './composed';

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
const GROUND = '#1C1008';

function useRoomPicture(source: number, pull: SharedValue<number>, geometry: ComposedGeometry, ground: boolean) {
  const image = useImage(source);
  return useDerivedValue(() => createPicture(canvas => {
    const p = pull.value;
    if (!image || p <= 0) return;
    const s = composedAt(p, geometry), r = referenceAt(s, geometry);
    if (ground) {
      const paint = Skia.Paint();
      paint.setColor(Skia.Color(GROUND));
      paint.setAlphaf(Math.min(1, p * 6));
      canvas.drawRect(Skia.XYWHRect(0, 0, geometry.view.width, geometry.view.height), paint);
    }
    const w = image.width(), h = image.height();
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
