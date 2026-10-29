import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { readEvent } from '../../services/events';
import { moodCurveLayout, moodIcon, setInsightFeedback, SHORT_COPY, shortDate, thenNowCount, type Insight, type InsightFeedback,
  type ShortWeekly } from '../../services/reflections';
import { petalCardArt } from '../petalCards/petalCardArt';
import { EventIllustration } from './EventIllustration';
import { useAppLocale } from '../../services/locale';
import { BudGate, useBloom, useEventSpecies, WeeklyBouquet } from './WeeklyBloom';
import { ART_RATIO, INSIGHT_ART, WEEKLY_ART } from './weeklyArt';

const CURVE_HEIGHT = 104, DOT = 26, CHIP = DOT + 6;
// One Event open at a time, under the part (`at`) that opened it.
type Opened = { at: string; id: string } & ({ state: 'loading' } | { state: 'ready'; text: string } | { state: 'error' });

const MARK_TEXT = { HIDDEN: 'hidden', INACCURATE: 'thanks' } as const;
export type ReportPart = 'left' | 'right' | 'all';

// Rendering only: every part was chosen and validated on the backend; a hidden part simply is not saved.
// Labels and dates follow the app language; the report's own sentences stay as saved.
// Weekly 2.0 (docs/product/WEEKLY_2.0.md) is one spread of the book. Left page (`part` left): the date and headline
// (after the bloom) over the week's bouquet; tap a flower for that day's words. Right page (`part` right): main insight
// → more insights, side by side to swipe → "还有一件事" (then and now) → petal card with the safety note → question and
// "写一写". It opens on a bud alone; tapping it raises the bouquet, then the headline, then the right page. A 2.0 week
// with no insights shows only its headline and a gentle question. Phones (`part` all) stack both pages.
// Older reports: with insights, the same order around the mood curve; without, the short report's layout.
export function ShortWeeklyReport({ short, interactive, onWrite, reportId, reducedMotion = false, part = 'all', date, safety, report }: {
  short: ShortWeekly; interactive: boolean; onWrite: () => void; reportId?: string; reducedMotion?: boolean; part?: ReportPart;
  // Weekly 2.0 only: the period's date lines, the safety note (shown with the petal card) and the AI-output report link.
  date?: { eyebrow: string; range: string }; safety?: ReactNode; report?: ReactNode;
}) {
  const lang = useAppLocale(), copy = SHORT_COPY[lang];
  const [opened, setOpened] = useState<Opened | null>(null);
  const [width, setWidth] = useState(0);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  // ---- Weekly 2.0 opening (shared by both pages) ----
  const ceremony = short.version2 && !!short.insights;
  const points = short.curve?.points ?? [];
  const { bloomed, bloom, bud, fan, headline: headlineIn, rest: restIn, rise } = useBloom(reportId ?? '', points.length, { enabled: ceremony, reducedMotion });
  const species = useEventSpecies();
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
      return <Pressable key={entry.eventId} accessibilityRole="button" accessibilityLabel={shortDate(entry.date, lang)}
        accessibilityHint={on ? copy.close : copy.open} disabled={!interactive}
        onPress={() => void toggle(at, entry.eventId)} style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: .7 }]}>
        <Text style={[s.chipText, on && s.chipTextOn]}>{shortDate(entry.date, lang)}</Text>
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
  const [moreAt, setMoreAt] = useState(0);
  const [pageHeights, setPageHeights] = useState<number[]>([]);
  const moreRow = useRef<ScrollView>(null);
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
        ? <Pressable key={dot.sourceEventId} accessibilityRole="button" accessibilityLabel={shortDate(dot.date, lang)} disabled={!interactive}
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
      <Text style={s.pairLabel}>{copy[key]} · {shortDate(side.date, lang)}</Text>
      <Text selectable={interactive} style={s.pairQuote}>{`“${side.quote}”`}</Text>
    </View>)}
    {short.thenAndNow.count && short.thenAndNow.phrase
      ? <Text selectable={interactive} style={s.small}>{thenNowCount(short.thenAndNow.count, short.thenAndNow.phrase, lang)}</Text> : null}
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

  if (short.version2) {
    // Weekly 2.0 is written on the paper itself: no boxes, only painted vignettes, serif type and gold hairlines.
    const eyebrow = (text: string) => <Text style={v.eyebrow}>{text}</Text>;
    const art = (key: string, height: number, source = INSIGHT_ART[key]) => source
      ? <Image source={source} contentFit="contain" accessible={false} style={{ width: height * (ART_RATIO[key] ?? 1), height }} /> : null;
    const rule = <View accessible={false} style={v.rule} />;
    const dates = (item: Insight, at: string) => <View style={v.dates}>
      {item.evidence.map((entry, i) => {
        const on = opened?.at === at && opened.id === entry.eventId;
        return <Pressable key={entry.eventId} accessibilityRole="button" accessibilityLabel={shortDate(entry.date, lang)}
          accessibilityHint={on ? copy.close : copy.open} disabled={!interactive} hitSlop={10}
          onPress={() => void toggle(at, entry.eventId)} style={({ pressed }) => [v.date, pressed && { opacity: .6 }]}>
          <Text style={[v.dateText, on && v.dateOn]}>{i ? '· ' : ''}{shortDate(entry.date, lang)}</Text>
        </Pressable>;
      })}
    </View>;
    const entry = (item: Insight, at: string, main: boolean) => {
      const marked = markOf(item);
      if (marked) return <View key={at} testID={`insight-${at}`} style={v.marked}>
        <Text style={v.markedText}>{copy[MARK_TEXT[marked]]}</Text>
        {canMark && <Pressable accessibilityRole="button" accessibilityLabel={copy.undo} onPress={() => void mark(item, null)} hitSlop={12}>
          <Text style={v.link}>{copy.undo}</Text></Pressable>}
      </View>;
      return <View key={at} testID={`insight-${at}`}>
        <View style={v.entryHead}>
          <View style={{ flex: 1 }}>
            {eyebrow(copy.types[item.type])}
            <Text selectable={interactive} style={main ? v.mainText : v.text}>{item.text}</Text>
          </View>
          <View style={main ? v.artMain : v.art}>{art(item.type, main ? 66 : 56)}</View>
        </View>
        {item.quote && !item.text.includes(item.quote.text) && <Text selectable={interactive} style={v.quote}>{`“${item.quote.text}”`}</Text>}
        {item.items.map((thing, i) => <Text key={i} selectable={interactive} style={v.good}>{thing.text}</Text>)}
        {item.fact && <Text selectable={interactive} style={v.fact}>{item.fact}</Text>}
        {dates(item, at)}
        {panel(at)}
        {canMark && <View style={v.marks}>
          {(['INACCURATE', 'HIDDEN'] as const).map(verdict => <Pressable key={verdict} accessibilityRole="button" hitSlop={12}
            accessibilityLabel={copy[verdict === 'HIDDEN' ? 'hide' : 'inaccurate']}
            onPress={() => void mark(item, verdict)} style={({ pressed }) => [v.markButton, pressed && { opacity: .6 }]}>
            <Text style={v.markText}>{copy[verdict === 'HIDDEN' ? 'hide' : 'inaccurate']}</Text>
          </Pressable>)}
        </View>}
        {markError === item.index && <Text accessibilityRole="alert" style={v.fact}>{copy.feedbackFailed}</Text>}
      </View>;
    };
    // More insights page sideways, one at a time, with a quiet "1 / 3" and arrows.
    const pages = (list: Insight[]) => {
      if (list.length === 1) return entry(list[0], 'more-0', false);
      const go = (to: number) => { const next = Math.max(0, Math.min(list.length - 1, to)); setMoreAt(next);
        moreRow.current?.scrollTo({ x: next * rowWidth, animated: !reducedMotion }); };
      return <View onLayout={event => setRowWidth(event.nativeEvent.layout.width)}>
        {rowWidth > 0 && <ScrollView ref={moreRow} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          style={pageHeights[moreAt] ? { height: pageHeights[moreAt] } : undefined} contentContainerStyle={{ alignItems: 'flex-start' }}
          onMomentumScrollEnd={event => setMoreAt(Math.round(event.nativeEvent.contentOffset.x / rowWidth))}
          onScroll={event => setMoreAt(Math.round(event.nativeEvent.contentOffset.x / rowWidth))} scrollEventThrottle={64}>
          {list.map((item, i) => <View key={i} style={{ width: rowWidth }} onLayout={event => {
            const height = Math.ceil(event.nativeEvent.layout.height);
            setPageHeights(current => current[i] === height ? current : Object.assign([...current], { [i]: height }));
          }}>{entry(item, `more-${i}`, false)}</View>)}
        </ScrollView>}
        <View style={v.pager}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.previousCard} disabled={moreAt === 0} onPress={() => go(moreAt - 1)}
            style={[v.arrow, moreAt === 0 && { opacity: .3 }]}><Text style={v.arrowText}>‹</Text></Pressable>
          <Text accessibilityLiveRegion="polite" style={v.pageText}>{`${moreAt + 1} / ${list.length}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.nextCard} disabled={moreAt === list.length - 1} onPress={() => go(moreAt + 1)}
            style={[v.arrow, moreAt === list.length - 1 && { opacity: .3 }]}><Text style={v.arrowText}>›</Text></Pressable>
        </View>
      </View>;
    };
    const dateLines = date && <>
      <Text style={v.eyebrow}>{date.eyebrow}</Text>
      {!!date.range && <Text style={v.range}>{date.range}</Text>}
    </>;
    const title = short.headline && <Text accessibilityRole="header" style={v.headline}>{short.headline}</Text>;
    const question = short.question && <View style={v.question}>
      <View style={v.entryHead}>
        <View style={{ flex: 1 }}>
          {eyebrow(copy.question)}
          <Text selectable={interactive} style={v.questionText}>{short.question}</Text>
        </View>
        <View style={v.art}>{art('question', 60, WEEKLY_ART.question)}</View>
      </View>
      <Pressable accessibilityRole="button" disabled={!interactive} onPress={onWrite}
        style={({ pressed }) => [v.answer, pressed && { transform: [{ scale: .97 }] }]}>
        <Text style={v.answerText}>{copy.answer}</Text><Text style={v.answerArrow}>›</Text>
      </Pressable>
    </View>;
    // A week with no insights: its headline ("这周的花还在长") and a gentle question, nothing else.
    if (!insights) return <View testID="short-weekly-report">
      {part !== 'right' && <>{dateLines}{title}{question}</>}
    </View>;
    const left = !bloomed
      ? <BudGate title={copy.bloomed} hint={copy.tapBud} fade={bud} fan={fan} moods={points.map(point => point.mood)} interactive={interactive} onOpen={bloom} />
      : <>
        <Animated.View style={fadeRise(headlineIn)}>{dateLines}{title}</Animated.View>
        {short.curve && <View style={v.bouquet}>
          {eyebrow(copy.bouquet)}
          <WeeklyBouquet days={short.curve.days} points={points} locale={lang} dayNames={copy.days} species={species} rise={rise}
            openId={opened?.at === 'bouquet' ? opened.id : null} interactive={interactive} onOpen={id => void toggle('bouquet', id)} />
          <Animated.View style={fadeRise(restIn)}><Text selectable={interactive} style={v.fact}>{short.curve.claim}</Text></Animated.View>
          {panel('bouquet')}
        </View>}
      </>;
    const right = bloomed && <Animated.View style={fadeRise(restIn)}>
      {entry(insights.main, 'main', true)}
      {insights.secondary.length > 0 && <>{rule}{pages(insights.secondary)}</>}
      {short.thenAndNow && <>
        {rule}
        <View style={v.entryHead}>
          <View style={{ flex: 1 }}>
            {eyebrow(copy.oneMore)}
            {([['then', short.thenAndNow.then], ['now', short.thenAndNow.now]] as const).map(([key, side]) => <View key={key} style={v.pair}>
              <Text style={v.pairLabel}>{copy[key]} · {shortDate(side.date, lang)}</Text>
              <Text selectable={interactive} style={v.quote}>{`“${side.quote}”`}</Text>
            </View>)}
            {short.thenAndNow.count && short.thenAndNow.phrase
              ? <Text selectable={interactive} style={v.fact}>{thenNowCount(short.thenAndNow.count, short.thenAndNow.phrase, lang)}</Text> : null}
          </View>
          <View style={v.art}>{art('oneMore', 60, WEEKLY_ART.oneMore)}</View>
        </View>
      </>}
      {short.card && cardArt && <>
        {rule}
        {eyebrow(copy.card)}
        <View style={s.card}>
          <Image source={cardArt} contentFit="contain" style={s.cardArt} accessibilityLabel={short.card.name} />
          <Text style={s.cardName}>{short.card.name}</Text>
          <Text selectable={interactive} style={s.cardLine}>{short.card.line}</Text>
          <Text selectable={interactive} style={s.cardText}>{short.card.text}</Text>
          {short.card.reason && <View style={s.stretch}>
            <Text style={v.pairLabel}>{copy.whyCard}</Text>
            <Text selectable={interactive} style={v.fact}>{short.card.reason}</Text>
          </View>}
          <Text selectable={interactive} style={[v.fact, s.stretch]}>{short.card.fact}</Text>
          <Text style={s.disclaimer}>{short.card.disclaimer}</Text>
        </View>
      </>}
      {safety && <View style={s.safety}>{safety}</View>}
      {rule}
      {question}
      {report}
    </Animated.View>;
    return <View testID="short-weekly-report">
      {part !== 'right' && <View testID="weekly-left-page">{left}</View>}
      {part !== 'left' && right && <View testID="weekly-right-page" style={part === 'all' ? { marginTop: 18 } : undefined}>{right}</View>}
    </View>;
  }
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
  eyebrow: { fontFamily: 'Georgia', fontSize: 12, letterSpacing: 2.2, color: '#8C6E3A', marginTop: 4 },
  range: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 15, color: '#5E4B33', marginTop: 3, marginBottom: 10 },
  safety: { marginTop: 4, marginBottom: 14 },
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
// Weekly 2.0: type on the page, gold hairlines, painted vignettes (no boxes).
const INK = '#3F2F1F', SOFT = '#6B543A', GOLD = '#A8823F';
const v = StyleSheet.create({
  eyebrow: { fontFamily: 'Georgia', fontSize: 12, letterSpacing: 2.4, color: GOLD, marginBottom: 6 },
  range: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 15, color: SOFT, marginTop: -2, marginBottom: 14 },
  headline: { fontFamily: 'Georgia', fontSize: 27, lineHeight: 38, color: INK, marginBottom: 22 },
  bouquet: { marginBottom: 6 },
  rule: { height: 1, backgroundColor: '#A8823F40', marginVertical: 22 },
  entryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  art: { width: 58, alignItems: 'center', paddingTop: 2 },
  artMain: { width: 66, alignItems: 'center', paddingTop: 2 },
  mainText: { fontFamily: 'Georgia', fontSize: 20, lineHeight: 32, color: INK, marginBottom: 10 },
  text: { fontFamily: 'Georgia', fontSize: 17, lineHeight: 28, color: INK, marginBottom: 8 },
  quote: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 16, lineHeight: 26, color: '#4D3B28', marginBottom: 8 },
  good: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 16, lineHeight: 26, color: '#4D3B28', marginBottom: 2, paddingLeft: 14,
    borderLeftWidth: 1, borderColor: '#A8823F55' },
  fact: { fontFamily: 'Georgia', fontSize: 13, lineHeight: 20, color: SOFT, marginTop: 4, marginBottom: 8 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, marginBottom: 4 },
  date: { minHeight: 32, justifyContent: 'center' },
  dateText: { fontFamily: 'Georgia', fontSize: 13, color: GOLD, textDecorationLine: 'underline', textDecorationColor: '#A8823F66' },
  dateOn: { color: INK },
  marks: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  markButton: { minHeight: 32, justifyContent: 'center' },
  markText: { fontFamily: 'Georgia', fontSize: 12, color: '#9A8261', letterSpacing: .3 },
  marked: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6 },
  markedText: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 14, color: SOFT },
  link: { fontFamily: 'Georgia', fontSize: 13, color: GOLD, textDecorationLine: 'underline' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontFamily: 'Georgia', fontSize: 24, color: GOLD },
  pageText: { fontFamily: 'Georgia', fontSize: 12, letterSpacing: 2, color: SOFT },
  pair: { marginBottom: 6 },
  pairLabel: { fontFamily: 'Georgia', fontSize: 12, letterSpacing: 1, color: '#8C6E3A', marginBottom: 2 },
  question: { marginBottom: 8 },
  questionText: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 19, lineHeight: 30, color: INK, marginBottom: 14 },
  answer: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 20,
    borderRadius: 22, backgroundColor: '#FBF3E2', borderWidth: 1, borderColor: '#C9A96E', boxShadow: '0 1px 3px rgba(80,55,25,.18)', marginBottom: 18 },
  answerText: { fontFamily: 'Georgia', fontSize: 15, color: '#234A3F' },
  answerArrow: { fontFamily: 'Georgia', fontSize: 18, color: '#234A3F' },
});
