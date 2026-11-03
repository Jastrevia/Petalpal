import { Skia, type SkCanvas } from '@shopify/react-native-skia';

/** A faint botanical line drawing for an empty records page: a stem with a few leaves and one open five-petal bloom,
 *  outlined only (like the gilt sprigs beside each section, drawn larger and much fainter), so the blank parchment looks
 *  intentional. It is decoration, never a record: it is drawn only when the day has no flower, Event or mood.
 *  `size` is its height; (cx, cy) its centre. */
export function drawBotanicalWatermark(canvas: SkCanvas, cx: number, cy: number, size: number, color = '#B48D4C', alpha = .2) {
  'worklet';
  const k = size / 100;                      // drawn on a 100-unit-tall grid
  const X = (x: number) => cx + (x - 50) * k, Y = (y: number) => cy + (y - 50) * k;
  const line = Skia.Paint();
  line.setAntiAlias(true);
  line.setStyle(1);                          // stroke
  line.setStrokeWidth(Math.max(1, 1.6 * k));
  line.setStrokeCap(1);                      // round
  line.setColor(Skia.Color(color));
  line.setAlphaf(alpha);
  // Stem: from the base, curving up to the bloom.
  const stem = Skia.PathBuilder.Make();
  stem.moveTo(X(46), Y(98)); stem.cubicTo(X(50), Y(78), X(42), Y(58), X(52), Y(34));
  canvas.drawPath(stem.build(), line);
  // Leaves along it, alternating sides.
  for (const [x, y, s, len] of [[47, 84, -1, 20], [46, 70, 1, 18], [45, 56, -1, 15]] as const) {
    const leaf = Skia.PathBuilder.Make();
    leaf.moveTo(X(x), Y(y));
    leaf.quadTo(X(x + len * .55 * s), Y(y - 12), X(x + len * s), Y(y - 7));
    leaf.quadTo(X(x + len * .5 * s), Y(y + 2), X(x), Y(y));
    const vein = Skia.PathBuilder.Make();
    vein.moveTo(X(x), Y(y)); vein.lineTo(X(x + len * .8 * s), Y(y - 6));
    canvas.drawPath(leaf.build(), line);
    canvas.drawPath(vein.build(), line);
  }
  // The bloom: five rounded petals about a small centre.
  const bx = 52, by = 26;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    const tip = [bx + Math.cos(a) * 15, by + Math.sin(a) * 15];
    const l = [bx + Math.cos(a - .5) * 9, by + Math.sin(a - .5) * 9], r = [bx + Math.cos(a + .5) * 9, by + Math.sin(a + .5) * 9];
    const petal = Skia.PathBuilder.Make();
    petal.moveTo(X(bx + Math.cos(a) * 3), Y(by + Math.sin(a) * 3));
    petal.quadTo(X(l[0]), Y(l[1]), X(tip[0]), Y(tip[1]));
    petal.quadTo(X(r[0]), Y(r[1]), X(bx + Math.cos(a) * 3), Y(by + Math.sin(a) * 3));
    canvas.drawPath(petal.build(), line);
  }
  canvas.drawCircle(X(bx), Y(by), 3 * k, line);
}
