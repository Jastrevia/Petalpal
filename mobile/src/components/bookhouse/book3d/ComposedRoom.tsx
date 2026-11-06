import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { BlendMode, BlurStyle, Canvas, ClipOp, Picture, Skia, TileMode, createPicture, useImage, type SkCanvas, type SkImage } from '@shopify/react-native-skia';
import { composedAt, composedDesk, composedPoint, deskShelfFade, CS, DESK_CUT, DESK_CUT_V1, PAINTING, ROOM_ROWS, WALLS, type ComposedGeometry, type ComposedState } from './composed';
import { SHELF } from './desk';

const INTERIOR = require('../../../../assets/bookhouse/interior.webp');
const DESK = require('../../../../assets/bookhouse/composed/desk-cutout.webp');
const DESK_V1 = require('../../../../assets/bookhouse/composed/desk-cutout-v1.webp');
const WOOD = require('../../../../assets/bookhouse/composed/wood-wall.webp');
/** wood-wall.webp: interior.png's plain boards and rail below the bookcase (x 260–790, y 1000–1150). */
const WOOD_TILE = { width: 530, height: 150 };
const WALL_LEFT = require('../../../../assets/bookhouse/walls/wall-left.webp');
const WALL_RIGHT = require('../../../../assets/bookhouse/walls/wall-right.webp');
/** Width (window px) of the cross-fade where two non-adjacent parts of a painting meet. */
/** Portrait layout: the plain ground beside the bookshelf (the shelf painting's own darkest wood tone). */
const PORTRAIT_GROUND = '#1C1008';
function mix(a: number, b: number, t: number) { 'worklet'; return a + (b - a) * t; }
const FEATHER = 20;
/** Each part is drawn this much (window px) past its end, under the next one, so no hairline shows between them. */
const OVERLAP = 1;

/** Draws `src` (image px) onto `dst` (window px); then, if `fadeFrom` is given, continues the slice before a join for
 *  FEATHER px past it, fading out, so the join is a short cross-fade (as the shelf's own picture draws it). */
function drawFaded(canvas: SkCanvas, image: SkImage, src: { x: number; y: number; w: number; h: number }, dst: { x: number; y: number; w: number; h: number }) {
  'worklet';
  canvas.saveLayer();
  canvas.drawImageRect(image, Skia.XYWHRect(src.x, src.y, src.w, src.h), Skia.XYWHRect(dst.x, dst.y, dst.w, dst.h), Skia.Paint());
  const fade = Skia.Paint();
  fade.setBlendMode(BlendMode.DstIn);
  fade.setShader(Skia.Shader.MakeLinearGradient({ x: dst.x + OVERLAP, y: 0 }, { x: dst.x + dst.w, y: 0 }, [Skia.Color('#000000'), Skia.Color('#00000000')], null, TileMode.Clamp));
  // A little wider than the image, so the partial pixels at its ends are masked too (clamped: opaque before, clear after).
  canvas.drawRect(Skia.XYWHRect(dst.x - 2, dst.y - 2, dst.w + 4, dst.h + 4), fade);
  canvas.restore();
}

/** The room behind the shelf: interior.png drawn exactly as the shelf draws it — its slices, scale and registration —
 *  over the painting's rows 0..ROOM_ROWS, the last slice continuing past the shelf's end to the painting's edge. It is
 *  the same picture as the shelf, so it is revealed around the shelf as the camera pulls back, with no seam. */
export function ComposedRoom({ pull, geometry }: { pull: SharedValue<number>; geometry: ComposedGeometry }) {
  const image = useImage(INTERIOR);
  const wallLeft = useImage(WALL_LEFT);
  const wallRight = useImage(WALL_RIGHT);
  const wood = useImage(WOOD);
  const picture = useDerivedValue(() => createPicture(canvas => {
    const p = pull.value;
    if (!image || p <= 0) return;
    const s = composedAt(p, geometry);
    const r = geometry.rest, f = r.scale * s.k;
    if (geometry.variant === 'portrait') {
      // Portrait: nothing around the bookshelf but a plain dark ground (it replaces the backdrop as the camera pulls
      // back), and the bookcase's own soft shadow on it.
      const W = geometry.view.width, H = geometry.view.height;
      const ground = Skia.Paint();
      ground.setColor(Skia.Color(PORTRAIT_GROUND));
      ground.setAlphaf(Math.min(1, p * 6));
      canvas.drawRect(Skia.XYWHRect(0, 0, W, H), ground);
      const [sx0, sy0] = composedPoint(0, 0, s, geometry), [sx1, sy1] = composedPoint(r.width, r.sceneHeight, s, geometry);
      const shade = Skia.Paint();
      shade.setAntiAlias(true);
      shade.setColor(Skia.Color('#000000'));
      shade.setAlphaf(.55 * Math.min(1, p * 4));
      shade.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 10, true));
      canvas.drawRect(Skia.XYWHRect(sx0 - 2, sy0 + 4, sx1 - sx0 + 4, sy1 - sy0), shade);
      return;
    }
    const kx = image.width() / PAINTING.width, ky = image.height() / PAINTING.height;
    const row = (y: number) => r.cabinetTop + (y - SHELF.top) * r.scale;   // painting row → shelf-local y
    const [, top] = composedPoint(0, row(0), s, geometry);
    const h = ROOM_ROWS * f;
    const paint = Skia.Paint();
    paint.setAlphaf(Math.min(1, p * 6));
    canvas.saveLayer(paint);
    // v2: beyond the room (wide windows) the treehouse carries on as plain dark boards — the painting's own boards below
    // the bookcase, at the room's scale, in shade — instead of the blurred backdrop.
    if (geometry.variant === 'v2' && wood) {
      const W = geometry.view.width, H = geometry.view.height;
      const tw = WOOD_TILE.width * f, th = WOOD_TILE.height * f;
      const [cx] = composedPoint(r.width / 2, 0, s, geometry);
      const x0 = cx - Math.ceil(cx / tw) * tw;
      for (let y = top - Math.ceil(Math.max(0, top) / th) * th; y < H; y += th)
        for (let x = x0; x < W; x += tw)
          canvas.drawImageRect(wood, Skia.XYWHRect(0, 0, wood.width(), wood.height()), Skia.XYWHRect(x, y, tw + .5, th + .5), Skia.Paint());
      const shade = Skia.Paint();
      shade.setColor(Skia.Color('rgba(20,10,3,0.55)'));
      canvas.drawRect(Skia.XYWHRect(0, 0, W, H), shade);
    }
    r.slices.forEach((slice, i) => {
      const last = i === r.slices.length - 1;
      const w = last ? PAINTING.width - slice.sx : (slice.to - slice.from) / r.scale;   // painting px
      const [x] = composedPoint(slice.from, 0, s, geometry);
      const extra = last ? 0 : OVERLAP / f;
      canvas.drawImageRect(image, Skia.XYWHRect(slice.sx * kx, 0, (w + extra) * kx, ROOM_ROWS * ky), Skia.XYWHRect(x, top, (w + extra) * f, h), Skia.Paint());
    });
    // Where the shelf's two halves meet (non-adjacent parts of the painting), the half before the join carries on.
    r.slices.forEach((slice, i) => {
      if (i === 0) return;
      const before = r.slices[i - 1];
      const end = before.sx + (before.to - before.from) / r.scale;
      if (Math.abs(end - slice.sx) < .5) return;
      const [x] = composedPoint(slice.from, 0, s, geometry);
      drawFaded(canvas, image, { x: (end - OVERLAP / f) * kx, y: 0, w: ((FEATHER + OVERLAP) / f) * kx, h: ROOM_ROWS * ky }, { x: x - OVERLAP, y: top, w: FEATHER + OVERLAP, h });
    });
    // Past the painting's edges, the room carries on in its own side walls (the same rows, the same scale).
    const [x0] = composedPoint(0, 0, s, geometry);
    const [xRight] = composedPoint(r.width, 0, s, geometry);
    const xEdge = xRight + (PAINTING.width - geometry.xEnd) * f;              // window x of painting x 1024
    const rows = ROOM_ROWS;
    if (wallLeft && x0 > 0) {
      canvas.drawImageRect(wallLeft, Skia.XYWHRect(0, 0, wallLeft.width(), rows * (wallLeft.height() / WALLS.rows)),
        Skia.XYWHRect(x0 - WALLS.left * f, top, WALLS.left * f + 1, rows * f), Skia.Paint());
    }
    if (wallRight && xEdge < geometry.view.width) {
      const k = wallRight.width() / (WALLS.rightTo - WALLS.rightFrom), from = PAINTING.width - WALLS.rightFrom;
      canvas.drawImageRect(wallRight, Skia.XYWHRect(from * k, 0, (WALLS.rightTo - PAINTING.width) * k, rows * (wallRight.height() / WALLS.rows)),
        Skia.XYWHRect(xEdge - 1, top, (WALLS.rightTo - PAINTING.width) * f + 1, rows * f), Skia.Paint());
    }
    // v2: where the room meets the dark boards beyond it, a soft shadow (the room's walls stand forward of them).
    if (geometry.variant === 'v2') {
      const xl = x0 - WALLS.left * f, xr = xEdge + (WALLS.rightTo - PAINTING.width) * f, sw = 18 * f;
      const edge = (from: number, to: number) => {
        const g = Skia.Paint();
        g.setShader(Skia.Shader.MakeLinearGradient({ x: from, y: 0 }, { x: to, y: 0 }, [Skia.Color('rgba(20,10,3,0.6)'), Skia.Color('rgba(20,10,3,0)')], null, TileMode.Clamp));
        canvas.drawRect(Skia.XYWHRect(Math.min(from, to), top, Math.abs(to - from), h), g);
      };
      if (xl > 0) edge(xl, xl + sw);
      if (xr < geometry.view.width) edge(xr, xr - sw);
    }
    canvas.restore();
  }), [image, wallLeft, wallRight, wood, geometry]);
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}

/** The writing desk in front of the bookcase: continuous-structure.png's chair-free desk with only the objects standing
 *  on it above its back edge (assets/bookhouse/composed), sliced exactly like the shelf so its lantern stands under the
 *  pillar and its flowers by the ladder, at the painting's own scale once the camera stops. It rises with the camera. */
export function ComposedDesk({ pull, geometry }: { pull: SharedValue<number>; geometry: ComposedGeometry }) {
  const v2 = useImage(DESK), v1 = useImage(DESK_V1);
  const image = geometry.variant === 'v1' ? v1 : v2;   // (portrait uses the V2 desk)
  const cut = geometry.variant === 'v1' ? DESK_CUT_V1 : DESK_CUT;
  const picture = useDerivedValue(() => createPicture(canvas => {
    const p = pull.value;
    if (!image || p <= 0) return;
    const s: ComposedState = composedAt(p, geometry);
    const d = composedDesk(s, geometry);
    const top = d.edge - (cut.edge - cut.top) * d.scale;
    if (top >= geometry.view.height) return;
    const r = geometry.deskShelf || geometry.rest, W = geometry.view.width;
    // Portrait: the desk is part of the app's portrait column (the same column the journal is laid out in).
    if (geometry.variant === 'portrait') {
      // ...as wide as the bookcase above it, so the two share their outer edges.
      // (During the pull-back the bookcase's edges move with the camera: the clip follows them the same way.)
      const sh = geometry.deskShelf, column = sh ? sh.width : Math.min(W, 560), x0 = sh ? sh.x : (W - column) / 2;
      const end = composedAt(1, geometry), g = geometry;
      const [a1] = composedPoint(g.ax, 0, end, g), [a] = composedPoint(g.ax, 0, s, g), rr = s.k / g.k1;
      // ...and blends from the receding shelf's edges to the wide bookcase's as that fades in (the visible bookcase).
      const f = sh ? deskShelfFade(s) : 1;
      const [nl] = composedPoint(0, 0, s, g), [nr] = composedPoint(g.rest.width, 0, s, g);
      const cl = mix(nl, a + (x0 - a1) * rr, f), cr = mix(nr, a + (x0 + column - a1) * rr, f);
      canvas.clipRect(Skia.XYWHRect(cl, 0, cr - cl, geometry.view.height), ClipOp.Intersect, true);
    }
    const pad = cut.pad;
    const k = image.width() / (CS.width + pad * 2);
    const csx = (x: number) => (x + CS.dx) * CS.K;                       // painting x → continuous-structure x
    const left = r.slices[0].sx, a = r.slices[1].sx + (r.slices[1].to - r.slices[1].from) / r.scale, c = r.slices[2].sx;
    const lw = csx(a) - csx(left), rw = CS.width - csx(c), h = image.height() / k;
    const over = OVERLAP / d.scale;
    // Its own boards carry on past both ends to the window's edges.
    const extraL = Math.min(pad + csx(left), Math.max(0, d.x / d.scale)), extraR = Math.min(pad, Math.max(0, (W - d.x) / d.scale - lw - rw));
    canvas.drawImageRect(image, Skia.XYWHRect((pad + csx(left) - extraL) * k, 0, (extraL + lw + over) * k, h * k),
      Skia.XYWHRect(d.x - extraL * d.scale, top, (extraL + lw + over) * d.scale, h * d.scale), Skia.Paint());
    canvas.drawImageRect(image, Skia.XYWHRect((pad + csx(c)) * k, 0, (rw + extraR) * k, h * k),
      Skia.XYWHRect(d.x + lw * d.scale, top, (rw + extraR) * d.scale, h * d.scale), Skia.Paint());
    drawFaded(canvas, image, { x: (pad + csx(a) - over) * k, y: 0, w: ((FEATHER + OVERLAP) / d.scale) * k, h: h * k }, { x: d.x + lw * d.scale - OVERLAP, y: top, w: FEATHER + OVERLAP, h: h * d.scale });
    // Wider windows: the desk's own boards (its plain extension, below the back edge) carry on to both edges.
    if (pad > 0) {
      const sy = (cut.edge - cut.top) * k, sh = h * k - sy, dy = top + (cut.edge - cut.top) * d.scale, dh = h * d.scale - (cut.edge - cut.top) * d.scale;
      const seg = pad * d.scale;
      // (plain boards only: the right-hand extension, which holds no objects)
      const src = Skia.XYWHRect((pad + CS.width) * k, sy, pad * k, sh);
      const l0 = d.x - extraL * d.scale, r0 = d.x + (lw + rw + extraR) * d.scale;
      // Every other copy is mirrored, so neighbouring copies meet on the same column of boards (no seam).
      const tile = (x: number, flip: boolean) => {
        canvas.save();
        if (flip) { canvas.translate(2 * x + seg, 0); canvas.scale(-1, 1); }
        canvas.drawImageRect(image, src, Skia.XYWHRect(x - .25, dy, seg + .5, dh), Skia.Paint());
        canvas.restore();
      };
      for (let x = l0 - seg, i = 0; x > -seg; x -= seg, i++) tile(x, i % 2 === 0);
      for (let x = r0, i = 0; x < W; x += seg, i++) tile(x, i % 2 === 1);
      // ...and they recede into the room's shade, as the dark boards beyond the room do.
      const recede = (from: number, to: number) => {
        if (Math.abs(to - from) < 1) return;
        const g = Skia.Paint();
        g.setShader(Skia.Shader.MakeLinearGradient({ x: from, y: 0 }, { x: to, y: 0 }, [Skia.Color('rgba(20,10,3,0)'), Skia.Color('rgba(20,10,3,0.55)')], null, TileMode.Clamp));
        canvas.drawRect(Skia.XYWHRect(Math.min(from, to), dy, Math.abs(to - from), dh), g);
      };
      const dark = Skia.Paint();
      dark.setColor(Skia.Color('rgba(20,10,3,0.55)'));
      if (l0 > 0) { const e = Math.max(0, l0 - 2 * seg); recede(l0 + 2, e); if (e > 0) canvas.drawRect(Skia.XYWHRect(0, dy, e, dh), dark); }
      if (r0 < W) { const e = Math.min(W, r0 + 2 * seg); recede(r0 - 2, e); if (e < W) canvas.drawRect(Skia.XYWHRect(e, dy, W - e, dh), dark); }
    }
    // The bookcase stands just behind the desk: its base shades the desk top along the back edge.
    const shade = Skia.Paint();
    shade.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: d.edge }, { x: 0, y: d.edge + 16 * d.scale }, [Skia.Color('rgba(30,14,4,0.42)'), Skia.Color('rgba(30,14,4,0)')], null, TileMode.Clamp));
    canvas.drawRect(Skia.XYWHRect(0, d.edge, W, 16 * d.scale), shade);
  }), [image, cut, geometry]);
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}
