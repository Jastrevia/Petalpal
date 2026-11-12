import { pavilionScene, pavilionGeometry, pavilionPages, pavilionFullLeaves, pavilionReadingCamera, PAVILION, PAVILION_CLOTH } from '../components/bookhouse/pavilionMotion';
import { PavilionBook, PavilionEngraving, usePavilionSpines } from '../components/bookhouse/PavilionBook';
import { PAVILION_TEXT } from '../components/bookhouse/pavilionText';
import { cancelAnimation, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { OPEN_MS, CLOSE_MS, OPEN_STAGES, CLOSE_STAGES, openTiming, closeTiming } from '../components/bookhouse/book3d/motion';
import { EmotionalSafetyNote } from '../components/features/EmotionalSafetyNote';
import { AiOutputReport } from '../components/features/AiPrivacySettings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { pavilionAutoOpen, pavilionMonth, pavilionPages as monthEntrancePages } from '../services/pavilionMonth';
import { useAuth } from '../services/auth';
import { useWorldTime } from '../components/garden/world-time';
import { createLastMonthReflection, createLastWeekReflection, lastClosedMonthKey, lastClosedWeekKey, listReflections, readReflection, monthly2, shortWeekly, weekLabel, weeklyTriggerOutcome, type ReflectionReport, type ReportType, type SavedReport, type ShortLocale } from '../services/reflections';
import { ShortWeeklyReport } from '../components/features/ShortWeeklyReport';
import { PetalCollection } from '../components/features/PetalCollection';
import { MonthlyReport2 } from '../components/features/MonthlyReport2';
import { PavilionBookReader } from '../components/bookhouse/PavilionBookReader';
import { useAppLocale } from '../services/locale';

// The shelf's books: Weekly, Monthly, the third one, notes about the reflections (safety note, disclaimers), and the
// cream fourth one, the 花语集 (petal cards, kept insights, threads, letters, muted words).
type Book = ReportType | 'notes' | 'collection';
const BOOKS: Book[] = ['weekly', 'monthly', 'notes', 'collection'];
const rectStyle = (r: { x: number; y: number; width: number; height: number }) => ({ left: r.x, top: r.y, width: r.width, height: r.height });
// Every label on this screen follows the app language; saved reflections keep their own words.
const CHROME = {
  en: { book: { weekly: 'Weekly', monthly: 'Monthly', notes: 'Instruction', collection: 'Flower Language Collection' }, unit: { weekly: 'week', monthly: 'month' },
    reportOutput: 'Report final output', notesTitle: 'About these reflections', notes: [
      'Your petal card is only a way to look back at yourself. It is not a prediction, and it cannot replace professional help.',
      'Every number and every quote in a reflection is found by the app in your own entries; AI only words them, and any sentence that does not match what you wrote is left out.',
      'Don’t want to see an insight? Tap Hide under it. If something in a reflection seems wrong, report it at the end of that reflection.',
      'Keep an insight or a card and it waits in the cream Petal collection book. Follow an insight and each Weekly reports on that thread (up to three). Write an entry to answer a question and the next Weekly quotes your answer.',
      'In the Petal collection you can write one sentence to a later week, withdraw it before its day, and list names or topics that insights must never use.'],
    title: (type: ReportType) => `Your ${type === 'weekly' ? 'Weekly' : 'Monthly'} Reflection`, shelf: (type: Book) => type === 'collection' ? 'Flower Language Collection' : type === 'notes' ? 'Instruction' : `${type === 'weekly' ? 'Weekly' : 'Monthly'} reflections`,
    inProgress: ' · In progress', writing: (type: ReportType) => `Writing last ${type === 'weekly' ? 'week' : 'month'}’s reflection…`,
    loading: 'Loading reflection', tryLoad: 'Try loading again', tryRead: 'Try reading again', loadFailed: 'Unable to load saved reflections.',
    readFailed: 'Unable to read this reflection.', emptyTitle: 'A place to look back', empty: (type: ReportType) => `No saved ${type} reflections yet.`,
    emptyBody: 'When a reflection is available, you can return here to revisit its moments, themes and patterns.',
    older: ' You can also look through older reflections.', noText: 'No written reflection is available for this saved report.',
    tabs: { Summary: 'Summary', Topics: 'Topics', Patterns: 'Patterns' }, themes: (type: ReportType) => `Your ${type === 'weekly' ? 'Weekly' : 'Monthly'} Themes`,
    recorded: (n: number) => `${n} recorded`, noThemes: 'No themes recorded in this reflection.', patterns: 'Notable Patterns',
    change: (n: number, type: ReportType) => `Recorded events: ${n > 0 ? '+' : ''}${n} compared with the previous ${type === 'weekly' ? 'week' : 'month'}.`,
    notEnough: 'There isn’t enough recorded evidence to compare periods.',
    footer: (n: number) => `${n} recorded ${n === 1 ? 'event' : 'events'} · Saved reflection`, of: (i: number, n: number) => `${i} of ${n}`,
    previous: (type: ReportType) => `Previous ${type === 'weekly' ? 'week' : 'month'}`, next: (type: ReportType) => `Next ${type === 'weekly' ? 'week' : 'month'}`,
    close: 'Close Reflections', putBack: 'Put the book back on the shelf', lantern: 'Lantern — night lighting', lanternHint: 'Turn the lantern on for night, or off for day',
    kept: 'Your reflections, kept here.' },
  'zh-Hans': { book: { weekly: '周报', monthly: '月报', notes: '使用说明', collection: '花语集' }, unit: { weekly: '周', monthly: '月' },
    reportOutput: '举报最终内容', notesTitle: '关于这些回看', notes: [
      '花语卡只是陪你回看自己，不是预测，也不能代替专业的帮助。',
      '回看里的每个数字、每句原话，都是程序从你自己的记录里找出来的；AI 只负责把它们说通顺，和你写过的话对不上的句子不会出现。',
      '不想看到某一条，可以点它下面的「隐藏」。觉得哪份回看有问题，可以在那份回看的最后举报。',
      '收藏的洞察和花语卡都在书架上奶白色的“花语集”里。跟进一条洞察，之后每份周报都会说说这条线（最多 3 条）。点“写一条来回答”写下的记录，下周的周报会引用它。',
      '在花语集里可以写一句话给之后的某一周，到那天之前都能撤回；也可以写下不想出现在洞察里的人名或主题。'],
    title: (type: ReportType) => type === 'weekly' ? '你的周报' : '你的月报', shelf: (type: Book) => type === 'collection' ? '花语集' : type === 'notes' ? '使用说明' : type === 'weekly' ? '周报' : '月报',
    inProgress: ' · 还在写', writing: (type: ReportType) => type === 'weekly' ? '正在写上周的周报…' : '正在写上个月的月报…',
    loading: '正在打开', tryLoad: '重新加载', tryRead: '重新打开', loadFailed: '没能打开保存的回看。', readFailed: '没能打开这份回看。',
    emptyTitle: '回看的地方', empty: (type: ReportType) => type === 'weekly' ? '还没有保存的周报。' : '还没有保存的月报。',
    emptyBody: '有回看的时候，可以回到这里，再看看那些时刻、主题和规律。', older: '也可以翻看更早的。', noText: '这份记录没有文字回看。',
    tabs: { Summary: '摘要', Topics: '主题', Patterns: '规律' }, themes: (type: ReportType) => type === 'weekly' ? '这周的主题' : '这个月的主题',
    recorded: (n: number) => `${n} 次`, noThemes: '这次没有记下主题。', patterns: '值得留意的规律',
    change: (n: number, type: ReportType) => `记录数和上${type === 'weekly' ? '周' : '个月'}相比：${n > 0 ? '+' : ''}${n}。`,
    notEnough: '记录还不多，暂时不比较。',
    footer: (n: number) => `${n} 条记录 · 已保存`, of: (i: number, n: number) => `${i} / ${n}`,
    previous: (type: ReportType) => type === 'weekly' ? '上一周' : '上一个月', next: (type: ReportType) => type === 'weekly' ? '下一周' : '下一个月',
    close: '关闭回看', putBack: '把书放回书架', lantern: '灯笼 · 夜晚灯光', lanternHint: '点亮灯笼是夜晚，熄灭回到白天', kept: '你的回看都收在这里。' },
} as const;
function period(report: SavedReport, lang: ShortLocale) {
  if (report.type === 'monthly') {
    const match = report.periodKey.match(/(\d{4})-(\d{2})/);
    if (match) return lang === 'zh-Hans' ? `${Number(match[1])}年${Number(match[2])}月`
      : new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return weekLabel(report.periodKey, lang).chip;
}
function heading(report: SavedReport, lang: ShortLocale) {
  if (report.type !== 'weekly') return period(report, lang);
  const label = weekLabel(report.periodKey, lang);
  return label.range ? `${label.title} · ${label.range}` : label.title;
}
const pavilionReference = require('../../assets/reflection/pavilion-reference-v3.webp');
const pavilionEmpty = require('../../assets/reflection/pavilion-empty-v3.webp');
const pavilionNight = require('../../assets/reflection/pavilion-night-v1.webp');
const parchment = require('../../assets/bookhouse/journal/parchment.webp');
type Section = 'Summary' | 'Topics' | 'Patterns';
const TURN_MS = 680;

// Below this width the screen shows part of the wide layout and a finger moves across it.
const PHONE_MAX_WIDTH = 640;
// Up to 25 pages of 20 (about nine years of Weekly and Monthly reflections).
const MAX_REPORT_PAGES = 25;
export default function Reflection() {
  const router = useRouter();
  // A Garden month sign opens the pavilion at its month (/reflection?month=1…12); anything else is no month.
  const { month: requestedMonth } = useLocalSearchParams<{ month?: string }>();
  const monthNumber = pavilionMonth(requestedMonth);
  const auth = useAuth();
  const lang = useAppLocale(), t = CHROME[lang];
  // A phone lays the pavilion out as a wide screen does, the painting as tall as the screen and so
  // wider than it, the books and the open book at their own size; a finger moves the view across.
  const screen = useWindowDimensions();
  const phone = screen.width < PHONE_MAX_WIDTH;
  const height = screen.height;
  const width = phone ? Math.max(PHONE_MAX_WIDTH, screen.height * PAVILION.width / PAVILION.height) : screen.width;
  const { isTreehouseLightingTime: worldNight } = useWorldTime();
  const [nightOverride, setNightOverride] = useState<boolean | null>(null);
  const night = (__DEV__ ? nightOverride : null) ?? worldNight;
  const lighting = useRef(new Animated.Value(night ? 1 : 0)).current;
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(lighting, { toValue: night ? 1 : 0, duration: reducedMotion ? 0 : 1800, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [night, reducedMotion, lighting]);
  const [type, setType] = useState<ReportType>(monthNumber === null ? 'weekly' : 'monthly');
  // The pavilion opens with every book on the shelf. Tapping one pulls it out, carries it to the desk and opens it
  // (the green book is Weekly, the blue Monthly, the purple one the notes about them).
  const [open, setOpen] = useState<Book | null>(null);
  const spines = usePavilionSpines(lang);
  const pavilionText = PAVILION_TEXT[lang];
  const instructionFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const fade = Animated.timing(instructionFade, { toValue: open ? 0 : 1,
      duration: reducedMotion ? 0 : open ? 180 : 360, useNativeDriver: true });
    fade.start(); return () => fade.stop();
  }, [open, reducedMotion, instructionFade]);
  // `notes`: a book without reports (the notes or the 花语集), shown as one scrolling page.
  const notes = open === 'notes' || open === 'collection';
  const onBook = (book: Book) => open === book;
  const [flying, setFlying] = useState<Book | null>(null);
  const timeline = useSharedValue(0), focus = useSharedValue(0);
  const contentFade = useRef(new Animated.Value(0)).current;
  const busy = useRef(false), pendingBook = useRef<Book | null>(null);
  const [bookDrawn, setBookDrawn] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // Development-only handles for the local preview's checks; never in a release build.
    if (__DEV__ && typeof window !== 'undefined') {
      (window as any).__reflectionDebug = {
        get open() { return open; },
        timeline,
        focus,
        openBook,
        closeBook,
        pauseAt: (t: number) => { cancelAnimation(timeline); timeline.value = t; },
        setLocale: (loc: 'en' | 'zh-Hans') => auth.updateLocale?.(loc),
        setOpenBook: (book: Book | null, t = 0) => {
          cancelAnimation(timeline);
          busy.current = false;
          if (book) {
            if (book === 'weekly' || book === 'monthly') setType(book);
            setOpen(book);
            setFlying(book);
            setBookDrawn(true);
            timeline.value = t;
          } else {
            setOpen(null);
            setFlying(null);
            setBookDrawn(false);
            timeline.value = 0;
          }
        },
      };
    }
  }, [open, timeline, focus, auth]);
  useEffect(() => () => { cancelAnimation(timeline); cancelAnimation(focus); contentFade.stopAnimation(); }, [timeline, focus, contentFade]);
  function revealContent() {
    Animated.timing(contentFade, { toValue: 1, duration: reducedMotion ? 0 : 180, useNativeDriver: true }).start();
  }
  function finishOpen() { setFlying(null); busy.current = false; revealContent(); }
  function bookReady() {
    setBookDrawn(true);
    timeline.value = withTiming(1, { duration: reducedMotion ? 0 : OPEN_MS, easing: openTiming(OPEN_STAGES) },
      done => { if (done) runOnJS(finishOpen)(); });
  }
  function startBook(book: Book) {
    if (book === 'weekly' || book === 'monthly') setType(book);
    busy.current = true; setBookDrawn(false); setFocused(false);
    timeline.value = 0; focus.value = 0; contentFade.setValue(0);
    setOpen(book); setFlying(book);
    // Start only once the illustrated spine and paper are decoded. Until then,
    // its shelf copy remains in place, so no book disappears while assets load.
  }
  function openBook(book: Book) {
    if (busy.current || book === open) return;
    if (open) { pendingBook.current = book; closeBook(); return; }
    startBook(book);
  }
  function finishReturn() {
    setOpen(null); setFlying(null); setBookDrawn(false); setFocused(false); busy.current = false;
    const next = pendingBook.current; pendingBook.current = null;
    if (next) startBook(next);
  }
  function returnToShelf() {
    timeline.value = withTiming(0, { duration: reducedMotion ? 0 : CLOSE_MS, easing: closeTiming(CLOSE_STAGES) },
      done => { if (done) runOnJS(finishReturn)(); });
  }
  function closeBook() {
    if (busy.current || !open || turning) return;
    busy.current = true; setFlying(open);
    Animated.timing(contentFade, { toValue: 0, duration: reducedMotion ? 0 : 100, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      if (focused) {
        focus.value = withTiming(0, { duration: reducedMotion ? 0 : 300 }, done => { if (done) runOnJS(returnToShelf)(); });
      } else returnToShelf();
    });
  }
  function finishFocus(next: boolean) { setFocused(next); busy.current = false; setFlying(null); revealContent(); }
  function toggleFocus() {
    if (busy.current || turning || !open) return;
    busy.current = true; setFlying(open);
    const next = !focused;
    Animated.timing(contentFade, { toValue: 0, duration: reducedMotion ? 0 : 90, useNativeDriver: true }).start(({ finished }) => {
      if (finished) focus.value = withTiming(next ? 1 : 0, { duration: reducedMotion ? 0 : 350 },
        done => { if (done) runOnJS(finishFocus)(next); });
    });
  }
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  // One page per period, oldest first. null = the newest page.
  const [pageId, setPageId] = useState<Record<ReportType, string | null>>({ weekly: null, monthly: null });
  const [details, setDetails] = useState<Record<string, ReflectionReport>>({});
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [listError, setListError] = useState('');
  const [readError, setReadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [section, setSection] = useState<Section>('Summary');
  const listAbort = useRef<AbortController | null>(null);
  async function load(older?: string) {
    listAbort.current?.abort();
    const controller = new AbortController(); listAbort.current = controller;
    setLoading(true); setListError('');
    try {
      const result = await listReflections(older, controller.signal);
      if (controller.signal.aborted) return;
      setReports(previous => older ? [...previous, ...result.reports] : result.reports);
      setCursor(result.nextCursor);
      // Every earlier reflection belongs in the books too (the server pages 20 at a time, newest
      // first): the first page shows at once, the rest follow in the background.
      let next = result.nextCursor;
      for (let page = 0; next && page < MAX_REPORT_PAGES; page++) {
        const more = await listReflections(next, controller.signal);
        if (controller.signal.aborted) return;
        setReports(previous => [...previous, ...more.reports.filter(report => !previous.some(seen => seen.id === report.id))]);
        next = more.nextCursor; setCursor(next);
      }
    } catch (error) {
      if (!controller.signal.aborted) setListError(lang === 'en' && error instanceof Error ? error.message : t.loadFailed);
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => listAbort.current?.abort(); }, []);

  // Back to the Garden already underneath; replacing would mount a second Garden each visit.
  const leave = () => router.canGoBack() ? router.back() : router.dismissTo('/');
  const insets = useSafeAreaInsets();
  // A month entrance shows only that month's Monthly reports, never a different month's.
  const pages = monthEntrancePages(reports, type, monthNumber);
  const found = pages.findIndex(report => report.id === pageId[type]);
  const index = found >= 0 ? found : pages.length - 1;
  const selected = pages[index] ?? null;
  const show = (report: SavedReport) => setPageId(previous => ({ ...previous, [report.type]: report.id }));

  // A month entrance (a Garden sign) opens that month's book by itself: once per requested month, and only once the
  // shared spine textures exist. Opening earlier mounted the moving book mid-load on a cold start (the startup crash).
  // Later spine rebuilds, re-renders or closing the book never open it again.
  const autoOpened = useRef<number | null>(null);
  useEffect(() => {
    if (!pavilionAutoOpen(monthNumber, !!spines, autoOpened.current)) return;
    autoOpened.current = monthNumber;
    setPageId(previous => ({ ...previous, monthly: null }));
    openBook('monthly');
  }, [monthNumber, spines]);
  // That month's report may be on an older page of the list: keep loading pages until it appears or the list ends.
  useEffect(() => {
    if (monthNumber !== null && type === 'monthly' && !loading && !listError && cursor && pages.length === 0) void load(cursor);
  }, [monthNumber, type, loading, listError, cursor, pages.length]);

  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [creatingType, setCreatingType] = useState<ReportType | null>(null);
  const [openPeriod, setOpenPeriod] = useState<{ type: ReportType; periodKey: string } | null>(null);
  const createAbort = useRef<AbortController | null>(null);
  useEffect(() => () => createAbort.current?.abort(), []);
  async function createLast(kind: ReportType) {
    if (creating) return;
    const controller = new AbortController(); createAbort.current = controller;
    setCreating(true); setCreatingType(kind); setNotice('');
    const create = kind === 'weekly' ? createLastWeekReflection : createLastMonthReflection;
    const period = kind === 'weekly' ? 'week' : 'month';
    let outcome;
    try { outcome = weeklyTriggerOutcome(await create(controller.signal), undefined, period, lang); }
    catch (error) { outcome = weeklyTriggerOutcome(undefined, error, period, lang); }
    if (controller.signal.aborted) return;
    setCreating(false); setNotice(outcome.kind === 'ready' ? '' : outcome.message);
    if ((outcome.kind === 'ready' || outcome.kind === 'empty') && outcome.periodKey) {
      setOpenPeriod({ type: kind, periodKey: outcome.periodKey }); await load();
    }
  }
  // Opening a book writes its last closed period's reflection once per visit when it is missing.
  // The server still picks the period and keeps one job per period, so this never repeats a charge.
  const autoCreated = useRef<Record<ReportType, boolean>>({ weekly: false, monthly: false });
  useEffect(() => {
    if (loading || listError || creating || autoCreated.current[type]) return;
    // A month entrance only reads that month's saved reports; it never writes last month's.
    if (type === 'monthly' && monthNumber !== null) return;
    const lastKey = type === 'weekly' ? lastClosedWeekKey() : lastClosedMonthKey();
    if (reports.some(report => report.type === type && report.periodKey === lastKey)) return;
    autoCreated.current[type] = true; void createLast(type);
  }, [type, loading, listError, reports, creating, monthNumber]);
  // A finished reflection opens on its own book's page, but never switches books: the owner may
  // have tapped the other book while it was being written (Weekly and Monthly write one at a time).
  useEffect(() => {
    const created = openPeriod ? reports.find(report => report.type === openPeriod.type && report.periodKey === openPeriod.periodKey) : undefined;
    if (created) { setOpenPeriod(null); show(created); }
  }, [reports, openPeriod]);

  // Read the open page; quietly prefetch its neighbours so a turn can show both faces.
  useEffect(() => {
    setReadError(''); setSection('Summary');
    if (!selected) { setReading(false); return; }
    const controller = new AbortController();
    const fetchDetail = (report: SavedReport | undefined, visible: boolean) => {
      if (!report || details[report.id]) return;
      if (visible) setReading(true);
      readReflection(report, controller.signal).then(result => {
        if (!controller.signal.aborted) setDetails(previous => ({ ...previous, [report.id]: result }));
      }).catch(error => {
        if (visible && !controller.signal.aborted) setReadError(lang === 'en' && error instanceof Error ? error.message : t.readFailed);
      }).finally(() => { if (visible && !controller.signal.aborted) setReading(false); });
    };
    if (details[selected.id]) setReading(false);
    fetchDetail(selected, true); fetchDetail(pages[index - 1], false); fetchDetail(pages[index + 1], false);
    return () => controller.abort();
  }, [selected?.id, retry]);

  // Page turn: one leaf rotates around the spine (Journal technique). Forward: the right
  // page swings left and its back is the next period's left page; backward reverses it.
  const [turning, setTurning] = useState<{ from: number; to: number } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const locked = useRef(false);
  useEffect(() => () => progress.stopAnimation(), [progress]);
  async function turn(direction: number) {
    const to = index + direction, target = pages[to];
    if (locked.current || busy.current || !target) return;
    locked.current = true;
    if (!details[target.id]) {
      try { const result = await readReflection(target); setDetails(previous => ({ ...previous, [target.id]: result })); } catch {}
    }
    if (reducedMotion) { show(target); locked.current = false; return; }
    progress.setValue(0); setTurning({ from: index, to });
    Animated.timing(progress, { toValue: 1, duration: TURN_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (finished) show(target);
      setTurning(null); locked.current = false;
    });
  }
  const turnRef = useRef(turn); turnRef.current = turn;
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
    onPanResponderRelease: (_event, g) => { if (Math.abs(g.dx) > 50) void turnRef.current(g.dx < 0 ? 1 : -1); },
  })).current;

  useEffect(() => { focus.value = 0; setFocused(false); }, [width, height, focus]);
  // A phone: each page of the open book fits the screen's width, with a small margin (the spread is two pages wide).
  const scene = useMemo(() => pavilionScene(width, height, phone ? 2 * (screen.width - 16) : undefined), [width, height, phone, screen.width]);
  const instructionLeft = Math.max(12, scene.art.x + scene.art.width * .105);
  const instructionWidth = Math.min(width - 12, scene.art.x + scene.art.width * .96) - instructionLeft;
  const instructionTop = scene.art.y + scene.art.height * .63 - 22;
  // A phone frames the painting to fill its screen (scene.compact crops toward the shelf), and the
  // book opens on the desk as the same two-page spread a wide screen shows (owner, 2026-11-08).
  const compact = false, wide = false;
  // The first view frames the shelf; opening a book glides to its left page (the right one is a drag
  // away), and putting it back glides to the shelf again. A sideways drag looks anywhere in between.
  const panMin = phone ? Math.min(0, screen.width - width) : 0;
  const pan = useRef(new Animated.Value(0)).current;
  const panAt = useRef<number | null>(null);
  const panning = useRef({ min: 0, max: 0 });
  // A phone with a book open: where the view rests so that one whole page (left, right) is centred on the screen.
  const snaps = useRef<number[] | null>(null);
  // The tap a browser may still send when a drag ends must not open or put back a book.
  const draggedAt = useRef(0);
  const justDragged = () => Date.now() - draggedAt.current < 300;
  panning.current = { min: panMin, max: 0 };
  const clampPan = (value: number) => Math.min(panning.current.max, Math.max(panning.current.min, value));
  const shelf = { left: scene.slot('weekly').x, right: scene.slot('collection').x + scene.slot('collection').width };
  const shelfFrame = clampPan(screen.width / 2 - (shelf.left + shelf.right) / 2);
  const bookFrame = clampPan(12 - scene.table.x);
  const framing = phone ? (open ? bookFrame : shelfFrame) : 0;
  useEffect(() => {
    const first = panAt.current === null;
    panAt.current = framing;
    if (first) { pan.setValue(framing); return; }
    Animated.timing(pan, { toValue: framing, duration: reducedMotion ? 0 : 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [framing]);
  const lookAround = useRef(PanResponder.create({
    // Capture: a sideways drag that starts on a book or on the desk is a look-around, never a tap.
    onMoveShouldSetPanResponderCapture: (_event, g) => panning.current.min < 0 && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => pan.stopAnimation(value => { panAt.current = value; }),
    onPanResponderMove: (_event, g) => { draggedAt.current = Date.now(); pan.setValue(clampPan((panAt.current ?? 0) + g.dx)); },
    onPanResponderRelease: (_event, g) => {
      draggedAt.current = Date.now();
      // A flick carries on a little, as a hand-moved picture would.
      const loose = clampPan((panAt.current ?? 0) + g.dx + g.vx * 160);
      // With a book open the view settles on a whole page, never between two.
      const to = snaps.current ? snaps.current.reduce((best, snap) => Math.abs(snap - loose) < Math.abs(best - loose) ? snap : best) : loose;
      panAt.current = to;
      Animated.timing(pan, { toValue: to, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    },
    onPanResponderTerminate: (_event, g) => { panAt.current = clampPan((panAt.current ?? 0) + g.dx); pan.setValue(panAt.current); },
  })).current;
  const sceneWidth = width, artHeight = scene.art.height;
  const geometry = useMemo(() => pavilionGeometry(scene, open ?? 'weekly'), [scene, open]);
  const leaves = useMemo(() => pavilionFullLeaves(geometry.layout, focused), [geometry, focused]);
  snaps.current = phone && open ? [leaves.left, leaves.right].map(leaf => clampPan((screen.width - leaf.width) / 2 - leaf.x)) : null;
  const compactBookTop = Math.min(scene.art.height * .36, height * .32);
  // Phones keep the chapter bookmarks outside the page's right edge, as on wide screens.
  const compactTabs = open === 'collection' || open === 'notes' ? 40 : 0;
  const compactBookWidth = Math.min(440, width - 24 - compactTabs);
  const compactBookLeft = (width - compactBookWidth - compactTabs) / 2;
  const readingCamera = useMemo(() => pavilionReadingCamera(width), [width]);
  const compactBookHeight = Math.max(380, height - compactBookTop - 20);

  const readingRect = compact ? {
    x: compactBookLeft,
    y: compactBookTop,
    width: compactBookWidth,
    height: compactBookHeight,
  } : {
    x: leaves.left.x, y: Math.min(leaves.left.y, leaves.right.y),
    width: leaves.right.x + leaves.right.width - leaves.left.x,
    height: Math.max(leaves.left.height, leaves.right.height),
  };
  const area = { left: 0, top: 0, width: readingRect.width, height: readingRect.height };
  const pageWidth = leaves.right.width;
  const backwards = !!turning && turning.to < turning.from;
  const angle = progress.interpolate({ inputRange: [0, 1], outputRange: backwards ? ['-180deg', '0deg'] : ['0deg', '-180deg'] });
  const faceOpacity = (front: boolean) => progress.interpolate({ inputRange: [0, .499, .501, 1],
    outputRange: front === !backwards ? [1, 1, 0, 0] : [0, 0, 1, 1] });
  const bookCloth = PAVILION_CLOTH[open ?? 'weekly'];
  const accent = type === 'weekly' ? '#55704A' : '#3B5F8C', bookInk = type === 'weekly' ? '#34472F' : '#2A4466';
  const paper = (_side: 'left' | 'right') => <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F3E4C7' }]}>
    <Image source={parchment} style={StyleSheet.absoluteFill} resizeMode="stretch" />
  </View>;

  const weekly2Of = (report: SavedReport | null) => {
    const detail = report ? details[report.id] : null;
    if (detail && report?.type === 'monthly') { const month = monthly2(detail); return month ? { detail, short: null, month } : null; }
    const short = detail && report?.type === 'weekly' ? shortWeekly(detail) : null;
    return detail && short?.version2 ? { detail, short, month: null } : null;
  };
  const weekly2Page = (report: SavedReport, part: 'left' | 'right' | 'all', interactive: boolean) => {
    const found = weekly2Of(report)!, label = weekLabel(report.periodKey, lang);
    if (found.month) return <MonthlyReport2 month={found.month} part={part} interactive={interactive}
      date={heading(report, lang) + (report.status === 'PARTIAL' ? t.inProgress : '')}
      report={interactive ? <View style={{ marginTop: 8 }}><AiOutputReport kind="monthly" outputId={found.detail.id} linkStyle={s.quietLink} title={t.reportOutput} /></View> : null} />;
    return <ShortWeeklyReport short={found.short!} interactive={interactive} reportId={found.detail.id} reducedMotion={reducedMotion} part={part}
      date={{ eyebrow: lang === 'en' ? label.title.toUpperCase() : label.title, range: label.range + (report.status === 'PARTIAL' ? t.inProgress : '') }}
      report={interactive ? <View style={{ marginTop: 8 }}><AiOutputReport kind="weekly" outputId={found.detail.id} linkStyle={s.quietLink} title={t.reportOutput} /></View> : null}
      onWrite={() => router.dismissTo({ pathname: '/', params: { feature: 'events' } })} />;
  };

  function leftFace(report: SavedReport | null, interactive: boolean) {
    const detail = report ? details[report.id] ?? null : null;
    const shown: Section = interactive ? section : 'Summary';
    const spread = weekly2Of(report);
    // The third book: the safety note and the disclaimers that used to sit inside the reflections.
    const notesPage = open === 'collection' ? <PetalCollection headingSize={compact ? 20 : Math.max(20, Math.min(25, sceneWidth * .024))} />
      : <View style={{ flex: 1, minHeight: 0 }}>
      <Text accessibilityRole="header" style={[s.heading, { fontSize: compact ? 20 : Math.max(20, Math.min(25, sceneWidth * .024)), marginBottom: 12 }]}>{t.notesTitle}</Text>
      <ScrollView style={{ flex: 1 }}>
        <EmotionalSafetyNote style={s.notesText} />
        {t.notes.map((line, i) => <Text key={i} style={[s.notesText, { marginTop: 12 }]}>{line}</Text>)}
      </ScrollView>
    </View>;
    return <View style={{ flex: 1, minHeight: 0, paddingRight: compact ? 0 : 30, flexDirection: wide ? 'row' : 'column', gap: wide ? 22 : 0 }}>
      <View style={wide ? { width: '42%', minHeight: 0 } : notes && interactive ? { flex: 1, minHeight: 0 } : undefined}>
      {notes && interactive ? (wide ? null : notesPage) : <>
      {!spread && <>
      <Text accessibilityRole="header" style={[s.heading, compact && { color: bookInk }, { fontSize: compact ? 22 : Math.max(21, Math.min(27, sceneWidth * .026)) }]}>{t.title(type)}</Text>
      {report && (report.type === 'weekly'
        ? <><Text style={s.eyebrow}>{lang === 'en' ? weekLabel(report.periodKey, lang).title.toUpperCase() : weekLabel(report.periodKey, lang).title}</Text>
          {!!weekLabel(report.periodKey, lang).range && <Text style={s.range}>{weekLabel(report.periodKey, lang).range}{report.status === 'PARTIAL' ? t.inProgress : ''}</Text>}</>
        : <Text style={s.range}>{heading(report, lang)}{report.status === 'PARTIAL' ? t.inProgress : ''}</Text>)}
      </>}
      {interactive && creatingType === type && (creating || !!notice) && <View testID="reflection-create-status" accessibilityLiveRegion="polite" style={s.status}>
        {creating && <ActivityIndicator size="small" color="#8B6C44" accessible={false} />}
        <Text style={s.statusText}>{creating ? t.writing(type) : notice}</Text>
      </View>}
      {!spread && <View accessible={false} style={s.ornament}><View style={s.goldLine} /><Text style={s.fleuron}>❦</Text><View style={s.goldLine} /></View>}
      {/* A phone on its side: the 2.0 left page fills this column and its right page the other. */}
      {wide && spread && report && !notes && <View key={`${report.id}-left`} style={{ flex: 1, minHeight: 0 }}>{weekly2Page(report, 'left', interactive)}</View>}
      {compact && detail && !spread && <View style={s.textTabs}>{(['Summary', 'Topics', 'Patterns'] as const).map(item => <Pressable key={item} accessibilityRole="tab"
        accessibilityState={{ selected: shown === item, disabled: !interactive || !detail }} aria-selected={shown === item} disabled={!interactive || !detail}
        onPress={() => setSection(item)} style={[s.textTab, shown === item && { borderColor: accent }]}><Text style={[s.small, shown === item && s.textTabTextOn]}>{t.tabs[item]}</Text></Pressable>)}</View>}
      </>}
      </View>
      {notes && interactive && wide && <View style={[{ flex: 1, minHeight: 0 }, s.gutter]}>{notesPage}</View>}
      {!(notes && interactive) && <View style={[{ flex: 1, minHeight: 0 }, wide && s.gutter]}>
      {interactive && (loading || reading) && <ActivityIndicator color="#6E744E" accessibilityLabel={t.loading} />}
      {interactive && !!listError && <><Text style={s.body}>{listError}</Text><Pressable accessibilityRole="button" onPress={() => void load(cursor || undefined)}><Text style={s.link}>{t.tryLoad}</Text></Pressable></>}
      {interactive && !!readError && <><Text style={s.body}>{readError}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={s.link}>{t.tryRead}</Text></Pressable></>}
      {/* Weekly 2.0 pages never scroll: they turn (ShortWeeklyReport's Paged). */}
      {detail && spread && report ? <View key={report.id} style={{ flex: 1, minHeight: 0 }}>{weekly2Page(report, wide ? 'right' : compact ? 'all' : 'left', interactive)}</View>
      : <ScrollView key={`${report?.id}-${shown}`} style={{ flex: 1 }} scrollEnabled={interactive} contentContainerStyle={{ paddingBottom: 15 }}>
        {interactive && !loading && !listError && !report && <View style={{ paddingTop: compact ? 4 : 20 }}>
          <Text style={[s.heading, { fontSize: compact ? 20 : 22, marginBottom: compact ? 8 : 15 }]}>{t.emptyTitle}</Text>
          <Text style={s.body}>{t.empty(type)}</Text>
          <Text style={s.body}>{t.emptyBody}{cursor ? t.older : ''}</Text>
          <Image source={require('../../assets/garden/environment/flowers/ivory_wildflowers.png')} resizeMode="contain" style={{ width: 105, height: 80, marginTop: 8, opacity: .8 }} accessible={false} />
        </View>}
        {detail && !spread && <>
          {shown === 'Summary' && (() => {
            const short = shortWeekly(detail);
            if (short) return <ShortWeeklyReport short={short} interactive={interactive} reportId={detail.id} reducedMotion={reducedMotion}
              onWrite={() => router.dismissTo({ pathname: '/', params: { feature: 'events' } })} />;
            const text = detail.summary || detail.narrativeSections?.map(item => item.claim).join('\n\n') || t.noText;
            return <Text selectable={interactive} style={s.body}><Text style={[s.initial, { color: accent }]}>{text.slice(0, 1)}</Text>{text.slice(1)}</Text>;
          })()}
          {(shown === 'Summary' || shown === 'Topics') && <>
            <Text style={s.sectionHeading}>{t.themes(type)}</Text>
            {detail.topTopics?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 17 }}>{detail.topTopics.map(item => <View key={item.topic} style={s.topic}>
              <Text style={{ color: '#85905D', fontSize: 26 }}>❧</Text><Text style={s.ink}>{item.topic}</Text><Text style={s.small}>{t.recorded(item.count)}</Text>
            </View>)}</View> : <Text style={s.body}>{t.noThemes}</Text>}
          </>}
          {(shown === 'Summary' || shown === 'Patterns') && <>
            <Text style={s.sectionHeading}>❧  {t.patterns}</Text>
            {detail.trendSignals?.status === 'ok' ? <>
              {typeof detail.trendSignals.eventCountChange === 'number' && <Text style={s.body}>{t.change(detail.trendSignals.eventCountChange, type)}</Text>}
              {detail.trendSignals.topicChanges?.map(item => <Text key={item.topic} selectable={interactive} style={s.pattern}>❧  {item.topic}: {item.previousCount} → {item.currentCount}</Text>)}
            </> : <Text style={s.body}>{t.notEnough}</Text>}
          </>}
          {interactive && <View style={{ marginTop: 6, marginBottom: 12 }}><AiOutputReport kind={type} outputId={detail.id} title={t.reportOutput} /></View>}
          {compact && rightFace(report)}
        </>}
      </ScrollView>}
      {detail && <Text style={[s.small, { paddingTop: 7, borderTopWidth: 1, borderColor: '#AA8B5933' }]}>{t.footer(detail.eventCount)}</Text>}
      </View>}
    </View>;
  }
  function rightFace(report: SavedReport | null, interactive = false) {
    const detail = report && !notes ? details[report.id] ?? null : null, spread = notes ? null : weekly2Of(report);
    // Weekly 2.0, right page: the insights, petal card and question (blank paper until the bud is opened).
    if (spread && report && (spread.month || spread.short?.insights)) return <View key={report.id} style={{ flex: 1, minHeight: 0, paddingLeft: 18 }}>
      {weekly2Page(report, 'right', interactive)}
    </View>;
    return <View style={{ flex: compact ? undefined : 1, minHeight: 0, alignItems: 'center', paddingLeft: compact ? 0 : 18, paddingTop: compact ? 15 : 0, paddingBottom: compact ? 0 : artHeight * .045 }}>
      <Image source={require('../../assets/reflection/botanical.webp')} resizeMode="contain" accessible={false} style={{ width: '100%', height: compact ? 120 : undefined, flex: compact ? undefined : 1, opacity: .88 }} />
      {spread ? null : detail?.narrativeSections?.length ? <ScrollView scrollEnabled={!compact} style={{ maxHeight: compact ? undefined : 120, alignSelf: 'stretch' }}><Text style={s.note}>{detail.narrativeSections[detail.narrativeSections.length - 1].claim}</Text></ScrollView> : <Text style={s.caption}>❧  {report ? period(report, lang) : t.kept}</Text>}
    </View>;
  }
  // Phone: a whole page; desktop: a two-page spread split at the spine.
  const page = (report: SavedReport | null, interactive: boolean) => compact
    ? <View style={{ flex: 1, minHeight: 0, paddingTop: 6, paddingRight: 4, paddingBottom: 4, paddingLeft: 4 }}>{leftFace(report, interactive)}</View>
    : <View style={{ flex: 1, flexDirection: 'row' }}>{leftFace(report, interactive)}{rightFace(report)}</View>;

  const from = turning ? pages[turning.from] : null, to = turning ? pages[turning.to] : null;
  const restingLeft = turning ? (backwards ? to : from) : selected;
  const restingRight = turning ? (backwards ? from : to) : selected;
  const leafFront = turning ? (backwards ? to : from) : null, leafBack = turning ? (backwards ? from : to) : null;
  const atStart = index <= 0, atEnd = index >= pages.length - 1;
  const contentHeight = Math.max(60, readingRect.height - (!notes && pages.length ? 40 : 0));
  const leafSize = { left: compact ? 0 : leaves.right.x - readingRect.x, width: pageWidth, height: contentHeight };


  return <View style={{ flex: 1, backgroundColor: '#34251A' }}>
    {/* clip, not hidden, on the web: a phone's scaled-down pages keep their wide layout box, and a
        focused button there must not scroll the scene sideways (a hidden box can still scroll). */}
    <View style={{ width: screen.width, height, overflow: (Platform.OS === 'web' ? 'clip' : 'hidden') as 'hidden' }} testID="reflection-scene" {...lookAround.panHandlers}>
    {/* A phone sees part of the painting: a finger moves it to look around (window, lake, shelf). */}
    <Animated.View testID="reflection-look" pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width, height, transform: [{ translateX: pan }] }}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image source={pavilionEmpty} resizeMode="stretch" style={{ position: 'absolute', left: scene.art.x, top: scene.art.y, width: scene.art.width, height: scene.art.height }} />
        {/* Both paintings share the original pixel geometry. Lighting lives below
            the book/reader tree, so a fade cannot reset a book or dim its pages. */}
        <Animated.Image source={pavilionNight} resizeMode="stretch"
          style={{ position: 'absolute', left: scene.art.x, top: scene.art.y, width: scene.art.width, height: scene.art.height, opacity: lighting }} />
      </View>
      <Animated.View testID="reflection-instruction" pointerEvents="none" accessibilityElementsHidden={!!open}
        accessible={!open} accessibilityLabel={pavilionText.instruction}
        importantForAccessibility={open ? 'no-hide-descendants' : 'auto'} style={{ position: 'absolute',
          left: instructionLeft, width: instructionWidth, top: instructionTop, height: 44, opacity: instructionFade }}>
        <PavilionEngraving locale={lang} width={instructionWidth} height={44} left={instructionLeft} top={instructionTop}
          art={scene.art} size={Math.max(17, Math.min(25, scene.art.width * .021))} />
      </Animated.View>
      {open && <Pressable testID="reflection-desk" accessibilityRole="button" accessibilityLabel={t.putBack} onPress={() => { if (!justDragged()) closeBook(); }} style={StyleSheet.absoluteFill} />}
      {BOOKS.map(item => {
        const rect = scene.slot(item), out = onBook(item) && bookDrawn;
        return <Pressable key={item} testID={`reflection-shelf-${item}`} accessibilityRole="button"
          accessibilityState={{ selected: onBook(item), disabled: !!turning || !!flying }}
          accessibilityLabel={pavilionText.titles[item]} accessibilityHint={lang === 'en' ? 'Take this book to the reading desk' : '把这本书取到阅读桌前'}
          disabled={!!turning || !!flying} onPress={() => { if (!justDragged()) openBook(item); }} pointerEvents={compact && open ? 'none' : 'auto'}
          style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height, overflow: 'hidden' }}>
          {!out && (spines ? <Image source={{ uri: spines[item].uri }} accessible={false} resizeMode="stretch" style={StyleSheet.absoluteFill} />
            : <Image source={pavilionReference} accessible={false} resizeMode="stretch" style={{ position: 'absolute',
              left: scene.art.x - rect.x, top: scene.art.y - rect.y, width: scene.art.width, height: scene.art.height }} />)}
        </Pressable>;
      })}
      {/* A phone reading a book: the whole painting fades in above the page (window, lake and the
          shelf with this book's gap), the same view a wide screen keeps; it fades with the page. */}
      {compact && open && <Animated.View testID="reflection-reading-scene" pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: contentFade }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#34251A' }]} />
        <Image source={pavilionEmpty} resizeMode="stretch" style={{ position: 'absolute', ...rectStyle(readingCamera.art) }} />
        <Animated.Image source={pavilionNight} resizeMode="stretch" style={{ position: 'absolute', ...rectStyle(readingCamera.art), opacity: lighting }} />
        {BOOKS.filter(item => item !== open).map(item => {
          const rect = readingCamera.slot(item);
          return <View key={item} style={{ position: 'absolute', ...rectStyle(rect), overflow: 'hidden' }}>
            {spines ? <Image source={{ uri: spines[item].uri }} accessible={false} resizeMode="stretch" style={StyleSheet.absoluteFill} />
              : <Image source={pavilionReference} accessible={false} resizeMode="stretch" style={{ position: 'absolute',
                left: -rect.x, top: -rect.y, width: readingCamera.art.width, height: readingCamera.art.height }} />}
          </View>;
        })}
      </Animated.View>}
      {/* On a phone the page covers the book; its edges would peek out past the narrower page, so the
          3D book fades out while the page is up and back in before it flies to the shelf. */}
      {open && <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, compact && { opacity: contentFade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <PavilionBook key={open} id={open} locale={lang} spine={spines?.[open].image ?? null} geometry={geometry} timeline={timeline} focus={focus} onReady={bookReady} />
      </Animated.View>}
      {open && <Animated.View testID="reflection-book" pointerEvents={flying ? 'none' : 'box-none'}
        accessibilityElementsHidden={!!flying} importantForAccessibility={flying ? 'no-hide-descendants' : 'auto'}
        style={{
          position: 'absolute',
          left: readingRect.x,
          top: readingRect.y,
          width: readingRect.width,
          height: readingRect.height,
          opacity: contentFade,
        }}>
        <PavilionBookReader
          bookId={open}
          locale={lang}
          leaves={leaves}
          readingRect={readingRect}
          compact={compact}
          reports={pages}
          details={details}
          selectedReport={selected}
          onSelectReport={show}
          onClose={closeBook}
          onWriteEvent={() => router.dismissTo({ pathname: '/', params: { feature: 'events' } })}
          reportPage={weekly2Page}
          collectionPage={() => <PetalCollection headingSize={compact ? 20 : 22} />}
        />
      </Animated.View>}
      {__DEV__ && <Pressable testID="reflection-lantern" accessibilityRole="switch" accessibilityLabel={t.lantern} accessibilityState={{ checked: night }} aria-checked={night}
        accessibilityHint={t.lanternHint} onPress={() => setNightOverride(!night)}
        style={{ position: 'absolute', left: scene.lantern.x, top: scene.lantern.y,
          width: scene.lantern.width, height: scene.lantern.height }} />}
    </Animated.View>
    </View>
    {/* While a phone reads a book, the book's own ✕ is the only close button. */}
    {!(compact && open) && <Pressable accessibilityRole="button" accessibilityLabel={t.close} onPress={leave} hitSlop={6}
      style={[s.back, { top: compact ? undefined : insets.top + 10, bottom: compact ? insets.bottom + 10 : undefined, right: insets.right + 12 }]}><Text style={s.closeText}>✕</Text></Pressable>}
  </View>;
}

const s = StyleSheet.create({
  back: { position: 'absolute', zIndex: 20, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3E7CCE6', borderWidth: 1, borderColor: '#BFA36D' },
  closeText: { fontSize: 20, color: '#4A3622' },
  putBack: { position: 'absolute', zIndex: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3E7CCD9', borderWidth: 1, borderColor: '#BFA36D99' },
  putBackText: { fontSize: 13, color: '#5E4B33' },
  pages: { position: 'absolute', borderRadius: 12 },
  sectionHeading: { fontFamily: 'Georgia', fontSize: 18, color: '#654D30', marginTop: 8, marginBottom: 12 },
  pattern: { fontFamily: 'Georgia', fontSize: 15, lineHeight: 23, color: '#556040', marginBottom: 8 },
  topic: { alignItems: 'center', minWidth: 70, maxWidth: 125, padding: 5 },
  edgeTab: { width: 83, minHeight: 49, justifyContent: 'center', alignItems: 'center', borderRadius: 4, borderWidth: 1, borderColor: '#9F805866', shadowColor: '#372412', shadowOpacity: .18, shadowRadius: 2, shadowOffset: { width: 1, height: 2 } },
  notesText: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: '#4D3B28' },
  shelfGap: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  pick: { fontFamily: 'Georgia', fontStyle: 'italic', letterSpacing: .5, textAlign: 'center', color: '#5E4B33' },
  quietLink: { fontFamily: 'Georgia', fontSize: 12, color: '#8C7556', textDecorationLine: 'underline' },
  note: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 17, lineHeight: 25, color: '#775633', textAlign: 'center', padding: 9 },
  caption: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 16, color: '#8B6C44', paddingVertical: 16, textAlign: 'center' },
  heading: { fontFamily: 'Georgia', color: '#453321', lineHeight: 34 },
  ink: { fontFamily: 'Georgia', color: '#453321', fontSize: 16 },
  body: { fontFamily: 'Georgia', color: '#4D3B28', fontSize: 16, lineHeight: 26, marginBottom: 15 },
  small: { fontFamily: 'Georgia', color: '#53432D', fontSize: 13, lineHeight: 19 },
  link: { fontFamily: 'Georgia', color: '#52613B', textDecorationLine: 'underline', marginVertical: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  statusText: { fontFamily: 'Georgia', fontStyle: 'italic', color: '#7A5E3C', fontSize: 14, flexShrink: 1 },
  turns: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  turn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontFamily: 'Georgia', color: '#6B5232', fontSize: 30 },
  number: { fontFamily: 'Georgia', color: '#6B5232', fontSize: 13, flexShrink: 1, textAlign: 'center' },
  eyebrow: { fontFamily: 'Georgia', fontSize: 12, letterSpacing: 2.2, color: '#8C6E3A', marginTop: 8 },
  range: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 15, color: '#5E4B33', marginTop: 3 },
  ornament: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  goldLine: { flex: 1, height: 1, backgroundColor: '#B8934A80' },
  fleuron: { fontFamily: 'Georgia', fontSize: 17, color: '#A88236' },
  initial: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 30, lineHeight: 30, color: '#6C7A4A' },
  textTabs: { flexDirection: 'row', gap: 18, marginBottom: 14, borderBottomWidth: 1, borderColor: '#B4986A40' },
  textTab: { paddingVertical: 8, borderBottomWidth: 2, borderColor: 'transparent', marginBottom: -1 },
  textTabTextOn: { color: '#3F4A2C' },
  gutter: { paddingLeft: 22, borderLeftWidth: 1, borderColor: '#A98A5C55' },
  cover: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 14, boxShadow: '0 6px 14px rgba(20,12,5,.5), inset 0 0 16px rgba(0,0,0,.45)' },
  coverRule: { position: 'absolute', left: 4, top: 4, right: 4, bottom: 4, borderRadius: 11, borderWidth: 1, borderColor: '#C9A45CCC' },
  sheetEdge: { position: 'absolute', borderRadius: 6, backgroundColor: '#E8D3A0', borderWidth: 1, borderColor: '#C29A4A' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#D2AE62' },
  fox: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(150,104,48,.05)', boxShadow: '0 0 26px 14px rgba(150,104,48,.07)' },
  // Aged paper: hinge shadow at the spine and a warm, worn edge all round.
  aged: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, boxShadow: 'inset 14px 0 14px -8px rgba(70,42,16,.45), inset 0 0 36px rgba(128,86,38,.34)' },
  ribbon: { position: 'absolute', top: 0, right: 9, width: 14, zIndex: 1, shadowColor: '#3B2414', shadowOpacity: .25, shadowRadius: 2, shadowOffset: { width: 1, height: 1 } },
  ribbonBody: { width: 14, height: 70, backgroundColor: '#A55E63' },
  ribbonTailLeft: { width: 0, height: 0, borderTopWidth: 11, borderTopColor: '#A55E63', borderRightWidth: 7, borderRightColor: 'transparent' },
  ribbonTailRight: { width: 0, height: 0, borderTopWidth: 11, borderTopColor: '#A55E63', borderLeftWidth: 7, borderLeftColor: 'transparent' },
});
