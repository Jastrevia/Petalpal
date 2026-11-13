import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { drawPetalCard, requestPetalReading, type PetalCardFace, type PetalReading, type PetalToday, type PetalTopic } from '../../services/petalCardDraw';
import { PETAL_CARD_ART } from './petalCardArt';
import { prepareShare, sharePrepared, type PreparedShare, type ShareOutcome } from './petalShare';
import { usePauseGardenWhile } from '../garden/gardenOverlayPause';
import { JOURNAL_ART } from '../features/journalKit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';

const BACKS = {
  lilac: require('@/assets/petal-card-backs/lilac.webp'),
  violet: require('@/assets/petal-card-backs/violet.webp'),
};

const COPY = {
  en: { title: 'THE PETAL RING', sub: 'Turn the ring slowly and choose one', hint: 'Drag to turn · tap the glowing card',
    no: 'No.', turnOver: 'Turn it over', close: 'Close', today: "Today's petal card", drawing: 'Drawing…',
    failed: "The draw didn't go through. Try again.", chosen: (n: number) => `You chose card ${n}`,
    share: 'Share', preparing: 'Making the picture…', saved: 'Picture saved. Post it to Instagram, Reddit, X, WeChat or RedNote from your photos.',
    shareFailed: "Couldn't share this time. Try again.", ask: 'What’s on your mind today?',
    askSub: 'One question a day, one card for it.', later: 'Come back later', uses: (_n: number) => 'Today’s card is still face down', usedUp: 'Today’s card is turned. The ring turns again tomorrow.', notes: 'Notes', upright: 'Upright', reversed: 'Reversed',
    reading: 'Reading', readingWait: 'Reading your card…',
    readingConsent: 'Turn on AI processing in Privacy to see the reading of your card.',
    freeLeft: (n: number) => n === 0 ? 'That was your last free reading.' : `${n} free ${n === 1 ? 'reading' : 'readings'} left.`,
    locked: 'Your free readings are used up. A one-time unlock is on its way.' },
  'zh-Hans': { title: '花环', sub: '慢慢转，在今天的牌里挑一张', hint: '拖动花环 · 轻点亮着的那张',
    no: '第', turnOver: '翻开它', close: '收起', today: '今日花语卡', drawing: '正在抽牌…',
    failed: '抽牌没有成功，再试一次。', chosen: (n: number) => `你挑了第 ${n} 张`,
    share: '分享', preparing: '正在画分享图……', saved: '图片已保存，可以从相册发到小红书、微信、Instagram、X 或 Reddit。',
    shareFailed: '这次没有分享成功，再试一次。', ask: '今天，想问问哪件事？', askSub: '一天一问，一问一张牌。', later: '晚一点再来', uses: (_n: number) => '今天的牌还没翻开', usedUp: '今天的牌翻开了。明天，花环会重新转起来。', notes: '注意事项',
    upright: '正位', reversed: '逆位', reading: '牌面解读', readingWait: '正在解读…',
    readingConsent: '在隐私设置里打开 AI 处理，就能看到这张牌的解读。',
    freeLeft: (n: number) => n === 0 ? '这是最后一次免费解读。' : `还可以免费解读 ${n} 次。`,
    locked: '免费解读用完了。一次解锁、每天都能看的方式还在准备。' },
};

const mod = (n: number, m: number) => ((n % m) + m) % m;
const READING_TRIES = 8;

// The petal ring (design: the owner's loop ring): first the owner picks today's topic, then a few
// card places on a tilted ring carry the whole of today's deck flowing through them. One step brings the next card to the front, a
// full turn the next batch, and after the last card the first comes round again. The deck order
// stays on the server; tapping the front card sends its place and the server reveals the card.
export function PetalRing({ visible, today, onClose }: { visible: boolean; today: PetalToday | null; onClose: () => void }) {
  const { width: vw, height: vh } = useWindowDimensions();
  const locale = today?.locale ?? 'en';
  const copy = COPY[locale];
  const insets = useSafeAreaInsets();
  // A phone held sideways is wide but short: the ring lies flatter so the far cards clear the heading
  // and the near ones stay on the screen, the topics sit two to a row, and the drawn card stands
  // beside its words instead of above them.
  const short = vh < 520 && vw > vh;
  const size = useMemo(() => {
    const cw = Math.round(Math.max(58, Math.min(112, short ? vh * 0.165 : Math.min(vw * 0.19, vh * 0.12))));
    const r = Math.round(Math.max(140, Math.min(420, vw * 0.42)));
    const n = Math.max(8, Math.floor((2 * Math.PI * r) / (cw * 1.5)));
    return { cw, ch: Math.round(cw * 1.55), r, n, step: 360 / n };
  }, [vw, vh, short]);
  const deckSize = today?.deckSize ?? 69;
  usePauseGardenWhile(visible);
  // The ring turns on the UI thread: each card reads the shared angle in its own animated style,
  // so spinning never re-renders the deck. React only hears when a new card reaches the front.
  const angle = useSharedValue(0), velocity = useSharedValue(0), dragging = useSharedValue(false), lastX = useSharedValue(0);
  const [front, setFront] = useState(0);
  const [phase, setPhase] = useState<'topic' | 'spin' | 'drawing' | 'chosen' | 'revealed'>('topic');
  const [face, setFace] = useState<PetalCardFace | null>(null);
  const [topic, setTopic] = useState<{ id: PetalTopic | null; label: string | null }>({ id: null, label: null });
  const [reading, setReading] = useState<PetalReading | null>(null);
  const [chosenNo, setChosenNo] = useState(0);
  const [error, setError] = useState('');
  const lift = useRef(new Animated.Value(0)).current, flip = useRef(new Animated.Value(0)).current;
  // The share picture is made once the card faces up (petalShare.ts).
  const [prepared, setPrepared] = useState<PreparedShare | null>(null);
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  // The small print under a turned card (what petal cards are not, free readings left) stays folded until asked for.
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => {
    setPrepared(null); setShared(null);
    if (phase !== 'revealed' || !face) return;
    let active = true;
    void prepareShare(face, PETAL_CARD_ART[face.id], locale).then(result => {
      if (!active) return;
      setPrepared(result);
      // Development only: window.__petalShare holds the picture, to look at without sharing.
      if (__DEV__ && typeof window !== 'undefined') (window as unknown as { __petalShare?: PreparedShare }).__petalShare = result;
    });
    return () => { active = false; };
  }, [phase, face, locale]);
  const share = () => { if (prepared) void sharePrepared(prepared).then(setShared); };

  // Opening: show today's card straight away if it was drawn already, else ask for today's topic.
  useEffect(() => {
    if (!visible) return;
    lift.setValue(0); flip.setValue(0); setError('');
    if (today?.drawn?.card) {
      setFace(today.drawn.card); setChosenNo(mod(today.drawn.position, deckSize) + 1); setPhase('revealed');
      setTopic({ id: today.drawn.topic, label: today.drawn.topicLabel }); setReading(today.drawn.reading ?? null);
      lift.setValue(1); flip.setValue(1);
    } else {
      setFace(null); setReading(null); setTopic({ id: null, label: null }); setPhase('topic');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  function pickTopic(id: PetalTopic, label: string) {
    setTopic({ id, label }); setPhase('spin');
    angle.value = 0; velocity.value = -1.4; setFront(0);
  }

  // Once the card faces up, ask for its reading if this owner can have one. Another device may be
  // writing it already (GENERATING): look again, at most READING_TRIES times. Anything unexpected
  // (an error, the switch turned off) hides the reading; the card itself is never affected.
  const tries = useRef(0);
  useEffect(() => { tries.current = 0; }, [visible]);
  useEffect(() => {
    if (!visible || phase !== 'revealed' || !reading?.available || reading.needsConsent || reading.locked) return;
    if (reading.status !== 'NONE' && reading.status !== 'GENERATING') return;
    const hide = { available: true, needsConsent: false, status: 'FAILED' } as const;
    if (++tries.current > READING_TRIES) { setReading(hide); return; }
    let active = true;
    const timer = setTimeout(() => {
      void requestPetalReading().then(next => { if (active) setReading(next ?? { available: false }); })
        .catch(() => { if (active) setReading(hide); });
    }, reading.status === 'GENERATING' ? 4000 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [visible, phase, reading]);

  // Inertia and snapping, frame-rate independent, only while the ring is open and spinning.
  const step = size.step;
  const spinning = useFrameCallback(info => {
    if (dragging.value) return;
    const k = Math.min(4, (info.timeSincePreviousFrame ?? 16) / 16);
    if (Math.abs(velocity.value) > 0.03) { angle.value += velocity.value * k; velocity.value *= Math.pow(0.955, k); }
    else {
      const target = Math.round(angle.value / step) * step;
      velocity.value = 0;
      if (Math.abs(target - angle.value) > 0.01) angle.value += (target - angle.value) * Math.min(1, 0.14 * k);
    }
  }, false);
  useEffect(() => {
    spinning.setActive(visible && phase === 'spin');
    return () => spinning.setActive(false);
  }, [visible, phase, spinning]);
  useAnimatedReaction(() => Math.round(-angle.value / step), (next, previous) => {
    if (next !== previous) runOnJS(setFront)(next);
  }, [step]);

  const degPerPx = 180 / (Math.PI * size.r);
  // A drag ends with a release over some card; that release must not count as choosing it.
  const lastDrag = useRef(0);
  const noteDrag = () => { lastDrag.current = Date.now(); };
  const ringActive = phase === 'spin' || phase === 'drawing';
  const pan = useMemo(() => Gesture.Pan().enabled(ringActive).activeOffsetX([-6, 6]).failOffsetY([-14, 14])
    .onBegin(() => { dragging.value = true; velocity.value = 0; lastX.value = 0; })
    .onStart(() => { runOnJS(noteDrag)(); })
    .onUpdate(e => { angle.value += (e.translationX - lastX.value) * degPerPx; lastX.value = e.translationX; })
    .onEnd(e => { velocity.value = (e.velocityX / 60) * degPerPx; runOnJS(noteDrag)(); })
    .onFinalize(() => { dragging.value = false; }), [ringActive, degPerPx, angle, velocity, dragging, lastX]);

  const placeOf = (i: number) => i + size.n * Math.round((front - i) / size.n);
  const frontNo = mod(front, deckSize) + 1;

  async function choose(place: number) {
    if (phase !== 'spin' || !topic.id || Date.now() - lastDrag.current < 350) return;
    if (place !== front) { velocity.value = 0; angle.value = -place * size.step; return; }
    setPhase('drawing'); setError('');
    try {
      const result = await drawPetalCard(mod(place, deckSize), topic.id);
      if (!result?.card) throw new Error('No card');
      setFace(result.card); setChosenNo(mod(result.position, deckSize) + 1); setPhase('chosen');
      setTopic({ id: result.topic, label: result.topicLabel }); setReading(result.reading ?? null);
      Animated.timing(lift, { toValue: 1, duration: 750, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
    } catch { setError(copy.failed); setPhase('spin'); }
  }
  function turnOver() {
    Animated.timing(flip, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      .start(() => setPhase('revealed'));
  }

  const back = BACKS[today?.back ?? 'lilac'];
  const P = size.r * 4.2, tilt = short ? 0.2 : 0.3;
  const bigW = short ? Math.min(vh * 0.62 / 1.55, 200) : Math.min(vw * 0.6, vh * 0.34 / 1.55, 260), bigH = bigW * 1.55;
  // Sideways: the card's column is the left 40 % of the screen, its words take the rest.
  const wordsLeft = Math.round(vw * 0.4);
  const showRing = phase === 'spin' || phase === 'drawing';
  const backFace = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] });
  const frontFace = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const turn = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] });
  return <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <GestureHandlerRootView style={{ flex: 1 }}><GestureDetector gesture={pan}>
    <View style={styles.sky}>
      {STARS.map(([x, y, s], i) => <View key={i} pointerEvents="none" style={[styles.star, { left: `${x}%`, top: `${y}%`, width: s, height: s }]} />)}
      <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose}
        style={[styles.close, short && { top: 12 }, { right: 16 + insets.right }]}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
      {phase === 'topic' ? <ScrollView style={[styles.topicsScroll, short && { top: 14 }]} showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.topics, { paddingLeft: 24 + insets.left, paddingRight: 24 + insets.right, paddingBottom: 24 + insets.bottom }]}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={[styles.ask, short && { marginTop: 4 }]}>{copy.ask}</Text>
        <Text style={styles.sub}>{copy.askSub}</Text>
        <View style={[styles.topicList, short && styles.topicListShort]}>
          {(today?.topics ?? []).map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => pickTopic(item.id, item.label)}
            style={({ pressed }) => [styles.topic, short && styles.topicShort, pressed && styles.pressed]}><Text style={styles.topicText}>{item.label}</Text></Pressable>)}
        </View>
        <Text testID="petal-uses" style={styles.uses}>{copy.uses(0)}</Text>
        <Pressable testID="petal-later" accessibilityRole="button" onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
          <Text style={styles.laterText}>{copy.later}</Text>
        </Pressable>
      </ScrollView> : null}

      {showRing ? <View pointerEvents="none" style={[styles.header, short && styles.headerShort]}>
        <Text style={styles.title}>{copy.title}</Text>
        {topic.label ? <Text style={[styles.topicTag, short && { marginTop: 4 }]}>{topic.label}</Text> : null}
        {/* Sideways the same words sit in the middle of the ring (the hint below), so they are not said twice. */}
        {short ? null : <Text style={styles.sub}>{copy.sub}</Text>}
        <View style={[styles.counter, short && { marginTop: 6 }]}>
          <Text style={styles.counterText}>{copy.no} <Text style={styles.counterValue}>{frontNo}</Text> / {deckSize}</Text>
        </View>
        <View style={[styles.track, short && { marginTop: 6 }]}><View style={[styles.fill, { width: `${(frontNo / deckSize) * 100}%` }]} /></View>
      </View> : null}

      {showRing ? <View style={[styles.ringCenter, { top: vh * (short ? 0.5 : 0.47) }]}>
        {Array.from({ length: size.n }, (_, i) => {
          const place = placeOf(i);
          return <RingCard key={i} index={i} place={place} number={mod(place, deckSize) + 1} isFront={place === front}
            angle={angle} size={size} perspective={P} tilt={tilt} back={back} label={`${copy.no} ${mod(place, deckSize) + 1}`} onChoose={choose} />;
        })}
      </View> : null}

      {!showRing && phase !== 'topic' ? <Animated.View style={[styles.big, { width: bigW, height: bigH, top: short ? (vh - bigH) / 2 : vh * 0.1 },
        short && { alignSelf: 'flex-start', left: Math.max(insets.left + 12, (wordsLeft + insets.left - bigW) / 2) }, {
        transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [vh * 0.25, 0] }) },
          { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }, { perspective: 1200 }, { rotateY: turn }] }]}>
        <Animated.Image source={back} style={[styles.bigImage, { opacity: backFace }]} />
        {/* A card without bundled art keeps its back rather than turning blank. */}
        {face ? <Animated.Image source={PETAL_CARD_ART[face.id] ?? back}
          style={[styles.bigImage, { opacity: frontFace }, face.reversed && PETAL_CARD_ART[face.id] !== undefined && styles.upsideDown]} /> : null}
      </Animated.View> : null}

      {phase === 'drawing' ? <ActivityIndicator style={styles.drawing} color="#E9CF8A" accessibilityLabel={copy.drawing} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {showRing ? <Text pointerEvents="none" style={[styles.hint, short && { bottom: 'auto', top: vh * 0.5 - 10 }]}>{copy.hint}</Text> : null}

      {phase === 'chosen' ? <View style={[styles.panel, short && { left: wordsLeft, right: 24 + insets.right, bottom: 'auto', top: vh * 0.34 }]}>
        <Text style={styles.panelTitle}>{copy.chosen(chosenNo)}</Text>
        <Pressable accessibilityRole="button" onPress={turnOver} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{copy.turnOver}</Text>
        </Pressable>
      </View> : null}

      {phase === 'revealed' && face ? <ScrollView style={[styles.reveal, short ? { top: 0, left: wordsLeft } : { top: vh * 0.1 + bigH + 12 }]}
        contentContainerStyle={[styles.revealContent, short && { paddingTop: 20, paddingRight: 64 + insets.right, paddingBottom: 20 + insets.bottom }]}>
        <Text style={styles.kicker}>{topic.label ?? copy.today}</Text>
        <Text style={styles.cardName}>{face.name}</Text>
        {face.keywords ? <Text style={styles.orientation}>{`${face.reversed ? copy.reversed : copy.upright} · ${face.keywords.join(locale === 'en' ? ', ' : '、')}`}</Text> : null}
        <Text style={styles.line}>{face.line}</Text>
        <Text style={styles.text}>{face.text}</Text>
        {/* The reading opens under the same painted golden sprig that divides the pavilion's journal pages. */}
        {reading?.available && reading.status === 'READY' && reading.paragraphs?.length ? <View style={styles.reading}>
          <Image source={JOURNAL_ART.divider} resizeMode="contain" accessible={false} style={styles.sprig} />
          <Text style={styles.readingTitle}>{copy.reading}</Text>
          {reading.paragraphs.map((paragraph, i) => <Text key={i} selectable style={styles.readingText}>{paragraph}</Text>)}
        </View> : null}
        {reading?.available && reading.locked ? <Text style={styles.lockedNote}>{copy.locked}</Text> : null}
        {reading?.available && !reading.needsConsent && !reading.locked && (reading.status === 'NONE' || reading.status === 'GENERATING') ? <View style={styles.waitRow}>
          <ActivityIndicator size="small" color="#E9CF8A" accessible={false} /><Text style={styles.text}>{copy.readingWait}</Text>
        </View> : null}
        {reading?.available && reading.needsConsent ? <Text style={styles.disclaimer}>{copy.readingConsent}</Text> : null}
        <Pressable testID="petal-notes" accessibilityRole="button" accessibilityState={{ expanded: notesOpen }} onPress={() => setNotesOpen(open => !open)}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }} style={({ pressed }) => [styles.notesToggle, pressed && styles.pressed]}>
          <Text style={styles.notesLabel}>{`${copy.notes} ${notesOpen ? '▴' : '▾'}`}</Text>
        </Pressable>
        {notesOpen ? <View testID="petal-notes-body">
          <Text style={styles.disclaimer}>{face.disclaimer}</Text>
          {reading?.available && reading.status === 'READY' && typeof reading.freeLeft === 'number' ? <Text style={styles.disclaimer}>{copy.freeLeft(reading.freeLeft)}</Text> : null}
        </View> : null}
        {/* Today's draw is used: said quietly at the foot of the page, after the card and its reading. */}
        <Text testID="petal-used-up" style={styles.usedUp}>{copy.usedUp}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.share} accessibilityState={{ disabled: !prepared }} disabled={!prepared}
          onPress={share} style={({ pressed }) => [styles.secondary, !prepared && styles.waiting, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>{prepared ? copy.share : copy.preparing}</Text>
        </Pressable>
        {shared === 'saved' || shared === 'failed' ? <Text accessibilityRole="alert" style={styles.disclaimer}>{shared === 'saved' ? copy.saved : copy.shareFailed}</Text> : null}
        <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{copy.close}</Text>
        </Pressable>
      </ScrollView> : null}
    </View>
    </GestureDetector></GestureHandlerRootView>
  </Modal>;
}

// One card on the ring. Its place on the tilted circle is computed on the UI thread from the
// shared angle; it re-renders only when its number, glow or size change.
const RingCard = memo(function RingCard({ index, place, number, isFront, angle, size, perspective, tilt, back, label, onChoose }: {
  index: number; place: number; number: number; isFront: boolean; angle: SharedValue<number>;
  size: { cw: number; ch: number; r: number; step: number }; perspective: number; tilt: number;
  back: ImageSourcePropType; label: string; onChoose: (place: number) => void;
}) {
  const { cw, ch, r, step } = size;
  const style = useAnimatedStyle(() => {
    const deg = index * step + angle.value, rad = (deg * Math.PI) / 180;
    const z = r * Math.cos(rad), x = r * Math.sin(rad);
    const s = perspective / (perspective - z), facing = (Math.cos(rad) + 1) / 2;
    const turned = (((deg + 180) % 360) + 360) % 360 - 180;
    return { zIndex: Math.round(facing * 100), opacity: 0.3 + 0.7 * facing,
      transform: [{ translateX: x * s }, { translateY: z * tilt * s }, { perspective: 900 }, { rotateY: `${turned}deg` }, { scale: s }] };
  }, [index, step, r, perspective, tilt]);
  return <Reanimated.View style={[{ position: 'absolute', left: -cw / 2, top: -ch / 2, width: cw }, style]}>
    <Pressable onPress={() => onChoose(place)} accessibilityRole="button" accessibilityLabel={label}>
      <Image source={back} style={[{ width: cw, height: ch, borderRadius: cw * 0.07 }, isFront && styles.glow]} />
      <Text style={[styles.no, { fontSize: cw * 0.15 }]}>{number}</Text>
    </Pressable>
  </Reanimated.View>;
});

// A fixed scatter of faint stars over the night background.
const STARS: [number, number, number][] = Array.from({ length: 36 }, (_, i) => [((i * 37) % 97) + 1.5, ((i * 53) % 89) + 4, i % 5 === 0 ? 3 : 2]);

const styles = StyleSheet.create({
  sky: { flex: 1, backgroundColor: '#17123A', overflow: 'hidden' },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF55' },
  close: { position: 'absolute', top: 44, right: 16, zIndex: 300, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF14' },
  closeText: { fontSize: 26, lineHeight: 30, color: '#F6EDDB' },
  header: { position: 'absolute', top: 40, left: 16, right: 16, alignItems: 'center', zIndex: 200 },
  title: { fontFamily: 'serif', fontSize: 15, letterSpacing: 6, color: '#E9CF8A' },
  sub: { marginTop: 8, fontFamily: 'serif', fontSize: 12, color: '#C9C0E8', textAlign: 'center' },
  counter: { marginTop: 12, flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: '#E9CF8A55', backgroundColor: '#1B154088' },
  counterText: { fontFamily: 'serif', fontSize: 12, color: '#E9CF8A' },
  counterValue: { color: '#FFF3CF' },
  track: { marginTop: 10, width: 240, maxWidth: '70%', height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: '#FFFFFF22' },
  fill: { height: '100%', backgroundColor: '#E9CF8A' },
  ringCenter: { position: 'absolute', left: '50%', width: 0, height: 0 },
  glow: { boxShadow: '0 0 18px 4px #F3DFA8CC', borderWidth: 1.5, borderColor: '#F3DFA8' },
  no: { textAlign: 'center', marginTop: 4, fontFamily: 'serif', color: '#E9CF8A' },
  big: { position: 'absolute', alignSelf: 'center', zIndex: 250 },
  bigImage: { position: 'absolute', width: '100%', height: '100%', borderRadius: 14 },
  upsideDown: { transform: [{ rotate: '180deg' }] },
  headerShort: { top: 12 },
  topicsScroll: { position: 'absolute', top: 70, left: 0, right: 0, bottom: 0, zIndex: 200 },
  topics: { alignItems: 'center', gap: 12 },
  topicList: { alignSelf: 'stretch', alignItems: 'center', gap: 12 },
  topicListShort: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  topicShort: { width: '46%' },
  ask: { marginTop: 18, fontFamily: 'serif', fontSize: 22, color: '#F3DFA8', textAlign: 'center' },
  topic: { alignSelf: 'center', maxWidth: 360, width: '100%', minHeight: 48, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: '#E9CF8A88', backgroundColor: '#1B154088' },
  topicText: { fontFamily: 'serif', fontSize: 17, color: '#F6EDDB' },
  uses: { marginTop: 2, fontFamily: 'serif', fontSize: 12, color: '#C9C0E8' },
  later: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontFamily: 'serif', fontSize: 15, color: '#E9CF8A', textDecorationLine: 'underline' },
  usedUp: { fontFamily: 'serif', fontSize: 12, color: '#C9C0E8', textAlign: 'center', marginVertical: 4 },
  topicTag: { marginTop: 8, fontFamily: 'serif', fontSize: 15, color: '#F3DFA8' },
  orientation: { fontFamily: 'serif', fontSize: 13, letterSpacing: 1, color: '#E9CF8A', textAlign: 'center' },
  reading: { alignSelf: 'center', width: '100%', maxWidth: 620, marginTop: 6, gap: 10 },
  sprig: { alignSelf: 'center', width: 210, height: 42 },
  readingTitle: { fontFamily: 'serif', fontSize: 15, letterSpacing: 2, color: '#E9CF8A', textAlign: 'center' },
  readingText: { fontFamily: 'serif', fontSize: 15, lineHeight: 25, color: '#F1EAF9' },
  lockedNote: { alignSelf: 'stretch', marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderColor: '#E9CF8A44',
    fontFamily: 'serif', fontSize: 14, lineHeight: 22, color: '#D8D0F0', textAlign: 'center' },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  drawing: { position: 'absolute', alignSelf: 'center', bottom: 120 },
  error: { position: 'absolute', alignSelf: 'center', bottom: 90, color: '#F4B9C2', fontSize: 13 },
  hint: { position: 'absolute', bottom: 40, alignSelf: 'center', fontFamily: 'serif', fontSize: 12, color: '#9F96C8' },
  panel: { position: 'absolute', left: 20, right: 20, bottom: 36, alignItems: 'center', gap: 14 },
  panelTitle: { fontFamily: 'serif', fontSize: 18, color: '#F3DFA8', textAlign: 'center' },
  primary: { alignSelf: 'stretch', paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: '#E9CF8A' },
  primaryText: { fontFamily: 'serif', fontSize: 16, color: '#2B2457' },
  pressed: { opacity: 0.8 },
  secondary: { alignSelf: 'stretch', paddingVertical: 11, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E9CF8A' },
  secondaryText: { fontFamily: 'serif', fontSize: 16, color: '#F3DFA8' },
  waiting: { opacity: 0.55 },
  reveal: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  revealContent: { paddingHorizontal: 24, paddingBottom: 30, alignItems: 'center', gap: 8 },
  kicker: { fontFamily: 'serif', fontSize: 12, letterSpacing: 2, color: '#C9C0E8' },
  cardName: { fontFamily: 'serif', fontSize: 22, color: '#F3DFA8', textAlign: 'center' },
  line: { fontFamily: 'serif', fontSize: 17, color: '#F6EDDB', textAlign: 'center' },
  text: { fontFamily: 'serif', fontSize: 14, lineHeight: 22, color: '#D8D0F0', textAlign: 'center' },
  disclaimer: { fontSize: 11, color: '#9F96C8', textAlign: 'center', marginVertical: 4 },
  notesToggle: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 10 },
  notesLabel: { fontSize: 11, letterSpacing: 0.6, color: '#9F96C8', textAlign: 'center' },
});
