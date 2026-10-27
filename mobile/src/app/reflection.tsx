import { EmotionalSafetyNote } from '../components/features/EmotionalSafetyNote';
import { AiOutputReport } from '../components/features/AiPrivacySettings';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useWorldTime } from '../components/garden/world-time';
import { createLastMonthReflection, createLastWeekReflection, lastClosedMonthKey, lastClosedWeekKey, listReflections, readReflection, shortWeekly, weekLabel, weeklyTriggerOutcome, type ReflectionReport, type ReportType, type SavedReport } from '../services/reflections';
import { ShortWeeklyReport } from '../components/features/ShortWeeklyReport';

const title = (type: ReportType) => type === 'weekly' ? 'Weekly' : 'Monthly';
function period(report: SavedReport) {
  if (report.type === 'monthly') {
    const match = report.periodKey.match(/(\d{4})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return weekLabel(report.periodKey).chip;
}
function heading(report: SavedReport) {
  if (report.type !== 'weekly') return period(report);
  const label = weekLabel(report.periodKey);
  return label.range ? `${label.title} · ${label.range}` : label.title;
}
const interiorDay = require('../../assets/reflection/interior-day-v2.png');
const interiorNight = require('../../assets/reflection/interior-night-v2.png');
type Section = 'Summary' | 'Topics' | 'Patterns';
const TURN_MS = 680;

export default function Reflection() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { isTreehouseLightingTime: worldNight } = useWorldTime();
  const [nightOverride, setNightOverride] = useState<boolean | null>(null);
  const night = nightOverride ?? worldNight;
  const lighting = useRef(new Animated.Value(night ? 1 : 0)).current;
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(lighting, { toValue: night ? 1 : 0, duration: reducedMotion ? 0 : 550, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [night, reducedMotion, lighting]);
  const [type, setType] = useState<ReportType>('weekly');
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
    } catch (error) {
      if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : 'Unable to load saved reflections.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => listAbort.current?.abort(); }, []);

  // Back to the Garden already underneath; replacing would mount a second Garden each visit.
  const leave = () => router.canGoBack() ? router.back() : router.dismissTo('/');
  const pages = reports.filter(report => report.type === type).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  const found = pages.findIndex(report => report.id === pageId[type]);
  const index = found >= 0 ? found : pages.length - 1;
  const selected = pages[index] ?? null;
  const show = (report: SavedReport) => setPageId(previous => ({ ...previous, [report.type]: report.id }));

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
    try { outcome = weeklyTriggerOutcome(await create(controller.signal), undefined, period); }
    catch (error) { outcome = weeklyTriggerOutcome(undefined, error, period); }
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
    const lastKey = type === 'weekly' ? lastClosedWeekKey() : lastClosedMonthKey();
    if (reports.some(report => report.type === type && report.periodKey === lastKey)) return;
    autoCreated.current[type] = true; void createLast(type);
  }, [type, loading, listError, reports, creating]);
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
        if (visible && !controller.signal.aborted) setReadError(error instanceof Error ? error.message : 'Unable to read this reflection.');
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
    if (locked.current || !target) return;
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

  // Narrow or short screens (phones in either orientation) use the single-page layout.
  const compact = width < 700 || height < 600;
  // A phone on its side reads like an open book: heading on the left, the reflection on the right.
  const wide = compact && width > height;
  const sceneWidth = Math.min(width, 1000);
  const artHeight = sceneWidth * 4 / 3;
  // Phone: a scenic header, then one page that fills the rest of the screen (content scrolls inside).
  // Upright phones keep the whole window and the lake outside it in view (the window ends at
  // about 40% of the art); a phone on its side keeps the short header.
  const bookTop = compact ? (wide ? Math.min(artHeight * .3, 170, height * .22) : Math.min(artHeight * .4, height * .36)) : artHeight * .365;
  const bookWidth = compact ? sceneWidth - 20 : sceneWidth * .80;
  const bookHeight = compact ? Math.max(320, height - bookTop - 12) : artHeight * .48;
  const bookLeft = compact ? 10 : sceneWidth * .17;
  const sceneHeight = compact ? bookTop + bookHeight + 12 : artHeight;
  const camera = { position: 'absolute' as const, left: 0, top: 0, width: sceneWidth, height: artHeight };
  const lakeCamera = { ...camera, top: -artHeight * .14 };
  // The text area inside the book (same fractions as the resting layout below).
  // Phone: the page sits inside the open cloth cover of the shelf book it came from.
  const area = compact
    ? { left: 20, top: 15, width: bookWidth - 38, height: bookHeight - 31 }
    : { left: bookWidth * .10, top: bookHeight * .07, width: bookWidth * .85, height: bookHeight * .83 };
  const pageWidth = compact ? area.width : area.width / 2;
  const paperColor = night ? '#E6C495' : '#F3E1BA';
  const backwards = !!turning && turning.to < turning.from;
  const angle = progress.interpolate({ inputRange: [0, 1], outputRange: backwards ? ['-180deg', '0deg'] : ['0deg', '-180deg'] });
  const faceOpacity = (front: boolean) => progress.interpolate({ inputRange: [0, .499, .501, 1],
    outputRange: front === !backwards ? [1, 1, 0, 0] : [0, 0, 1, 1] });

  // The open book on phones is the shelf book itself: green cloth for Weekly, blue for Monthly.
  const cloth = type === 'weekly' ? (night ? '#2F4739' : '#3E5A4C') : (night ? '#233F62' : '#2D5279');
  const accent = type === 'weekly' ? '#55704A' : '#3B5F8C', bookInk = type === 'weekly' ? '#34472F' : '#2A4466';
  // Shelf spines cropped from the same painted art (1000-wide units, rows 138–318): the phone's Weekly/Monthly switch.
  const shelf = { weekly: { x: 572, w: 70 }, monthly: { x: 661, w: 74 } };
  const shelfSpine = (item: ReportType, h: number) => {
    const { x, w } = shelf[item], k = h / 180;
    return <View style={{ width: w * k, height: h, overflow: 'hidden', borderRadius: 2 }}>
      <Image source={night ? interiorNight : interiorDay} accessible={false} style={{ position: 'absolute', width: 1000 * k, height: 4000 / 3 * k, left: -x * k, top: -138 * k }} />
    </View>;
  };

  // Phone paper: the left page of the painted spread, scaled to cover the page and mirrored so its
  // gutter shading sits at the spine. Same art (and day/night) as the desktop book.
  const sheet = { x: 262, y: 545, w: 310, h: 500 }; // in a 1000-wide copy of the interior art
  const paintedPaper = () => {
    const k = Math.max(area.width / sheet.w, area.height / sheet.h);
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 6 }]}>
      <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}>
        <Image source={night ? interiorNight : interiorDay} accessible={false} style={{ position: 'absolute', width: 1000 * k, height: 4000 / 3 * k,
          left: -sheet.x * k - (sheet.w * k - area.width) / 2, top: -sheet.y * k - (sheet.h * k - area.height) / 2 }} />
      </View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#F6E4BE', opacity: night ? .38 : .2 }]} />
      {/* Foxing: a few soft age marks. */}
      <View style={[s.fox, { left: '14%', top: '62%', width: 70, height: 60 }]} />
      <View style={[s.fox, { right: '16%', top: '26%', width: 46, height: 40 }]} />
      <View style={[s.fox, { right: '9%', bottom: '12%', width: 84, height: 70 }]} />
      <View style={s.aged} />
    </View>;
  };
  // Paper under a moving leaf: the book's own art on both layouts.
  const paper = (side: 'left' | 'right') => compact
    ? paintedPaper()
    : <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Image source={night ? interiorNight : interiorDay} accessible={false}
        style={{ position: 'absolute', width: sceneWidth, height: artHeight,
          left: -(bookLeft + area.left + (side === 'right' ? pageWidth : 0)), top: -(bookTop + area.top) }} />
    </View>;

  function leftFace(report: SavedReport | null, interactive: boolean) {
    const detail = report ? details[report.id] ?? null : null;
    const shown: Section = interactive ? section : 'Summary';
    return <View style={{ flex: 1, minHeight: 0, paddingRight: compact ? 0 : 30, flexDirection: wide ? 'row' : 'column', gap: wide ? 22 : 0 }}>
      <View style={wide ? { width: '38%' } : undefined}>
      {compact && <View style={s.shelf}>{(['weekly', 'monthly'] as const).map(item => <Pressable key={item} accessibilityRole="tab"
        accessibilityState={{ selected: type === item }} aria-selected={type === item} accessibilityLabel={`${title(item)} reflections`}
        disabled={!interactive || !!turning} onPress={() => setType(item)} style={[s.shelfItem, { opacity: type === item ? 1 : .62 }]}>
        <View style={[s.shelfSpine, type === item && s.shelfSpineOn]}>{shelfSpine(item, wide ? 44 : 52)}</View>
        <Text style={[s.small, type === item && [s.shelfTextOn, { borderColor: '#B8934A' }]]}>{title(item)}</Text></Pressable>)}</View>}
      <Text accessibilityRole="header" style={[s.heading, compact && { color: bookInk }, { fontSize: compact ? 22 : Math.max(21, Math.min(27, sceneWidth * .026)) }]}>Your {title(type)} Reflection</Text>
      {report && (report.type === 'weekly'
        ? <><Text style={s.eyebrow}>{weekLabel(report.periodKey).title.toUpperCase()}</Text>
          {!!weekLabel(report.periodKey).range && <Text style={s.range}>{weekLabel(report.periodKey).range}{report.status === 'PARTIAL' ? ' · In progress' : ''}</Text>}</>
        : <Text style={s.range}>{heading(report)}{report.status === 'PARTIAL' ? ' · In progress' : ''}</Text>)}
      {interactive && creatingType === type && (creating || !!notice) && <View testID="reflection-create-status" accessibilityLiveRegion="polite" style={s.status}>
        {creating && <ActivityIndicator size="small" color="#8B6C44" accessible={false} />}
        <Text style={s.statusText}>{creating ? `Writing last ${type === 'weekly' ? 'week' : 'month'}’s reflection…` : notice}</Text>
      </View>}
      <View accessible={false} style={s.ornament}><View style={s.goldLine} /><Text style={s.fleuron}>❦</Text><View style={s.goldLine} /></View>
      {compact && detail && <View style={s.textTabs}>{(['Summary', 'Topics', 'Patterns'] as const).map(item => <Pressable key={item} accessibilityRole="tab"
        accessibilityState={{ selected: shown === item, disabled: !interactive || !detail }} aria-selected={shown === item} disabled={!interactive || !detail}
        onPress={() => setSection(item)} style={[s.textTab, shown === item && { borderColor: accent }]}><Text style={[s.small, shown === item && s.textTabTextOn]}>{item}</Text></Pressable>)}</View>}
      </View>
      <View style={[{ flex: 1, minHeight: 0 }, wide && s.gutter]}>
      {interactive && (loading || reading) && <ActivityIndicator color="#6E744E" accessibilityLabel="Loading reflection" />}
      {interactive && !!listError && <><Text style={s.body}>{listError}</Text><Pressable accessibilityRole="button" onPress={() => void load(cursor || undefined)}><Text style={s.link}>Try loading again</Text></Pressable></>}
      {interactive && !!readError && <><Text style={s.body}>{readError}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text style={s.link}>Try reading again</Text></Pressable></>}
      <ScrollView key={`${report?.id}-${shown}`} style={{ flex: 1 }} scrollEnabled={interactive} contentContainerStyle={{ paddingBottom: 15 }}>
        {interactive && !loading && !listError && !report && <View style={{ paddingTop: compact ? 4 : 20 }}>
          <Text style={[s.heading, { fontSize: compact ? 20 : 22, marginBottom: compact ? 8 : 15 }]}>A place to look back</Text>
          <Text style={s.body}>No saved {type} reflections yet.</Text>
          <Text style={s.body}>When a reflection is available, you can return here to revisit its moments, themes and patterns.{cursor ? ' You can also look through older reflections.' : ''}</Text>
          <Image source={require('../../assets/garden/environment/flowers/ivory_wildflowers.png')} resizeMode="contain" style={{ width: 105, height: 80, marginTop: 8, opacity: .8 }} accessible={false} />
        </View>}
        {detail && <>
          <EmotionalSafetyNote />
          {shown === 'Summary' && (() => {
            const short = shortWeekly(detail);
            if (short) return <ShortWeeklyReport short={short} interactive={interactive}
              onWrite={() => router.dismissTo({ pathname: '/', params: { feature: 'events' } })} />;
            const text = detail.summary || detail.narrativeSections?.map(item => item.claim).join('\n\n') || 'No written reflection is available for this saved report.';
            return <Text selectable={interactive} style={s.body}><Text style={[s.initial, { color: accent }]}>{text.slice(0, 1)}</Text>{text.slice(1)}</Text>;
          })()}
          {(shown === 'Summary' || shown === 'Topics') && <>
            <Text style={s.sectionHeading}>Your {title(type)} Themes</Text>
            {detail.topTopics?.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 17 }}>{detail.topTopics.map(item => <View key={item.topic} style={s.topic}>
              <Text style={{ color: '#85905D', fontSize: 26 }}>❧</Text><Text style={s.ink}>{item.topic}</Text><Text style={s.small}>{item.count} recorded</Text>
            </View>)}</View> : <Text style={s.body}>No themes recorded in this reflection.</Text>}
          </>}
          {(shown === 'Summary' || shown === 'Patterns') && <>
            <Text style={s.sectionHeading}>❧  Notable Patterns</Text>
            {detail.trendSignals?.status === 'ok' ? <>
              {typeof detail.trendSignals.eventCountChange === 'number' && <Text style={s.body}>Recorded events: {detail.trendSignals.eventCountChange > 0 ? '+' : ''}{detail.trendSignals.eventCountChange} compared with the previous {type === 'weekly' ? 'week' : 'month'}.</Text>}
              {detail.trendSignals.topicChanges?.map(item => <Text key={item.topic} selectable={interactive} style={s.pattern}>❧  {item.topic}: {item.previousCount} → {item.currentCount}</Text>)}
            </> : <Text style={s.body}>There isn’t enough recorded evidence to compare periods.</Text>}
          </>}
          {interactive && <View style={{ marginTop: 6, marginBottom: 12 }}><AiOutputReport kind={type} outputId={detail.id} /></View>}
          {compact && rightFace(report)}
        </>}
      </ScrollView>
      {detail && <Text style={[s.small, { paddingTop: 7, borderTopWidth: 1, borderColor: '#AA8B5933' }]}>{detail.eventCount} recorded {detail.eventCount === 1 ? 'event' : 'events'} · Saved reflection</Text>}
      </View>
    </View>;
  }
  function rightFace(report: SavedReport | null) {
    const detail = report ? details[report.id] ?? null : null;
    return <View style={{ flex: compact ? undefined : 1, minHeight: 0, alignItems: 'center', paddingLeft: compact ? 0 : 18, paddingTop: compact ? 15 : 0, paddingBottom: compact ? 0 : artHeight * .045 }}>
      <Image source={require('../../assets/reflection/botanical.png')} resizeMode="contain" accessible={false} style={{ width: '100%', height: compact ? 120 : undefined, flex: compact ? undefined : 1, opacity: .88 }} />
      {detail?.narrativeSections?.length ? <ScrollView scrollEnabled={!compact} style={{ maxHeight: compact ? undefined : 120, alignSelf: 'stretch' }}><Text style={s.note}>{detail.narrativeSections[detail.narrativeSections.length - 1].claim}</Text></ScrollView> : <Text style={s.caption}>❧  {report ? period(report) : 'Your reflections, kept here.'}</Text>}
    </View>;
  }
  // Phone: a whole page; desktop: a two-page spread split at the spine.
  const page = (report: SavedReport | null, interactive: boolean) => compact
    ? <View style={{ flex: 1, paddingTop: 18, paddingRight: 30, paddingBottom: 60, paddingLeft: 30 }}>{leftFace(report, interactive)}</View>
    : <View style={{ flex: 1, flexDirection: 'row' }}>{leftFace(report, interactive)}{rightFace(report)}</View>;

  const from = turning ? pages[turning.from] : null, to = turning ? pages[turning.to] : null;
  // What rests under the leaf while it moves (Journal mapping).
  const restingLeft = turning ? (backwards ? to : from) : selected;
  const restingRight = turning ? (backwards ? from : to) : selected;
  const leafFront = turning ? (backwards ? to : from) : null, leafBack = turning ? (backwards ? from : to) : null;
  const atStart = index <= 0, atEnd = index >= pages.length - 1;
  const leafSize = { left: compact ? 0 : pageWidth, width: pageWidth, height: area.height };

  return <ScrollView style={{ flex: 1, backgroundColor: '#35271D' }} contentContainerStyle={{ minHeight: height, alignItems: 'center' }}>
    <View style={{ width: sceneWidth, height: sceneHeight, overflow: 'hidden' }} testID="reflection-scene">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Image source={require('../../assets/reflection/lake-day-v2.png')} style={lakeCamera} />
        <Animated.Image source={require('../../assets/reflection/lake-night-v2.png')} style={[lakeCamera, { opacity: lighting }]} />
        <Image source={interiorDay} style={camera} />
        <Animated.Image source={interiorNight} style={[camera, { opacity: lighting }]} />
      </View>
      <Pressable accessibilityRole="button" onPress={leave} style={[s.back, compact ? { top: 10, left: 10, paddingVertical: 8, paddingHorizontal: 11 } : { top: artHeight * .055, left: sceneWidth * .115 }]}><Text style={[s.ink, compact && { fontSize: 14 }]}>←  Back to Garden</Text></Pressable>
      <Pressable testID="reflection-lantern" accessibilityRole="switch" accessibilityLabel="Lantern — night lighting" accessibilityState={{ checked: night }} aria-checked={night} accessibilityHint="Turn the lantern on for night, or off for day" onPress={() => setNightOverride(!night)} hitSlop={6}
        style={{ position: 'absolute', left: sceneWidth * .91, top: artHeight * .10, width: sceneWidth * .085, height: artHeight * .145, zIndex: 3 }} />
      {!compact && (['weekly', 'monthly'] as const).map((item, i) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: type === item }} aria-selected={type === item} accessibilityLabel={`${title(item)} reflections`} disabled={!!turning} onPress={() => setType(item)} style={{ position: 'absolute', left: sceneWidth * (.561 + i * .094), top: artHeight * .075, width: sceneWidth * .086, height: artHeight * .17, alignItems: 'center', paddingTop: artHeight * .042 }}>
        <Text style={{ fontFamily: 'Georgia', fontSize: Math.max(12, sceneWidth * .018), color: '#EAD6AA', textShadowColor: '#42301C', textShadowRadius: 2, borderBottomWidth: type === item ? 1 : 0, borderColor: '#DCC49588', paddingBottom: 4 }}>{title(item)}</Text>
      </Pressable>)}
      <View testID="reflection-book" style={{ position: 'absolute', top: bookTop, left: bookLeft, width: bookWidth, height: bookHeight }}>
        {!compact && <View style={{ position: 'absolute', left: '-6%', top: '10%', gap: 6, zIndex: 2 }}>
          {(['Summary', 'Topics', 'Patterns'] as const).map((item, i) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: section === item, disabled: !selected || !details[selected.id] || !!turning }} aria-selected={section === item} disabled={!selected || !details[selected.id] || !!turning} onPress={() => setSection(item)} style={[s.edgeTab, { backgroundColor: ['#BBC09A', '#E1C49A', '#DCA9A0'][i], opacity: section === item ? 1 : .88 }]}><Text style={s.small}>{item}</Text></Pressable>)}
        </View>}
        {compact && <>
          <View pointerEvents="none" style={[s.cover, { backgroundColor: cloth }]}>
            <View style={s.coverRule} />
            {/* Gold-tooled corners. */}
            <View style={[s.corner, { left: 8, top: 8, borderTopWidth: 2, borderLeftWidth: 2 }]} />
            <View style={[s.corner, { right: 8, top: 8, borderTopWidth: 2, borderRightWidth: 2 }]} />
            <View style={[s.corner, { left: 8, bottom: 8, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
            <View style={[s.corner, { right: 8, bottom: 8, borderBottomWidth: 2, borderRightWidth: 2 }]} />
          </View>
          {/* Gilt page block: two sheets peeking out at the fore-edge and tail. */}
          <View pointerEvents="none" style={[s.sheetEdge, { left: area.left + 7, top: area.top + 6, width: area.width - 4, height: area.height - 2 }]} />
          <View pointerEvents="none" style={[s.sheetEdge, { left: area.left + 3, top: area.top + 3, width: area.width - 2, height: area.height - 1 }]} />
        </>}
        <View {...swipe.panHandlers} style={[s.pages, { left: area.left, top: area.top, width: area.width, height: area.height, backgroundColor: compact ? paperColor : 'transparent',
          borderRadius: compact ? 6 : 12, boxShadow: compact ? '0 2px 6px rgba(25,14,5,.45)' : undefined, overflow: compact ? 'hidden' : 'visible' }]}>
          {compact && <>
            {paintedPaper()}
            {/* A sprig pressed between the pages. */}
            {!wide && <Image source={require('../../assets/garden/environment/flowers/sparse_sprig.png')} accessible={false} resizeMode="contain"
              style={{ position: 'absolute', right: 22, top: 128, width: 82, height: 76, opacity: .5, transform: [{ rotate: '16deg' }] }} />}
            <View pointerEvents="none" style={s.ribbon}><View style={s.ribbonBody} />
              <View style={{ flexDirection: 'row' }}><View style={s.ribbonTailLeft} /><View style={s.ribbonTailRight} /></View></View>
          </>}
          {compact
            ? page(turning ? (backwards ? from : to) : selected, !turning)
            : <View style={{ flex: 1, flexDirection: 'row' }}>
              <View testID="reflection-left-page" style={{ flex: 1, minHeight: 0 }}>{leftFace(restingLeft, !turning)}</View>
              <View testID="reflection-right-page" style={{ flex: 1, minHeight: 0 }}>{rightFace(restingRight)}</View>
            </View>}
          {turning && <>
            <Animated.View pointerEvents="none" style={{ position: 'absolute', left: compact ? 0 : pageWidth, top: 7, bottom: 7, width: 24, backgroundColor: '#604322',
              opacity: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [0, .14, 0] }),
              transform: [{ translateX: progress.interpolate({ inputRange: [0, .5, 1], outputRange: backwards ? [0, 0, pageWidth - 24] : [pageWidth - 24, 0, 0] }) }] }} />
            <Animated.View testID="reflection-turning-leaf" pointerEvents="none" accessible={false} aria-hidden importantForAccessibility="no-hide-descendants"
              style={{ position: 'absolute', top: 0, ...leafSize, zIndex: 2, ...(Platform.OS === 'web' ? { transformStyle: 'preserve-3d' as const } : {}),
                transform: [{ perspective: pageWidth * 8 }, { translateX: -pageWidth / 2 }, { rotateY: angle }, { translateX: pageWidth / 2 }] }}>
              <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: 'hidden', overflow: 'hidden', borderRadius: compact ? 0 : 6, opacity: faceOpacity(true) }]}>
                {paper('right')}
                {compact ? page(leafFront, false) : rightFace(leafFront)}
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: compact ? 0 : 6, opacity: faceOpacity(false) }]}>
                <View style={[StyleSheet.absoluteFill, { transform: [{ rotateY: '180deg' }] }]}>
                  {paper('left')}
                  {compact ? null : leftFace(leafBack, false)}
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#765632', opacity: .1 }]} />
                </View>
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#664728', opacity: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [0, .16, 0] }) }]} />
              <Animated.View style={{ position: 'absolute', right: 0, top: 7, bottom: 7, width: 2, backgroundColor: '#FFF3D6', opacity: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [0, .8, 0] }) }} />
            </Animated.View>
          </>}
        </View>
        {pages.length > 0 && <View style={[s.turns, compact
          ? { left: area.left + 8, width: area.width - 16, top: area.top + area.height - 52, borderTopWidth: 1, borderColor: '#AA8B5933' }
          : { left: area.left, width: area.width, top: area.top + area.height + 4 }]}>
          <Pressable testID="reflection-previous-page" accessibilityRole="button" accessibilityLabel={`Previous ${type === 'weekly' ? 'week' : 'month'}`}
            disabled={!!turning || (atStart && !cursor)} onPress={() => atStart ? void load(cursor || undefined) : void turn(-1)}
            style={[s.turn, { opacity: atStart && !cursor ? .35 : 1 }]}><Text style={s.arrow}>‹</Text></Pressable>
          <Text accessibilityLiveRegion="polite" style={s.number}>{selected ? `❦   ${period(selected)}  ·  ${index + 1} of ${pages.length}   ❦` : ''}</Text>
          <Pressable testID="reflection-next-page" accessibilityRole="button" accessibilityLabel={`Next ${type === 'weekly' ? 'week' : 'month'}`}
            disabled={!!turning || atEnd} onPress={() => void turn(1)} style={[s.turn, { opacity: atEnd ? .35 : 1 }]}><Text style={s.arrow}>›</Text></Pressable>
        </View>}
      </View>
    </View>
  </ScrollView>;
}
const s = StyleSheet.create({
  back: { position: 'absolute', top: 24, left: 24, padding: 13, borderRadius: 4, backgroundColor: '#F3E7CCD9' },
  pages: { position: 'absolute', borderRadius: 12 },
  sectionHeading: { fontFamily: 'Georgia', fontSize: 18, color: '#654D30', marginTop: 8, marginBottom: 12 },
  pattern: { fontFamily: 'Georgia', fontSize: 15, lineHeight: 23, color: '#556040', marginBottom: 8 },
  topic: { alignItems: 'center', minWidth: 70, maxWidth: 125, padding: 5 },
  edgeTab: { width: 83, minHeight: 49, justifyContent: 'center', alignItems: 'center', borderRadius: 4, borderWidth: 1, borderColor: '#9F805866', shadowColor: '#372412', shadowOpacity: .18, shadowRadius: 2, shadowOffset: { width: 1, height: 2 } },
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
  shelf: { flexDirection: 'row', alignItems: 'flex-end', gap: 20, marginBottom: 10 },
  shelfItem: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, minHeight: 44 },
  shelfSpine: { borderRadius: 2, boxShadow: '1px 2px 3px rgba(40,25,10,.35)' },
  shelfSpineOn: { transform: [{ translateY: -3 }], boxShadow: '1px 5px 6px rgba(40,25,10,.45)' },
  shelfTextOn: { color: '#3A2C1C', borderBottomWidth: 1, paddingBottom: 2 },
  ribbon: { position: 'absolute', top: 0, right: 9, width: 14, zIndex: 1, shadowColor: '#3B2414', shadowOpacity: .25, shadowRadius: 2, shadowOffset: { width: 1, height: 1 } },
  ribbonBody: { width: 14, height: 70, backgroundColor: '#A55E63' },
  ribbonTailLeft: { width: 0, height: 0, borderTopWidth: 11, borderTopColor: '#A55E63', borderRightWidth: 7, borderRightColor: 'transparent' },
  ribbonTailRight: { width: 0, height: 0, borderTopWidth: 11, borderTopColor: '#A55E63', borderLeftWidth: 7, borderLeftColor: 'transparent' },
});
