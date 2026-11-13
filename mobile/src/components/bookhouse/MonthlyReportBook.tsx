import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { Canvas, Picture, Skia, createPicture, type SkImage } from '@shopify/react-native-skia';
import { MONTH_NAMES, MONTHS } from '../../services/bookhouse';
import {
  archiveProblem, archiveSpreads, loadMonthlyArchive, monthTitle, paginateBlocks, reportBlocks,
  type ArchiveDay, type ArchivePage, type ArchiveProblem, type MonthlyArchive, type ReportBlock,
} from '../../services/monthlyArchive';
import { MOOD_SPECIES } from '../../services/reflections';
import { clusterPicture } from '../garden/planting/flowerClusters';
import { petalCardArt } from '../petalCards/petalCardArt';
import { useEventSpecies } from '../features/WeeklyBloom';
import { WEEKLY_ART } from '../features/weeklyArt';
import { archiveClothRgb, hasCjk, useArchiveBookImages, useJournalFonts } from './book3d/assets';
import { useAppLocale } from '../../services/locale';
import { pullAt, pullOrigin, ROOM_ARTWORK } from './book3d/scene';
import { drawBook, drawFloatShadow, SPEC } from './book3d/engine';
import { loadAsset, type AssetSource } from './book3d/loadAsset';
import {
  bookLayout, closeTiming, CLOSE_MS, CLOSE_STAGES, deskBookLayout, DESK_CLOSE_MS, DESK_CLOSE_STAGES, DESK_HANDOFF_T, DESK_OPEN_MS, DESK_OPEN_STAGES,
  LEAN_MS, OPEN_MS, OPEN_STAGES, openTiming, openingFrame, pageCentres, projectPoint, pullOf, readingFrame, RIFFLE_STAGGER, TURN_MS, turnPages, type ShelfOrigin,
} from './book3d/motion';
import { coverTexture, PAGE, plainPage } from './book3d/pages';
import { archivePage, measureBlock, reportRoom, type ArchiveState, type ReportArt } from './book3d/reportPages';
import { monthBookStyles as book, type BookMode, type ClosedTo, type SceneLink } from './MonthBook';
import { Icon, ICONS, LOCK_ICON, RoundButton } from './TreehouseArt';
import type { ShelfRect } from './TreehouseShelf';

// The year's Monthly Report archive as a physical book — the 13th book on the My Journals shelf, after December. It is
// the journals' own book (MonthBook): the same 3D renderer, the same flight out of its slot while the camera pulls back
// to the desk, the same opening, full-page turns, close-up reading and closing back into its slot; only its pages differ.
// Its pages are the year's saved Monthly reports, read from the Pavilion (services/monthlyArchive.ts) each time it is
// opened, laid out across as many pages as each report needs. Read-only.

const OPEN_EASE = openTiming(OPEN_STAGES), CLOSE_EASE = closeTiming(CLOSE_STAGES);
const DESK_OPEN_EASE = openTiming(DESK_OPEN_STAGES), DESK_CLOSE_EASE = closeTiming(DESK_CLOSE_STAGES);
const PAN_START = 16, PAN_SLOPE = 2.2, PAN_COMMIT = .25, PAN_FLICK = .35, PAN_MS = 420;
const RIBBON_RED = '#A8443A';
/** Painted pages kept at once (a spread, and the leaves and backs of the longest riffle). */
const KEEP = 10;
const toOrigin = (r: ShelfRect): ShelfOrigin => ({ cam: r.camera, x: r.x + r.width / 2, bottom: r.y + r.height, height: r.height });
const afterFrames = (frames: number, fn: () => void) => { if (frames <= 0) fn(); else requestAnimationFrame(() => afterFrames(frames - 1, fn)); };
type TurnPlan = { from: number; to: number; dir: 1 | -1; pages: number[]; landed?: boolean };
type BookView = { mode: BookMode; index: number; turn: TurnPlan | null; side: 1 | -1 };
type Loaded = { status: 'loading' } | { status: 'error'; problem: ArchiveProblem } | { status: 'ready'; archive: MonthlyArchive };

/** A page's words, for screen readers (the page itself is a picture). */
function pageText(page: ArchivePage, year: number, loaded: Loaded): string {
  if (page.kind === 'front') return `Monthly Report, ${year}. Reflections from the Pavilion.`;
  if (page.kind === 'end') return `End of ${MONTH_NAMES[page.month - 1]}.`;
  if (page.kind === 'contents') {
    if (loaded.status === 'loading') return 'Contents. Gathering your Monthly Reports from the Pavilion.';
    if (loaded.status === 'error') return `Contents. ${loaded.problem.message}`;
    return `Contents, ${year}. ${MONTH_NAMES.map((name, i) => `${name}: ${loaded.archive.months[i] ? 'written' : 'not yet written'}`).join('. ')}.`;
  }
  const words = (block: ReportBlock) => block.type === 'calendar' ? `A calendar of ${block.days.length} days.`
    : block.type === 'cards' ? block.cards.map(c => `${c.role}: ${c.name}${c.headline ? `, ${c.headline}` : ''}`).join('. ') : 'text' in block ? block.text : '';
  return `${monthTitle(page.month, year)}, page ${page.page} of ${page.pages}. ${page.blocks.map(words).filter(Boolean).join(' ')}`;
}

/** The year's saved Monthly reports, fetched again each time the book is opened (and on a retry). */
function useArchive(year: number) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded({ status: 'loading' });
    loadMonthlyArchive(year, controller.signal).then(
      archive => { if (!controller.signal.aborted) setLoaded({ status: 'ready', archive }); },
      error => { if (!controller.signal.aborted) setLoaded({ status: 'error', problem: archiveProblem(error) }); });
    return () => controller.abort();
  }, [year, attempt]);
  return { loaded, retry: useCallback(() => setAttempt(n => n + 1), []) };
}

/** The pictures the reports show (each day's flower, the petal cards, bare ground), loaded once they are wanted. */
function useReportArt(archive: MonthlyArchive | null) {
  const species = useEventSpecies();
  const [images, setImages] = useState(() => new Map<string, SkImage | null>());
  // Each picture is asked for once; a load still running when another arrives is never dropped.
  const asked = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const wanted = useMemo(() => {
    const out = new Map<string, AssetSource>([['ground', WEEKLY_ART.ground as AssetSource]]);
    for (const entry of archive?.months ?? []) {
      for (const section of entry?.detail.narrativeSections ?? []) {
        for (const day of (section?.kind === 'MONTH_GARDEN' && Array.isArray(section.points) ? section.points : [])) {
          const code = species?.get(day.sourceEventId) ?? (day.mood ? MOOD_SPECIES[day.mood] : null);
          const art = code ? clusterPicture(code, '', 'S') : null;
          if (code && art) out.set(`flower|${code}`, art.source as AssetSource);
        }
        const cards = (section?.kind === 'MONTH_SPREAD' ? (section as unknown as { cards?: unknown }).cards : null);
        for (const card of (Array.isArray(cards) ? cards as { cardId?: string }[] : [])) { const art = petalCardArt(card?.cardId); if (card?.cardId && art) out.set(`card|${card.cardId}`, art as AssetSource); }
      }
    }
    for (const mood of Object.values(MOOD_SPECIES)) { const art = clusterPicture(mood, '', 'S'); if (art && archive) out.set(`flower|${mood}`, art.source as AssetSource); }
    return out;
  }, [archive, species]);
  useEffect(() => {
    for (const [key, source] of wanted) {
      if (asked.current.has(key)) continue;
      asked.current.add(key);
      void loadAsset(source, data => Skia.Image.MakeImageFromEncoded(data)).then(image => {
        if (alive.current) setImages(previous => new Map(previous).set(key, image));
      });
    }
  }, [wanted]);
  return useMemo<{ art: ReportArt; version: string }>(() => ({
    art: {
      flower: (day: ArchiveDay) => {
        const code = (day.eventId && species?.get(day.eventId)) || (day.mood ? MOOD_SPECIES[day.mood] : null);
        return code ? images.get(`flower|${code}`) ?? images.get(`flower|${MOOD_SPECIES[day.mood!]}`) ?? null : null;
      },
      card: (cardId: string) => images.get(`card|${cardId}`) ?? null,
      ground: images.get('ground') ?? null,
    },
    version: `${images.size}|${species ? species.size : '-'}`,
  }), [images, species]);
}

export function MonthlyReportBook({ year, shelfRect, reducedMotion, closeSignal, returnTo, waiting = false, scene, onShown, onClosed, onMode, onHomeward }: {
  year: number; shelfRect: ShelfRect; reducedMotion: boolean; closeSignal: number; scene: SceneLink;
  /** As MonthBook: close into this slot of the desk-view bookcase without moving the camera (another book was chosen). */
  returnTo?: { run: number; rect: ShelfRect | null } | null;
  /** As MonthBook: mounted early while another book closes; stays in its slot (not drawn) until this is false. */
  waiting?: boolean;
  onHomeward?: () => void; onShown?: () => void; onClosed: (to: ClosedTo) => void; onMode?: (mode: BookMode) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const L = useMemo(() => ROOM_ARTWORK ? deskBookLayout(width, height, insets) : bookLayout(width, height, insets, 0, scene.column ?? Infinity, scene.footer ?? 0),
    [width, height, insets, scene.column, scene.footer]);
  const origin = useMemo<ShelfOrigin>(() => toOrigin(shelfRect), [shelfRect]);

  // ---------- the archive's contents ----------
  const { loaded, retry } = useArchive(year);
  const archive = loaded.status === 'ready' ? loaded.archive : null;
  const { art, version: artVersion } = useReportArt(archive);
  // Chinese on these pages (the zh-Hans copy, or a report written or named in Chinese) needs the Chinese font, as the
  // journals' pages do (usePageFaces); without it the painted pages would show no glyphs for that text.
  const locale = useAppLocale();
  const cjk = useMemo(() => locale === 'zh-Hans' || (!!archive && hasCjk(JSON.stringify(archive))), [locale, archive]);
  const fonts = useJournalFonts(cjk);
  const img = useArchiveBookImages();
  const { spreads, starts } = useMemo(() => {
    if (!archive || !fonts) return archiveSpreads(Array.from({ length: 12 }, () => null));
    const measure = measureBlock(fonts);
    return archiveSpreads(archive.months.map(entry => entry ? paginateBlocks(reportBlocks(entry, year), reportRoom, measure) : null));
  }, [archive, fonts, year]);
  const written = useMemo(() => archive ? archive.months.map(Boolean) : null, [archive]);
  const pageState: ArchiveState = loaded.status === 'ready' ? { status: 'ready', written: written! }
    : loaded.status === 'error' ? { status: 'error', message: loaded.problem.message } : { status: 'loading' };
  const stateKey = loaded.status === 'ready' ? `ready|${written!.map(Number).join('')}` : loaded.status;

  // ---------- page faces ----------
  // Painted sharp enough for the close-up page (which is the page itself here, not a live view laid over it).
  const density = Math.max(1, Math.min(1.6, PixelRatio.get() * L.page.width / PAGE.width));
  const base = useMemo(() => fonts && img.cover && img.parchment
    ? { cover: coverTexture(img.cover, fonts, year), flyleaf: plainPage({ parchment: img.parchment, fonts, kind: 'flyleaf' }) } : null,
  [fonts, img.cover, img.parchment, year]);
  const cache = useRef(new Map<string, SkImage | null>());
  useEffect(() => { cache.current.clear(); }, [base, density, artVersion, spreads]);
  const face = useCallback((i: number, side: 'left' | 'right'): SkImage | null => {
    const spread = spreads[i];
    if (!spread || !fonts || !img.parchment) return null;
    const page = spread[side];
    const key = page.kind === 'report' ? `r|${page.month}|${page.page}|${side}|${artVersion}` : page.kind === 'end' ? `e|${page.month}|${side}`
      : `${page.kind}|${side}|${stateKey}`;
    const hit = cache.current.get(key);
    if (hit !== undefined) { cache.current.delete(key); cache.current.set(key, hit); return hit; }
    const made = archivePage({ parchment: img.parchment, fonts, spine: img.spine, year, page, state: pageState, art, density, left: side === 'left' });
    cache.current.set(key, made);
    while (cache.current.size > KEEP) cache.current.delete(cache.current.keys().next().value as string);
    return made;
    // pageState is described by stateKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreads, fonts, img.parchment, img.spine, year, stateKey, art, artVersion, density]);

  // ---------- state machine (as MonthBook's) ----------
  const [view, setViewState] = useState<BookView>({ mode: 'opening', index: 0, turn: null, side: 1 });
  const viewRef = useRef(view);
  const setView = useCallback((next: Partial<BookView>) => { viewRef.current = { ...viewRef.current, ...next }; setViewState(viewRef.current); }, []);
  const generation = useRef(0);
  const pending = useRef<number | null>(null);
  const { mode, index, turn: plan, side } = view;
  useEffect(() => { onMode?.(mode); }, [mode, onMode]);

  let left: SkImage | null, right: SkImage | null;
  let leaves: (SkImage | null)[] = [], leafBacks: (SkImage | null)[] = [];
  if (plan) {
    left = face(plan.dir < 0 || plan.landed ? plan.to : plan.from, 'left');
    right = face(plan.dir > 0 || plan.landed ? plan.to : plan.from, 'right');
    leaves = plan.pages.map(p => face(p, 'right'));
    leafBacks = plan.pages.map(p => face(p + 1, 'left'));
  } else {
    left = face(index, 'left');
    right = face(index, 'right');
  }
  const faceKey = [left, right, ...leaves, ...leafBacks].map(faceId).join('|');
  const ribbonOn = !!written?.some(Boolean);
  const tex = useMemo(() => base && img.spine && img.grain && img.edges && img.parchment ? {
    cover: base.cover, spine: img.spine, grain: img.grain, edges: img.edges, parchment: img.parchment,
    tint: archiveClothRgb(), flyleaf: base.flyleaf, left, right, leaves, leafBacks,
    ribbon: ribbonOn ? hexRgb(RIBBON_RED) : null,
    // faceKey stands for the page pictures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  } : null, [base, img.spine, img.grain, img.edges, img.parchment, faceKey, ribbonOn]);

  // ---------- motion (UI thread) ----------
  const t = useSharedValue(0), lean = useSharedValue(0), turn = useSharedValue(0), dir = useSharedValue(0), count = useSharedValue(1), reading3d = useSharedValue(0);
  const leanSide = useSharedValue(1);
  const { pull, geometry, rootX, scrollY } = scene;
  const heldOpen = useRef(!!(scene.held && scene.deskRect)).current;
  const held = useSharedValue(heldOpen ? 1 : 0);
  const deskOrigin = useSharedValue<ShelfOrigin | null>(heldOpen && scene.deskRect ? toOrigin(scene.deskRect) : null);
  useAnimatedReaction(() => t.value, v => { if (held.value !== 1) pull.value = pullOf(v); }, [pull]);
  const homeward = useSharedValue(0);
  const homewardRef = useRef(onHomeward);
  useLayoutEffect(() => { homewardRef.current = onHomeward; }, [onHomeward]);
  const nearlyHome = useCallback(() => homewardRef.current?.(), []);
  useAnimatedReaction(() => t.value, v => { if (homeward.value === 1 && v <= DESK_HANDOFF_T) { homeward.value = 0; runOnJS(nearlyHome)(); } }, [nearlyHome]);
  const drawn = useSharedValue(0);
  const picture = useDerivedValue(() => createPicture(canvas => {
    if (!tex || drawn.value === 0) return;
    let f;
    if (reading3d.value === 1) f = readingFrame(L, lean.value, turn.value, dir.value, count.value, leanSide.value);
    else {
      const p = pullOf(t.value);
      const from = held.value === 1 && deskOrigin.value ? deskOrigin.value : pullOrigin(origin, geometry && p > 0 ? pullAt(p, geometry) : null, geometry, rootX, scrollY);
      f = openingFrame(t.value, from, L);
    }
    drawFloatShadow(canvas, f.cam, f.pose, f.state, f.shadow, f.lift);
    const opening = reading3d.value !== 1;
    drawBook(canvas, f.cam, f.pose, f.state, {
      cover: tex.cover, spine: tex.spine, grain: tex.grain, edges: tex.edges, parchment: tex.parchment, tint: tex.tint,
      left: f.leftBlank ? tex.flyleaf : tex.left, right: tex.right,
      leaves: opening ? [tex.flyleaf] : tex.leaves, leafBacks: opening ? [tex.left] : tex.leafBacks,
    }, { ribbon: tex.ribbon ? f.ribbon : 0, ribbonTint: tex.ribbon || undefined });
  }), [tex, L, origin, geometry, rootX, scrollY]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: reading3d.value === 1 ? .5 * Math.min(1, lean.value * 1.4) : 0 }));

  // Opening starts once the title spread is painted (it never waits for the network: the contents page says so instead).
  const ready = !!tex && !!left && !!right;
  const started = useRef(false);
  useEffect(() => {
    if (!ready || started.current || waiting) return;
    started.current = true;
    drawn.value = 1;
    onShown?.();
    const id = ++generation.current;
    const finish = () => { if (id !== generation.current) return; reading3d.value = 1; setView({ mode: 'idle' }); };
    if (reducedMotion) { t.value = 1; finish(); return; }
    t.value = withTiming(1, { duration: heldOpen ? DESK_OPEN_MS : OPEN_MS, easing: heldOpen ? DESK_OPEN_EASE : OPEN_EASE }, done => { if (done) runOnJS(finish)(); });
  }, [ready, waiting, reducedMotion, onShown, t, reading3d, setView, heldOpen, drawn]);

  // ---------- page turns (whole leaves, as MonthBook) ----------
  const turnRef = useRef<(to: number) => void>(() => undefined);
  const finishTurn = useCallback((id: number) => {
    if (id !== generation.current) return;
    const p = viewRef.current.turn;
    if (!p) return;
    setView({ turn: { ...p, landed: true } });
    afterFrames(2, () => {
      if (id !== generation.current) return;
      dir.value = 0; turn.value = 0;
      afterFrames(1, () => {
        if (id !== generation.current) return;
        setView({ mode: 'idle', index: p.to, turn: null });
        const next = pending.current; pending.current = null;
        if (next !== null && next !== p.to) afterFrames(1, () => turnRef.current(next));
      });
    });
  }, [setView, dir, turn]);
  const turnTo = useCallback((to: number) => {
    const v = viewRef.current;
    if (to < 0 || to >= spreads.length) return;
    if (v.mode === 'turning-forward' || v.mode === 'turning-backward') { pending.current = to; return; }
    if (v.mode !== 'idle' || to === v.index) return;
    const id = ++generation.current;
    const forward = to > v.index;
    const pages = turnPages(v.index, to);
    if (reducedMotion) { setView({ index: to }); return; }
    setView({ mode: forward ? 'turning-forward' : 'turning-backward', turn: { from: v.index, to, dir: forward ? 1 : -1, pages } });
    afterFrames(2, () => {
      if (id !== generation.current) return;
      turn.value = 0; count.value = pages.length; dir.value = forward ? 1 : -1;
      afterFrames(1, () => {
        if (id !== generation.current) return;
        turn.value = withTiming(1, { duration: TURN_MS * (1 + (pages.length - 1) * RIFFLE_STAGGER), easing: Easing.linear },
          done => { if (done) runOnJS(finishTurn)(id); });
      });
    });
  }, [spreads.length, reducedMotion, turn, count, dir, setView, finishTurn]);
  useLayoutEffect(() => { turnRef.current = turnTo; }, [turnTo]);
  // The book's spreads can only grow from the title spread (the reports arriving); never leave the view past the end.
  useEffect(() => { if (viewRef.current.index >= spreads.length && !viewRef.current.turn) setView({ index: Math.max(0, spreads.length - 1) }); }, [spreads.length, setView]);

  // ---------- leaning in to read a page, panning between the two, leaning out ----------
  const leanIn = useCallback((toSide: 1 | -1) => {
    const v = viewRef.current;
    if (v.mode !== 'idle') return;
    const id = ++generation.current;
    leanSide.value = toSide;
    const end = () => { if (id !== generation.current) return; setView({ mode: 'focused' }); };
    setView({ mode: 'leaning-in', side: toSide });
    if (reducedMotion) { lean.value = 1; end(); return; }
    lean.value = withTiming(1, { duration: LEAN_MS, easing: Easing.linear }, done => { if (done) runOnJS(end)(); });
  }, [reducedMotion, lean, leanSide, setView]);
  const pageTravel = useMemo(() => {
    const [rc, lc] = pageCentres();
    return Math.max(1, Math.abs(projectPoint(L.cam, L.lean, rc)[0] - projectPoint(L.cam, L.lean, lc)[0]));
  }, [L]);
  const panFrom = useRef<1 | -1>(1);
  const finishPan = useCallback((id: number, to: 1 | -1) => { if (id === generation.current) setView({ mode: 'focused', side: to }); }, [setView]);
  const settlePan = useCallback((dx: number, vx: number) => {
    const from = panFrom.current, to = (-from) as 1 | -1;
    const toward = from < 0 ? -1 : 1;
    const moved = toward * dx / pageTravel, flick = toward * vx;
    const target = moved > PAN_COMMIT || flick > PAN_FLICK ? to : from;
    const id = ++generation.current;
    const rest = Math.abs(target - leanSide.value) / 2;
    if (reducedMotion) { leanSide.value = target; finishPan(id, target); return; }
    leanSide.value = withTiming(target, { duration: Math.max(140, PAN_MS * rest), easing: Easing.out(Easing.cubic) },
      done => { if (done) runOnJS(finishPan)(id, target); });
  }, [pageTravel, leanSide, reducedMotion, finishPan]);
  const pageSwipe = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      const v = viewRef.current;
      if (v.mode !== 'focused') return false;
      if (Math.abs(g.dx) < PAN_START || Math.abs(g.dx) < Math.abs(g.dy) * PAN_SLOPE) return false;
      return v.side < 0 ? g.dx < 0 : g.dx > 0;
    },
    onPanResponderGrant: () => { generation.current++; panFrom.current = viewRef.current.side; setView({ mode: 'panning' }); },
    onPanResponderMove: (_, g) => { leanSide.value = Math.max(-1, Math.min(1, panFrom.current - 2 * g.dx / pageTravel)); },
    onPanResponderRelease: (_, g) => settlePan(g.dx, g.vx),
    onPanResponderTerminate: () => settlePan(0, 0),
    onPanResponderTerminationRequest: () => false,
  }), [pageTravel, leanSide, setView, settlePan]);
  const leanOut = useCallback((then?: () => void) => {
    const v = viewRef.current;
    if (v.mode !== 'focused') return;
    const id = ++generation.current;
    const end = () => { if (id !== generation.current) return; setView({ mode: 'idle' }); then?.(); };
    setView({ mode: 'leaning-out' });
    if (reducedMotion) { lean.value = 0; end(); return; }
    lean.value = withTiming(0, { duration: LEAN_MS, easing: Easing.linear }, done => { if (done) runOnJS(end)(); });
  }, [reducedMotion, lean, setView]);

  // ---------- closing: back to the shelf, or into the desk-view bookcase (another book chosen) ----------
  const close = useCallback(() => {
    const v = viewRef.current;
    if (v.mode === 'focused') { leanOut(() => closeRef.current()); return; }
    if (v.mode !== 'idle') return;
    const id = ++generation.current;
    pending.current = null;
    setView({ mode: 'closing' });
    held.value = 0;
    if (reducedMotion) { t.value = 0; onClosed('shelf'); return; }
    afterFrames(1, () => {
      if (id !== generation.current) return;
      reading3d.value = 0; lean.value = 0;
      t.value = withTiming(0, { duration: CLOSE_MS, easing: CLOSE_EASE }, done => { if (done) runOnJS(onClosed)('shelf'); });
    });
  }, [reducedMotion, onClosed, lean, reading3d, t, setView, leanOut, held]);
  const closeRef = useRef(close);
  useLayoutEffect(() => { closeRef.current = close; }, [close]);
  const lastClose = useRef(closeSignal);
  useEffect(() => { if (closeSignal !== lastClose.current) { lastClose.current = closeSignal; close(); } }, [closeSignal, close]);
  const returnToDesk = useCallback((rect: ShelfRect | null) => {
    const v = viewRef.current;
    if (v.mode === 'focused') { leanOut(() => returnRef.current(rect)); return; }
    if (v.mode !== 'idle') { onClosed('stayed'); return; }
    const id = ++generation.current;
    pending.current = null;
    setView({ mode: 'closing' });
    deskOrigin.value = rect ? toOrigin(rect) : geometry ? pullOrigin(origin, pullAt(1, geometry), geometry, rootX, scrollY) : origin;
    held.value = 1;
    if (reducedMotion) { t.value = 0; onClosed('desk'); return; }
    afterFrames(1, () => {
      if (id !== generation.current) return;
      reading3d.value = 0; lean.value = 0; homeward.value = 1;
      t.value = withTiming(0, { duration: DESK_CLOSE_MS, easing: DESK_CLOSE_EASE }, done => { if (done) runOnJS(onClosed)('desk'); });
    });
  }, [reducedMotion, onClosed, lean, reading3d, t, held, homeward, deskOrigin, setView, leanOut, geometry, origin, rootX, scrollY]);
  const returnRef = useRef(returnToDesk);
  useLayoutEffect(() => { returnRef.current = returnToDesk; }, [returnToDesk]);
  const lastReturn = useRef(returnTo?.run ?? 0);
  useEffect(() => {
    if (!returnTo || returnTo.run === lastReturn.current) return;
    lastReturn.current = returnTo.run;
    returnToDesk(returnTo.rect);
  }, [returnTo, returnToDesk]);

  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => { const i = viewRef.current.index; if (g.dx < -40) turnTo(i + 1); else if (g.dx > 40) turnTo(i - 1); },
  }), [turnTo]);

  // ---------- overlay geometry (as MonthBook) ----------
  const zh = L.read.pz;
  const at = (x: number, y: number) => projectPoint(L.cam, L.read, [x, y, zh]);
  const { W, H, over: o, gap: g } = SPEC;
  const [rx0, ry0] = at(g, o), [rx1] = at(W - o, o), [, ry1] = at(W - o, H - o);
  const [lx0] = at(-(W - o), o);
  const spreadOn = mode === 'idle' || !!plan;
  const settled = mode === 'idle' || mode === 'focused' || mode === 'panning' || !!plan;
  const closeUp = mode === 'leaning-in' || mode === 'focused' || mode === 'panning' || mode === 'leaning-out';
  const target = plan ? plan.to : index;
  const shown = spreads[target];
  const month = shown?.month ?? null;

  // ---------- the twelve month bookmarks ----------
  const tabs = useRef<ScrollView>(null);
  const TAB_H = 34, TAB_GAP = 3, TAB_ARROW = 26;
  const tabsHeight = 12 * (TAB_H + TAB_GAP) - TAB_GAP;
  const tabsScroll = tabsHeight > L.tabHeight;
  const tabView = tabsScroll ? L.tabHeight - 2 * TAB_ARROW : L.tabHeight;
  const tabMax = Math.max(0, tabsHeight - tabView);
  // Where the rail is scrolled to stays out of React state: a state update on every scroll frame drew the whole
  // book again. The thumb follows a shared value, and the state changes only where an arrow turns on or off.
  const [tabOffset, setTabOffset] = useState(0);
  const tabY = useRef(0), tabAt = useSharedValue(0);
  const thumbHeight = Math.max(18, tabView * tabView / tabsHeight);
  const thumbStyle = useAnimatedStyle(() => ({ top: (tabView - thumbHeight) * Math.max(0, Math.min(1, tabAt.value / Math.max(1, tabMax))) }), [tabView, thumbHeight, tabMax]);
  const onTabScroll = (y: number) => {
    tabY.current = y; tabAt.value = y;
    setTabOffset(previous => (previous <= 2) !== (y <= 2) || (previous >= tabMax - 2) !== (y >= tabMax - 2) ? y : previous);
  };
  const showTab = useCallback((animated: boolean) => {
    if (month === null) return;
    tabs.current?.scrollTo({ y: Math.max(0, Math.min(tabMax, (month - 1) * (TAB_H + TAB_GAP) - tabView / 2 + TAB_H / 2)), animated });
  }, [month, tabMax, tabView]);
  useEffect(() => { showTab(!reducedMotion); }, [showTab, reducedMotion]);
  const pageTabs = (direction: 1 | -1) => tabs.current?.scrollTo({ y: Math.max(0, Math.min(tabMax, tabY.current + direction * (tabView - TAB_H))), animated: !reducedMotion });

  const shownPages = shown && shown.left.kind === 'report' ? shown.left.pages : 0;
  const shownFrom = shown && shown.left.kind === 'report' ? shown.left.page : 0;
  const title = month ? monthTitle(month, year) : `Monthly Report ${year}`;
  const sub = month ? (shownPages > 1 ? `Pages ${shownFrom}${shown!.right.kind === 'report' ? `–${shownFrom + 1}` : ''} of ${shownPages}` : 'Monthly Report')
    : loaded.status === 'loading' ? 'Gathering your reports…' : loaded.status === 'error' ? (loaded.problem.kind === 'consent' ? 'AI memory is off' : 'Couldn’t load just now')
      : `${written!.filter(Boolean).length} of 12 months written`;
  const pageLabel = (s: 'left' | 'right') => shown ? pageText(shown[s], year, loaded) : '';

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="monthly-report-book" accessibilityLabel={`Book mode ${mode}`}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#140A03' }, dimStyle]} />
    {tex && <View pointerEvents="none" style={StyleSheet.absoluteFill}><Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas></View>}

    {spreadOn && <>
      {mode === 'idle' && shown && <View {...swipe.panHandlers} style={{ position: 'absolute', left: lx0, top: ry0, width: rx1 - lx0, height: ry1 - ry0, flexDirection: 'row' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={pageLabel('left')} accessibilityHint="Brings the left page close to read"
          onPress={() => leanIn(-1)} style={{ width: rx0 - lx0, height: '100%' }} />
        <Pressable accessibilityRole="button" accessibilityLabel={pageLabel('right')} accessibilityHint="Brings the right page close to read"
          onPress={() => leanIn(1)} style={{ flex: 1, height: '100%' }} />
      </View>}
      {/* Twelve bookmarks out of the fore-edge, always inside the book's own height (the rail scrolls when it must). */}
      <View testID="monthly-report-bookmarks" style={{ position: 'absolute', left: L.tabLeft, top: L.tabTop, width: L.width - L.tabLeft, height: L.tabHeight }}>
        {tabsScroll && <Pressable accessibilityRole="button" accessibilityLabel="Earlier months" disabled={tabOffset <= 2} onPress={() => pageTabs(-1)} hitSlop={{ top: 6, bottom: 2, left: 8, right: 8 }}
          style={[book.tabArrow, { top: 1 }, tabOffset <= 2 && book.tabArrowOff]}><Text style={book.tabArrowText}>▴</Text></Pressable>}
        <View style={{ position: 'absolute', left: 0, right: 0, top: tabsScroll ? TAB_ARROW : 0, height: tabView, overflow: 'hidden' }}>
          <ScrollView ref={tabs} showsVerticalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Month bookmarks"
            onContentSizeChange={() => showTab(false)} scrollEventThrottle={16} onScroll={event => onTabScroll(event.nativeEvent.contentOffset.y)}
            scrollEnabled={tabsScroll} bounces={false} overScrollMode="never" decelerationRate="fast"
            contentContainerStyle={{ gap: TAB_GAP, paddingVertical: tabsScroll ? 0 : Math.max(0, (tabView - tabsHeight) / 2) }}>
            {MONTHS.map((name, i) => <MonthBookmark key={name} month={i + 1} year={year} height={TAB_H} selected={month === i + 1}
              state={loaded.status === 'ready' ? (starts[i] !== null ? 'written' : 'locked') : loaded.status}
              onPress={() => { const at = starts[i]; if (at !== null) turnTo(at); }} />)}
          </ScrollView>
          {tabsScroll && <View pointerEvents="none" style={[book.tabTrack, { height: tabView }]}>
            <Animated.View style={[book.tabThumb, { height: thumbHeight }, thumbStyle]} />
          </View>}
        </View>
        {tabsScroll && <Pressable accessibilityRole="button" accessibilityLabel="Later months" disabled={tabOffset >= tabMax - 2} onPress={() => pageTabs(1)} hitSlop={{ top: 2, bottom: 6, left: 8, right: 8 }}
          style={[book.tabArrow, { top: L.tabHeight - TAB_ARROW + 3 }, tabOffset >= tabMax - 2 && book.tabArrowOff]}><Text style={book.tabArrowText}>▾</Text></Pressable>}
      </View>
    </>}

    {/* Close up: the page itself, brought flat to the screen; a sideways swipe pans to the other page. */}
    {(mode === 'focused' || mode === 'panning') && <View {...pageSwipe.panHandlers} accessible accessibilityLabel={pageLabel(side < 0 ? 'left' : 'right')}
      style={{ position: 'absolute', left: L.page.x, top: L.page.y, width: L.page.width, height: L.page.height }} />}

    {settled && <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: insets.top + 3, left: (width - Math.min(width, 560)) / 2 + 12 }}>
        {closeUp ? <RoundButton label="Back to both pages" icon={ICONS.back} disabled={mode !== 'focused'} onPress={() => leanOut()} />
          : <RoundButton label="Back to bookshelf" icon={ICONS.back} disabled={mode !== 'idle'} onPress={close} />}
      </View>
      {spreadOn && <View style={[book.controls, { top: L.below + 8, left: L.side + 12, right: L.side + 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous pages" disabled={target <= 0} onPress={() => turnTo(viewRef.current.index - 1)}
          style={[book.turn, target <= 0 && { opacity: .35 }]}><Text style={book.arrow}>‹</Text></Pressable>
        <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: 'center' }}>
          <Text numberOfLines={1} style={[book.pageNumber, { fontFamily: 'EBGaramond-MediumItalic' }]}>{title}</Text>
          <Text numberOfLines={1} style={[book.pageSub, { fontFamily: 'EBGaramond-MediumItalic' }]}>{sub}</Text>
        </View>
        {loaded.status === 'error' ? <Pressable accessibilityRole="button" accessibilityLabel="Try loading the Monthly Reports again" onPress={retry} style={book.today}>
          <Text style={[book.todayText, { fontFamily: 'EBGaramond-MediumItalic' }]}>Try again</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Next pages" disabled={target >= spreads.length - 1} onPress={() => turnTo(viewRef.current.index + 1)}
          style={[book.turn, target >= spreads.length - 1 && { opacity: .35 }]}><Text style={book.arrow}>›</Text></Pressable>
      </View>}
    </View>}
  </View>;
}

/** One month's bookmark: a written month opens its report; a month with no saved, written report is grey and locked.
 *  While the reports load (or could not be read) every bookmark waits, neither open nor locked. */
function MonthBookmark({ month, year, height, selected, state, onPress }: {
  month: number; year: number; height: number; selected: boolean; state: 'written' | 'locked' | 'loading' | 'error'; onPress: () => void;
}) {
  const name = MONTH_NAMES[month - 1];
  const locked = state === 'locked', waiting = state === 'loading' || state === 'error';
  const label = `${name} ${year}${locked ? ', locked: no Monthly Report saved yet' : waiting ? (state === 'loading' ? ', loading' : ', unavailable') : ', Monthly Report'}`;
  return <Pressable testID={`report-bookmark-${month}`} accessibilityRole="tab" accessibilityLabel={label}
    accessibilityState={{ selected, disabled: state !== 'written', busy: state === 'loading' }} disabled={state !== 'written'} onPress={onPress}
    hitSlop={{ top: 1.5, bottom: 1.5, left: 4, right: 10 }}
    style={[book.bookmark, styles.mark, { height, width: selected ? 42 : 36 },
      selected && { backgroundColor: ARCHIVE_GREEN, borderColor: '#D9B56A' },
      locked && styles.locked, waiting && styles.waiting]}>
    {!selected && <View style={[book.bookmarkBand, { backgroundColor: locked || waiting ? '#A9A398' : ARCHIVE_GREEN }]} />}
    <Text numberOfLines={1} style={[book.bookmarkText, styles.markText, selected && { color: '#FFF4DE', fontWeight: '600' }, locked && { color: '#8E887D' }]}>{MONTHS[month - 1]}</Text>
    {locked && <View style={styles.lock}><Icon source={LOCK_ICON} size={10} opacity={.7} /></View>}
  </Pressable>;
}
const ARCHIVE_GREEN = '#2F4D2A';
const styles = StyleSheet.create({
  mark: { paddingLeft: 7, paddingRight: 2 },
  markText: { fontSize: 12 },
  locked: { backgroundColor: '#DCD7CE', borderColor: '#AFA89B' },
  waiting: { opacity: .55 },
  lock: { position: 'absolute', right: 3, bottom: 2 },
});

const faceIds = new WeakMap<object, number>();
let nextFaceId = 1;
function faceId(image: SkImage | null) {
  if (!image) return 0;
  let id = faceIds.get(image);
  if (!id) { id = nextFaceId++; faceIds.set(image, id); }
  return id;
}
function hexRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}
