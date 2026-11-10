// The Monthly Report archive's page faces (Treehouse → My Journals → the year's 13th book), painted like the journals'
// pages (pages.ts: the same parchment, border, gilt corners, Garamond and ink) and then mapped onto the 3D book.
// Read-only pictures: the report's own words, laid out and paginated by services/monthlyArchive.ts.
import { Skia, TextAlign, type SkCanvas, type SkImage, type SkTypefaceFontProvider } from '@shopify/react-native-skia';
import { MONTH_NAMES } from '../../../services/bookhouse';
import { type ArchiveDay, type ArchivePage, type Measure, type ReportBlock } from '../../../services/monthlyArchive';
import { border, corners, fill, flourish, INK, lockGlyph, paint, PAGE, paper, paragraph, plate, SOFT, sprig, stroke, text, type TextOptions } from './pages';

const { width: W, height: H } = PAGE;
/** The text column and the room a report page holds (book units), under the running head and above the folio. */
export const REPORT = { x: 72, inner: W - 72 - 68, top: 116, firstTop: 78, bottom: H - 122 };
/** The room on a report's page `index` (0: its first page, which has no running head above it). */
export const reportRoom = (index: number) => REPORT.bottom - (index === 0 ? REPORT.firstTop : REPORT.top);
const GOLD_INK = '#8C7148', GOLD_SOFT = '#A8823F', GREY = '#9B958A', GREY_INK = '#7F796E';

type Style = TextOptions & { after: number; indent?: number };
const STYLE: Record<'eyebrow' | 'headline' | 'section' | 'label' | 'text' | 'date', Style> = {
  eyebrow: { size: 22, spacing: 5, color: GOLD_INK, after: 10 },
  headline: { size: 46, italic: true, line: 1.18, color: INK, after: 24 },
  section: { size: 22, spacing: 5, color: GOLD_INK, after: 18 },
  label: { size: 21, spacing: 3, color: '#8C6E3A', after: 4 },
  text: { size: 30, line: 1.36, color: INK, after: 12 },
  date: { size: 23, italic: true, color: GOLD_SOFT, after: 16 },
};
const RULE_H = 36;
function textStyle(block: Extract<ReportBlock, { type: 'text' }>): Style {
  const s = STYLE.text;
  switch (block.tone) {
    case 'soft': return { ...s, color: SOFT };
    case 'quote': return { ...s, italic: true, after: 4 };
    case 'item': return { ...s, indent: 22, after: 8 };
    case 'center': return { ...s, align: TextAlign.Center };
    default: return s;
  }
}
const styleOf = (block: ReportBlock): Style | null => block.type === 'text' ? textStyle(block)
  : block.type === 'rule' || block.type === 'calendar' || block.type === 'cards' ? null : STYLE[block.type];
const shown = (block: ReportBlock) => 'text' in block ? (block.type === 'eyebrow' || block.type === 'section' || block.type === 'label' ? block.text.toUpperCase() : block.text) : '';

// ---------- pictures ----------
/** Pictures a report page may show; each is null until loaded (or when the app has none for it). */
export type ReportArt = { flower: (day: ArchiveDay) => SkImage | null; card: (cardId: string) => SkImage | null; ground: SkImage | null };
const DAY_NAMES = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** Each day: its flower (a square `cell × FLOWER` wide) over its date. */
const FLOWER = .52;
const CAL = { head: 30, cellH: (cell: number) => cell * FLOWER + 26, after: 14 };
function calendarRows(days: ArchiveDay[]) {
  if (!days.length) return 0;
  const lead = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return Math.ceil((lead + days.length) / 7);
}
const CARD_GAP = 20;
const cardWidth = () => (REPORT.inner - CARD_GAP * 2) / 3;
const CARD_ART = (w: number) => ({ w: w * .74, h: w * .74 * 1.5 });

// ---------- measuring ----------
export function measureBlock(fonts: SkTypefaceFontProvider): Measure {
  return block => {
    if (block.type === 'rule') return RULE_H;
    if (block.type === 'calendar') { const cell = REPORT.inner / 7; return CAL.head + calendarRows(block.days) * CAL.cellH(cell) + CAL.after; }
    if (block.type === 'cards') {
      const w = cardWidth(), art = CARD_ART(w);
      return Math.max(...block.cards.map(card => 30 + art.h + 8 + paragraph(fonts, card.name, w, { size: 26, italic: true, align: TextAlign.Center }).getHeight()
        + (card.headline ? paragraph(fonts, card.headline, w, { size: 24, line: 1.3, align: TextAlign.Center }).getHeight() + 4 : 0))) + 18;
    }
    const s = styleOf(block)!;
    return paragraph(fonts, shown(block), REPORT.inner - (s.indent ?? 0), s).getHeight() + s.after + (block.type === 'section' ? 6 : 0);
  };
}

// ---------- painting ----------
function drawBlock(canvas: SkCanvas, fonts: SkTypefaceFontProvider, block: ReportBlock, y: number, art: ReportArt) {
  const { x, inner } = REPORT;
  if (block.type === 'rule') {
    canvas.drawLine(x + inner * .3, y + RULE_H / 2, x + inner * .7, y + RULE_H / 2, stroke('#A8823F66', 1.4));
    return;
  }
  if (block.type === 'calendar') { drawCalendar(canvas, fonts, block.days, y, art); return; }
  if (block.type === 'cards') {
    const w = cardWidth(), a = CARD_ART(w);
    const row = block.cards.length * w + (block.cards.length - 1) * CARD_GAP;
    block.cards.forEach((card, i) => {
      const cx = x + (inner - row) / 2 + i * (w + CARD_GAP);
      let cy = y;
      cy += text(canvas, fonts, card.role.toUpperCase(), cx, cy, w, { size: 20, spacing: 3, color: '#8C6E3A', align: TextAlign.Center }) + 6;
      const image = art.card(card.cardId), ax = cx + (w - a.w) / 2;
      if (image) {
        const k = Math.min(a.w / image.width(), a.h / image.height()), dw = image.width() * k, dh = image.height() * k;
        canvas.save();
        canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(ax + (a.w - dw) / 2, cy + (a.h - dh) / 2, dw, dh), 9, 9), 1, true);
        canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(ax + (a.w - dw) / 2, cy + (a.h - dh) / 2, dw, dh), Skia.Paint());
        canvas.restore();
      } else {
        // No picture for this card here: an empty gilt frame, never an invented one.
        canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(ax, cy, a.w, a.h), 9, 9), stroke('#C2A06B', 1.6));
      }
      cy += a.h + 8;
      cy += text(canvas, fonts, card.name, cx, cy, w, { size: 26, italic: true, color: INK, align: TextAlign.Center });
      if (card.headline) text(canvas, fonts, card.headline, cx, cy + 4, w, { size: 24, line: 1.3, color: INK, align: TextAlign.Center });
    });
    return;
  }
  const s = styleOf(block)!, indent = s.indent ?? 0;
  const h = text(canvas, fonts, shown(block), x + indent, y, inner - indent, s);
  if (block.type === 'text' && block.tone === 'item') canvas.drawLine(x + 6, y + 4, x + 6, y + h - 2, stroke('#A8823F77', 1.4));
  if (block.type === 'section') canvas.drawLine(x, y + h + 6, x + inner, y + h + 6, stroke('#C2A06B88', 1.2));
}
/** This month's garden: a calendar from Monday, one painted flower per day in its main mood (the Pavilion's), bare
 *  ground where nothing was written. */
function drawCalendar(canvas: SkCanvas, fonts: SkTypefaceFontProvider, days: ArchiveDay[], y: number, art: ReportArt) {
  const { x, inner } = REPORT, cell = inner / 7, cellH = CAL.cellH(cell);
  DAY_NAMES.forEach((day, i) => text(canvas, fonts, day, x + i * cell, y, cell, { size: 20, color: SOFT, align: TextAlign.Center }));
  if (!days.length) return;
  const lead = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  days.forEach((day, k) => {
    const i = lead + k, cx = x + (i % 7) * cell, cy = y + CAL.head + Math.floor(i / 7) * cellH;
    const image = day.mood ? art.flower(day) : art.ground;
    const box = cell * FLOWER, base = cy + box + 2;
    if (image) {
      const k2 = Math.min(box / image.width(), (day.mood ? box : box * .36) / image.height()), dw = image.width() * k2, dh = image.height() * k2;
      const p = Skia.Paint();
      if (!day.mood) p.setAlphaf(.55);
      canvas.drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(cx + (cell - dw) / 2, base - dh, dw, dh), p);
    } else if (day.mood) {
      canvas.drawCircle(cx + cell / 2, base - box / 2, box * .2, fill('#B48D4C99'));
    }
    text(canvas, fonts, String(Number(day.date.slice(8))), cx, base, cell, { size: 19, color: SOFT, align: TextAlign.Center });
  });
}

type Head = { year: number; month: number; page: number; pages: number };
function runningHead(canvas: SkCanvas, fonts: SkTypefaceFontProvider, head: Head) {
  // A report's first page opens with its own date line; the pages after it carry the month at their head.
  if (head.page > 1) text(canvas, fonts, `${MONTH_NAMES[head.month - 1].toUpperCase()} ${head.year}`, 0, 64, W, { size: 20, spacing: 6, color: SOFT, align: TextAlign.Center });
  flourish(canvas, W / 2, H - 98, 54);
  text(canvas, fonts, head.pages > 1 ? `${head.page} of ${head.pages}` : 'Monthly Report', 0, H - 84, W, { size: 22, color: '#9A8463', spacing: 3, align: TextAlign.Center });
}

/** Where the archive stands (the title and contents pages say it; the pages of a report never change with it). */
export type ArchiveState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; written: boolean[] };

/** One page of the archive book at `density` pixels per book unit. `left`: a left-hand page (its paper is mirrored). */
export function archivePage(o: { parchment: SkImage; fonts: SkTypefaceFontProvider; spine: SkImage | null; year: number; page: ArchivePage;
  state: ArchiveState; art: ReportArt; density: number; left: boolean }): SkImage | null {
  const { fonts, page, year } = o;
  return paint(W, H, o.density, canvas => {
    paper(canvas, o.parchment, W, H, o.left);
    if (page.kind === 'end') {
      flourish(canvas, W / 2, H * .46, 60);
      text(canvas, fonts, `End of ${MONTH_NAMES[page.month - 1]}`, 0, H * .46 + 22, W, { size: 28, italic: true, color: SOFT, align: TextAlign.Center });
      return;
    }
    border(canvas, W, H, 30);
    corners(canvas, W, H, 30, 60);
    if (page.kind === 'front') { frontPage(canvas, fonts, o.spine, year, o.state); return; }
    if (page.kind === 'contents') { contentsPage(canvas, fonts, year, o.state); return; }
    runningHead(canvas, fonts, { year, month: page.month, page: page.page, pages: page.pages });
    const measure = measureBlock(fonts);
    let y = page.page === 1 ? REPORT.firstTop : REPORT.top;
    for (const block of page.blocks) { drawBlock(canvas, fonts, block, y, o.art); y += measure(block); }
  });
}

/** The title page: the year, the book's name and its emblem (the approved spine's chart, laurel and seal). */
function frontPage(canvas: SkCanvas, fonts: SkTypefaceFontProvider, spine: SkImage | null, year: number, state: ArchiveState) {
  text(canvas, fonts, `${year}`, 0, 84, W, { size: 30, align: TextAlign.Center, spacing: 10, color: SOFT });
  text(canvas, fonts, 'Monthly Report', 0, 120, W, { size: 66, italic: true, align: TextAlign.Center, color: INK });
  flourish(canvas, W / 2, 228, 120);
  if (spine) plate(canvas, spine, W / 2, 262, 330, 420, [.04, .36, .92, .4]);
  text(canvas, fonts, 'Reflections from the Pavilion', 0, 714, W, { size: 32, italic: true, align: TextAlign.Center, color: INK });
  const count = state.status === 'ready' ? state.written.filter(Boolean).length : null;
  const line = count === null ? '' : count ? `${count} of 12 months written` : 'No months written yet';
  if (line) text(canvas, fonts, line, 0, H - 112, W, { size: 27, align: TextAlign.Center, spacing: 3, color: SOFT });
}
/** Contents: the twelve months, each written (its bookmark opens it) or not yet written (locked). */
function contentsPage(canvas: SkCanvas, fonts: SkTypefaceFontProvider, year: number, state: ArchiveState) {
  const x = 84, inner = W - x - 80;
  text(canvas, fonts, `${year}`.split('').join(' '), 0, 70, W, { size: 22, spacing: 6, color: SOFT, align: TextAlign.Center });
  text(canvas, fonts, 'Contents', 0, 98, W, { size: 52, italic: true, color: INK, align: TextAlign.Center });
  flourish(canvas, W / 2, 182, 90);
  if (state.status !== 'ready') {
    const message = state.status === 'loading' ? 'Gathering your Monthly Reports from the Pavilion…' : state.message;
    const h = paragraph(fonts, message, inner, { size: 34, italic: true, line: 1.3, align: TextAlign.Center }).getHeight();
    text(canvas, fonts, message, x, H * .42 - h / 2, inner, { size: 34, italic: true, line: 1.3, color: state.status === 'loading' ? SOFT : INK, align: TextAlign.Center });
    if (state.status === 'error') text(canvas, fonts, 'Tap “Try again” below the book.', x, H * .42 + h / 2 + 26, inner, { size: 27, color: SOFT, align: TextAlign.Center });
    return;
  }
  const top = 214, row = 48;
  MONTH_NAMES.forEach((name, i) => {
    const y = top + i * row, written = state.written[i];
    text(canvas, fonts, name, x, y, inner * .6, { size: 31, italic: true, color: written ? INK : GREY_INK });
    if (written) {
      sprig(canvas, x + inner - 150, y + 8, '#B48D4C');
      text(canvas, fonts, 'Written', x + inner - 120, y + 5, 120, { size: 25, color: GOLD_INK, align: TextAlign.Right });
    } else {
      lockGlyph(canvas, x + inner - 176, y + 20, .9, GREY);
      text(canvas, fonts, 'Not yet written', x + inner - 160, y + 5, 160, { size: 23, color: GREY, align: TextAlign.Right });
    }
    if (i < 11) canvas.drawLine(x, y + row - 6, x + inner, y + row - 6, stroke('#C2A06B40', 1));
  });
  const note = state.written.some(Boolean) ? 'Tap a month’s bookmark to turn to its report.'
    : 'No Monthly Reports yet. When the Pavilion writes one, its month opens here.';
  text(canvas, fonts, note, x, top + 12 * row + 16, inner, { size: 25, italic: true, line: 1.3, color: SOFT, align: TextAlign.Center });
}
