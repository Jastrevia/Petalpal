import { useWorldTime } from '../components/garden/world-time';
import type { PanelTheme } from '../components/features/PanelTheme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useAuth } from '../services/auth';
import { useGuest } from '../services/guest';
import {
  defaultShelfYear, deletePrivateJournal, formatLocalDate, journalCounts, journalLocked, journalYears, MONTH_NAMES, monthDays, monthKey, monthLocked, readCheckIns, readJournals,
  readMonthEvents, todayLocalDate, type DailyCheckInRecord, type JournalCheckIn, type MonthEvent,
} from '../services/bookhouse';
import { readEvent } from '../services/events';
import { loadGardenPlacements } from '../components/garden/planting/gardenHydration';
import { loadFlowerSource } from '../components/garden/planting/flowerDetailApi';
import { loadFlowerPlacements, type FlowerPlacementRecord } from '../components/garden/planting/plantingPersistence';
import { ICONS, ParchmentButton, RoundButton, TitlePlaque, TreehouseBackdrop } from '../components/bookhouse/TreehouseArt';
import { measureBook, shelfLayout, TreehouseShelf, type ShelfRect, type ShelfSlot } from '../components/bookhouse/TreehouseShelf';
import { MonthBook, type BookMode, type ClosedTo } from '../components/bookhouse/MonthBook';
import { pullTarget } from '../components/bookhouse/book3d/desk';
import { DeskLayer } from '../components/bookhouse/book3d/DeskLayer';
import { pullTarget as roomPullTarget } from '../components/bookhouse/book3d/roomDesk';
import { RoomBack, RoomFront } from '../components/bookhouse/book3d/RoomLayers';
import { ROOM_ARTWORK, ROOM_LAYOUT, ROOM_SCENE, shelfTransform, type PullGeometry } from '../components/bookhouse/book3d/scene';
import { ComposedDesk, ComposedRoom } from '../components/bookhouse/book3d/ComposedRoom';
import { ReferenceFront, ReferenceRoom, ReferenceSquirrel } from '../components/bookhouse/book3d/ReferenceScene';
import { composedAt, composedPoint, composedRestRect, composedTarget, deskShelfFade, deskShelfFrame, portraitColumn, PORTRAIT_FOOTER, REF, referenceColumn, referenceShelfWidth } from '../components/bookhouse/book3d/composed';
import { TreehouseWalls } from '../components/bookhouse/book3d/TreehouseWalls';
import { compositeEnd, DESK_DEPTH } from '../components/bookhouse/book3d/walls';
import { bookLayout, deskBookLayout, inOpenBookZone } from '../components/bookhouse/book3d/motion';
import { preloadBookImages } from '../components/bookhouse/book3d/assets';
import { preparePapers, retainJournalAssets } from '../components/bookhouse/book3d/usePageFaces';
import type { Draft } from '../components/bookhouse/book3d/WritingPage';
import { JournalActions } from '../components/bookhouse/JournalActions';

const serif = Platform.select({ ios: 'Georgia', web: 'Georgia', default: 'serif' });
const moodName = (mood: string) => { const word = mood.replace('_BLOOM', '').toLowerCase(); return word.charAt(0).toUpperCase() + word.slice(1); };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to load your book. Please try again.';

// The bookshelf is always mounted; a month opens as a book that flies out of its slot over it,
// so the selected year and scroll position are still there when the book flies back.
// `held`: opened from the bookcase seen from the desk (switching months), from `deskRect`, with the camera already there.
type OpenBook = { year: number; month: number; rect: ShelfRect; geometry: PullGeometry; scrollY: number; held?: boolean; deskRect?: ShelfRect | null };
type MonthChoice = { year: number; month: number; rect: ShelfRect };
const TOP_BAR = 52;
const SHELF_FOOTER = 46;
/** Pulled back to the desk, the title sign sits this far below the safe area: under the row of top controls (back,
 *  Help, 44 tall from 4), so they stay clear and tappable. */
const TITLE_CLEARANCE = 52;
const SHELF_FOOTER_GAP = 8;
const GUTTER = 12;

export default function Bookhouse() {
  const { session } = useAuth();
  // Guest mode (services/guest.tsx): the Treehouse is to look at; opening a month's book asks for an account.
  const guest = useGuest();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { isTreehouseLightingTime: worldNight } = useWorldTime();
  const [devNight, setDevNight] = useState<boolean | null>(null);
  const lit = __DEV__ ? devNight ?? worldNight : worldNight;
  const timezone = session?.user.timezone || 'UTC';
  const column = Math.min(width, 560);
  const inner = column - GUTTER * 2;
  const sceneScroll = useRef<ScrollView>(null);
  const bookNodes = useRef(new Map<string, ShelfSlot>());
  // The desk-view bookcase (portrait layout): its books open their months from the desk (switching books).
  const deskShelfNodes = useRef(new Map<string, ShelfSlot>());

  const [entries, setEntries] = useState<JournalCheckIn[]>([]);
  const [error, setError] = useState('');
  const [book, setBook] = useState<OpenBook | null>(null);
  // Switching months at the desk, the chosen month's book is mounted while the open one closes (its pages load
  // meanwhile, nothing drawn) and starts out of its slot as the closing one slides home (`nextWaiting` until then).
  const [nextBook, setNextBook] = useState<OpenBook | null>(null);
  const [nextWaiting, setNextWaiting] = useState(false);
  // Each slot empties only once its 3D book is drawn in its place (no blank frame while its textures load), and fills
  // again the moment that book is back in it.
  const [shownMonths, setShownMonths] = useState<string[]>([]);
  const showMonth = (key: string, on: boolean) => setShownMonths(list => on ? (list.includes(key) ? list : [...list, key]) : list.filter(k => k !== key));
  const [closeSignal, setCloseSignal] = useState(0);
  // The open book's state (MonthBook): the desk-view bookcase takes taps only while the whole spread rests on the desk.
  const [bookMode, setBookModeState] = useState<BookMode | null>(null);
  const bookModeRef = useRef<BookMode | null>(null);
  const onBookMode = useCallback((mode: BookMode | null) => { bookModeRef.current = mode; setBookModeState(mode); }, []);
  // Switching months at the desk: one switch at a time. `switching` is set the moment a book is chosen (so a second tap
  // never starts another) and cleared once the chosen book is on its way; the open book closes into its slot first.
  const switching = useRef<MonthChoice | null>(null);
  const [returnTo, setReturnTo] = useState<{ run: number; rect: ShelfRect | null } | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<MonthChoice | null>(null);
  // Closing with unsaved writing asks first; `year`: a year chosen at the desk, shown once the book is back on its shelf.
  const [confirmClose, setConfirmClose] = useState<{ year: number | null } | null>(null);
  // A year chosen on the desk-view bookcase while a book is open: the book goes back to its shelf first (the camera
  // returning with it), then the shelf shows that year. One at a time; a closing that does not happen drops it.
  const pendingYear = useRef<number | null>(null);
  const [shelfYear, setShelfYear] = useState<number | null>(null);
  // Unsaved writing, kept while the Treehouse is open (by day and journal) so leaving a page never loses it.
  const drafts = useRef(new Map<string, Draft>()).current;
  // The camera pulling back from the shelf to the writing desk (driven by the open book's timeline).
  const pull = useSharedValue(0);
  const sceneY = useRef(0);
  const [history, setHistory] = useState(false);
  const [actionEntry, setActionEntry] = useState<JournalCheckIn | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 3600); return () => clearTimeout(timer); }, [notice]);
  const arrival = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(arrival, { toValue: 1, duration: reducedMotion ? 0 : 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [arrival, reducedMotion]);

  const requestVersion = useRef(0);
  const journalRequest = useRef<AbortController | null>(null);
  const reload = useCallback(async (): Promise<JournalCheckIn[] | null> => {
    if (!session) return null;
    const version = ++requestVersion.current;
    journalRequest.current?.abort();
    const controller = new AbortController();
    journalRequest.current = controller;
    setError('');
    try {
      const [next, records] = await Promise.all([readJournals(session.user.id, controller.signal),
        // Daily Grow records for the books' left pages; the shelf itself never waits on them.
        readCheckIns(session.user.id, controller.signal).then(list => ({ list, failed: false }), () => ({ list: [] as DailyCheckInRecord[], failed: true }))]);
      if (version !== requestVersion.current) return null;
      setEntries(next); setCheckIns(records.list); setRecordsFailed(failed => failed || records.failed); return next;
    } catch (e) { if (version === requestVersion.current) setError(errorMessage(e)); return null; }
  }, [session]);
  const [checkIns, setCheckIns] = useState<DailyCheckInRecord[]>([]);
  // Each month's Events (for its books' left pages), kept per month so a switch never changes the closing book's pages.
  const [monthEvents, setMonthEvents] = useState<Record<string, MonthEvent[]>>({});
  const [recordsFailed, setRecordsFailed] = useState(false);
  useFocusEffect(useCallback(() => { void reload(); return () => { requestVersion.current++; journalRequest.current?.abort(); }; }, [reload]));

  const today = todayLocalDate(timezone);
  const years = useMemo(() => journalYears(entries), [entries]);
  const counts = useMemo(() => journalCounts(entries), [entries]);
  const year = shelfYear ?? defaultShelfYear(years, today);
  const exit = () => router.canGoBack() ? router.back() : router.dismissTo('/');
  // Unsaved writing is never dropped silently: drafts survive turning pages and closing the book, and leaving the
  // Treehouse with one asks first (and, on the web, so does closing or reloading the tab).
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = () => { if (drafts.size > 0) setConfirmLeave(true); else exit(); };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const warn = (event: BeforeUnloadEvent) => { if (drafts.size > 0) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts]);
  // Android's back gesture closes an open book before leaving the Treehouse.
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!book) { if (drafts.size === 0) return false; setConfirmLeave(true); return true; }
      setCloseSignal(n => n + 1); return true;
    });
    return () => subscription.remove();
  }, [book, drafts]));
  const openMonth = (y: number, m: number, rect: ShelfRect | null) => {
    if (!rect || book) return;
    if (!session) { guest?.requestAccount(); return; }
    const rest = shelfLayout(column, cabinetTop, cabinetBottom);
    // The scene is chosen in book3d/scene.ts: the Treehouse room (ROOM_SCENE) or the painted desk alone (fallback).
    const painted = pullTarget({ width: rest.width, cabinetBottom, sceneHeight }, width, desk.deskEdge, sceneY.current);
    const geometry: PullGeometry = ROOM_ARTWORK
      ? { kind: 'room', ...roomPullTarget({ width: rest.width, cabinetTop, scale: rest.scale, sceneHeight }, { width, height }, desk.deskEdge + 12, insets.top, sceneY.current) }
      : ROOM_SCENE && (ROOM_LAYOUT === 'reference' || ROOM_LAYOUT === 'portrait' || ROOM_LAYOUT === 'composed' || ROOM_LAYOUT === 'composed-v1')
        ? { kind: 'composed', ...composedTarget({ width: rest.width, scale: rest.scale, cabinetTop, sceneHeight, rootX: (width - rest.width) / 2, slices: rest.slices }, { width, height },
          // (The illustrated scene keeps a band of desk above the journal for its quill, ink and teacup.)
          ROOM_LAYOUT === 'reference' ? desk.deskEdge - REF.room : desk.deskEdge, sceneY.current,
          { top: insets.top + TOP_BAR, safeTop: insets.top + TITLE_CLEARANCE }, ROOM_LAYOUT === 'composed-v1' ? 'v1' : ROOM_LAYOUT === 'portrait' ? 'portrait' : ROOM_LAYOUT === 'reference' ? 'reference' : 'v2') }
        : ROOM_SCENE
          ? { kind: 'treehouse', ...painted, rest: { width: rest.width, scale: rest.scale, cabinetTop, rootX: (width - rest.width) / 2, xEnd: compositeEnd(rest) } }
          : { kind: 'painted', ...painted };
    // Portrait: once pulled back, the bookcase is seen from the desk as wide as the desk itself — the same painting at
    // the same scale as the receding shelf, on the same rows and centre, laid out across the column (no stretching).
    // The illustrated scene: the bookcase exactly as wide as the illustration's (which it covers), at the same scale.
    if (geometry.kind === 'composed' && (geometry.variant === 'portrait' || geometry.variant === 'reference')) {
      const frame = deskShelfFrame(geometry, { cabinetTop, cabinetBottom, railBottom: sceneHeight - insets.bottom - 6 });
      const wide = shelfLayout(geometry.variant === 'reference' ? referenceShelfWidth(geometry) : deskColumn, frame.cabinetTop, frame.cabinetBottom, true);
      geometry.deskShelf = { width: wide.width, scale: wide.scale, slices: wide.slices, x: (width - wide.width) / 2, ...frame };
    }
    setShelfYear(y); setShownMonths([]); setBook({ year: y, month: m, rect, geometry, scrollY: sceneY.current });
    loadMonthEvents(y, m);
  };
  // The book's left pages: that month's Events (by their stored local date), read again each time it is opened.
  const loadMonthEvents = (y: number, m: number) => {
    const key = `${y}-${m}`;
    if (!session) return;
    readMonthEvents(session.user.id, y, m).then(result => setMonthEvents(all => ({ ...all, [key]: result.events || [] })))
      .catch(() => { setMonthEvents(all => ({ ...all, [key]: all[key] || [] })); setRecordsFailed(true); });
  };
  const monthPrefix = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-`;
  // A book tapped in the bookcase behind the desk: the open book goes back to its slot and that month's comes out —
  // all in the same scene, the camera staying where it is. Unsaved writing in the open book is never dropped: switching
  // with a draft asks first, and the draft stays (unsaved) for when that month is opened again.
  const chooseAtDesk = (y: number, m: number, rect: ShelfRect | null) => {
    if (!book || !rect || switching.current || nextBook || confirmSwitch || bookModeRef.current !== 'idle') return;
    if (y === book.year && m === book.month) return;
    const prefix = monthPrefix(book.year, book.month);
    if ([...drafts.keys()].some(key => key.startsWith(prefix))) { setConfirmSwitch({ year: y, month: m, rect }); return; }
    void switchTo({ year: y, month: m, rect });
  };
  const switchTo = async (choice: MonthChoice, keptDraft = false) => {
    if (!book || switching.current || book.geometry.kind !== 'composed') return;
    switching.current = choice;
    // The chosen month's book: its place on the bookshelf itself is the same slot with the pull-back undone, so it can
    // later close all the way back to the shelf. It waits (pages loading) until the open book is nearly home.
    setNextWaiting(true);
    setNextBook({ year: choice.year, month: choice.month, rect: composedRestRect(choice.rect, book.geometry), geometry: book.geometry, scrollY: book.scrollY, held: true, deskRect: choice.rect });
    loadMonthEvents(choice.year, choice.month);
    // The open book's own slot in the desk-view bookcase (its book is hidden there, but laid out).
    const from = await measureBook(deskShelfNodes.current.get(monthKey(book.year, book.month)));
    setReturnTo({ run: Date.now(), rect: from });
    if (keptDraft) setNotice(`Your ${MONTH_NAMES[book.month - 1]} draft is kept, not saved yet. Open ${MONTH_NAMES[book.month - 1]} again to finish it.`);
  };
  const bookClosed = (to: ClosedTo) => {
    switching.current = null;
    setReturnTo(null);
    // The switch could not start (the book was busy): the waiting book is put away unseen.
    if (to === 'stayed') { setNextBook(null); setNextWaiting(false); return; }
    if (book) showMonth(monthKey(book.year, book.month), false);
    if (to === 'desk' && nextBook) {
      // The closed book is back in its slot; the chosen month's book (already on its way) becomes the open one.
      setNextWaiting(false);
      setBook(nextBook); setNextBook(null);
      return;
    }
    setBook(null); setNextBook(null); setShownMonths([]); onBookMode(null);
    const nextYear = pendingYear.current;
    pendingYear.current = null;
    if (to === 'shelf' && nextYear !== null) setShelfYear(nextYear);
  };
  // Each book's days, rebuilt only when that month's own data changes (a switch never redraws the other book's pages).
  const daysCache = useRef(new Map<string, { inputs: unknown[]; days: ReturnType<typeof monthDays> }>()).current;
  const daysOf = (b: OpenBook) => {
    const key = `${b.year}-${b.month}`, events = monthEvents[key];
    const inputs = [entries, checkIns, events, today];
    const hit = daysCache.get(key);
    if (hit && hit.inputs.every((v, i) => v === inputs[i])) return hit.days;
    const days = monthDays(b.year, b.month, entries, checkIns, events || [], today);
    daysCache.set(key, { inputs, days });
    return days;
  };
  useEffect(() => { if (recordsFailed && book) setNotice('Some flower, Event or mood records could not be loaded. They will appear once the connection returns.'); }, [recordsFailed, book]);
  const removeEntry = async () => {
    if (!session || !actionEntry?.journal) return;
    await deletePrivateJournal(session.user.id, actionEntry.journal.id);
    for (const key of [...drafts.keys()]) if (key.endsWith(`|${actionEntry.journal.id}`)) drafts.delete(key);
    setActionEntry(null);
    setNotice('Journal deleted.');
    await reload();
  };
  const plaqueWidth = Math.min(300, inner - 40);
  // The shelf fills the phone: the title sign rests on the painted top beam and the buttons sit below the last shelf.
  // Tiny or landscape windows scroll instead of shrinking the books.
  const sceneHeight = Math.max(height, 640);
  const cabinetTop = insets.top + TOP_BAR + 52;
  const cabinetBottom = sceneHeight - insets.bottom - SHELF_FOOTER_GAP - SHELF_FOOTER - 8;
  // The open book's column: in the portrait Treehouse, the width the bookcase, the desk and the journal share once
  // pulled back (the whole width on phones; on wider windows a centred column as wide as the bookcase).
  const portrait = ROOM_SCENE && (ROOM_LAYOUT === 'portrait' || ROOM_LAYOUT === 'reference') && !ROOM_ARTWORK;
  const deskColumn = useMemo(() => {
    if (!portrait) return Math.min(width, 560);
    const rest = shelfLayout(column, cabinetTop, cabinetBottom);
    const restGeometry = { width: rest.width, scale: rest.scale, cabinetTop, sceneHeight, rootX: (width - rest.width) / 2, slices: rest.slices };
    const title = { top: insets.top + TOP_BAR, safeTop: insets.top + TITLE_CLEARANCE };
    return ROOM_LAYOUT === 'reference' ? referenceColumn({ width, height }, insets, restGeometry, title) : portraitColumn({ width, height }, insets, restGeometry, title);
  }, [portrait, width, height, insets, column, cabinetTop, cabinetBottom, sceneHeight]);
  const deskFooter = portrait ? PORTRAIT_FOOTER : 0;
  const desk = useMemo(() => ROOM_ARTWORK ? deskBookLayout(width, height, insets) : bookLayout(width, height, insets, 0, deskColumn, deskFooter), [width, height, insets, deskColumn, deskFooter]);
  // The title sign hangs on the shelf's top beam, so it recedes with the shelf: the same uniform scale about the
  // shelf's top centre (the sign is centred, so only its centre's height changes).
  const plaqueCentre = insets.top + TOP_BAR + 25;
  // It moves with the camera exactly as the receding shelf does (one uniform scale about the same point), so the two
  // always coincide while one fades into the other.
  const colX = (width - column) / 2;
  const deskShelfStyle = useAnimatedStyle(() => {
    const g = book?.geometry;
    if (!g || g.kind !== 'composed' || !g.deskShelf || pull.value <= 0) return { opacity: 0, transform: [{ scale: 1 }] };
    const s = composedAt(pull.value, g), end = composedAt(1, g);
    const [ax1, ay1] = composedPoint(g.ax, 0, end, g), [ax, ay] = composedPoint(g.ax, 0, s, g);
    // Scaled about the view's own centre (cx, cy), then moved: the anchor (ax1, ay1) lands on (ax, ay).
    const r = s.k / g.k1, cx = column / 2, cy = height / 2;
    return { opacity: deskShelfFade(s, g),
      transform: [{ translateX: ax - colX - cx - (ax1 - colX - cx) * r }, { translateY: ay - cy - (ay1 - cy) * r }, { scale: r }] };
  });
  const plaqueStyle = useAnimatedStyle(() => {
    const g = book?.geometry || null;
    const t = shelfTransform(pull.value, g);
    return { transform: [{ translateX: t.tx }, { translateY: g ? (plaqueCentre - g.ay) * (t.k - 1) + t.ty : 0 }, { scale: t.k }] };
  });

  // The books' pictures, fonts and papers are kept while the Treehouse is open (reopening a month never waits for them
  // again). While nothing moves — the shelf at rest, or a journal lying open — the months on view get their covers ready,
  // nearest first, one file at a time, so opening or switching to one starts at once.
  useEffect(() => retainJournalAssets(), []);
  const still = book ? bookMode === 'idle' : true;
  const nearMonth = book?.month ?? (Number(today.slice(0, 4)) === year ? Number(today.slice(5, 7)) : 12);
  useEffect(() => {
    if (!still) return;
    const months = Array.from({ length: 12 }, (_, i) => i + 1)
      .filter(m => m !== book?.month && !monthLocked(year, m, today, counts.get(monthKey(year, m)) || 0))
      .sort((a, b) => Math.abs(a - nearMonth) - Math.abs(b - nearMonth));
    let cancel = () => {};
    const timer = setTimeout(() => { cancel = preloadBookImages(months, () => preparePapers(desk.page.width)); }, book ? 250 : 900);
    return () => { clearTimeout(timer); cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, book?.month, nearMonth, year, today, desk.page.width]);
  // The desk-view bookcase's books are tappable while the spread rests on the desk and no switch is under way.
  const deskPick = !!book && !nextBook && bookMode === 'idle' && !returnTo && !confirmSwitch && !confirmClose;

  // A tap off the open book — the empty desk, the bookcase behind it (anywhere but its books), the room beside it — closes
  // the book (it flies back to its shelf and the camera returns). Only a tap: a press that moves or lingers (a drag, a
  // swipe, a scroll) never closes it, nor does one on or right beside the book, its bookmarks or its date controls (those
  // take their own taps first anyway). Unsaved writing asks first, as switching months does.
  const offBookTap = useRef<{ x: number; y: number; at: number } | null>(null);
  const offBook = {
    onPressIn: (e: GestureResponderEvent) => { offBookTap.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, at: Date.now() }; },
    onPress: (e: GestureResponderEvent) => {
      const start = offBookTap.current;
      offBookTap.current = null;
      const x = e.nativeEvent.pageX, y = e.nativeEvent.pageY;
      if (!start || Math.hypot(x - start.x, y - start.y) > 10 || Date.now() - start.at > 700) return;
      if (inOpenBookZone(desk, x, y)) return;
      closeFromOutside();
    },
  };
  const closeFromOutside = (nextYear: number | null = null) => {
    if (!book || nextBook || switching.current || pendingYear.current !== null || bookModeRef.current !== 'idle') return;
    if ([...drafts.keys()].some(key => key.startsWith(monthPrefix(book.year, book.month)))) { setConfirmClose({ year: nextYear }); return; }
    pendingYear.current = nextYear;
    setCloseSignal(n => n + 1);
  };
  // A year tapped on the desk-view bookcase (a locked one only says it has not arrived): this book goes back to its
  // shelf with the existing closing, and the shelf then shows that year's books.
  const chooseYearAtDesk = (y: number) => {
    if (!book || y === year) return;
    closeFromOutside(y);
  };
  const keepWriting = () => { setConfirmClose(null); pendingYear.current = null; };

  return <Animated.View style={[s.root, { opacity: arrival }]}>
    {/* Around the receding shelf (and beside it on wide windows) the rest of the room stays softly out of focus. */}
    <TreehouseBackdrop width={width} height={height} night={lit} dim={width > column + 40 || (book && book.geometry.kind !== 'room') ? .3 : 0} />
    {book && book.geometry.kind === 'composed' && (book.geometry.variant === 'reference' ? <ReferenceRoom pull={pull} geometry={book.geometry} /> : <ComposedRoom pull={pull} geometry={book.geometry} />)}
    {/* The Treehouse around the bookshelf, revealed as the camera pulls back (behind the shelf). */}
    {book && book.geometry.kind === 'treehouse' && <TreehouseWalls pull={pull} geometry={book.geometry} />}
    {book && book.geometry.kind === 'room' && <RoomBack pull={pull} geometry={book.geometry} />}
    <ScrollView ref={sceneScroll} onScroll={event => { sceneY.current = event.nativeEvent.contentOffset.y; }} scrollEnabled={!book}
      scrollEventThrottle={32} bounces={false} contentContainerStyle={{ alignItems: 'center' }}>
      <View style={{ width: column, height: sceneHeight, alignItems: 'center' }}>
        {/* The bookshelf itself; while a book is open it is only a picture behind the desk (the desk-view bookcase below
            takes the taps). */}
        <View pointerEvents={book ? 'none' : 'box-none'} importantForAccessibility={book ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={!!book}
          style={{ width: column, height: sceneHeight, alignItems: 'center' }}>
        <TreehouseShelf column={column} height={sceneHeight} cabinetTop={cabinetTop} cabinetBottom={cabinetBottom} railBottom={sceneHeight - insets.bottom - 6}
          years={years} year={year} today={today} counts={counts} reducedMotion={reducedMotion}
          onSelectYear={setShelfYear} onOpenMonth={openMonth} onLocked={setNotice}
          hiddenMonth={book ? shownMonths : null} bookNodes={bookNodes}
          pull={pull} pullGeometry={book?.geometry || null}
          targets={{ years: {}, books: {}, shelf: {} }}
          footer={() => null} />
        </View>
        {/* Portrait: the bookcase as seen from the writing desk, taking over from the receding shelf as the camera settles. */}
        {/* Its books stay in reach while the journal is open: tap one to put this book back and open that month. */}
        {book && book.geometry.kind === 'composed' && book.geometry.deskShelf && <Reanimated.View pointerEvents={deskPick ? 'box-none' : 'none'}
          accessibilityElementsHidden={!deskPick} importantForAccessibility={deskPick ? 'auto' : 'no-hide-descendants'}
          style={[{ position: 'absolute', left: 0, top: book.scrollY, width: column, height, alignItems: 'center' }, deskShelfStyle]}>
          {/* The bookcase and the desk in front of it: a tap on them (not on a book) closes the open book (offBook). */}
          <Pressable accessible={false} focusable={false} {...offBook} style={{ width: column, height, alignItems: 'center', cursor: 'auto' } as never}>
            <TreehouseShelf fill deskTouch column={book.geometry.deskShelf.width} height={height} cabinetTop={book.geometry.deskShelf.cabinetTop} cabinetBottom={book.geometry.deskShelf.cabinetBottom}
              railBottom={book.geometry.deskShelf.railBottom} years={years} year={year} today={today} counts={counts} reducedMotion={reducedMotion}
              onSelectYear={chooseYearAtDesk} onOpenMonth={chooseAtDesk} onLocked={setNotice} targets={{ years: {}, books: {}, shelf: {} }} footer={() => null}
              hiddenMonth={shownMonths} bookNodes={deskShelfNodes} />
          </Pressable>
        </Reanimated.View>}
        <View pointerEvents={book ? 'none' : 'box-none'} importantForAccessibility={book ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={!!book}
          style={{ position: 'absolute', left: 0, right: 0, top: insets.top }}>
          <View style={s.topBar}><RoundButton label="Back to Garden" icon={ICONS.back} onPress={leave} /></View>
          <Reanimated.View style={plaqueStyle}><TitlePlaque title="My Journals" width={plaqueWidth} onLongPress={__DEV__ ? () => setDevNight(value => !(value ?? worldNight)) : undefined} /></Reanimated.View>
        </View>
        {!!error && <Text accessibilityRole="alert" onPress={() => void reload()} style={[s.inlineError, { position: 'absolute', top: cabinetTop + 8, left: 90, right: 12 }]}>{error} Tap to retry.</Text>}
      </View>
    </ScrollView>

    {/* Wider windows: the room beside the Treehouse's column closes the open book on a tap too. */}
    {deskPick && width > column + 1 && [0, 1].map(i => <Pressable key={i} accessible={false} focusable={false} {...offBook}
      style={{ position: 'absolute', top: 0, bottom: 0, width: colX, left: i ? colX + column : 0, cursor: 'auto' } as never} />)}
    {/* The writing desk in the foreground, revealed as the camera pulls back (never part of the shelf's layout); in the
        room scene also the botanical frame and the quill. */}
    {book && book.geometry.kind === 'composed' && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {book.geometry.variant === 'reference' ? <ReferenceFront pull={pull} geometry={book.geometry} /> : <ComposedDesk pull={pull} geometry={book.geometry} />}
      {/* Scrollkeeper roams the desk behind the open journal (it used to sit on top of the old bookcase). */}
      {book.geometry.variant === 'reference' && <ReferenceSquirrel pull={pull} geometry={book.geometry} still={!!reducedMotion} />}</View>}
    {book && (book.geometry.kind === 'painted' || book.geometry.kind === 'treehouse') && <DeskLayer pull={pull} geometry={book.geometry} width={width} height={height} depth={book.geometry.kind === 'treehouse' ? DESK_DEPTH : 0} />}
    {book && book.geometry.kind === 'room' && <RoomFront pull={pull} geometry={book.geometry} height={height} />}
    {/* The open book, and while switching months at the desk the chosen month's book (keyed by month, so it carries on
        as the open book once the other is home). */}
    {session && [book, nextBook].map(b => b && <MonthBook key={`${b.year}-${b.month}`} year={b.year} month={b.month} shelfRect={b.rect} days={daysOf(b)}
      userId={session.user.id} today={today} reducedMotion={reducedMotion} night={lit} closeSignal={closeSignal} drafts={drafts}
      returnTo={b === book ? returnTo : null} waiting={b === nextBook && nextWaiting}
      scene={{ pull, geometry: b.geometry, rootX: (width - shelfLayout(column, cabinetTop, cabinetBottom).width) / 2, scrollY: b.scrollY, column: deskColumn, footer: deskFooter,
        held: b.held, deskRect: b.deskRect }}
      onShown={() => showMonth(monthKey(b.year, b.month), true)} onClosed={b === book ? bookClosed : () => undefined} onMode={onBookMode}
      onHomeward={b === book ? () => setNextWaiting(false) : undefined}
      onSaved={async () => { await reload(); }} onActions={setActionEntry} />)}
    {!!notice && <View pointerEvents="none" style={[s.noticeWrap, book ? { top: insets.top + 56 } : { bottom: insets.bottom + SHELF_FOOTER + 20 }]}><Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text></View>}
    {actionEntry && <JournalActions visible locked={journalLocked(actionEntry)} date={formatLocalDate(actionEntry.localDate)} reducedMotion={reducedMotion}
      onClose={() => setActionEntry(null)} onDelete={removeEntry}
      />}
    {history && session && <FlowerHistory userId={session.user.id} timezone={timezone} onClose={() => setHistory(false)} />}
    {confirmSwitch && book && <Sheet title="Unsaved journal" onClose={() => setConfirmSwitch(null)}>
      <Text style={s.body}>Your writing in {MONTH_NAMES[book.month - 1]} hasn’t been saved yet. You can keep writing, or open {MONTH_NAMES[confirmSwitch.month - 1]} now and
        come back to it: the draft stays in {MONTH_NAMES[book.month - 1]}’s book while you are in the Treehouse. It is only saved to your journal when you tap Save.</Text>
      <View style={{ gap: 10, marginTop: 14 }}>
        <ParchmentButton label="Keep writing" onPress={() => setConfirmSwitch(null)} />
        <ParchmentButton secondary label={`Open ${MONTH_NAMES[confirmSwitch.month - 1]}, keep the draft`}
          onPress={() => { const choice = confirmSwitch; setConfirmSwitch(null); void switchTo(choice, true); }} />
      </View>
    </Sheet>}
    {confirmClose && book && <Sheet title="Unsaved journal" onClose={keepWriting}>
      <Text style={s.body}>Your writing in {MONTH_NAMES[book.month - 1]} hasn’t been saved yet. You can keep writing, or close the book and come back to it: the
        draft stays in {MONTH_NAMES[book.month - 1]}’s book while you are in the Treehouse. It is only saved to your journal when you tap Save.</Text>
      <View style={{ gap: 10, marginTop: 14 }}>
        <ParchmentButton label="Keep writing" onPress={keepWriting} />
        <ParchmentButton secondary label={confirmClose.year !== null ? `Close the book, keep the draft, show ${confirmClose.year}` : 'Close the book, keep the draft'}
          onPress={() => { pendingYear.current = confirmClose.year; setConfirmClose(null); setCloseSignal(n => n + 1); }} />
      </View>
    </Sheet>}
    {confirmLeave && <Sheet title="Unsaved journal" onClose={() => setConfirmLeave(false)}>
      <Text style={s.body}>You have writing that hasn’t been saved yet. If you leave the Treehouse now, it will be lost.</Text>
      <View style={{ gap: 10, marginTop: 14 }}>
        <ParchmentButton label="Keep writing" onPress={() => setConfirmLeave(false)} />
        <ParchmentButton secondary label="Leave without saving" onPress={() => { drafts.clear(); setConfirmLeave(false); exit(); }} />
      </View>
    </Sheet>}
  </Animated.View>;
}

function Sheet({ title, onClose, children, theme, journal = false }: { title: string; onClose: () => void; children: React.ReactNode; theme?: PanelTheme; journal?: boolean }) {
  const insets = useSafeAreaInsets();
  return <Modal transparent animationType="fade" onRequestClose={onClose}><View style={[s.scrim, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
    <View style={[s.sheet, theme && { backgroundColor: theme.background, borderColor: theme.gold }, journal && s.journalSheet]}>{journal && <Image source={require('../../assets/bookhouse/desk.png')} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: .4 }]} />}<View style={[s.sheetHeader, theme && { borderColor: theme.border }]}><Text style={[s.title, theme && { color: theme.text }, journal && { fontSize: 27, paddingVertical: 14 }]}>{title}{journal ? ' ❧' : ''}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={s.smallButton}><Text style={[s.body, theme && { color: theme.text }]}>✕</Text></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 14 }}>{children}</ScrollView>
    </View></View></Modal>;
}
function FlowerHistory({ userId, timezone, onClose }: { userId: string; timezone: string; onClose: () => void }) {
  const [flowers, setFlowers] = useState<FlowerPlacementRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ id: string; content: string; messages: string[]; supports: number; secondary: string[] } | null>(null);
  const [detailError, setDetailError] = useState(''); const [detailBusy, setDetailBusy] = useState<string | null>(null);
  const version = useRef(0);
  const load = useCallback(async () => { setLoading(true); setError(''); try {
    const [records, placements] = await Promise.all([loadGardenPlacements(userId, userId, timezone), loadFlowerPlacements()]);
    const plantedDates = new Map(placements.map(p => [p.flowerId, p.plantedDate]));
    setFlowers(records.map(flower => ({ ...flower, plantedDate: flower.placementOrigin === 'LOCAL'
      ? plantedDates.get(flower.flowerId) || flower.plantedDate : flower.plantedDate })).sort((a, b) => b.plantedDate.localeCompare(a.plantedDate)));
  } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); } }, [userId, timezone]);
  useEffect(() => { void load(); return () => { version.current++; }; }, [load]);
  const inspect = async (flower: FlowerPlacementRecord) => {
    const request = ++version.current; setDetailBusy(flower.flowerId); setDetailError(''); setDetail(null);
    try { const [source, event] = await Promise.all([loadFlowerSource(userId, flower.flowerId), flower.sourceEventId ? readEvent(flower.sourceEventId) : Promise.resolve(null)]);
      if (request === version.current) setDetail({ id: flower.flowerId, content: event?.content || source.dailyCheckIn?.journal?.content || source.event || '',
        messages: (source.messages || []).map(m => `${m.author || m.senderName || 'Friend'}: ${m.text}`), supports: source.supportCount, secondary: event?.secondaryEmotions || flower.secondaryEmotions || [] });
    } catch (e) { if (request === version.current) setDetailError(errorMessage(e)); } finally { if (request === version.current) setDetailBusy(null); }
  };
  return <Sheet title="Flower History" onClose={onClose}>
    {loading ? <ActivityIndicator /> : error ? <><Text accessibilityRole="alert" style={s.body}>{error}</Text><Pressable accessibilityRole="button" onPress={load}><Text>Retry flower history</Text></Pressable></> : !flowers.length ? <Text style={s.body}>Your Garden has no flowers yet.</Text> : flowers.map(flower => <View key={flower.flowerId} style={s.historyEntry}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Read flower ${flower.flowerName} ${flower.flowerId}`} onPress={() => inspect(flower)} style={{ minHeight: 48 }}>
        <Text style={s.title}>{flower.flowerName}</Text><Text style={s.caption}>{moodName(flower.mood || '')} · {flower.sourceType || 'Flower'}</Text>
        <Text style={s.caption}>{flower.placementOrigin === 'LOCAL' ? 'Planted' : 'Created'} {new Date(flower.plantedDate).toLocaleDateString(undefined, { timeZone: timezone })} · {flower.supportCount} support</Text>
      </Pressable>
      {detailBusy === flower.flowerId && <ActivityIndicator />}
      {detail?.id === flower.flowerId && <View style={{ gap: 8 }}><Text selectable style={s.body}>{detail.content || 'No written entry attached.'}</Text><Text style={s.caption}>{detail.secondary.join(' · ') || 'No secondary emotions'} · {detail.supports} support</Text>
        {detail.messages.length ? detail.messages.map((message, i) => <Text key={i} style={s.body}>{message}</Text>) : <Text style={s.caption}>No messages received.</Text>}</View>}
    </View>)}
    {!!detailError && <Text accessibilityRole="alert" style={s.body}>{detailError}</Text>}
  </Sheet>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#38291F' },
  topBar: { height: TOP_BAR, paddingHorizontal: GUTTER, flexDirection: 'row', alignItems: 'center' },
  shelfFooter: { position: 'absolute', flexDirection: 'row', gap: 8 },
  inlineError: { fontFamily: serif, fontSize: 14, color: '#FFF1D6', textAlign: 'center', padding: 10, minHeight: 44 },
  noticeWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  notice: { fontFamily: serif, fontSize: 15, color: '#FFF3D8', backgroundColor: '#315E49F2', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, overflow: 'hidden' },
  // Writing and Flower History sheets (unchanged).
  journalSheet: { maxWidth: 760, borderRadius: 16, borderWidth: 2, shadowColor: '#180D06', shadowOpacity: .5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  cream: { color: '#FFF1D6', fontFamily: serif, fontSize: 15 }, smallButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 12 },
  title: { fontFamily: serif, fontSize: 18, color: '#345849' }, body: { fontFamily: serif, color: '#475448', fontSize: 15, lineHeight: 22 }, caption: { color: '#68745D', fontFamily: serif, fontSize: 12, lineHeight: 17 },
  scrim: { flex: 1, backgroundColor: '#231B16C9', paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' }, sheet: { width: '100%', maxWidth: 620, maxHeight: '100%', backgroundColor: '#F5EBD7', borderRadius: 18, borderWidth: 2, borderColor: '#C1A26E', overflow: 'hidden' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, borderBottomWidth: 1, borderColor: '#D4C3A3' },
  input: { minHeight: 150, color: '#28483C', backgroundColor: '#FFFBF1', borderWidth: 1, borderColor: '#A5B29B', padding: 14, borderRadius: 10, fontSize: 16, textAlignVertical: 'top' }, save: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#315E49', borderRadius: 24 }, historyEntry: { borderBottomWidth: 1, borderColor: '#D4C3A3', paddingBottom: 12 },
});
