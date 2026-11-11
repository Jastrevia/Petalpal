// Page and cover faces for the 3D book, painted once into images (JS thread) and then mapped onto the book.
// Everything is drawn from the shipped textures (parchment, the month's spine painting, its baked cover) and live
// journal data; nothing comes from the reference image.
import { drawBotanicalWatermark } from './watermark';
import {
  BlendMode, FontSlant, FontWeight, Skia, TextAlign, TileMode, type SkCanvas, type SkImage, type SkTypefaceFontProvider,
} from '@shopify/react-native-skia';
import { SPEC } from './math';
import { journalCount, treehouseZh, tt } from '../../../services/treehouseCopy';

/** Page faces in book units (the top page between the squares and the gutter), painted at 1.25 px per unit. */
export const PAGE = { width: SPEC.W - SPEC.over - SPEC.gap, height: SPEC.H - 2 * SPEC.over, density: 1 };
export const INK = '#4A3B27', SOFT = '#7A6447', RULE = '#C2A06B', GOLD = '#B98E45', GOLD_LIGHT = '#F1D99A', GOLD_DARK = '#6E4E1E';
// Chinese falls back to Noto Serif SC (assets.ts CJK_FAMILY), registered only when a book needs it.
export const FAMILY = ['EB Garamond', 'Noto Serif SC'];

export function paint(width: number, height: number, density: number, draw: (canvas: SkCanvas) => void): SkImage | null {
  const surface = Skia.Surface.Make(Math.round(width * density), Math.round(height * density));
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(density, density);
  draw(canvas);
  surface.flush();
  const image = surface.makeImageSnapshot();
  // Raster copy: shareable with the UI thread on native.
  return image.makeNonTextureImage?.() ?? image;
}

export type TextOptions = { size: number; italic?: boolean; color?: string; align?: TextAlign; maxLines?: number; spacing?: number; line?: number; weight?: FontWeight };
// Native Skia reads every key that is present and throws on an undefined value ("Value is undefined, expected a
// String"), which stops the app; the web build ignores it. So an unset option is left out, never passed as undefined.
const clipped = (maxLines: number | undefined) => maxLines ? { maxLines, ellipsis: '…' } : {};
export function paragraph(fonts: SkTypefaceFontProvider, text: string, width: number, o: TextOptions) {
  const builder = Skia.ParagraphBuilder.Make({ textAlign: o.align ?? TextAlign.Left, ...clipped(o.maxLines) }, fonts);
  builder.pushStyle({ fontFamilies: FAMILY, fontSize: o.size, color: Skia.Color(o.color ?? INK), letterSpacing: o.spacing ?? 0,
    ...(o.line === undefined ? {} : { heightMultiplier: o.line }),
    fontStyle: { slant: o.italic ? FontSlant.Italic : FontSlant.Upright, weight: o.weight ?? (o.italic ? FontWeight.Medium : FontWeight.Normal) } });
  builder.addText(text);
  const p = builder.build();
  p.layout(width);
  return p;
}
/** Draws text and returns its height. Gold text is struck like gilt: a dark bed, a light edge, then the gold face. */
export function text(canvas: SkCanvas, fonts: SkTypefaceFontProvider, value: string, x: number, y: number, width: number, o: TextOptions & { gilt?: boolean }) {
  if (o.gilt) {
    paragraph(fonts, value, width, { ...o, color: GOLD_DARK }).paint(canvas, x, y + 2.2);
    paragraph(fonts, value, width, { ...o, color: GOLD_LIGHT }).paint(canvas, x, y - .8);
    const p = paragraph(fonts, value, width, { ...o, color: '#D2AC5E' });
    p.paint(canvas, x, y);
    return p.getHeight();
  }
  const p = paragraph(fonts, value, width, o);
  p.paint(canvas, x, y);
  return p.getHeight();
}

export function stroke(color: string, width: number) {
  const p = Skia.Paint();
  p.setAntiAlias(true); p.setStyle(1); p.setStrokeWidth(width); p.setColor(Skia.Color(color));
  return p;
}
export function fill(color: string) {
  const p = Skia.Paint();
  p.setAntiAlias(true); p.setColor(Skia.Color(color));
  return p;
}

/** Aged paper: the parchment texture, a warmer rim and a faint printed border. */
export function paper(canvas: SkCanvas, parchment: SkImage, w: number, h: number, mirror: boolean) {
  const p = Skia.Paint();
  canvas.save();
  if (mirror) { canvas.translate(w, 0); canvas.scale(-1, 1); }
  canvas.drawImageRect(parchment, Skia.XYWHRect(0, 0, parchment.width(), parchment.height()), Skia.XYWHRect(0, 0, w, h), p);
  canvas.restore();
  // Foxing toward the outer edges.
  const rim = Skia.Paint();
  rim.setShader(Skia.Shader.MakeRadialGradient({ x: w / 2, y: h / 2 }, Math.hypot(w, h) * .62,
    [Skia.Color('#00000000'), Skia.Color('#00000000'), Skia.Color('#8A5A2233')], [0, .62, 1], TileMode.Clamp));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), rim);
}
export function border(canvas: SkCanvas, w: number, h: number, inset: number) {
  canvas.drawRect(Skia.XYWHRect(inset, inset, w - inset * 2, h - inset * 2), stroke('#B9955E99', 1.6));
  canvas.drawRect(Skia.XYWHRect(inset + 7, inset + 7, w - inset * 2 - 14, h - inset * 2 - 14), stroke('#B9955E66', .9));
}
/** A gilt corner piece: a stepped bracket with a curl and a lozenge, struck dark then light then gold. */
function corner(canvas: SkCanvas, x: number, y: number, sx: number, sy: number, size: number) {
  const path = Skia.PathBuilder.Make();
  path.moveTo(0, size); path.lineTo(0, 10); path.quadTo(0, 0, 10, 0); path.lineTo(size, 0);
  path.moveTo(9, size * .72); path.lineTo(9, 18); path.quadTo(9, 9, 18, 9); path.lineTo(size * .72, 9);
  path.moveTo(size, 0); path.cubicTo(size + 10, 2, size + 12, 12, size + 4, 14); path.cubicTo(size - 2, 15, size - 2, 8, size + 3, 8);
  path.moveTo(0, size); path.cubicTo(2, size + 10, 12, size + 12, 14, size + 4); path.cubicTo(15, size - 2, 8, size - 2, 8, size + 3);
  const lozenge = Skia.PathBuilder.Make();
  lozenge.moveTo(22, 15); lozenge.lineTo(29, 22); lozenge.lineTo(22, 29); lozenge.lineTo(15, 22); lozenge.close();
  const pathPath = path.build(), lozengePath = lozenge.build();
  for (const [dx, dy, color, width] of [[0, 1.4, GOLD_DARK, 3.2], [0, -.5, GOLD_LIGHT, 1.6], [0, 0, GOLD, 2.2]] as const) {
    canvas.save();
    canvas.translate(x + dx, y + dy); canvas.scale(sx, sy);
    canvas.drawPath(pathPath, stroke(color, width));
    canvas.drawPath(lozengePath, fill(color));
    canvas.restore();
  }
}
export function corners(canvas: SkCanvas, w: number, h: number, inset: number, size: number) {
  corner(canvas, inset, inset, 1, 1, size); corner(canvas, w - inset, inset, -1, 1, size);
  corner(canvas, inset, h - inset, 1, -1, size); corner(canvas, w - inset, h - inset, -1, -1, size);
}
export function flourish(canvas: SkCanvas, cx: number, y: number, half: number) {
  canvas.drawLine(cx - half, y, cx - 12, y, stroke(RULE, 1.4));
  canvas.drawLine(cx + 12, y, cx + half, y, stroke(RULE, 1.4));
  const d = Skia.PathBuilder.Make();
  d.moveTo(cx, y - 6); d.lineTo(cx + 6, y); d.lineTo(cx, y + 6); d.lineTo(cx - 6, y); d.close();
  const dPath = d.build();
  canvas.drawPath(dPath, fill(RULE));
  canvas.drawCircle(cx - half - 4, y, 2.4, fill(RULE)); canvas.drawCircle(cx + half + 4, y, 2.4, fill(RULE));
}
/** A gilt vine (stem and paired leaves) like the cover's, beside the plate. */
function vine(canvas: SkCanvas, x: number, top: number, bottom: number, flip: number) {
  const stem = Skia.PathBuilder.Make();
  const n = 7, step = (bottom - top) / n;
  stem.moveTo(x, top);
  for (let i = 0; i < n; i++) stem.quadTo(x + (i % 2 ? 9 : -9) * flip, top + step * (i + .5), x, top + step * (i + 1));
  const stemPath = stem.build();
  canvas.drawPath(stemPath, stroke('#A9834488', 1.6));
  for (let i = 0; i < n; i++) {
    const y = top + step * (i + .5), side = (i % 2 ? 1 : -1) * flip;
    const leaf = Skia.PathBuilder.Make();
    leaf.moveTo(x, y); leaf.quadTo(x + side * 10, y - 9, x + side * 19, y - 4); leaf.quadTo(x + side * 10, y + 2, x, y);
    const leafPath = leaf.build();
    canvas.drawPath(leafPath, fill('#B48D4C88'));
  }
}
/** The month's flower, cut from its own spine painting, inlaid in an arched gilt frame (as on the cover). */
export function plate(canvas: SkCanvas, spine: SkImage, cx: number, top: number, width: number, height: number,
  /** The part of the painting shown (shares of its width and height); the journals show the flower's panel. */
  part: [number, number, number, number] = [.16, .2, .7, .64]) {
  const iw = spine.width(), ih = spine.height();
  const src = Skia.XYWHRect(iw * part[0], ih * part[1], iw * part[2], ih * part[3]);
  const x = cx - width / 2;
  const arch = Skia.PathBuilder.Make();
  arch.moveTo(x, top + height); arch.lineTo(x, top + width / 2);
  arch.arcToTangent(x, top, cx, top, width / 2); arch.arcToTangent(x + width, top, x + width, top + width / 2, width / 2);
  arch.lineTo(x + width, top + height); arch.close();
  const archPath = arch.build();
  const shadow = fill('#3A24104D');
  shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(1, 6, true));
  canvas.save(); canvas.translate(3, 5); canvas.drawPath(archPath, shadow); canvas.restore();
  canvas.save();
  canvas.clipPath(archPath, 1, true);
  // Cover the arch: scale the painting to the frame's width and centre the flower in it.
  const k = width / src.width;
  const shownH = src.height * k;
  canvas.drawImageRect(spine, src, Skia.XYWHRect(x, top + (height - shownH) / 2, width, shownH), Skia.Paint());
  canvas.restore();
  canvas.drawPath(archPath, stroke(GOLD_DARK, 5));
  canvas.drawPath(archPath, stroke('#D6B06A', 3));
  canvas.save(); canvas.translate(0, -1); canvas.drawPath(archPath, stroke('#F4DFA488', 1)); canvas.restore();
}

/** The front cover: the baked leather cover with the year struck in gilt above the month's title. */
export function coverTexture(cover: SkImage, fonts: SkTypefaceFontProvider, year: number) {
  const w = cover.width(), h = cover.height();
  return paint(w, h, 1, canvas => {
    canvas.drawImage(cover, 0, 0);
    text(canvas, fonts, `${year}`, 0, h * .085, w, { size: w * .06, align: TextAlign.Center, spacing: w * .02, gilt: true });
  });
}

/** Left page: month, year and the month's botanical plate. */
export function frontispiece(o: { parchment: SkImage; spine: SkImage; fonts: SkTypefaceFontProvider; monthName: string; year: number;
  flower: string; latin: string; count: number }) {
  const { width: w, height: h } = PAGE;
  return paint(w, h, PAGE.density, canvas => {
    paper(canvas, o.parchment, w, h, true);
    border(canvas, w, h, 30);
    corners(canvas, w, h, 30, 60);
    text(canvas, o.fonts, `${o.year}`, 0, 82, w, { size: 30, align: TextAlign.Center, spacing: 10, color: SOFT });
    text(canvas, o.fonts, o.monthName, 0, 116, w, { size: 92, italic: true, align: TextAlign.Center, color: INK });
    flourish(canvas, w / 2, 248, 120);
    const plateW = 210, plateH = 470, plateTop = 284;
    plate(canvas, o.spine, w / 2, plateTop, plateW, plateH);
    vine(canvas, w / 2 - plateW / 2 - 52, plateTop + 50, plateTop + plateH - 30, 1);
    vine(canvas, w / 2 + plateW / 2 + 52, plateTop + 50, plateTop + plateH - 30, -1);
    text(canvas, o.fonts, o.flower, 0, plateTop + plateH + 26, w, { size: 40, italic: true, align: TextAlign.Center, color: INK });
    text(canvas, o.fonts, o.latin, 0, plateTop + plateH + 76, w, { size: 28, italic: true, align: TextAlign.Center, color: SOFT });
    text(canvas, o.fonts, o.count ? journalCount(o.count) : tt('No journals yet'), 0, h - 112, w,
      { size: 27, align: TextAlign.Center, spacing: 3, color: SOFT });
  });
}

// ---------- a day's left page: the field-journal record of what grew, what happened and how it felt ----------
export type FlowerArt = { image: SkImage; bounds: [number, number, number, number] } | null;
export type RecordsFace = {
  weekday: string; date: string;
  flowers: { name: string; meaning: string | null; source: string; art: FlowerArt }[];
  events: string[];
  moods: { title: string; secondary: string[]; source: string }[];
};
function sectionLabel(canvas: SkCanvas, fonts: SkTypefaceFontProvider, label: string, x: number, y: number, inner: number) {
  // The leading spaces leave room for the sprig; the words after them are looked up in the owner's language.
  const pad = label.slice(0, label.length - label.trimStart().length), words = label.trim();
  const h = text(canvas, fonts, (pad + tt(words)).toUpperCase(), x, y, inner, { size: 23, spacing: treehouseZh() ? 2 : 5, color: '#8C7148' });
  canvas.drawLine(x, y + h + 4, x + inner, y + h + 4, stroke('#C2A06B88', 1.2));
  return h + 14;
}
/** A small gilt sprig: the field journal's mark beside each section. */
export function sprig(canvas: SkCanvas, x: number, y: number, color: string) {
  const stem = Skia.PathBuilder.Make();
  stem.moveTo(x, y + 18); stem.quadTo(x + 4, y + 6, x + 12, y);
  canvas.drawPath(stem.build(), stroke(color, 2));
  for (const [dx, dy, s] of [[3, 12, -1], [7, 6, 1]] as const) {
    const leaf = Skia.PathBuilder.Make();
    leaf.moveTo(x + dx, y + dy); leaf.quadTo(x + dx + 7 * s, y + dy - 6, x + dx + 12 * s, y + dy - 2); leaf.quadTo(x + dx + 6 * s, y + dy + 2, x + dx, y + dy);
    canvas.drawPath(leaf.build(), fill(color));
  }
}
const EMPTY = '#A08B6A';
/** Left page in the spread: Date → Flower → Event → Mood analysis, from the day's own records only. The flower's
 *  own Garden artwork is the page's centrepiece, as in a botanical field journal. */
export function recordsPage(o: { parchment: SkImage; fonts: SkTypefaceFontProvider; day: RecordsFace }) {
  const { width: w, height: h } = PAGE;
  const x = 66, inner = w - x - 70;
  const d = o.day;
  const flower = d.flowers[0];
  const mood = d.moods[0];
  return paint(w, h, 1, canvas => {
    paper(canvas, o.parchment, w, h, true);
    border(canvas, w, h, 30);
    corners(canvas, w, h, 30, 60);
    let y = 66;
    y += text(canvas, o.fonts, d.weekday.toUpperCase(), 0, y, w, { size: 24, spacing: 7, color: SOFT, align: TextAlign.Center });
    y += text(canvas, o.fonts, d.date, 0, y + 2, w, { size: 44, italic: true, color: INK, align: TextAlign.Center });
    flourish(canvas, w / 2, y + 20, 90);
    y += 40;
    // Room left for the flower once the Event and mood sections below have what they need.
    const eventText = d.events[0] || '';
    const eventLines = flower ? 2 : 4;
    const eventH = 40 + (eventText ? paragraph(o.fonts, eventText, inner, { size: 29, line: 1.25, maxLines: eventLines }).getHeight() + (d.events.length > 1 ? 30 : 0) : 36);
    const moodH = 40 + (mood ? 46 + (mood.secondary.length ? 34 : 0) : 36);
    const footer = h - 126;
    // Flower
    const flowerTop = y;
    if (flower) {
      const nameH = 50, meaningH = flower.meaning ? 36 : 0, sourceH = 26, more = d.flowers.length > 1 ? 30 : 0;
      const art = Math.max(90, Math.min(300, footer - eventH - moodH - flowerTop - nameH - meaningH - sourceH - more - 16));
      if (flower.art) {
        const [bx0, by0, bx1, by1] = flower.art.bounds;
        const k = Math.min(art / (bx1 - bx0), art / (by1 - by0));
        const dw = (bx1 - bx0) * k, dh = (by1 - by0) * k;
        canvas.drawImageRect(flower.art.image, Skia.XYWHRect(bx0, by0, bx1 - bx0, by1 - by0), Skia.XYWHRect((w - dw) / 2, y + (art - dh), dw, dh), Skia.Paint());
      } else {
        // No bundled artwork for this flower: an empty gilt frame rather than an invented picture.
        canvas.drawRect(Skia.XYWHRect(w / 2 - art * .35, y + art * .1, art * .7, art * .85), stroke('#C2A06B', 1.6));
      }
      y += art + 6;
      y += text(canvas, o.fonts, flower.name, 0, y, w, { size: 42, italic: true, color: INK, align: TextAlign.Center, maxLines: 1 });
      if (flower.meaning) y += text(canvas, o.fonts, flower.meaning, x, y, inner, { size: 27, color: SOFT, align: TextAlign.Center, maxLines: 1 });
      y += text(canvas, o.fonts, tt(flower.source === 'Event' ? 'Grew from an Event' : 'Grew from Daily Grow').toUpperCase(), 0, y + 2, w, { size: 18, spacing: 4, color: '#9A8463', align: TextAlign.Center }) + 4;
      if (d.flowers.length > 1) y += text(canvas, o.fonts, `${tt('Also grew')}${treehouseZh() ? '：' : ': '}${d.flowers.slice(1).map(f => f.name).join(treehouseZh() ? '、' : ', ')}`, x, y, inner, { size: 24, italic: true, color: SOFT, align: TextAlign.Center, maxLines: 1 });
      y += 12;
    } else {
      sprig(canvas, x - 2, y + 2, '#B48D4C');
      y += sectionLabel(canvas, o.fonts, "    The day's flower", x, y, inner);
      y += text(canvas, o.fonts, tt('No flower grew on this day.'), x, y + 2, inner, { size: 30, italic: true, color: EMPTY }) + 16;
    }
    // Event
    sprig(canvas, x - 2, y + 2, '#B48D4C');
    y += sectionLabel(canvas, o.fonts, d.events.length > 1 ? `    ${tt('Events')} · ${d.events.length}` : '    Event', x, y, inner);
    if (eventText) {
      y += text(canvas, o.fonts, eventText, x, y, inner, { size: 29, color: INK, line: 1.25, maxLines: eventLines }) + 4;
      if (d.events.length > 1) y += text(canvas, o.fonts, treehouseZh() ? `还有 ${d.events.length - 1} 条 · 点书页阅读` : `and ${d.events.length - 1} more — tap to read`, x, y, inner, { size: 23, italic: true, color: SOFT }) + 4;
    } else {
      y += text(canvas, o.fonts, tt('No Event recorded.'), x, y + 2, inner, { size: 30, italic: true, color: EMPTY }) + 6;
    }
    y += 12;
    // Mood analysis
    sprig(canvas, x - 2, y + 2, '#B48D4C');
    y += sectionLabel(canvas, o.fonts, '    Mood analysis', x, y, inner);
    if (mood) {
      y += text(canvas, o.fonts, d.moods.length > 1 ? `${mood.title} · ${d.moods.slice(1).map(m => m.title).join(' · ')}` : mood.title, x, y, inner, { size: 34, italic: true, color: INK, maxLines: 1 }) + 2;
      if (mood.secondary.length) text(canvas, o.fonts, mood.secondary.join(' · '), x, y, inner, { size: 26, color: SOFT, maxLines: 1 });
    } else {
      y += text(canvas, o.fonts, tt('No mood recorded.'), x, y + 2, inner, { size: 30, italic: true, color: EMPTY });
    }
    // Nothing recorded at all: a faint botanical line drawing in the blank space, so the page looks intentional.
    if (!flower && !d.events.length && !mood) {
      const room = h - 130 - (y + 20);
      if (room > 120) drawBotanicalWatermark(canvas, w / 2, y + 20 + room / 2, Math.min(300, room * .85));
    }
    flourish(canvas, w / 2, h - 96, 60);
    text(canvas, o.fonts, tt('Tap the page to read'), 0, h - 80, w, { size: 25, italic: true, align: TextAlign.Center, color: SOFT });
  });
}
/** Right page with no journal to show: today's open page with its writing prompt, or a past day's quiet note. */
export function writingPage(o: { parchment: SkImage; fonts: SkTypefaceFontProvider; weekday: string; date: string; kind: 'today' | 'past' }) {
  const { width: w, height: h } = PAGE;
  const x = 74, inner = w - x - 64;
  return paint(w, h, 1, canvas => {
    paper(canvas, o.parchment, w, h, false);
    border(canvas, w, h, 30);
    corners(canvas, w, h, 30, 60);
    let y = 74;
    y += text(canvas, o.fonts, o.weekday.toUpperCase(), x, y, inner, { size: 26, spacing: 6, color: SOFT });
    y += text(canvas, o.fonts, o.date, x, y + 2, inner, { size: 38, italic: true, color: INK }) + 18;
    canvas.drawLine(x, y, x + inner, y, stroke(RULE, 1.4));
    y += 30;
    if (o.kind === 'today') {
      text(canvas, o.fonts, tt('Write your thoughts here…'), x, y, inner, { size: 44, italic: true, color: '#A8916C' });
      // Faint ruled lines, like a fresh journal page.
      for (let ly = y + 110; ly < h - 150; ly += 62) canvas.drawLine(x, ly, x + inner, ly, stroke('#C9B48D55', 1.2));
      flourish(canvas, w / 2, h - 122, 70);
      text(canvas, o.fonts, tt('Tap the page to write'), 0, h - 104, w, { size: 30, italic: true, align: TextAlign.Center, color: SOFT });
    } else {
      text(canvas, o.fonts, tt('No private journal on this day.'), x, y + 10, inner, { size: 38, italic: true, color: INK });
      text(canvas, o.fonts, tt('New journals are written on today’s page.'), x, y + 74, inner, { size: 28, color: SOFT });
      flourish(canvas, w / 2, h - 122, 70);
    }
  });
}

export type EntryFace = { weekday: string; date: string; title: string; body: string; grown: boolean; folio: string; hint?: string };
/** A small padlock (centred on x, y; about 22 units tall at k = 1). */
export function lockGlyph(canvas: SkCanvas, x: number, y: number, k: number, color: string) {
  const shackle = Skia.PathBuilder.Make();
  shackle.moveTo(x - 5 * k, y - 1 * k); shackle.lineTo(x - 5 * k, y - 5 * k); shackle.cubicTo(x - 5 * k, y - 12 * k, x + 5 * k, y - 12 * k, x + 5 * k, y - 5 * k); shackle.lineTo(x + 5 * k, y - 1 * k);
  canvas.drawPath(shackle.build(), stroke(color, 2.2 * k));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x - 8 * k, y - 2 * k, 16 * k, 12 * k), 2.5 * k, 2.5 * k), fill(color));
  canvas.drawCircle(x, y + 3.5 * k, 1.8 * k, fill('#F3E3C2'));
}
/** Right page in the spread (preview arrangement): date, title, as many lines of the entry as the page holds — ending
 *  in a deliberate ellipsis — and a reading hint. The whole entry is read close up (reading arrangement). */
export function entryPage(o: { parchment: SkImage; fonts: SkTypefaceFontProvider; entry: EntryFace; month: number }) {
  const { width: w, height: h } = PAGE;
  const x = 74, inner = w - x - 64;
  return paint(w, h, 1, canvas => {
    paper(canvas, o.parchment, w, h, false);
    border(canvas, w, h, 30);
    corners(canvas, w, h, 30, 60);
    let y = 74;
    y += text(canvas, o.fonts, o.entry.weekday.toUpperCase(), x, y, inner, { size: 26, spacing: 6, color: SOFT });
    y += text(canvas, o.fonts, o.entry.date, x, y + 2, inner, { size: 38, italic: true, color: INK }) + 18;
    canvas.drawLine(x, y, x + inner, y, stroke(RULE, 1.4));
    y += 26;
    if (o.entry.title) y += text(canvas, o.fonts, o.entry.title, x, y, inner, { size: 52, italic: true, color: INK, maxLines: 2, line: 1.1 }) + 16;
    const footer = h - 150;
    if (o.entry.grown) {
      lockGlyph(canvas, x + 12, y + 18, 1.1, '#8A6A3A');
      y += text(canvas, o.fonts, tt('From Daily Grow · read-only'), x + 34, y, inner - 34, { size: 28, italic: true, color: '#7C6A3E' }) + 14;
    }
    const lineH = 42 * 1.4;
    const lines = Math.floor((footer - y) / lineH);
    if (o.entry.body && lines > 0) text(canvas, o.fonts, o.entry.body, x, y, inner, { size: 42, line: 1.4, color: INK, maxLines: lines });
    flourish(canvas, w / 2, h - 122, 70);
    text(canvas, o.fonts, o.entry.hint ?? tt('Tap the page to read'), 0, h - 104, w, { size: 30, italic: true, align: TextAlign.Center, color: SOFT });
    text(canvas, o.fonts, o.entry.folio, 0, h - 64, w, { size: 24, align: TextAlign.Center, color: '#9A8463', spacing: 3 });
  });
}

// ---------- reading arrangement (see readingLayout.ts) ----------
/** The reading page's paper, corners and border at screen resolution: the live reading page shows this same image. */
export function readingBackground(parchment: SkImage, pixelWidth: number) {
  return paint(PAGE.width, PAGE.height, pixelWidth / PAGE.width, canvas => {
    paper(canvas, parchment, PAGE.width, PAGE.height, false);
    border(canvas, PAGE.width, PAGE.height, 30);
    corners(canvas, PAGE.width, PAGE.height, 30, 60);
  });
}
/** Text exactly as React Native lays it out: fixed line boxes with the leading split above and below each line. */
function lines(fonts: SkTypefaceFontProvider, value: string, width: number, size: number, line: number,
  o: { italic?: boolean; color?: string; spacing?: number; maxLines?: number; align?: TextAlign } = {}) {
  const builder = Skia.ParagraphBuilder.Make({
    textAlign: o.align ?? TextAlign.Left, ...clipped(o.maxLines),
    strutStyle: { strutEnabled: true, forceStrutHeight: true, fontFamilies: FAMILY, fontSize: size, heightMultiplier: line / size, halfLeading: true },
  }, fonts);
  builder.pushStyle({ fontFamilies: FAMILY, fontSize: size, color: Skia.Color(o.color ?? INK), letterSpacing: o.spacing ?? 0,
    heightMultiplier: line / size, halfLeading: true,
    fontStyle: { slant: o.italic ? FontSlant.Italic : FontSlant.Upright, weight: o.italic ? FontWeight.Medium : FontWeight.Normal } });
  builder.addText(value);
  const p = builder.build();
  p.layout(width);
  return p;
}
export type ReadingContent = { weekday: string; date: string; grown: boolean; title: string; body: string };
/** Where the live page placed the blocks under the text (measured), so the picture matches it. */
export type ReadingBlocks = { photo: { y: number; height: number } | null; end: number | null };
/** Before a page has been shown live its blocks are placed as the live page will place them: the photo slot 16 pt
 *  under the text (`photoHeight` tall, as measured on another page), the ornament 14 pt under that. */
export type BlockEstimate = { estimate: true; photo: boolean; photoHeight: number };
/** A picture of the live reading page at a scroll position (points; drawn at `density` pixels per point). */
export function readingFace(o: { background: SkImage; fonts: SkTypefaceFontProvider; m: import('./readingLayout').ReadingMetrics;
  density: number; content: ReadingContent; scrollY: number; blocks: ReadingBlocks | BlockEstimate; photo: SkImage | null; sprig: SkImage | null }) {
  const { m, content: c } = o;
  const w = m.width, h = m.height;
  const surface = Skia.Surface.Make(Math.round(w * o.density), Math.round(h * o.density));
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(o.density, o.density);
  canvas.drawImageRect(o.background, Skia.XYWHRect(0, 0, o.background.width(), o.background.height()), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  const x = m.padLeft, inner = w - m.padLeft - m.padRight;
  // Header: weekday, date (and the Daily Grow note) beside the actions button.
  let y = m.padTop;
  const textW = inner - m.actions.size - 8;
  lines(o.fonts, c.weekday.toUpperCase(), textW, m.weekday.size, m.weekday.line, { color: SOFT, spacing: m.weekday.spacing }).paint(canvas, x, y);
  y += m.weekday.line;
  lines(o.fonts, c.date, textW, m.date.size, m.date.line, { italic: true }).paint(canvas, x, y);
  y += m.date.line;
  if (c.grown) { lines(o.fonts, tt('From Daily Grow · kept as written'), textW, m.grown.size, m.grown.line, { italic: true, color: '#7C6A3E' }).paint(canvas, x, y); y += m.grown.line; }
  y = Math.max(y, m.padTop + m.actions.size);
  const bx = x + inner - m.actions.size / 2, by = m.padTop + m.actions.size / 2;
  canvas.drawCircle(bx, by, m.actions.size / 2, fill('#F7EBD2E6'));
  canvas.drawCircle(bx, by, m.actions.size / 2 - .5, stroke('#C9A264', 1));
  for (const dx of [-6.5, 0, 6.5]) canvas.drawCircle(bx + dx, by, 1.6, fill('#5C4630'));
  if (c.title) {
    y += m.title.gap;
    const title = lines(o.fonts, c.title, inner, m.title.size, m.title.line, { italic: true, maxLines: m.title.maxLines });
    title.paint(canvas, x, y);
    y += title.getHeight();
  }
  y += m.rule.gap;
  canvas.drawRect(Skia.XYWHRect(x, y, inner, 1), fill(RULE));
  y += 1 + m.rule.gap;
  // The scrolling body, clipped to its window like the live ScrollView.
  const top = y, bottom = h - m.padBottom;
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(0, top, w, bottom - top), 1, true);
  canvas.translate(0, top - o.scrollY);
  let bodyHeight = 0;
  if (c.body) { const body = lines(o.fonts, c.body, inner, m.body.size, m.body.line); body.paint(canvas, x, 0); bodyHeight = body.getHeight(); }
  const est = 'estimate' in o.blocks ? o.blocks : null;
  const measured = est ? null : o.blocks as ReadingBlocks;
  const photo = est ? (est.photo ? { y: bodyHeight + 16, height: est.photoHeight } : null) : measured!.photo;
  const endY = est ? (photo ? photo.y + photo.height : bodyHeight) + 14 : measured!.end;
  if (photo) {
    const size = 120, cx = x + inner / 2;
    canvas.save();
    canvas.translate(cx, photo.y + photo.height / 2); canvas.rotate(-2, 0, 0); canvas.translate(-cx, -(photo.y + photo.height / 2));
    if (o.photo) {
      const pw = size, ph = size * .8, px = cx - pw / 2, py = photo.y + 5;
      canvas.drawRect(Skia.XYWHRect(px - 5, py - 5, pw + 10, ph + 10 + 25), fill('#F8E9CE'));
      canvas.drawRect(Skia.XYWHRect(px - 5, py - 5, pw + 10, ph + 10 + 25), stroke('#C1A47A', 1));
      const img = o.photo, crop = Math.min(img.width(), img.height() * (pw / ph)), cropH = crop / (pw / ph);
      canvas.drawImageRect(img, Skia.XYWHRect((img.width() - crop) / 2, (img.height() - cropH) / 2, crop, cropH), Skia.XYWHRect(px, py, pw, ph), Skia.Paint());
      lines(o.fonts, tt('Change photo'), pw + 10, 11, 14, { color: '#79613F', align: TextAlign.Center }).paint(canvas, px - 5, py + ph + 7);
    } else if (o.sprig) {
      // The empty photo slot: the same violet sprig the live page shows.
      const s = o.sprig, cell = s.width() / 4;
      canvas.drawImageRect(s, Skia.XYWHRect(2 * cell, 3 * cell, cell, cell), Skia.XYWHRect(cx - size * .4, photo.y + 5, size * .8, size * .85), Skia.Paint());
      lines(o.fonts, tt('Add a photo'), size, 11, 14, { color: '#79613F', align: TextAlign.Center }).paint(canvas, cx - size / 2, photo.y + 5 + size * .85 + 7);
    }
    canvas.restore();
  }
  if (endY !== null) {
    const cx = x + inner / 2, ey = endY + 12;
    canvas.drawRect(Skia.XYWHRect(cx - 45.5, ey - .5, 34, 1), fill(RULE)); canvas.drawRect(Skia.XYWHRect(cx + 11.5, ey - .5, 34, 1), fill(RULE));
    const d = Skia.PathBuilder.Make(); d.moveTo(cx, ey - 4.95); d.lineTo(cx + 4.95, ey); d.lineTo(cx, ey + 4.95); d.lineTo(cx - 4.95, ey); d.close();
    canvas.drawPath(d.build(), fill(RULE));
  }
  canvas.restore();
  surface.flush();
  const image = surface.makeImageSnapshot();
  return image.makeNonTextureImage?.() ?? image;
}

export function plainPage(o: { parchment: SkImage; fonts: SkTypefaceFontProvider; kind: 'reading' | 'empty' | 'flyleaf'; spine?: SkImage | null }) {
  const { width: w, height: h } = PAGE;
  return paint(w, h, PAGE.density, canvas => {
    paper(canvas, o.parchment, w, h, o.kind === 'flyleaf');
    if (o.kind === 'flyleaf') {
      // A blank leaf with a small gilt ornament.
      flourish(canvas, w / 2, h * .46, 60);
      return;
    }
    border(canvas, w, h, 30);
    corners(canvas, w, h, 30, 60);
    if (o.kind === 'empty') {
      if (o.spine) {
        // A small sprig of the month's flower, faded like an endpaper print.
        canvas.saveLayer(fadePaint(.5));
        plate(canvas, o.spine, w / 2, 110, 140, 280);
        canvas.restore();
      }
      // A month with no days at all: nothing recorded, and today is not in it.
      text(canvas, o.fonts, tt('No journal or records\nfor this month.'), 0, 420, w, { size: 48, italic: true, align: TextAlign.Center, color: INK, line: 1.15 });
      flourish(canvas, w / 2, 556, 70);
      text(canvas, o.fonts, tt('New journals are written\non today’s page.'), 0, 582, w, { size: 32, align: TextAlign.Center, color: SOFT, line: 1.3 });
    }
  });
}
function fadePaint(alpha: number) {
  const p = Skia.Paint();
  p.setAlphaf(alpha);
  p.setBlendMode(BlendMode.SrcOver);
  return p;
}

/** Decodes a journal photo (a data: URI) for the page. */
export function decodePhoto(uri: string | null | undefined) {
  if (!uri) return null;
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || comma < 0) return null;
  try {
    const data = Skia.Data.fromBase64(uri.slice(comma + 1));
    return Skia.Image.MakeImageFromEncoded(data);
  } catch { return null; }
}
