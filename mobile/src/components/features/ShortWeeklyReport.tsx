import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { readEvent } from '../../services/events';
import { moodCurveLayout, moodIcon, setInsightFeedback, SHORT_COPY, shortDate, thenNowCount, type Insight, type InsightFeedback,
  type ShortWeekly } from '../../services/reflections';
import { petalCardArt } from '../petalCards/petalCardArt';
import { EventIllustration } from './EventIllustration';
import { BudGate, useEventSpecies, WeeklyBouquet } from './WeeklyBloom';

const CURVE_HEIGHT = 104, DOT = 26, CHIP = DOT + 6;
// One Event open at a time, under the part (`at`) that opened it.
type Opened = { at: string; id: string } & ({ state: 'loading' } | { state: 'ready'; text: string } | { state: 'error' });

// Weekly 2.0 reports opened while the app runs: they open straight to the bouquet next time (and on the page-turn copy).
const BLOOMED = new Set<string>();
const MARK_TEXT = { HIDDEN: 'hidden', INACCURATE: 'thanks' } as const;

// Rendering only: every part was chosen and validated on the backend; a hidden part simply is not saved.
// Weekly 2.0 (docs/product/WEEKLY_2.0.md): a bud to tap → the week's flowers rise into the bouquet → the headline →
// main insight → more insights, side by side to swipe → "还有一件事" (then and now) → petal card → question; each insight
// can be marked "不准确" or hidden. With insights but no 2.0 headline: the same order around the mood curve. Without
// insights the layout is the short report's (a 2.0 headline still shows first).
export function ShortWeeklyReport({ short, interactive, onWrite, reportId, reducedMotion = false }: {
  short: ShortWeekly; interactive: boolean; onWrite: () => void; reportId?: string; reducedMotion?: boolean;
}) {
  const copy = SHORT_COPY[short.locale];
  const [opened, setOpened] = useState<Opened | null>(null);
  const [width, setWidth] = useState(0);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  // ---- Weekly 2.0 opening ----
  const bloomKey = reportId ?? '';
  const ceremony = short.version2 && !!short.insights;
  const [bloomed, setBloomed] = useState(() => !ceremony || reducedMotion || BLOOMED.has(bloomKey));
  const points = short.curve?.points ?? [];
  const bud = useRef(new Animated.Value(1)).current, headlineIn = useRef(new Animated.Value(bloomed ? 1 : 0)).current;
  const restIn = useRef(new Animated.Value(bloomed ? 1 : 0)).current;
  const rise = useRef(points.map(() => new Animated.Value(bloomed ? 1 : 0))).current;
  const species = useEventSpecies();
  function bloom() {
    BLOOMED.add(bloomKey);
    if (reducedMotion) { [headlineIn, restIn, ...rise].forEach(value => value.setValue(1)); setBloomed(true); return; }
    const ease = (value: Animated.Value, duration = 360) => Animated.timing(value, { toValue: 1, duration, useNativeDriver: true });
    Animated.timing(bud, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
      setBloomed(true);
      Animated.sequence([Animated.stagger(110, rise.map(value => ease(value))), ease(headlineIn, 380), ease(restIn, 320)]).start();
    });
  }
  // Reduced motion arrives asynchronously: no bud then.
  useEffect(() => { if (reducedMotion && !bloomed) bloom(); }, [reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  // ---- 不准确 / 隐藏 ----
  const [marks, setMarks] = useState<Record<number, InsightFeedback | null>>({});
  const [markError, setMarkError] = useState<number | null>(null);
  const markOf = (item: Insight) => (Object.hasOwn(marks, item.index) ? marks[item.index] : item.feedback);
  async function mark(item: Insight, verdict: InsightFeedback | null) {
    if (!reportId) return;
    const before = markOf(item);
    setMarks(current => ({ ...current, [item.index]: verdict })); setMarkError(null);
    try { await setInsightFeedback(reportId, item.index, verdict); }
    catch { setMarks(current => ({ ...current, [item.index]: before })); setMarkError(item.index); }
  }
  const canMark = interactive && short.version2 && !!reportId;
  async function toggle(at: string, id: string) {
    const ticket = ++request.current;
    if (opened?.at === at && opened.id === id) { setOpened(null); return; }
    setOpened({ at, id, state: 'loading' });
    try {
      const event = await readEvent(id);
      if (ticket === request.current) setOpened({ at, id, state: 'ready', text: event.content });
    } catch {
      if (ticket === request.current) setOpened({ at, id, state: 'error' });
    }
  }
  const panel = (at: string) => opened?.at !== at ? null : <>
    {opened.state === 'loading' && <View style={s.row}><ActivityIndicator size="small" color="#8B6C44" accessible={false} /><Text style={s.small}>{copy.loading}</Text></View>}
    {opened.state === 'ready' && <Text selectable={interactive} style={s.event}>{opened.text}</Text>}
    {opened.state === 'error' && <Text accessibilityRole="alert" style={s.small}>{copy.unavailable}</Text>}
  </>;
  const insights = short.insights;
  const cardArt = petalCardArt(short.card?.id);
  const layout = short.curve && width ? moodCurveLayout(short.curve.days, short.curve.points, width, CURVE_HEIGHT, CHIP / 2 + 2, CHIP - 4) : null;

  const lineOfWeek = short.line && <>
    <Text style={s.heading}>{copy.line}</Text>
    <Pressable accessibilityRole="button" accessibilityHint={opened?.at === 'line' ? copy.close : copy.open} disabled={!interactive}
      onPress={() => void toggle('line', short.line!.eventId)} style={({ pressed }) => [s.quote, pressed && { opacity: .7 }]}>
      <Text selectable={interactive} style={s.quoteText}>{`“${short.line.text}”`}</Text>
      <Text style={s.link}>{opened?.at === 'line' ? copy.close : copy.open}</Text>
    </Pressable>
    {panel('line')}
  </>;
  const insightCard = (item: Insight, at: string, main: boolean, style?: object) => {
    const marked = markOf(item);
    if (marked) return <View key={at} testID={`insight-${at}`} style={[s.insight, s.insightMarked, style]}>
      <Text style={[s.small, { marginBottom: 0 }]}>{copy[MARK_TEXT[marked]]}</Text>
      {canMark && <Pressable accessibilityRole="button" accessibilityLabel={copy.undo} onPress={() => void mark(item, null)} hitSlop={12}><Text style={[s.link, { marginTop: 0 }]}>{copy.undo}</Text></Pressable>}
    </View>;
    return <View key={at} testID={`insight-${at}`} style={[s.insight, main && s.insightMain, style]}>
    <Text selectable={interactive} style={main ? s.insightMainText : s.insightText}>{item.text}</Text>
    {item.quote && !item.text.includes(item.quote.text) && <Text selectable={interactive} style={s.insightQuote}>{`“${item.quote.text}”`}</Text>}
    {item.items.map((entry, i) => <Text key={i} selectable={interactive} style={s.good}>{`· ${entry.text}`}</Text>)}
    {item.fact && <Text selectable={interactive} style={s.small}>{item.fact}</Text>}
    <View style={s.chips}>{item.evidence.map(entry => {
      const on = opened?.at === at && opened.id === entry.eventId;
      return <Pressable key={entry.eventId} accessibilityRole="button" accessibilityLabel={shortDate(entry.date, short.locale)}
        accessibilityHint={on ? copy.close : copy.open} disabled={!interactive}
        onPress={() => void toggle(at, entry.eventId)} style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: .7 }]}>
        <Text style={[s.chipText, on && s.chipTextOn]}>{shortDate(entry.date, short.locale)}</Text>
      </Pressable>;
    })}</View>
    {panel(at)}
    {canMark && <View style={s.marks}>
      {(['INACCURATE', 'HIDDEN'] as const).map(verdict => <Pressable key={verdict} accessibilityRole="button" hitSlop={12}
        accessibilityLabel={copy[verdict === 'HIDDEN' ? 'hide' : 'inaccurate']}
        onPress={() => void mark(item, verdict)} style={({ pressed }) => [s.markButton, pressed && { opacity: .6 }]}>
        <Text style={s.markText}>{copy[verdict === 'HIDDEN' ? 'hide' : 'inaccurate']}</Text>
      </Pressable>)}
    </View>}
    {markError === item.index && <Text accessibilityRole="alert" style={s.small}>{copy.feedbackFailed}</Text>}
  </View>;
  };
  // More insights: one card at a time, the next one peeking in from the side.
  const [rowWidth, setRowWidth] = useState(0);
  const cardWidth = Math.max(0, rowWidth - 36);
  const more = (list: Insight[]) => list.length === 1 ? insightCard(list[0], 'more-0', false)
    : <View onLayout={event => setRowWidth(event.nativeEvent.layout.width)}>
      {cardWidth > 0 && <ScrollView horizontal decelerationRate="fast" snapToInterval={cardWidth + 12} snapToAlignment="start"
        showsHorizontalScrollIndicator contentContainerStyle={{ gap: 12, paddingBottom: 6, marginBottom: 12, alignItems: 'flex-start' }}>
        {list.map((item, i) => insightCard(item, `more-${i}`, false, { width: cardWidth, marginBottom: 0 }))}
      </ScrollView>}
    </View>;
  const curve = short.curve && <>
    <Text style={s.heading}>{copy.curve}</Text>
    <View accessible={!insights} accessibilityLabel={short.curve.claim} onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ height: CURVE_HEIGHT }}>
      {layout?.segments.map((segment, i) => <View key={`line-${i}`} style={[s.segment, { left: segment.left, top: segment.top - 1,
        width: segment.length, transform: [{ rotate: `${segment.angle}rad` }] }]} />)}
      {/* With insights each flower opens its Event; otherwise the curve stays a picture, as before. */}
      {layout?.dots.map(dot => insights
        ? <Pressable key={dot.sourceEventId} accessibilityRole="button" accessibilityLabel={shortDate(dot.date, short.locale)} disabled={!interactive}
          onPress={() => void toggle('curve', dot.sourceEventId)}
          style={({ pressed }) => [s.dot, { left: dot.x - CHIP / 2, top: dot.y - CHIP / 2 },
            opened?.at === 'curve' && opened.id === dot.sourceEventId && s.dotOn, pressed && { opacity: .7 }]}>
          <EventIllustration index={moodIcon(dot.mood)} size={DOT} /></Pressable>
        : <View key={dot.sourceEventId} style={[s.dot, { left: dot.x - CHIP / 2, top: dot.y - CHIP / 2 }]}>
          <EventIllustration index={moodIcon(dot.mood)} size={DOT} /></View>)}
    </View>
    <View accessible={false} style={s.days}>{copy.days.map((day, i) => <Text key={i} style={s.day}>{day}</Text>)}</View>
    <Text selectable={interactive} style={s.small}>{short.curve.claim}</Text>
    {panel('curve')}
  </>;
  const card = short.card && cardArt && <>
    <Text style={s.heading}>{copy.card}</Text>
    <View style={s.card}>
      <Image source={cardArt} contentFit="contain" style={s.cardArt} accessibilityLabel={short.card.name} />
      <Text style={s.cardName}>{short.card.name}</Text>
      <Text selectable={interactive} style={s.cardLine}>{short.card.line}</Text>
      <Text selectable={interactive} style={s.cardText}>{short.card.text}</Text>
      {short.card.reason && <View style={s.stretch}>
        <Text style={s.pairLabel}>{copy.whyCard}</Text>
        <Text selectable={interactive} style={s.small}>{short.card.reason}</Text>
      </View>}
      <Text selectable={interactive} style={[s.small, s.stretch]}>{short.card.fact}</Text>
      <Text style={s.disclaimer}>{short.card.disclaimer}</Text>
    </View>
  </>;
  const thenAndNow = (heading: string) => short.thenAndNow && <>
    <Text style={s.heading}>{heading}</Text>
    {([['then', short.thenAndNow.then], ['now', short.thenAndNow.now]] as const).map(([key, side]) => <View key={key} style={s.pair}>
      <Text style={s.pairLabel}>{copy[key]} · {shortDate(side.date, short.locale)}</Text>
      <Text selectable={interactive} style={s.pairQuote}>{`“${side.quote}”`}</Text>
    </View>)}
    {short.thenAndNow.count && short.thenAndNow.phrase
      ? <Text selectable={interactive} style={s.small}>{thenNowCount(short.thenAndNow.count, short.thenAndNow.phrase, short.locale)}</Text> : null}
  </>;
  const headline = short.headline && <Text accessibilityRole="header" style={s.headline}>{short.headline}</Text>;
  const tail = <>
    {short.question && <>
      <Text style={s.heading}>{copy.question}</Text>
      <Text selectable={interactive} style={s.body}>{short.question}</Text>
      <Pressable accessibilityRole="button" disabled={!interactive} onPress={onWrite}
        style={({ pressed }) => [s.button, pressed && { opacity: .7 }]}><Text style={s.buttonText}>{copy.write}</Text></Pressable>
    </>}
    {short.support && <><Text style={s.heading}>{copy.support}</Text><Text accessibilityRole="alert" style={s.body}>{short.support}</Text></>}
  </>;
  const fadeRise = (value: Animated.Value) => ({ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] });

  if (ceremony && insights) return <View testID="short-weekly-report">
    {!bloomed ? <BudGate title={copy.bloomed} hint={copy.tapBud} fade={bud} interactive={interactive} onOpen={bloom} /> : <>
      <Animated.View style={fadeRise(headlineIn)}>{headline}</Animated.View>
      {short.curve && <>
        <Text style={s.heading}>{copy.bouquet}</Text>
        <WeeklyBouquet days={short.curve.days} points={points} locale={short.locale} dayNames={copy.days} species={species} rise={rise}
          openId={opened?.at === 'bouquet' ? opened.id : null} interactive={interactive} onOpen={id => void toggle('bouquet', id)} />
        <Animated.View style={fadeRise(restIn)}><Text selectable={interactive} style={s.small}>{short.curve.claim}</Text></Animated.View>
        {panel('bouquet')}
      </>}
      <Animated.View style={fadeRise(restIn)}>
        {insightCard(insights.main, 'main', true)}
        {insights.secondary.length > 0 && <><Text style={s.heading}>{copy.more}</Text>{more(insights.secondary)}</>}
        {thenAndNow(copy.oneMore)}
        {card}
        {tail}
      </Animated.View>
    </>}
  </View>;
  return <View testID="short-weekly-report">
    {insights ? <>
      {headline}
      {insightCard(insights.main, 'main', true)}
      {curve}
      {insights.secondary.length > 0 && <Text style={s.heading}>{copy.more}</Text>}
      {insights.secondary.map((item, i) => insightCard(item, `more-${i}`, false))}
      {lineOfWeek}
      {thenAndNow(copy.thenNow)}
      {card}
    </> : <>
      {headline}
      {lineOfWeek}
      {curve}
      {card}
      {short.side && <><Text style={s.heading}>{copy.side}</Text><Text selectable={interactive} style={s.body}>{short.side}</Text></>}
      {thenAndNow(copy.thenNow)}
    </>}
    {tail}
  </View>;
}
const s = StyleSheet.create({
  heading: { fontFamily: 'Georgia', fontSize: 18, color: '#654D30', marginTop: 8, marginBottom: 10 },
  headline: { fontFamily: 'Georgia', fontSize: 24, lineHeight: 32, color: '#4D3B28', marginTop: 4, marginBottom: 12 },
  quote: { borderLeftWidth: 3, borderColor: '#B8934A', paddingLeft: 12, marginBottom: 8 },
  quoteText: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 18, lineHeight: 27, color: '#4D3B28' },
  link: { fontFamily: 'Georgia', color: '#52613B', textDecorationLine: 'underline', fontSize: 13, marginTop: 6 },
  event: { fontFamily: 'Georgia', color: '#4D3B28', fontSize: 15, lineHeight: 24, marginBottom: 12, padding: 10,
    backgroundColor: '#F4E9D466', borderRadius: 6 },
  body: { fontFamily: 'Georgia', color: '#4D3B28', fontSize: 16, lineHeight: 26, marginBottom: 12 },
  insightText: { fontFamily: 'Georgia', color: '#4D3B28', fontSize: 16, lineHeight: 26, marginBottom: 8 },
  small: { fontFamily: 'Georgia', color: '#53432D', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  insight: { borderWidth: 1, borderColor: '#B8934A55', borderRadius: 10, padding: 14, marginBottom: 12, backgroundColor: '#FFF8EA99' },
  insightMain: { borderColor: '#B8934A', backgroundColor: '#FFF8EA' },
  insightMarked: { paddingVertical: 10, backgroundColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 12 },
  marks: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 6 },
  markButton: { minHeight: 32, justifyContent: 'center' },
  markText: { fontFamily: 'Georgia', color: '#8B6C44', fontSize: 12, letterSpacing: .3 },
  insightMainText: { fontFamily: 'Georgia', color: '#4D3B28', fontSize: 18, lineHeight: 28, marginBottom: 8 },
  good: { fontFamily: 'Georgia', color: '#4D3B28', fontSize: 15, lineHeight: 24, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: '#B8934A88', borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10 },
  chipOn: { backgroundColor: '#B8934A' },
  chipText: { fontFamily: 'Georgia', color: '#654D30', fontSize: 12 },
  chipTextOn: { color: '#FFF8EA' },
  segment: { position: 'absolute', height: 2, backgroundColor: '#B8934A99' },
  dot: { position: 'absolute', width: CHIP, height: CHIP, borderRadius: CHIP / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF8EA', borderWidth: 1, borderColor: '#B8934A66' },
  dotOn: { borderWidth: 2, borderColor: '#B8934A' },
  days: { flexDirection: 'row', marginTop: 4, marginBottom: 8 },
  pair: { borderLeftWidth: 2, borderColor: '#B8934A88', paddingLeft: 12, marginBottom: 10 },
  pairLabel: { fontFamily: 'Georgia', color: '#8B6C44', fontSize: 12, letterSpacing: .5, marginBottom: 3 },
  pairQuote: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 16, lineHeight: 24, color: '#4D3B28' },
  insightQuote: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 16, lineHeight: 24, color: '#4D3B28', marginBottom: 8 },
  day: { flex: 1, textAlign: 'center', fontFamily: 'Georgia', color: '#8B6C44', fontSize: 12 },
  button: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#B8934A', borderRadius: 18, paddingVertical: 8,
    paddingHorizontal: 16, marginBottom: 14 },
  buttonText: { fontFamily: 'Georgia', color: '#654D30', fontSize: 15 },
  card: { alignItems: 'center', marginBottom: 14 },
  cardArt: { width: 240, height: 360, borderRadius: 10, marginBottom: 12 },
  cardName: { fontFamily: 'Georgia', color: '#8B6C44', fontSize: 12, letterSpacing: .5, marginBottom: 4 },
  cardLine: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 18, lineHeight: 27, color: '#4D3B28', textAlign: 'center', marginBottom: 8 },
  cardText: { fontFamily: 'Georgia', color: '#4D3B28', fontSize: 15, lineHeight: 24, marginBottom: 10, alignSelf: 'stretch' },
  stretch: { alignSelf: 'stretch' },
  disclaimer: { fontFamily: 'Georgia', color: '#8B6C44', fontSize: 11, lineHeight: 16, alignSelf: 'stretch' },
});
