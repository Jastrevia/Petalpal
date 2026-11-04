import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { dayRecords, formatLocalDate, journalLocked, MONTH_NAMES, moodTitle, weekdayOf, type JournalDay } from '../../../services/bookhouse';
import { localFlowerArtwork } from '../../garden/planting/localFlowerArtwork';
import { FLOWERS, LATIN, retainBookImages, sharedPaperSources, useBookImages, useJournalFonts } from './assets';
import { coverTexture, entryPage, frontispiece, plainPage, readingBackground, recordsPage, writingPage, type FlowerArt, type RecordsFace } from './pages';
import { entryParts, readingMetrics } from './readingLayout';
import { loadAsset, type AssetSource } from './loadAsset';

const KEEP = 14;
// Papers that are the same in every month's book (the flyleaf, the plain reading paper and its encoded copy), painted
// once and shared while any book is open; released when the last one closes.
const papers = new Map<string, SkImage | string | null>();
let paperUsers = 0;
const holdPapers = () => { paperUsers++; let held = true; return () => { if (held) { held = false; if (--paperUsers === 0) papers.clear(); } }; };
/** Keeps every book's shared pictures, fonts and papers for as long as it is held (the Treehouse, while it is open). */
export function retainJournalAssets() {
  const images = retainBookImages(), own = holdPapers();
  return () => { own(); images(); };
}
function sharedPaper<T extends SkImage | string | null>(key: string, make: () => T): T {
  if (!papers.has(key)) papers.set(key, make());
  return papers.get(key) as T;
}
const paperDensity = () => Math.min(2.5, PixelRatio.get());
/** Paints the papers every book shares ahead of time, while nothing moves (the first book then opens sooner): the
 *  same pictures, under the same keys, a book paints for itself otherwise. `pageWidth`: the close-up page's width. */
export function preparePapers(pageWidth: number) {
  const src = sharedPaperSources();
  if (!src || paperUsers === 0) return;
  const { parchment, fonts } = src, density = paperDensity(), px = Math.round(pageWidth * density);
  const background = sharedPaper(`reading-bg|${px}`, () => readingBackground(parchment, pageWidth * density));
  if (background) sharedPaper(`reading-uri|${px}`, () => `data:image/jpeg;base64,${background.encodeToBase64(ImageFormat.JPEG, 92)}`);
  sharedPaper('flyleaf', () => plainPage({ parchment, fonts, kind: 'flyleaf' }));
  sharedPaper('blank', () => plainPage({ parchment, fonts, kind: 'reading' }));
}

/** What a day's right page shows: one of its journals, today's blank page to write on, or a past day's note. */
export type RightPage = { kind: 'journal'; index: number } | { kind: 'new' } | { kind: 'none' };
export function rightPageOf(day: JournalDay | undefined, slot: number, today: string): RightPage {
  if (!day) return { kind: 'none' };
  if (slot < day.journals.length) return { kind: 'journal', index: Math.max(0, slot) };
  return day.localDate === today ? { kind: 'new' } : { kind: 'none' };
}
/** The journal a day opens at: its latest; today with none yet opens on the blank page. */
export function defaultSlot(day: JournalDay | undefined) { return day ? Math.max(0, day.journals.length - 1) : 0; }

/** The pictures the book's page surfaces carry, painted on demand and cached (each is a few MB): the cover with its
 *  year, each day's records page (left) and journal page (right), and the plain papers under the close-up pages. */
export function usePageFaces({ month, year, days, today, page }: {
  month: number; year: number; days: JournalDay[]; today: string; page: { width: number; height: number };
}) {
  const img = useBookImages(month);
  const fonts = useJournalFonts();
  const density = paperDensity();
  const metrics = useMemo(() => readingMetrics(page.width, page.height), [page.width, page.height]);
  const journalCount = days.reduce((n, d) => n + d.journals.length, 0);

  useEffect(() => holdPapers(), []);
  const base = useMemo(() => {
    if (!fonts || !img.cover || !img.spine || !img.parchment || !img.grain || !img.edges) return null;
    const parchment = img.parchment, spine = img.spine;
    const px = Math.round(page.width * density);
    const background = sharedPaper(`reading-bg|${px}`, () => readingBackground(parchment, page.width * density));
    if (!background) return null;
    // A month with no days at all shows its frontispiece and an empty right page: painted only if it is ever needed.
    let front: SkImage | null | undefined, empty: SkImage | null | undefined;
    return {
      cover: coverTexture(img.cover, fonts, year),
      get front() { return front === undefined ? (front = frontispiece({ parchment, spine, fonts, monthName: MONTH_NAMES[month - 1], year, flower: FLOWERS[month - 1], latin: LATIN[month - 1], count: journalCount })) : front; },
      flyleaf: sharedPaper('flyleaf', () => plainPage({ parchment, fonts, kind: 'flyleaf' })),
      get empty() { return empty === undefined ? (empty = plainPage({ parchment, fonts, kind: 'empty', spine })) : empty; },
      // Paper with its border and corners only: under a page's text while it changes arrangement.
      blank: sharedPaper('blank', () => plainPage({ parchment, fonts, kind: 'reading' })),
      readingBackground: background,
      // The live close-up pages show exactly this paper (an encoded copy for React Native's Image).
      readingBackgroundUri: sharedPaper(`reading-uri|${px}`, () => `data:image/jpeg;base64,${background.encodeToBase64(ImageFormat.JPEG, 92)}`),
    };
  }, [fonts, img.cover, img.spine, img.parchment, img.grain, img.edges, month, year, journalCount, page.width, density]);

  // Each flower's own Garden artwork, loaded once per species for the records page. Painting a page only notes which
  // artwork it would like (render stays free of side effects); the loads start after the render commits.
  const [art, setArt] = useState(() => new Map<string, FlowerArt>());
  const asked = useRef(new Set<string>());
  const wanted = useRef(new Map<string, { code: string; name: string }>());
  const wantArt = useCallback((code: string, name: string) => {
    const key = `${code}|${name}`;
    if (!asked.current.has(key)) wanted.current.set(key, { code, name });
  }, []);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!wanted.current.size) return;
    const jobs = [...wanted.current.entries()];
    wanted.current.clear();
    const settle = (key: string, value: FlowerArt) => { if (alive.current) setArt(previous => new Map(previous).set(key, value)); };
    for (const [key, { code, name }] of jobs) {
      if (asked.current.has(key)) continue;
      asked.current.add(key);
      const local = localFlowerArtwork(code, name);
      const bounds = local?.component.contentBounds as unknown as number[] | undefined;
      if (!local?.source || !bounds) { settle(key, null); continue; }
      const { canvasWidth, canvasHeight } = local.component;
      loadAsset(local.source as AssetSource, data => Skia.Image.MakeImageFromEncoded(data)).then(image => {
        if (!image) { settle(key, null); return; }
        const kx = image.width() / canvasWidth, ky = image.height() / canvasHeight;
        settle(key, { image, bounds: [bounds[0] * kx, bounds[1] * ky, bounds[2] * kx, bounds[3] * ky] });
      }).catch(() => settle(key, null));
    }
  });

  const cache = useRef(new Map<string, SkImage | null>());
  useEffect(() => { cache.current.clear(); }, [base]);
  const remember = (key: string, make: () => SkImage | null) => {
    const hit = cache.current.get(key);
    if (hit !== undefined) { cache.current.delete(key); cache.current.set(key, hit); return hit; }
    const face = make();
    cache.current.set(key, face);
    while (cache.current.size > KEEP) cache.current.delete(cache.current.keys().next().value as string);
    return face;
  };

  /** The day's records as the left page lays them out (data only; also used by the close-up records page). */
  const records = useCallback((i: number): RecordsFace | null => {
    const day = days[i];
    if (!day) return null;
    const r = dayRecords(day);
    return {
      weekday: weekdayOf(day.localDate), date: formatLocalDate(day.localDate),
      flowers: r.flowers.map(f => ({ name: f.name, meaning: f.meaning, source: f.source, art: art.get(`${f.speciesCode}|${f.name}`) ?? null })),
      events: r.events,
      moods: r.moods.map(m => ({ title: moodTitle(m.label), secondary: m.secondary.map(moodTitle).filter(Boolean), source: m.source })),
    };
  }, [days, art]);

  /** Left page: the day's records (the month's frontispiece when the month holds no days at all). */
  const left = useCallback((i: number): SkImage | null => {
    if (!base || !img.parchment || !fonts) return null;
    const day = days[i];
    if (!day) return base.front;
    const first = dayRecords(day).flowers[0];
    if (first) wantArt(first.speciesCode, first.name);
    const face = records(i)!;
    const key = `l|${day.localDate}|${JSON.stringify([face.flowers.map(f => [f.name, f.meaning, !!f.art]), face.events, face.moods])}`;
    return remember(key, () => recordsPage({ parchment: img.parchment!, fonts, day: face }));
  }, [base, img.parchment, fonts, days, records, wantArt]);

  /** Right page: the selected journal of the day, today's page to write on, or a past day's note. */
  const right = useCallback((i: number, slot: number): SkImage | null => {
    if (!base || !img.parchment || !fonts) return null;
    const day = days[i];
    if (!day) return base.empty;
    const which = rightPageOf(day, slot, today);
    const weekday = weekdayOf(day.localDate), date = formatLocalDate(day.localDate);
    if (which.kind === 'journal') {
      const entry = day.journals[which.index];
      const parts = entryParts(entry.journal?.content || '');
      const locked = journalLocked(entry);
      const n = day.journals.length;
      return remember(`r|${entry.id}|${entry.journal?.content}|${which.index}|${n}`, () => entryPage({ parchment: img.parchment!, fonts, month,
        entry: { weekday, date, title: parts.title, body: parts.body, grown: locked, folio: n > 1 ? `Journal ${which.index + 1} of ${n}` : '',
          hint: locked ? 'Tap the page to read' : 'Tap the page to read or write' } }));
    }
    return remember(`w|${day.localDate}|${which.kind}`, () => writingPage({ parchment: img.parchment!, fonts, weekday, date, kind: which.kind === 'new' ? 'today' : 'past' }));
  }, [base, img.parchment, fonts, days, today, month]);

  return { base, left, right, records, metrics, images: img, ready: !!base };
}
