import { useMemo } from 'react';
import { BlurStyle, Canvas, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import { CLOSED, drawBook, shelfPose, type Camera } from './engine';
import { archiveClothRgb, atlasSpineRect, clothRgb, type ShelfImages } from './assets';

/** A monthly journal (`month` 1–12) or the year's Monthly Report archive (a book of its own kind, never month 13). */
export type ShelfBookSpec = ({ kind: 'month'; month: number } | { kind: 'archive' })
  & { x: number; bottom: number; height: number; locked: boolean; hidden: boolean; lifted: boolean };

/** The twelve monthly books (and the year's Monthly Report archive after December) standing on the shelf, drawn as real 3D books (rounded spine, boards, page block)
 *  from the same geometry the opened monthly book uses. Purely visual: the shelf's buttons sit on top. */
export function ShelfBooks({ width, height, camera, books, images }: { width: number; height: number; camera: Camera; books: ShelfBookSpec[]; images: ShelfImages }) {
  const { atlas, grain, edges, archive } = images;
  const picture = useMemo(() => {
    if (!atlas || !grain || !edges) return null;
    return createPicture(canvas => {
      // Grounding first: a soft cast shadow on the backboard (light from the upper left) and a contact shadow on the plank.
      const shadow = Skia.Paint();
      shadow.setAntiAlias(true);
      shadow.setColor(Skia.Color('#140A03'));
      for (const b of books) {
        if (b.hidden || b.kind === 'archive' && !archive) continue;
        const w = b.height * .29, y = b.bottom - (b.lifted ? 4 : 0);
        shadow.setAlphaf(.26);
        shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(2, w * .16), true));
        canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(b.x - w / 2 + w * .22, y - b.height + 6, w, b.height - 6), w * .2, w * .2), shadow);
        shadow.setAlphaf(.5);
        shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 2.2, true));
        canvas.drawOval(Skia.XYWHRect(b.x - w * .62, b.bottom - 2.5, w * 1.24, 5), shadow);
      }
      // Outer books first: their visible cover sides tuck behind the books nearer the centre of view.
      const order = books.filter(b => !b.hidden).sort((a, b) => Math.abs(b.x - camera.cx) - Math.abs(a.x - camera.cx));
      for (const b of order) {
        // The archive is drawn only once its own spine is in (until then the shelf shows its flat spine instead).
        if (b.kind === 'archive' && !archive) continue;
        const pose = shelfPose(b.x, b.bottom - (b.lifted ? 4 : 0), b.height);
        drawBook(canvas, camera, pose, CLOSED, {
          cover: null, spine: b.kind === 'archive' ? archive : atlas, grain, edges, parchment: null, left: null, right: null,
          tint: b.kind === 'archive' ? archiveClothRgb() : clothRgb(b.month),
          spineSrc: b.kind === 'archive' ? [.5, .5, archive!.width() - 1, archive!.height() - 1] : atlasSpineRect(b.month, atlas.width(), atlas.height()), plainCover: true,
        }, b.locked ? { desaturate: .88, lift: .2 } : {});
      }
    }, { width, height });
  }, [atlas, grain, edges, archive, books, camera, width, height]);
  if (!picture) return null;
  return <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
    <Picture picture={picture} />
  </Canvas>;
}

