import { EmotionalSafetyNote } from '../components/features/EmotionalSafetyNote';
import { BookhouseEnvironment, SceneLighting, SCENE_ASPECT, DESK_Y } from '../components/bookhouse/BookhouseEnvironment';
import { useWorldTime } from '../components/garden/world-time';
import { JournalCover } from '../components/bookhouse/JournalCover';
import { JournalPages } from '../components/bookhouse/JournalPages';
import { ImmersivePaper, immersiveText } from '../components/bookhouse/ImmersivePaper';
import { type PanelTheme } from '../components/features/PanelTheme';
import { useEventVoiceInput } from '../hooks/useEventVoiceInput';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { boundCamera, focusCamera, zoomCamera, type ShelfCamera } from '../components/bookhouse/shelfCamera';
import { EngravedYear, ShelfMotif } from '../components/bookhouse/EngravedYear';
import { useAuth } from '../services/auth';
import { daysInMonth, journalYears, MONTHS, monthKey, openableMonths, readJournals, savePrivateJournal, type JournalCheckIn } from '../services/bookhouse';
import { readEvent } from '../services/events';
import { loadGardenPlacements } from '../components/garden/planting/gardenHydration';
import { loadFlowerSource } from '../components/garden/planting/flowerDetailApi';
import { loadFlowerPlacements, type FlowerPlacementRecord } from '../components/garden/planting/plantingPersistence';
import { BookhouseArt } from '../components/bookhouse/BookhouseArt';

const serif = Platform.select({ ios: 'Georgia', web: 'Georgia', default: 'serif' });
const moodName = (mood: string) => { const word = mood.replace('_BLOOM', '').toLowerCase(); return word.charAt(0).toUpperCase() + word.slice(1); };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to load your book. Please try again.';

export default function Bookhouse() {
  const { session } = useAuth();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { isTreehouseLightingTime: worldNight } = useWorldTime();
  const [devNight, setDevNight] = useState<boolean | null>(null);
  const lit = __DEV__ ? devNight ?? worldNight : worldNight;
  const viewportWidth = Math.min(width, 1040);
  const narrowDesk = viewportWidth < 600;
  const bookWidth = Math.min(viewportWidth * (narrowDesk ? .94 : .76), (height - insets.top - insets.bottom) * .82 / .78);
  const bookHeight = bookWidth * .78;
  // Crop the sides on narrow screens, preserving the artwork's aspect ratio and
  // enough real tabletop for the unchanged journal and controls.
  const [deskHeight, setDeskHeight] = useState(0);
  const deskLayout = useRef<View>(null);
  const deskFootprint = (deskHeight || bookHeight * 1.035 + 210) + 12;
  const sceneWidth = Math.max(viewportWidth, deskFootprint / (SCENE_ASPECT - DESK_Y));
  // Frame the actual journal/control footprint, not the asset's unused foreground.
  // The one continuous background retains its natural aspect ratio underneath.
  const sceneHeight = sceneWidth * DESK_Y + deskFootprint;
  const homeCamera = { scale: 1, x: (viewportWidth - sceneWidth) / 2, y: 0 };
  const sceneScroll = useRef<ScrollView>(null);
  const artHeight = sceneWidth * 1.5;

  const [entries, setEntries] = useState<JournalCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedYear, setFocusedYear] = useState<number | null>(null);
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null);
  const [day, setDay] = useState(1);
  const [introVisible, setIntroVisible] = useState(true);
  useEffect(() => { setIntroVisible(true); }, [month?.year, month?.month, day]);
  const [entryIndex, setEntryIndex] = useState(0);
  useEffect(() => { setEntryIndex(0); }, [month?.year, month?.month, day]);
  const [editor, setEditor] = useState(false);
  const [history, setHistory] = useState(false);
  const [reader, setReader] = useState(false);
  const [pageSize, setPageSize] = useState({ width: 350, height: 260 });
  const [notice, setNotice] = useState('');
  const arrival = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(arrival, { toValue: 1, duration: reducedMotion ? 0 : 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [arrival, reducedMotion]);
  const shelfViewport = useRef<View>(null);
  const cameraScale = useRef(new Animated.Value(1)).current;
  const cameraX = useRef(new Animated.Value(homeCamera.x)).current;
  const camera = useRef<ShelfCamera>(homeCamera);
  const focusPoint = useRef({ x: .5, y: .5 });
  const cameraY = useRef(new Animated.Value(0)).current;
  const opening = useRef(new Animated.Value(1)).current;
  const requestVersion = useRef(0);
  const journalRequest = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (!session) return;
    const version = ++requestVersion.current;
    journalRequest.current?.abort();
    const controller = new AbortController();
    journalRequest.current = controller;
    setLoading(true); setError('');
    try { const next = await readJournals(session.user.id, controller.signal); if (version === requestVersion.current) setEntries(next); }
    catch (e) { if (version === requestVersion.current) setError(errorMessage(e)); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [session]);
  useFocusEffect(useCallback(() => { void reload(); return () => { requestVersion.current++; journalRequest.current?.abort(); }; }, [reload]));
  const years = useMemo(() => journalYears(entries), [entries]);
  const available = useMemo(() => new Set(entries.filter(e => e.journal).map(e => e.localDate.slice(0, 7))), [entries]);
  const openable = useMemo(() => openableMonths(entries), [entries]);
  const today = new Date();
  const isToday = (year: number, selected: number, n: number) => year === today.getFullYear() && selected === today.getMonth() + 1 && n === today.getDate();
  const zoom = Math.max(1.35, 980 / sceneWidth);
  const overviewHeight = sceneHeight;
  const shelfHeight = height - insets.top - insets.bottom;
  // Reuse the six physical shelves rather than append image strips for old years.
  const [yearOffset, setYearOffset] = useState(0);
  const visibleYears = years.slice(yearOffset, yearOffset + 6);
  const rowStep = artHeight * .12;
  const rowBottom = (index: number) => artHeight * .247 + index * rowStep;
  const bounds = { width: viewportWidth, height: shelfHeight, contentWidth: sceneWidth, contentHeight: overviewHeight };
  const applyCamera = (next: ShelfCamera, animate = false) => {
    cameraScale.stopAnimation(); cameraX.stopAnimation(); cameraY.stopAnimation();
    camera.current = next;
    const values = [[cameraScale, next.scale], [cameraX, next.x], [cameraY, next.y]] as const;
    if (animate) Animated.parallel(values.map(([value, toValue]) => Animated.timing(value,
      { toValue, duration: reducedMotion ? 0 : 480, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }))).start();
    else values.forEach(([value, nextValue]) => value.setValue(nextValue));
  };
  const focusShelf = (year: number, x: number, y: number) => {
    focusPoint.current = { x: x / sceneWidth, y: y / overviewHeight };
    sceneScroll.current?.scrollTo({ y: 0, animated: false });
    setFocusedYear(year);
    applyCamera(focusCamera({ x, y }, zoom, { ...bounds, height: Math.min(overviewHeight, Math.max(240, height * .55)) }), true);
  };
  // Only viewport/content changes reframe the camera. Data refreshes and panning do not reset it.
  const previousSize = useRef({ width: sceneWidth, height: shelfHeight, contentHeight: overviewHeight });
  useEffect(() => {
    const previous = previousSize.current;
    previousSize.current = { width: sceneWidth, height: shelfHeight, contentHeight: overviewHeight };
    if (focusedYear === null) { applyCamera(homeCamera, true); return; }
    if (previous.width === sceneWidth && previous.height === shelfHeight && previous.contentHeight === overviewHeight) return;
    const point = { x: focusPoint.current.x * sceneWidth, y: focusPoint.current.y * overviewHeight };
    applyCamera(focusCamera(point, zoom, bounds), true);
  }, [sceneWidth, shelfHeight, overviewHeight, focusedYear]);
  const panStart = useRef(camera.current);
  const pinchStart = useRef({ camera: camera.current, x: 0, y: 0 });
  const stopCamera = () => {
    cameraScale.stopAnimation(value => { camera.current.scale = value; });
    cameraX.stopAnimation(value => { camera.current.x = value; });
    cameraY.stopAnimation(value => { camera.current.y = value; });
  };
  const pan = Gesture.Pan().enabled(focusedYear !== null).minDistance(6).maxPointers(1).runOnJS(true)
    .onStart(() => { stopCamera(); panStart.current = { ...camera.current }; })
    .onUpdate(event => applyCamera(boundCamera({ ...panStart.current,
      x: panStart.current.x + event.translationX, y: panStart.current.y + event.translationY }, bounds)));
  const pinch = Gesture.Pinch().enabled(focusedYear !== null).runOnJS(true)
    .onStart(event => { stopCamera(); pinchStart.current = { camera: { ...camera.current }, x: event.focalX, y: event.focalY }; })
    .onUpdate(event => {
      const start = pinchStart.current;
      const scale = Math.max(1, Math.min(4, start.camera.scale * event.scale));
      const next = zoomCamera(start.camera, { x: start.x, y: start.y }, scale, bounds);
      applyCamera(boundCamera({ ...next, x: next.x + event.focalX - start.x, y: next.y + event.focalY - start.y }, bounds));
    });
  useEffect(() => {
    if (Platform.OS !== 'web' || focusedYear === null) return;
    const element = shelfViewport.current as unknown as HTMLElement | null;
    const wheel = (event: WheelEvent) => {
      // Trackpad/wheel scroll pans the same camera; browser zoom shortcuts stay native.
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? shelfHeight : 1;
      applyCamera(boundCamera({ ...camera.current,
        x: camera.current.x - (event.shiftKey ? event.deltaY : event.deltaX) * unit,
        y: camera.current.y - (event.shiftKey ? 0 : event.deltaY) * unit }, bounds));
    };
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => element?.removeEventListener('wheel', wheel);
  }, [focusedYear, sceneWidth, shelfHeight, overviewHeight]);
  const openMonth = (year: number, selected: number) => {
    if (!openable.has(monthKey(year, selected))) return;
    setMonth({ year, month: selected });
    setFocusedYear(null);
    applyCamera(homeCamera);
    sceneScroll.current?.scrollTo({ y: sceneWidth * DESK_Y - 24, animated: !reducedMotion });
    const first = entries.filter(e => e.journal && e.localDate.startsWith(monthKey(year, selected))).map(e => Number(e.localDate.slice(8, 10))).sort((a,b) => a-b)[0];
    // A month without journals yet (the current one) opens on today's page.
    setDay(first || (isToday(year, selected, today.getDate()) ? today.getDate() : 1)); opening.setValue(0);
    Animated.timing(opening, { toValue: 1, duration: reducedMotion ? 0 : 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const dayEntries = month ? entries.filter(e => e.journal && e.localDate === `${monthKey(month.year, month.month)}-${String(day).padStart(2, '0')}`) : [];
  const selectedEntry = dayEntries[Math.min(entryIndex, Math.max(0, dayEntries.length - 1))];
  // The atlas window is one square cell cropped to 78% of its height.
  // The cover (90% down the sprite) rests on the continuous scene tabletop.
  const compactBook = bookWidth < 600;
  const coverBaseline = bookHeight * .90;
  const pageTextStyle = { fontFamily: serif, fontSize: compactBook ? 14 : 16, lineHeight: compactBook ? 21 : 24, color: '#51432F' };
  const leave = () => router.canGoBack() ? router.back() : router.dismissTo('/');
  return <GestureHandlerRootView style={{ flex: 1 }}><Animated.View style={[s.root, { backgroundColor: lit ? '#101720' : '#46311F', opacity: arrival, transform: [{ scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [.98, 1] }) }] }]}>
    <ScrollView ref={sceneScroll} scrollEnabled={focusedYear === null} contentContainerStyle={{ alignItems: 'center', paddingTop: insets.top, paddingBottom: insets.bottom + 8 }}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)} touchAction={focusedYear === null ? 'auto' : 'none'}>
      <View ref={shelfViewport} testID="bookhouse-shelf-viewport" style={{ width: viewportWidth, height: sceneHeight, overflow: Platform.OS === 'web' ? 'clip' as 'hidden' : 'hidden' }}>
        <Animated.View testID="bookhouse-shelf-camera" style={{ width: sceneWidth, height: sceneHeight, overflow: Platform.OS === 'web' ? 'clip' as 'hidden' : 'hidden', transformOrigin: 'top left', transform: [{ translateX: cameraX }, { translateY: cameraY }, { scale: cameraScale }] }}>
          <BookhouseEnvironment width={sceneWidth} night={lit} />
              {visibleYears.map((year, index) => <View key={year} style={{ position: 'absolute', left: 0, width: sceneWidth, top: rowBottom(index) - rowStep, height: rowStep }}>
                <ShelfMotif index={index % 5} sceneWidth={sceneWidth} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Focus ${year} shelf`} onPress={event => focusShelf(year, sceneWidth * .046 + event.nativeEvent.locationX, rowBottom(index) - rowStep + rowStep * .24 + event.nativeEvent.locationY)}
                  style={{ position: 'absolute', left: sceneWidth * .046, top: rowStep * .24, width: sceneWidth * .058, height: rowStep * .68, justifyContent: 'flex-start' }}>
                  <EngravedYear year={year} width={sceneWidth * .058} />
                </Pressable>
                <View style={{ position: 'absolute', left: sceneWidth * .195, bottom: 0, width: sceneWidth * .622, height: rowStep * .85, flexDirection: 'row', alignItems: 'flex-end' }}>
                  {MONTHS.map((label, i) => {
                    const canOpen = openable.has(monthKey(year, i + 1));
                    const bookHeight = rowStep * (.70 + ((i * 7 + index * 3) % 5) * .033);
                    const bookWidth = sceneWidth * (.046 + ((i + index) % 3) * .0045);
                    const bookX = sceneWidth * .195 + Array.from({ length: i }, (_, n) => sceneWidth * (.046 + ((n + index) % 3) * .0045)).reduce((a, b) => a + b, 0);
                    const selected = month?.year === year && month.month === i + 1;
                    return <Animated.View key={label} style={{ width: bookWidth, height: bookHeight,
                      transform: selected ? [{ translateY: opening.interpolate({ inputRange: [0, .4, 1], outputRange: [-10, -18, -3] }) }, { scale: opening.interpolate({ inputRange: [0, .4, 1], outputRange: [1, 1.13, 1] }) }] : [] }}>
                      <Pressable accessibilityRole="button" accessibilityLabel={focusedYear !== null ? `${label} ${year}${canOpen ? ', open journal' : ', no saved entries'}` : `${label} ${year}, focus shelf`}
                        accessibilityState={{ disabled: focusedYear !== null && !canOpen, selected }} disabled={focusedYear !== null && !canOpen}
                        onPress={() => focusedYear !== null ? openMonth(year, i + 1) : focusShelf(year, bookX + bookWidth / 2, rowBottom(index) - bookHeight / 2)}
                        style={{ width: bookWidth, height: bookHeight, opacity: canOpen ? 1 : .78 }}>
                        <BookhouseArt index={(i + index * 2) % 12} width={bookWidth} height={bookHeight} />
                        <Text style={{ position: 'absolute', top: bookHeight * .22, alignSelf: 'center', color: '#3B3525', backgroundColor: '#F7E4BEED', paddingHorizontal: 1,
                          fontFamily: serif, fontSize: sceneWidth * .018, borderRadius: 1 }}>{label}</Text>
                        {available.has(monthKey(year, i + 1)) && <View style={{ position: 'absolute', bottom: 0, right: bookWidth * .18, height: 8, width: 3, backgroundColor: '#DAB478' }} />}
                      </Pressable>
                    </Animated.View>;
                  })}
                </View>
              </View>)}
          <SceneLighting width={sceneWidth} night={lit} />
          {/* Same scene coordinates as the two hanging lanterns; never change world time. */}
          {__DEV__ && ([.19, .79] as const).map((x, index) => <Pressable key={x}
            accessibilityRole="button" accessibilityLabel={`${index === 0 ? 'Left' : 'Right'} lantern: toggle day/night`}
            onPress={() => setDevNight(value => !(value ?? worldNight))} hitSlop={6}
            style={{ position: 'absolute', left: sceneWidth * (x - .05), top: sceneWidth * .025,
              width: sceneWidth * .10, height: sceneWidth * .15, zIndex: 1, cursor: 'auto' }} />)}
        <View ref={deskLayout} onLayout={event => {
          // Web layout events can include camera zoom; measure the unscaled footprint.
          const measured = Platform.OS === 'web' ? (deskLayout.current as unknown as HTMLElement | null)?.offsetHeight : event.nativeEvent.layout.height;
          if (measured && measured > 0) setDeskHeight(measured);
        }} style={[s.desk, { position: 'absolute', top: sceneWidth * DESK_Y, width: viewportWidth, left: (sceneWidth - viewportWidth) / 2 }]}>
          <View testID="bookhouse-desk-surface" style={{ alignItems: 'center', justifyContent: 'flex-end', height: coverBaseline, marginTop: bookHeight * .035 }}>
            <View pointerEvents="none" testID="bookhouse-contact-shadow" style={{ position: 'absolute', bottom: -2, width: bookWidth * .91, height: Math.max(3, bookHeight * .012), borderRadius: bookWidth, backgroundColor: '#28170B30', shadowColor: '#28170B', shadowOpacity: .15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }} />
          <Animated.View testID="bookhouse-open-book" onLayout={e => setPageSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} style={[s.reading, { width: bookWidth, height: bookHeight, marginBottom: -(bookHeight - coverBaseline), paddingTop: bookHeight * .15, paddingBottom: bookHeight * .18, opacity: opening.interpolate({ inputRange: [0, 1], outputRange: [.25, 1] }) }]}>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}><BookhouseArt index={12} width={pageSize.width} height={pageSize.height} /></View>
            {lit && <View pointerEvents="none" style={{ position: 'absolute', left: '12%', right: '12%', top: '10%', bottom: '16%', borderRadius: 12, backgroundColor: '#976635', opacity: .16 }} />}
            <View style={s.pages}>
              <View pointerEvents={introVisible ? 'auto' : 'none'} aria-hidden={!introVisible} accessibilityElementsHidden={!introVisible} importantForAccessibility={introVisible ? 'auto' : 'no-hide-descendants'} style={[s.leftPage, { opacity: introVisible ? 1 : 0 }]}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={compactBook} style={{ alignSelf: 'stretch', flex: 1 }} contentContainerStyle={{ alignItems: 'center', gap: compactBook ? 2 : 6 }}>
                <Text style={[s.bookTitle, { fontSize: compactBook ? 17 : 27 }]}>{month ? `${MONTHS[month.month - 1]} ${month.year}` : 'Your private pages'}</Text>
                <View style={[s.coverPlaceholder, compactBook && { flex: undefined, flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 0, marginTop: 2 }]}>{selectedEntry?.journal && session ? <JournalCover key={selectedEntry.journal.id} userId={session.user.id} journalId={selectedEntry.journal.id} size={compactBook ? 60 : 125} /> : <BookhouseArt index={14} width={compactBook ? 60 : 125} height={compactBook ? 66 : 140} />}</View>
                <View style={s.bookDivider} />
                <Text style={s.bookCaption}>{month ? `Day ${day}` : 'Choose a saved month.'}</Text>
                {!!month && <Text style={s.bookCaption}>{dayEntries.length ? `${dayEntries.length} private ${dayEntries.length === 1 ? 'entry' : 'entries'}` : 'A page waiting for a memory'}</Text>}
                {!compactBook && dayEntries.length <= 1 && <Text style={[s.keepsake, { fontSize: sceneWidth >= 700 ? 23 : 16 }]}>Small moments{'\n'}still matter. ♡</Text>}
                {dayEntries.length > 1 && <View style={s.entrySelector}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Previous journal entry" disabled={entryIndex === 0} onPress={() => setEntryIndex(i => i - 1)} style={[s.smallButton, { opacity: entryIndex === 0 ? .3 : 1 }]}><Text style={s.body}>‹</Text></Pressable>
                  <Text style={s.bookCaption}>{entryIndex + 1} / {dayEntries.length}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Next journal entry" disabled={entryIndex >= dayEntries.length - 1} onPress={() => setEntryIndex(i => i + 1)} style={[s.smallButton, { opacity: entryIndex >= dayEntries.length - 1 ? .3 : 1 }]}><Text style={s.body}>›</Text></Pressable>
                </View>}
                </ScrollView>
              </View>
              <View style={[s.rightPage, { paddingHorizontal: compactBook ? 8 : 24 }]}>
                {!selectedEntry?.journal && <View style={s.pageHeader}><Text style={s.bookCaption}>Private journal</Text><Text style={s.bookCaption}>{month ? `${MONTHS[month.month - 1]} ${day}` : ''}</Text></View>}
                {loading ? <ActivityIndicator color="#725332" /> : error ? <><Text accessibilityRole="alert" style={s.body}>{error}</Text><Pressable accessibilityRole="button" onPress={reload} style={s.smallButton}><Text>Retry journals</Text></Pressable></> :
                  selectedEntry?.journal ? null :
                  month && isToday(month.year, month.month, day) ? <View style={{ marginTop: 20, gap: 8, alignItems: 'flex-start' }}>
                    <Text style={[s.body, { color: '#725C42' }]}>Nothing written today yet.</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Write today's journal" onPress={() => setEditor(true)} style={s.smallButton}>
                      <Text style={[s.body, { color: '#5B3F26', textDecorationLine: 'underline' }]}>Write today’s journal  →</Text></Pressable>
                  </View> :
                  <Text style={[s.body, { marginTop: 20, color: '#725C42' }]}>{month ? 'No journal saved for this day.' : available.size ? 'Your saved journals are waiting on the shelves.' : 'Your first private journal will open a month on these shelves.'}</Text>}
              </View>
            </View>
            {!loading && !error && selectedEntry?.journal && !compactBook && <JournalPages night={lit} key={selectedEntry.id} text={selectedEntry.journal.content} textStyle={pageTextStyle} onIntroChange={setIntroVisible} bookWidth={pageSize.width} bookHeight={pageSize.height} inset={24} date={month ? `${MONTHS[month.month - 1]} ${day}` : ''} />}
            {/* Phones: the book is too small for pages, so tapping it lifts the journal onto one full-screen sheet. */}
            {!loading && !error && selectedEntry?.journal && compactBook && <Pressable accessibilityRole="button" accessibilityLabel="Open journal" accessibilityHint="Lifts the journal so you can read it full screen"
              onPress={() => setReader(true)} style={[StyleSheet.absoluteFill, { left: '50%', paddingTop: bookHeight * .15, paddingBottom: bookHeight * .18, paddingRight: '12%', paddingLeft: 6, zIndex: 2 }]}>
              <View style={s.pageHeader}><Text style={s.bookCaption}>{month ? `${MONTHS[month.month - 1]} ${day}` : ''}</Text></View>
              <Text numberOfLines={6} style={[pageTextStyle, { opacity: .85 }]}>{selectedEntry.journal.content}</Text>
              <Text style={[s.bookCaption, { marginTop: 'auto', color: '#7B5A36' }]}>Tap to open ⤢</Text>
            </Pressable>}
            {!loading && !error && selectedEntry?.journal && !compactBook && <Pressable accessibilityRole="button" accessibilityLabel="Read journal full screen" onPress={() => setReader(true)}
              style={{ position: 'absolute', zIndex: 3, top: bookHeight * .06, right: '13%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F4E5C3E6', borderWidth: 1, borderColor: '#C9A86F' }}>
              <Text style={[s.bookCaption, { color: '#5B3F26' }]}>Read in full ⤢</Text></Pressable>}
            {month && <View style={s.tabs}>{MONTHS.map((label, i) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Read ${label} ${month.year}`}
              disabled={!openable.has(monthKey(month.year, i + 1))} accessibilityState={{ selected: month.month === i + 1, disabled: !openable.has(monthKey(month.year, i + 1)) }}
              onPress={() => openMonth(month.year, i + 1)} style={[s.monthTab, { opacity: openable.has(monthKey(month.year, i + 1)) ? 1 : .55, backgroundColor: month.month === i + 1 ? '#E8BFB2' : '#E2CAA6' }]}><Text style={s.tabText}>{label}</Text></Pressable>)}</View>}
          </Animated.View>
          </View>
          <View style={{ height: bookHeight - coverBaseline }} />
          {month && <ScrollView horizontal style={{ flexGrow: 0, height: 54 }} showsHorizontalScrollIndicator contentContainerStyle={s.days}>{Array.from({ length: daysInMonth(month.year, month.month) }, (_, i) => i + 1).map(n =>
            <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Day ${n}`} accessibilityState={{ selected: day === n }} onPress={() => setDay(n)} style={[s.day, day === n && { backgroundColor: '#E9BDC7' }]}><Text style={[s.body, { color: day === n ? '#513B2A' : '#FFF1D6' }]}>{n}</Text></Pressable>)}</ScrollView>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
          <View style={s.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="New Journal" onPress={() => setEditor(true)} style={s.action}><BookhouseArt index={13} width={45} height={52} /><Text style={s.actionText}>New{ '\n' }Journal  →</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Flower History" onPress={() => setHistory(true)} style={s.action}><BookhouseArt index={14} width={45} height={52} /><Text style={s.actionText}>Flower{ '\n' }History  →</Text></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Garden" onPress={leave} style={s.back}><Text style={[s.cream, { fontSize: 17 }]}>←  Back to Garden</Text></Pressable>
        </View>
        </Animated.View>
      </View>
      </GestureDetector>
    </ScrollView>
    {(focusedYear !== null || years.length > 6) && <View style={[s.focusTools, { top: insets.top + 8 }]}>
      {focusedYear !== null && <Pressable accessibilityRole="button" onPress={() => { setFocusedYear(null); sceneScroll.current?.scrollTo({ y: 0, animated: false }); }} style={s.smallButton}><Text style={s.cream}>← All Years</Text></Pressable>}
      {years.length > 6 && <>
        <Pressable accessibilityRole="button" disabled={yearOffset === 0} onPress={() => { setYearOffset(Math.max(0, yearOffset - 6)); setFocusedYear(null); sceneScroll.current?.scrollTo({ y: 0, animated: false }); }} style={s.smallButton}><Text style={s.cream}>Earlier years</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={yearOffset + 6 >= years.length} onPress={() => { setYearOffset(yearOffset + 6); setFocusedYear(null); sceneScroll.current?.scrollTo({ y: 0, animated: false }); }} style={s.smallButton}><Text style={s.cream}>Later years</Text></Pressable>
      </>}
    </View>}
    {editor && session && <JournalEditor userId={session.user.id} onClose={() => setEditor(false)} onSaved={async () => { setEditor(false); setNotice('Private journal saved.'); await reload(); }} />}
    {reader && selectedEntry?.journal && <JournalReader text={selectedEntry.journal.content} night={lit} date={month ? `${MONTHS[month.month - 1]} ${day}, ${month.year}` : ''} onClose={() => setReader(false)} />}
    {history && session && <FlowerHistory userId={session.user.id} timezone={session.user.timezone || 'UTC'} onClose={() => setHistory(false)} />}
  </Animated.View></GestureHandlerRootView>;
}

function Sheet({ title, onClose, children, theme }: { title: string; onClose: () => void; children: React.ReactNode; theme?: PanelTheme }) {
  const insets = useSafeAreaInsets();
  const journal = title === 'New Journal';
  return <Modal transparent animationType="fade" onRequestClose={onClose}><View style={[s.scrim, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
    <View style={[s.sheet, theme && { backgroundColor: theme.background, borderColor: theme.gold }, journal && s.journalSheet]}>{journal && <Image source={require('../../assets/bookhouse/desk.png')} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: .4 }]} />}<View style={[s.sheetHeader, theme && { borderColor: theme.border }]}><Text style={[s.title, theme && { color: theme.text }, journal && { fontSize: 27, paddingVertical: 14 }]}>{title}{journal ? ' ❧' : ''}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={s.smallButton}><Text style={[s.body, theme && { color: theme.text }]}>✕</Text></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 14 }}>{children}</ScrollView>
    </View></View></Modal>;
}
function JournalEditor({ userId, onClose, onSaved }: { userId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const saving = useRef(false);
  const voice = useEventVoiceInput(text, setText, busy, 2000, 'journal');
  const paperBody = [s.body, { color: '#4B3A27' }];
  const paperCaption = [s.caption, { color: '#7A6448' }];
  const save = async () => {
    if (saving.current || voice.active || !text.trim()) return;
    saving.current = true; setBusy(true); setError('');
    try { await savePrivateJournal(userId, text); await onSaved(); }
    catch (e) { setError(`${errorMessage(e)} If the connection was interrupted, check your shelf before saving again.`); }
    finally { saving.current = false; setBusy(false); }
  };
  // Written on the lifted page: one tall sheet with room to keep going.
  return <ImmersivePaper title="New Journal ❧" subtitle="Only for you · not sent to AI or saved as an Event memory" closeLabel="Close New Journal"
    onClose={() => { if (!busy) onClose(); }} footer={<>
      {voice.active && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text accessibilityLiveRegion="polite" style={paperCaption}>{voice.phase === 'recording' ? `Recording ${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, '0')} / 3:00` : voice.phase === 'transcribing' ? 'Transcribing…' : 'Preparing microphone…'}</Text>
        {voice.phase === 'recording' && <Pressable accessibilityRole="button" accessibilityLabel="Done recording" onPress={() => void voice.done()} style={s.smallButton}><Text style={paperBody}>Done</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel voice input" onPress={() => void voice.cancel()} style={s.smallButton}><Text style={paperBody}>Cancel</Text></Pressable>
      </View>}
      {!!voice.error && <Text accessibilityRole="alert" style={paperBody}>{voice.error}</Text>}
      {!!voice.overflow && <Text selectable style={paperBody}>{voice.overflow}</Text>}
      {!!error && <Text accessibilityRole="alert" style={paperBody}>{error}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={[paperCaption, { flex: 1 }]}>{text.length} / 2000 · saved privately for you</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Dictate private journal" accessibilityHint="Record up to three minutes, then review before saving"
          disabled={busy || voice.active} accessibilityState={{ disabled: busy || voice.active }} onPress={() => void voice.start()}
          style={{ width: 48, height: 48, opacity: busy || voice.active ? .5 : 1 }}>
          <Image accessible={false} source={require('../../assets/events/microphone.png')} style={{ width: 48, height: 48 }} resizeMode="contain" />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Save private journal" disabled={busy || voice.active || !text.trim()} onPress={save}
        style={[s.save, { backgroundColor: '#5B7A62', opacity: busy || voice.active || !text.trim() ? .55 : 1 }]}><Text style={[s.cream, { fontSize: 18 }]}>{busy ? 'Saving…' : 'Save private journal'}</Text></Pressable>
    </>}>
    <EmotionalSafetyNote text={text} />
    <TextInput accessibilityLabel="Private journal" placeholder="A moment to keep…" placeholderTextColor="#A08562" value={text} onChangeText={setText} multiline maxLength={2000} editable={!busy} autoFocus
      style={[immersiveText, { flex: 1, minHeight: 200, textAlignVertical: 'top', padding: 0, backgroundColor: 'transparent', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }]} />
  </ImmersivePaper>;
}

// Reading a saved journal on the lifted page: the whole entry on one scrolling sheet.
function JournalReader({ text, date, night, onClose }: { text: string; date: string; night?: boolean; onClose: () => void }) {
  return <ImmersivePaper title={date || 'Private journal'} subtitle="Private journal" closeLabel="Close journal" night={night} onClose={onClose}>
    <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator>
      <Text selectable style={immersiveText}>{text}</Text>
    </ScrollView>
  </ImmersivePaper>;
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
  journalSheet: { maxWidth: 760, borderRadius: 16, borderWidth: 2, shadowColor: '#180D06', shadowOpacity: .5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  root: { flex: 1, backgroundColor: '#38291F' },
  focusTools: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#38291FCC', borderRadius: 12 },
  cream: { color: '#FFF1D6', fontFamily: serif, fontSize: 15 }, smallButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 12 },
  desk: { paddingHorizontal: 0, overflow: 'hidden' },
  reading: { paddingHorizontal: '10%' },
  pages: { flexDirection: 'row', flex: 1 }, leftPage: { flex: 1, paddingHorizontal: 12, paddingTop: 4, gap: 6, alignItems: 'center' }, rightPage: { flex: 1, minWidth: 0, minHeight: 0, paddingHorizontal: 10, paddingTop: 6 },
  bookTitle: { fontFamily: serif, fontStyle: 'italic', color: '#4A5947', textAlign: 'center' }, bookCaption: { fontFamily: serif, color: '#66513A', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  coverPlaceholder: { flex: 1, maxHeight: 190, minHeight: 100, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, bookDivider: { width: '75%', borderTopWidth: 1, borderColor: '#BAA078', marginVertical: 5 },
  keepsake: { fontFamily: serif, fontStyle: 'italic', color: '#9A744D', textAlign: 'center', lineHeight: 30, marginTop: 12 }, entrySelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', borderBottomWidth: 1, borderColor: '#CBB58E', paddingBottom: 10, marginBottom: 14 },
  title: { fontFamily: serif, fontSize: 18, color: '#345849' }, body: { fontFamily: serif, color: '#475448', fontSize: 15, lineHeight: 22 }, caption: { color: '#68745D', fontFamily: serif, fontSize: 12, lineHeight: 17 },
  tabs: { position: 'absolute', right: 0, top: '15%', bottom: '18%', width: 32 }, monthTab: { flex: 1, justifyContent: 'center', alignItems: 'center', borderTopRightRadius: 5, borderBottomRightRadius: 5, borderWidth: .5, borderColor: '#B99F79' }, tabText: { fontSize: 10, color: '#3C5046', fontFamily: serif },
  days: { gap: 2, paddingTop: 8 }, day: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, entry: { paddingBottom: 12, gap: 5 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 }, action: { flex: 1, minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#F9EDCF', borderWidth: 2, borderColor: '#C9A264', borderRadius: 16 }, actionText: { fontFamily: serif, color: '#3D6255', fontSize: 17 },
  back: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 12 }, notice: { color: '#FFF3D8', backgroundColor: '#315E49', padding: 10, marginTop: 8, borderRadius: 8 },
  scrim: { flex: 1, backgroundColor: '#231B16C9', paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' }, sheet: { width: '100%', maxWidth: 620, maxHeight: '100%', backgroundColor: '#F5EBD7', borderRadius: 18, borderWidth: 2, borderColor: '#C1A26E', overflow: 'hidden' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, borderBottomWidth: 1, borderColor: '#D4C3A3' },
  input: { minHeight: 150, color: '#28483C', backgroundColor: '#FFFBF1', borderWidth: 1, borderColor: '#A5B29B', padding: 14, borderRadius: 10, fontSize: 16, textAlignVertical: 'top' }, moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, mood: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#B8C0A6', borderRadius: 20 }, chosen: { backgroundColor: '#CADAC7', borderColor: '#42654D' }, save: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#315E49', borderRadius: 24 }, historyEntry: { borderBottomWidth: 1, borderColor: '#D4C3A3', paddingBottom: 12 },
});
