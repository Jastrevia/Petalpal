import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { BlendMode, Canvas, Picture, Skia, TileMode, createPicture, useImage } from '@shopify/react-native-skia';
import { DESK_ART, deskParallax, pullAt, type PullGeometry } from './desk';

const DESK_PAINTING = require('../../../../assets/bookhouse/continuous-structure.webp');

/** The writing desk in the foreground: continuous-structure.png from just under its lowest plank (the backboard strip
 *  with the lantern, books and teacup, then the desk top), across the full window width. It rises into the frame as the
 *  camera pulls back, its top rows blending into the shelf behind. It never touches the shelf's own layout.
 *
 *  `depth` (the Treehouse scene): the desk is nearer the camera than the shelf, so as the camera pulls back it shrinks a
 *  little more than the shelf does — one uniform scale about its back edge's centre, reaching exactly 1 once the camera
 *  stops — and its back edge meets the wall in a soft contact shade. */
export function DeskLayer({ pull, geometry, width, height, depth = 0 }: { pull: SharedValue<number>; geometry: PullGeometry; width: number; height: number; depth?: number }) {
  const desk = useImage(DESK_PAINTING);
  const picture = useDerivedValue(() => createPicture(canvas => {
    if (!desk || pull.value <= 0) return;
    const s = pullAt(pull.value, geometry);
    const { deskTop } = s;
    if (deskTop >= height) return;
    const k = desk.width() / DESK_ART.width, ds = geometry.deskScale;
    const srcH = DESK_ART.height - DESK_ART.top;
    const m = deskParallax(s, geometry, depth);
    canvas.save();
    if (m !== 1) { canvas.translate(width / 2, deskTop); canvas.scale(m, m); canvas.translate(-width / 2, -deskTop); }
    canvas.saveLayer();
    canvas.drawImageRect(desk, Skia.XYWHRect(0, DESK_ART.top * k, DESK_ART.width * k, srcH * k), Skia.XYWHRect(0, deskTop, DESK_ART.width * ds, srcH * ds), Skia.Paint());
    if (depth > 0) {
      // Where the desk top meets the wall behind it, the wall shades it: a narrow, soft darkening along the back edge.
      const edge = deskTop + (DESK_ART.edge - DESK_ART.top) * ds;
      const shade = Skia.Paint();
      shade.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: edge - 2 * ds }, { x: 0, y: edge + 16 * ds },
        [Skia.Color('rgba(30,14,4,0.30)'), Skia.Color('rgba(30,14,4,0)')], null, TileMode.Clamp));
      canvas.drawRect(Skia.XYWHRect(0, edge - 2 * ds, DESK_ART.width * ds, 18 * ds), shade);
    }
    // The top rows fade into whatever is behind them (the shelf's lowest plank).
    const fade = Skia.Paint();
    fade.setBlendMode(BlendMode.DstIn);
    const band = 22 * ds;
    fade.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: deskTop }, { x: 0, y: deskTop + band }, [Skia.Color('#00000000'), Skia.Color('#000000')], null, TileMode.Clamp));
    canvas.drawRect(Skia.XYWHRect(0, deskTop - 2, width, band + 2), fade);
    canvas.restore();
    canvas.restore();
  }), [desk, geometry, width, height, depth]);
  return <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>;
}
