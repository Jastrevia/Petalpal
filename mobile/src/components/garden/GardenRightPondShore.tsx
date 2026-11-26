import { BlurStyle, Image, Skia, TileMode, useImage, type SkImage } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { TERRAIN_ASSETS } from './terrainAssets';

// Local cliff-foot details only. The existing cliff artwork occludes the back
// of each shelf; the original lotus, islands and water remain separate layers.
const BOUNDS = { x: 1710, y: -165, width: 750, height: 600 };
const SHELVES = [
  [1755, -13, 78, 51], [1795, -37, 33, 25],
  [1842, -95, 65, 46],
  [1948, -39, 73, 50], [1985, -40, 30, 22],
  [2040, -39, 59, 41], [2164, 58, 67, 40],
  [2250, 26, 78, 47], [2291, 27, 32, 26],
  [2340, 66, 72, 53],
  [2394, 145, 65, 49], [2420, 263, 64, 51],
] as const;
const SUBMERGED = [
  [1779, 24, 65, 37], [1827, -12, 43, 29],
  [1880, -57, 68, 36], [1924, -1, 51, 32],
  [2015, 6, 39, 24], [2248, 72, 58, 34],
  [2323, 98, 46, 31], [2372, 167, 48, 34],
  [2410, 307, 48, 33],
] as const;
// Opaque mineral faces in the approved 724×2172 bank painting; no foliage.
const MINERAL_FACES = [
  { x: 273, y: 461, width: 43, height: 51 },
  { x: 389, y: 583, width: 54, height: 68 },
  { x: 345, y: 1299, width: 48, height: 40 },
] as const;

let cachedShoreSnapshot: { mineral: SkImage; image: SkImage } | null = null;

function makeShore(mineral: SkImage) {
  const surface = Skia.Surface.Make(900, 720);
  if (!surface || !(surface as any).ref) return null;
  const canvas = surface.getCanvas();
  if (!canvas) {
    surface.dispose();
    return null;
  }
  canvas.clear(Skia.Color('transparent'));
  canvas.scale(1.2, 1.2);
  canvas.translate(-BOUNDS.x, -BOUNDS.y);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  let seed = 73163;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const drawStone = (stone: readonly number[], submerged: boolean, index: number) => {
    const [x, y, w, h] = stone;
    const points = Array.from({ length: 9 }, (_, i) => {
      const angle = (i + random() * 0.26) * Math.PI * 2 / 9;
      const r = 0.88 + random() * 0.16;
      return { x: x + Math.cos(angle) * w * .5 * r, y: y + Math.sin(angle) * h * .5 * r };
    });
    const body = Skia.Path.Make();
    body.moveTo((points[8].x + points[0].x) / 2, (points[8].y + points[0].y) / 2);
    points.forEach((p, i) => {
      const next = points[(i + 1) % 9];
      if (submerged) body.quadTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
      else { body.lineTo(p.x, p.y); body.lineTo((p.x + next.x) / 2, (p.y + next.y) / 2); }
    });
    body.close();
    const tones = submerged
      ? ['#C8CEAC', '#A7BFA7', '#78ABAA', '#68A4AA']
      : index % 3 === 0
        ? ['#DCD1A9', '#BEB397', '#8F977F', '#74ABA8']
        : ['#DDD2B7', '#BEB49B', '#929C8D', '#73AAA9'];
    const gradient = Skia.Shader.MakeLinearGradient(
      { x: x - w * .2, y: y - h * .44 }, { x: x + w * .17, y: y + h * .52 },
      tones.map(c => Skia.Color(c)), [0, .36, .70, 1], TileMode.Clamp,
    );
    const soft = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, submerged ? 1.35 : .55, true);
    paint.setShader(gradient);
    paint.setAlphaf(submerged ? .62 : .94);
    paint.setMaskFilter(soft);
    canvas.drawPath(body, paint);
    paint.setShader(null);
    // Warm mineral facets become cool and less distinct below the waterline.
    canvas.save();
    canvas.clipPath(body, 1, true);
    if (!submerged) {
      // Retain the approved cliff's painted mineral grain on these smaller
      // exposed shelves, rather than introducing smooth pebble-shaped icons.
      paint.setAlphaf(.48);
      canvas.drawImageRect(mineral, MINERAL_FACES[index % MINERAL_FACES.length],
        { x: x - w * .5, y: y - h * .5, width: w, height: h }, paint);
      const cap = Skia.Path.Make();
      cap.moveTo(x - w * .44, y - h * .07);
      cap.lineTo(x - w * .22, y - h * .35);
      cap.lineTo(x + w * .09, y - h * .40);
      cap.lineTo(x + w * .40, y - h * .16);
      cap.lineTo(x + w * .20, y + h * .07);
      cap.lineTo(x - w * .09, y + h * .14);
      cap.close();
      paint.setColor(Skia.Color(index % 2 ? '#E0D3B3' : '#D2C89F'));
      paint.setAlphaf(.49);
      canvas.drawPath(cap, paint);
      cap.dispose();
      const wetFace = Skia.Path.Make();
      wetFace.moveTo(x + w * .20, y + h * .07);
      wetFace.lineTo(x + w * .40, y - h * .16);
      wetFace.lineTo(x + w * .44, y + h * .22);
      wetFace.lineTo(x + w * .12, y + h * .43);
      wetFace.lineTo(x - w * .09, y + h * .14);
      wetFace.close();
      paint.setColor(Skia.Color('#689B9A'));
      paint.setAlphaf(.29);
      canvas.drawPath(wetFace, paint);
      wetFace.dispose();
    }
    for (let facet = 0; facet < 24; facet++) {
      const px = x + (random() - .5) * w, py = y + (random() - .5) * h;
      const fw = w * (.055 + random() * .15), fh = h * (.07 + random() * .16);
      const fragment = Skia.Path.Make();
      fragment.moveTo(px - fw * .5, py);
      fragment.lineTo(px - fw * .16, py - fh * .58);
      fragment.lineTo(px + fw * .51, py - fh * .27);
      fragment.lineTo(px + fw * .36, py + fh * .35);
      fragment.lineTo(px - fw * .22, py + fh * .55);
      fragment.close();
      paint.setColor(Skia.Color(facet % 3 === 0 ? '#F0DFB9' : facet % 3 === 1 ? '#8E9C86' : '#D9CCAA'));
      paint.setAlphaf(submerged ? .12 : .17);
      canvas.drawPath(fragment, paint);
      fragment.dispose();
    }
    canvas.restore();
    // Short, broken contact glints hug only the wet front of exposed feet.
    // There is no perimeter ring or broad wash over the approved water.
    if (!submerged && index % 3 !== 1) {
      const contact = Skia.Path.Make();
      contact.moveTo(x - w * .30, y + h * .35);
      contact.quadTo(x - w * .16, y + h * .54, x + w * .07, y + h * .49);
      contact.lineTo(x + w * .08, y + h * .51 + 1.2);
      contact.quadTo(x - w * .19, y + h * .59, x - w * .32, y + h * .36);
      contact.close();
      paint.setColor(Skia.Color('#C0E7D9'));
      paint.setAlphaf(.32);
      canvas.drawPath(contact, paint);
      contact.dispose();
    }
    paint.setMaskFilter(null);
    gradient.dispose(); soft.dispose(); body.dispose();
  };
  SUBMERGED.forEach((stone, i) => drawStone(stone, true, i));
  SHELVES.forEach((stone, i) => drawStone(stone, false, i));
  paint.dispose();
  surface.flush();
  const image = surface.makeImageSnapshot();
  surface.dispose();
  return image;
}

function GardenRightPondShore({ mineral: shared }: { mineral?: SkImage | null }) {
  const fallback = useImage(shared === undefined ? TERRAIN_ASSETS.rightBank : null);
  const mineral = shared === undefined ? fallback : shared;
  const image = useMemo(() => {
    if (!mineral) return null;
    if (cachedShoreSnapshot && cachedShoreSnapshot.mineral === mineral && (cachedShoreSnapshot.image as any).ref && !(cachedShoreSnapshot.image as any).ref.isDeleted?.()) {
      return cachedShoreSnapshot.image;
    }
    const created = makeShore(mineral);
    if (created) {
      // eslint-disable-next-line react-hooks/globals -- Garden: the shore snapshot is cached for the app's life on purpose (made once, reused by every mount)
      cachedShoreSnapshot = { mineral, image: created };
    }
    return created;
  }, [mineral]);
  return image ? <Image image={image} {...BOUNDS} fit="fill" /> : null;
}
export default memo(GardenRightPondShore);
