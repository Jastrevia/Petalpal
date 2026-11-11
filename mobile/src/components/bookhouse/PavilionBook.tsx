import { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, Picture, Skia, FilterMode, MipmapMode, PaintStyle, BlendMode, TileMode, ImageFormat, BlurStyle, createPicture, useImage, useFont,
  type SkImage, type SkCanvas, type SkFont } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { AppLocale } from '../../services/locale';
import { drawBook, drawFloatShadow, type BookTextures } from './book3d/engine';
import { projectPoint } from './book3d/motion';
import { SPEC } from './book3d/math';
import { PAVILION_SLOTS, PAVILION_CLOTH, pavilionFrame, type PavilionBookId, type PavilionGeometry } from './pavilionMotion';
import { PAVILION_TEXT, pavilionTitleLines } from './pavilionText';

const BLANK = require('../../../assets/reflection/pavilion-leather-v4.webp');
// Original approved English letterforms, isolated as alpha-only glyphs.
const APPROVED_TITLE_GLYPHS = require('../../../assets/reflection/pavilion-approved-title-glyphs.png');
// The existing Noto Serif SC subset is Song-style; covers keep their original font.
const SPINE_FONT_ZH = require('../../../assets/fonts/PavilionLabels-Serif.ttf');
const WOOD = require('../../../assets/reflection/pavilion-empty-v3.webp');
const GRAIN = require('../../../assets/bookhouse/journal/leather-grain.webp');
const EDGES = require('../../../assets/bookhouse/journal/page-edges.webp');
const PAPER = require('../../../assets/bookhouse/journal/parchment.webp');
const COVERS = {
  weekly: require('../../../assets/reflection/pavilion-cover-weekly-hd.webp'),
  monthly: require('../../../assets/reflection/pavilion-cover-monthly-hd.webp'),
  notes: require('../../../assets/reflection/pavilion-cover-notes-hd.webp'),
  collection: require('../../../assets/reflection/pavilion-cover-collection-hd.webp'),
};
export const PAVILION_LABEL_FONT = require('../../../assets/fonts/PavilionLabels-Serif.ttf');
export const PAVILION_LABEL_FONT_ZH = require('../../../assets/fonts/PavilionLabels-ZH.ttf');
type TitledSpine = { image: SkImage; uri: string };

// The spine, cover and paper bakes are snapshotted to raster images straight away. On the web every offscreen (GPU)
// surface is a new WebGL context that disposing the surface never releases (4 books x 2 spine layers at entry, then a
// cover and a paper per opened book); past the browser's limit it drops the page's oldest live canvas and the page
// reloads (webPageGuard). On the web they therefore draw on CPU raster surfaces, which use no WebGL context.
function bakeSurface(width: number, height: number) {
  return Platform.OS === 'web' ? Skia.Surface.Make(width, height) : Skia.Surface.MakeOffscreen(width, height);
}
function rasterSnapshot(surface: NonNullable<ReturnType<typeof bakeSurface>>) {
  surface.flush();
  const snapshot = surface.makeImageSnapshot(), image = snapshot.makeNonTextureImage?.() ?? snapshot;
  if (image !== snapshot) snapshot.dispose();
  surface.dispose();
  return image;
}
function textWidth(font: SkFont, text: string) { return font.getGlyphWidths(font.getGlyphIDs(text)).reduce((sum, width) => sum + width, 0); }

interface FoilTheme {
  gradientColors: string[];
  gradientStops: number[];
  incisionColor: string;
  incisionAlpha: number;
  incisionDx: number;
  incisionDy: number;
  incisionWidth: number;
  bevelColor?: string;
  bevelAlpha?: number;
  bevelDx?: number;
  bevelDy?: number;
  strokeWidth: number;
  maxRatio?: number;
}

const FOIL_THEMES: Record<PavilionBookId, FoilTheme> = {
  // Weekly (Green leather #3E5742): Brighter, richer antique gold; slightly increased font weight.
  weekly: {
    gradientColors: ['#B88224', '#F4D270', '#FFFADC', '#E5B744', '#A8771E'],
    gradientStops: [0, 0.24, 0.48, 0.74, 1],
    incisionColor: '#07150CEE',
    incisionAlpha: 0.96,
    incisionDx: 0.35,
    incisionDy: 0.48,
    incisionWidth: 0.72,
    bevelColor: '#FFF8D488',
    bevelAlpha: 0.55,
    bevelDx: -0.25,
    bevelDy: -0.30,
    strokeWidth: 0.48,
    maxRatio: 0.80,
  },
  // Monthly (Blue leather #244B70): Elegant, classic gold; sharp character edges.
  monthly: {
    gradientColors: ['#B48022', '#F2CF6C', '#FFF9DB', '#E2B646', '#A2701A'],
    gradientStops: [0, 0.24, 0.48, 0.74, 1],
    incisionColor: '#050E1AEE',
    incisionAlpha: 0.96,
    incisionDx: 0.35,
    incisionDy: 0.48,
    incisionWidth: 0.70,
    bevelColor: '#FFF6D688',
    bevelAlpha: 0.55,
    bevelDx: -0.25,
    bevelDy: -0.30,
    strokeWidth: 0.44,
    maxRatio: 0.80,
  },
  // Instruction (Purple leather #6C4772): High contrast, heavier decorative serif, comfortable margin.
  notes: {
    gradientColors: ['#C69B32', '#FDE78A', '#FFFFF4', '#F4D264', '#BA8C24'],
    gradientStops: [0, 0.22, 0.46, 0.70, 1],
    incisionColor: '#12041AF5',
    incisionAlpha: 0.98,
    incisionDx: 0.35,
    incisionDy: 0.50,
    incisionWidth: 0.75,
    bevelColor: '#FFFFEA99',
    bevelAlpha: 0.65,
    bevelDx: -0.25,
    bevelDy: -0.30,
    strokeWidth: 0.54,
    maxRatio: 0.73,
  },
  // Flower Language Collection (Ivory leather #D9C49D): Dark antique bronze / deep brown-gold lettering.
  collection: {
    gradientColors: ['#79501D', '#B48738', '#D4AE5C', '#A7792D', '#704719'],
    gradientStops: [0, 0.28, 0.52, 0.78, 1],
    incisionColor: '#100601FF',
    incisionAlpha: 0.98,
    incisionDx: 0.30,
    incisionDy: 0.45,
    incisionWidth: 0.70,
    bevelColor: '#F7E6C866',
    bevelAlpha: 0.40,
    bevelDx: -0.20,
    bevelDy: -0.25,
    strokeWidth: 0.46,
    maxRatio: 0.76,
  },
};

/** Refined antique foil: crisp engraved incision, subtle bevel glint, stroke reinforcement, and radiant gold/bronze fill. */
function foil(
  canvas: SkCanvas, text: string, font: SkFont, width: number, baseline: number,
  size: number, id: PavilionBookId, locale: AppLocale, onCover = false
) {
  const theme = FOIL_THEMES[id];
  const ratio = onCover ? 0.84 : (theme.maxRatio ?? 0.80);
  font.setSize(size);
  font.setSize(Math.min(size, size * width * ratio / Math.max(1, textWidth(font, text))));
  const actual = font.getSize(), x = (width - textWidth(font, text)) / 2;
  const scale = actual / 16;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  // 1. Subtle dark engraved edge (incision into leather, not blurry outer shadow)
  const incW = 0.20 * scale;
  const incDx = 0.18 * scale;
  const incDy = 0.24 * scale;
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(incW);
  paint.setColor(Skia.Color(theme.incisionColor));
  paint.setAlphaf(0.58);
  canvas.drawText(text, x + incDx, baseline + incDy, paint, font);
  paint.setStyle(PaintStyle.Fill);
  canvas.drawText(text, x + incDx, baseline + incDy, paint, font);

  // 2. Subtle directional bevel highlight on illuminated top-left edge
  if (theme.bevelColor && theme.bevelAlpha) {
    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeWidth(0.16 * scale);
    paint.setColor(Skia.Color(theme.bevelColor));
    paint.setAlphaf(0.32);
    canvas.drawText(text, x + (theme.bevelDx ?? -0.25) * scale, baseline + (theme.bevelDy ?? -0.30) * scale, paint, font);
  }

  // 3. Core radiant gold/bronze foil gradient
  const gradient = Skia.Shader.MakeLinearGradient(
    { x: 0, y: baseline - actual * 0.95 },
    { x: 0, y: baseline + actual * 0.15 },
    theme.gradientColors.map(c => Skia.Color(c)),
    theme.gradientStops,
    TileMode.Clamp
  );
  paint.setShader(gradient);

  // 4. Stroke reinforcement: slightly solidifies thin hairline serifs without blur
  const strokeW = 0.10 * scale;
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(strokeW);
  paint.setAlphaf(1.0);
  canvas.drawText(text, x, baseline, paint, font);

  // 5. Crisp unblurred top fill
  paint.setStyle(PaintStyle.Fill);
  canvas.drawText(text, x, baseline, paint, font);

  paint.dispose();
  gradient.dispose();
}

/** One physical foil treatment for approved English shapes and live Song glyphs. */
function spineFoil(canvas: SkCanvas, mask: SkImage, width: number, height: number, id: PavilionBookId) {
  const ivory = id === 'collection';
  const paint = Skia.Paint(); paint.setAntiAlias(true);
  const gradient = Skia.Shader.MakeLinearGradient(
    { x: 0, y: 52 }, { x: 0, y: 103 },
    (ivory ? ['#74411F', '#B38443', '#8C592C', '#72431E', '#A57436']
      : ['#B98B47', '#F6D9A0', '#E4BE70', '#C89D52', '#EACB87']).map(c => Skia.Color(c)),
    [0, .24, .48, .74, 1], TileMode.Clamp
  );
  const rect = Skia.XYWHRect(0, 0, width, height);
  const source = Skia.XYWHRect(0, 0, mask.width(), mask.height());
  // SrcIn colors only the alpha stencil. No leather-colored rectangle, glow,
  // outline reinforcement or language-specific material can enter this layer.
  const layer = (dx: number, dy: number, color: string | null, alpha: number) => {
    canvas.saveLayer();
    paint.setBlendMode(BlendMode.SrcOver); paint.setShader(null); paint.setAlphaf(1);
    canvas.drawImageRectOptions(mask, source, Skia.XYWHRect(dx, dy, width, height), FilterMode.Linear, MipmapMode.Linear, paint);
    paint.setBlendMode(BlendMode.SrcIn);
    paint.setColor(Skia.Color(color ?? '#FFFFFF')); paint.setAlphaf(alpha);
    if (!color) paint.setShader(gradient);
    canvas.drawRect(rect, paint);
    canvas.restore();
  };
  layer(.28, .38, ivory ? '#4C2814' : '#463019', .64);
  layer(-.18, -.22, ivory ? '#D8B779' : '#FFE8B8', .42);
  layer(0, 0, null, .97);
  paint.dispose(); gradient.dispose();
}

/** Shelf textures rendered at 4x offscreen density for crisp high-DPI display. */
export function usePavilionSpines(locale: AppLocale) {
  const blank = useImage(BLANK), approvedGlyphs = useImage(APPROVED_TITLE_GLYPHS);
  const fontAsset = locale === 'zh-Hans' ? SPINE_FONT_ZH : PAVILION_LABEL_FONT;
  const font = useFont(fontAsset, 16);
  const spines = useMemo(() => {
    if (!blank || !approvedGlyphs || !font) return null;
    const result = {} as Record<PavilionBookId, TitledSpine>;
    for (const id of Object.keys(PAVILION_SLOTS) as PavilionBookId[]) {
      const r = PAVILION_SLOTS[id], density = 4;
      const surface = bakeSurface(r.width * density, r.height * density);
      if (!surface) return null;
      const canvas = surface.getCanvas(), paint = Skia.Paint();
      canvas.scale(density, density);

      // Both locales use the same continuous, unlettered leather material.
      canvas.clear(Skia.Color('transparent'));
      canvas.drawImageRectOptions(blank, Skia.XYWHRect(r.x, r.y, r.width, r.height), Skia.XYWHRect(0, 0, r.width, r.height), FilterMode.Linear, MipmapMode.Linear, paint);

      // The foil layer has genuine zero alpha outside the glyphs. It is baked
      // into the same spine texture used at rest and by the moving book mesh.
      const lettering = bakeSurface(r.width * density, r.height * density);
      if (!lettering) { paint.dispose(); surface.dispose(); return null; }
      const glyphs = lettering.getCanvas();
      glyphs.clear(Skia.Color('transparent'));
      glyphs.scale(density, density);
      if (locale === 'en') {
        // Recover the approved proportions and exact two-line Flower Language
        // layout instead of substituting another Latin font or shrinking it.
        glyphs.drawImageRectOptions(approvedGlyphs, Skia.XYWHRect(r.x, r.y, r.width, r.height), Skia.XYWHRect(0, 0, r.width, r.height), FilterMode.Linear, MipmapMode.Linear, paint);
      } else {
        const text = pavilionTitleLines(id, locale)[0];
        font.setSize(23.5);
        font.setSize(Math.min(23.5, 23.5 * r.width * .86 / Math.max(1, textWidth(font, text))));
        const x = (r.width - textWidth(font, text)) / 2;
        // Noto Serif SC title outlines are centered 0.38 em above baseline.
        // Use outline metrics rather than measureText (unsupported on web).
        const baseline = 78 + font.getSize() * .38;
        paint.setColor(Skia.Color('#FFFFFF'));
        glyphs.drawText(text, x, baseline, paint, font);
      }
      const glyphImage = rasterSnapshot(lettering);
      spineFoil(canvas, glyphImage, r.width, r.height, id);
      glyphImage.dispose();

      const image = rasterSnapshot(surface);
      paint.dispose();
      result[id] = { image, uri: `data:image/png;base64,${image.encodeToBase64(ImageFormat.PNG)}` };
    }
    return result;
  }, [blank, approvedGlyphs, font, locale]);
  useEffect(() => () => { if (spines) Object.values(spines).forEach(spine => spine.image.dispose()); }, [spines]);
  return spines;
}

/** Localized carving samples the actual wood beneath the glyphs. No flat label panel. */
export function PavilionEngraving({ locale, width, height, left, top, art, size }: {
  locale: AppLocale; width: number; height: number; left: number; top: number;
  art: { x: number; y: number; width: number; height: number }; size: number;
}) {
  const wood = useImage(WOOD);
  const fontAsset = locale === 'zh-Hans' ? PAVILION_LABEL_FONT_ZH : PAVILION_LABEL_FONT;
  const font = useFont(fontAsset, size);
  const picture = useMemo(() => createPicture(canvas => {
    if (!font || !wood || width <= 0) return;
    const text = PAVILION_TEXT[locale].instruction;
    font.setSize(size); font.setSize(Math.min(size, size * (width - 12) / Math.max(1, textWidth(font, text))));
    const x = (width - textWidth(font, text)) / 2;
    const metrics = font.getMetrics(), y = (height - metrics.ascent - metrics.descent) / 2;
    const paint = Skia.Paint(); paint.setAntiAlias(true);
    const matrix = Skia.Matrix(); matrix.translate(art.x - left, art.y - top); matrix.scale(art.width / wood.width(), art.height / wood.height());
    const substrate = wood.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.Linear, matrix); matrix.dispose();
    const tint = Skia.Shader.MakeColor(Skia.Color('#D1AD7866'));
    const carved = Skia.Shader.MakeBlend(BlendMode.Screen, substrate, tint);
    paint.setShader(carved); paint.setAlphaf(.85); canvas.drawText(text, x, y, paint, font);
    paint.setShader(null);
    // Difference masks keep both relief edges inside the glyph, like a shallow
    // incision in the wood, instead of casting a floating outside drop shadow.
    for (const edge of [{ color: '#301809B0', dx: .45, dy: .6 }, { color: '#F6D9A48C', dx: -.35, dy: -.5 }]) {
      canvas.saveLayer(undefined, Skia.XYWHRect(0, 0, width, height));
      paint.setBlendMode(BlendMode.SrcOver); paint.setColor(Skia.Color(edge.color));
      canvas.drawText(text, x, y, paint, font);
      paint.setBlendMode(BlendMode.DstOut); paint.setColor(Skia.Color('#FFFFFF'));
      canvas.drawText(text, x + edge.dx, y + edge.dy, paint, font);
      canvas.restore();
    }
    paint.dispose(); substrate.dispose(); tint.dispose(); carved.dispose();
  }), [wood, font, locale, width, height, left, top, art, size]);
  return <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}><Picture picture={picture} /></Canvas>;
}

// Dedicated cover painting stays at its real native resolution. Centre cropping
// fits the renderer's W/H ratio without stretching petals or gilded ornaments.
function coverTexture(image: SkImage, id: PavilionBookId, locale: AppLocale, font: SkFont, _grain: SkImage | null) {
  const w = image.width(), h = Math.min(image.height(), Math.round(w * SPEC.H / SPEC.W));
  const surface = bakeSurface(w, h); if (!surface) return null;
  const canvas = surface.getCanvas(), paint = Skia.Paint();
  canvas.drawImageRectOptions(image, Skia.XYWHRect(0, (image.height() - h) / 2, w, h), Skia.XYWHRect(0, 0, w, h), FilterMode.Linear, MipmapMode.Linear, paint);
  const lines = pavilionTitleLines(id, locale, true);
  lines.forEach((line, i) => foil(canvas, line, font, w, h * (lines.length > 1 ? .315 + i * .054 : .345), h * .047, id, locale, true));
  paint.dispose(); return rasterSnapshot(surface);
}
function paperTexture(image: SkImage) {
  const surface = bakeSurface(SPEC.W, SPEC.H); if (!surface) return null;
  const canvas = surface.getCanvas(), paint = Skia.Paint();
  canvas.drawImageRectOptions(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, SPEC.W, SPEC.H), FilterMode.Linear, MipmapMode.Linear, paint);


  paint.dispose(); return rasterSnapshot(surface);
}

/** The Treehouse motion, curved spine, page geometry and timing stay unchanged. */
export function PavilionBook({ id, locale, spine, geometry, timeline, focus, onReady }: {
  id: PavilionBookId; locale: AppLocale; spine: SkImage | null; geometry: PavilionGeometry;
  timeline: SharedValue<number>; focus: SharedValue<number>; onReady: () => void;
}) {
  const grain = useImage(GRAIN), edges = useImage(EDGES), parchment = useImage(PAPER), hd = useImage(COVERS[id]);
  const fontAsset = locale === 'zh-Hans' ? PAVILION_LABEL_FONT_ZH : PAVILION_LABEL_FONT;
  const font = useFont(fontAsset, 16);
  const cover = useMemo(() => hd && font ? coverTexture(hd, id, locale, font, grain) : null, [hd, font, grain, id, locale]);
  const paper = useMemo(() => parchment ? paperTexture(parchment) : null, [parchment]);
  useEffect(() => () => { cover?.dispose(); }, [cover]); useEffect(() => () => { paper?.dispose(); }, [paper]);
  const textures = useMemo<BookTextures | null>(() => {
    if (!spine || !grain || !edges || !parchment || !cover || !paper) return null;
    const hex = PAVILION_CLOTH[id];
    const tint = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
    return { cover, spine, grain, edges, parchment, left: paper, right: paper, tint };
  }, [spine, grain, edges, parchment, cover, paper, id]);
  const started = useRef(false), ready = useRef(onReady); ready.current = onReady;
  useEffect(() => { if (textures && !started.current) { started.current = true; ready.current(); } }, [textures]);
  const picture = useDerivedValue(() => createPicture(canvas => {
    if (!textures || !spine) return;
    const t = timeline.value, f = pavilionFrame(t, geometry, focus.value);
    const u = Math.min(1, Math.max(0, t / .13)), solid = u * u * (3 - 2 * u);
    drawFloatShadow(canvas, f.cam, f.pose, f.state, f.shadow * .65, f.lift);
    drawBook(canvas, f.cam, f.pose, f.state, textures, { opacity: solid });
    if (solid < 1) {
      const centre = projectPoint(f.cam, f.pose, [SPEC.W / 2, SPEC.H / 2, 0]);
      const first = pavilionFrame(0, geometry);
      const initialDepth = first.cam.d / (first.cam.d - first.pose.z), depth = f.cam.d / (f.cam.d - f.pose.z);
      const k = f.pose.s / first.pose.s * depth / initialDepth;
      const w = geometry.shelf.width * k, h = geometry.shelf.height * k;
      const paint = Skia.Paint(); paint.setAlphaf(1 - solid);
      canvas.drawImageRectOptions(spine, Skia.XYWHRect(0, 0, spine.width(), spine.height()), Skia.XYWHRect(centre[0] - w / 2, centre[1] - h / 2, w, h), FilterMode.Linear, MipmapMode.Linear, paint);
      paint.dispose();
    }
  }), [textures, spine, geometry]);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>
  </View>;
}
