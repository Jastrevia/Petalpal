import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { readEvent } from '../../services/events';
import { followInsight, keepSection, loadCollection, moodCurveLayout, moodIcon, setInsightFeedback, SHORT_COPY, shortDate, thenNowCount, type Insight, type InsightFeedback,
  type ShortCopy, type ShortWeekly } from '../../services/reflections';
import { petalCardArt } from '../petalCards/petalCardArt';
import { EventIllustration } from './EventIllustration';
import { useAppLocale } from '../../services/locale';
import { startAnswer } from '../../services/questionAnswer';
import { MoodPetalChart, useEventSpecies, WeeklyBouquet } from './WeeklyBloom';
import { ART_RATIO, INSIGHT_ART, WEEKLY_ART } from './weeklyArt';

const CURVE_HEIGHT = 104, DOT = 26, CHIP = DOT + 6;
// One Event open at a time, under the part (`at`) that opened it.
type Opened = { at: string; id: string } & ({ state: 'loading' } | { state: 'ready'; text: string } | { state: 'error' });

const MARK_TEXT = { HIDDEN: 'hidden', INACCURATE: 'thanks' } as const;
export type ReportPart = 'left' | 'right' | 'all';

// Rendering only: every part was chosen and validated on the backend; a hidden part simply is not saved.
// Labels and dates follow the app language; the report's own sentences stay as saved.
// Weekly 2.0 (docs/product/WEEKLY_2.0.md) is one spread of the book. Left page (`part` left): the date and headline
// over the week's bouquet (tap a flower for that day's words) and the 8-mood petal chart. Right page (`part` right):
// main insight → more insights, side by side to swipe → "还有一件事" (then and now) → petal card → the question → the
// report link. It shows at once (no opening animation). A 2.0 week with no insights shows only its headline and a gentle
// question. Phones (`part` all) put both pages in
// one flow. Text never scrolls: what does not fit on a page turns to the next (Paged). The safety note and disclaimers
// live in the third book on the shelf, not here.
// Older reports: with insights, the same order around the mood curve; without, the short report's layout.
export function ShortWeeklyReport({ short, interactive, onWrite, reportId, reducedMotion = false, part = 'all', date, report }: {
  short: ShortWeekly; interactive: boolean; onWrite: () => void; reportId?: string; reducedMotion?: boolean; part?: ReportPart;
  // Weekly 2.0 only: the period's date lines and the link to report this output.
  date?: { eyebrow: string; range: string }; report?: ReactNode;
}) {
  const lang = useAppLocale(), copy = SHORT_COPY[lang];
  const [opened, setOpened] = useState<Opened | null>(null);
  const [width, setWidth] = useState(0);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  const points = short.curve?.points ?? [];
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
  // ---- 收藏 / 跟进 (闭环): what this report already has kept and which words are followed, read once ----
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [loopNote, setLoopNote] = useState<{ index: number; text: string } | null>(null);
  useEffect(() => {
    if (!canMark) return;
    const controller = new AbortController();
    loadCollection(controller.signal).then(book => {
      setKept(new Set([...book.insights.filter(item => item.reportId === reportId).map(item => item.index),
        ...(short.cardIndex !== null && short.card && book.cards.some(card => card.cardId === short.card!.id && card.kept &&
          card.appearances.some(item => item.reportId === reportId)) ? [short.cardIndex] : [])]));
      setFollowed(new Set(book.threads.map(thread => thread.word)));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [canMark, reportId, short.cardIndex, short.card]);
  async function keep(index: number) {
    if (!reportId) return;
    const next = !kept.has(index), flip = (on: boolean) => setKept(current => { const copy = new Set(current); on ? copy.add(index) : copy.delete(index); return copy; });
    flip(next); setLoopNote(null);
    try { await keepSection(reportId, index, next); } catch { flip(!next); setLoopNote({ index, text: copy.feedbackFailed }); }
  }
  async function follow(item: Insight) {
    if (!reportId || !item.subject || followed.has(item.subject)) return;
    setLoopNote(null);
    try {
      const thread = await followInsight(reportId, item.index);
      setFollowed(current => new Set([...current, thread.word]));
    } catch (error) {
      setLoopNote({ index: item.index, text: (error as { status?: number })?.status === 409 ? copy.threadLimit : copy.feedbackFailed });
    }
  }
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

  if (short.version2) {
    // Weekly 2.0 is written on the paper itself: no boxes, only painted vignettes, serif type and gold hairlines. Every
    // block keeps one text size; the page is split into book pages (Paged) instead of scrolling.
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
    // The quiet actions under an insight or the card: 收藏, 跟进, 隐藏.
    const quiet = (label: string, onPress: () => void, on = false) => <Pressable key={label} accessibilityRole="button" hitSlop={12}
      accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress}
      style={({ pressed }) => [v.markButton, pressed && { opacity: .6 }]}><Text style={[v.markText, on && v.markOn]}>{label}</Text></Pressable>;
    const entry = (item: Insight, at: string, main: boolean) => {
      if (markOf(item) === 'HIDDEN') return <View key={at} testID={`insight-${at}`} style={v.marked}>
        <Text style={v.markedText}>{copy.hidden}</Text>
        {canMark && <Pressable accessibilityRole="button" accessibilityLabel={copy.undo} onPress={() => void mark(item, null)} hitSlop={12}>
          <Text style={v.link}>{copy.undo}</Text></Pressable>}
      </View>;
      return <View key={at} testID={`insight-${at}`}>
        <View style={v.entryHead}>
          <View style={{ flex: 1 }}>
            {eyebrow(copy.types[item.type])}
            <Text selectable={interactive} style={v.text}>{item.text}</Text>
          </View>
          <View style={main ? v.artMain : v.art}>{art(item.type, main ? 60 : 50)}</View>
        </View>
        {item.quote && !item.text.includes(item.quote.text) && <Text selectable={interactive} style={v.text}>{`“${item.quote.text}”`}</Text>}
        {item.items.map((thing, i) => <Text key={i} selectable={interactive} style={[v.text, v.good]}>{thing.text}</Text>)}
        {item.fact && <Text selectable={interactive} style={v.text}>{item.fact}</Text>}
        {dates(item, at)}
        {panel(at)}
        {canMark && <View style={v.marks}>
          {quiet(kept.has(item.index) ? copy.kept : copy.keep, () => void keep(item.index), kept.has(item.index))}
          {item.subject && quiet(followed.has(item.subject) ? copy.following : copy.follow, () => void follow(item), followed.has(item.subject))}
          {quiet(copy.hide, () => void mark(item, 'HIDDEN'))}
        </View>}
        {markError === item.index && <Text accessibilityRole="alert" style={v.text}>{copy.feedbackFailed}</Text>}
        {loopNote?.index === item.index && <Text accessibilityRole="alert" style={v.text}>{loopNote.text}</Text>}
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
    const head = <>
      {date && <><Text style={v.eyebrow}>{date.eyebrow}</Text>{!!date.range && <Text style={v.range}>{date.range}</Text>}</>}
      {short.headline && <Text accessibilityRole="header" style={v.headline}>{short.headline}</Text>}
    </>;
    // The question itself and "写一条来回答": the next Event the owner saves answers it (services/questionAnswer.ts).
    const question = short.question && <>
      <Text selectable={interactive} style={v.text}>{short.question}</Text>
      {interactive && reportId && <View style={v.marks}>{quiet(copy.answer, () => { startAnswer(reportId, short.question!); onWrite(); })}</View>}
    </>;
    // 闭环 blocks, all code-written: threads, the owner's answer to an earlier question, letters due this week.
    const loop: { key: string; node: ReactNode }[] = [];
    if (short.threads.length) loop.push({ key: 'threads', node: <>{rule}{eyebrow(copy.threads)}
      {short.threads.map((thread, i) => <View key={thread.word}>
        <Text selectable={interactive} style={v.text}>{thread.claim}</Text>
        {thread.evidence.length > 0 && dates({ evidence: thread.evidence } as Insight, `thread-${i}`)}
        {panel(`thread-${i}`)}
      </View>)}</> });
    if (short.answer) loop.push({ key: 'answer', node: <>{rule}{eyebrow(copy.answered)}
      <Text selectable={interactive} style={v.text}>{short.answer.question}</Text>
      <Text selectable={interactive} style={[v.text, v.good]}>{short.answer.quote.text}</Text>
      {dates({ evidence: [{ eventId: short.answer.quote.eventId, date: short.answer.quote.date }] } as Insight, 'answer')}
      {panel('answer')}</> });
    short.letters.forEach((letter, i) => loop.push({ key: `letter-${i}`, node: <>{rule}{eyebrow(copy.letter)}
      <Text selectable={interactive} style={v.text}>{letter.text}</Text>
      {letter.writtenOn && <Text style={v.pairLabel}>{copy.letterFrom(shortDate(letter.writtenOn, lang))}</Text>}</> }));
    type Block = { key: string; node: ReactNode };
    let left: Block[], right: Block[];
    if (!insights) {
      // A week with no insights: its headline ("这周的花还在长") and a gentle question, nothing else.
      left = [{ key: 'head', node: head }, ...(short.unlock ? [{ key: 'unlock', node: <Text style={v.text}>{short.unlock}</Text> }] : []),
        ...(question ? [{ key: 'question', node: question }] : [])];
      right = loop;
    } else {
      left = [{ key: 'head', node: head }];
      if (short.curve) {
        left.push({ key: 'bouquet', node: <View style={v.block}>
          {eyebrow(copy.bouquet)}
          <WeeklyBouquet days={short.curve.days} points={points} locale={lang} dayNames={copy.days} species={species}
            openId={opened?.at === 'bouquet' ? opened.id : null} interactive={interactive} onOpen={id => void toggle('bouquet', id)} />
          {panel('bouquet')}
        </View> });
        left.push({ key: 'moods', node: <View style={v.block}>{eyebrow(copy.moodChart)}
          <MoodPetalChart points={points} names={copy.moods} label={copy.moodChart} width={210} /></View> });
      }
      right = [{ key: 'main', node: entry(insights.main, 'main', true) }];
      if (insights.secondary.length) right.push({ key: 'more', node: <>{rule}{pages(insights.secondary)}</> });
      if (short.thenAndNow) right.push({ key: 'oneMore', node: <>
        {rule}
        <View style={v.entryHead}>
          <View style={{ flex: 1 }}>
            {eyebrow(copy.oneMore)}
            {([['then', short.thenAndNow.then], ['now', short.thenAndNow.now]] as const).map(([key, side]) => <View key={key} style={v.pair}>
              <Text style={v.pairLabel}>{copy[key]} · {shortDate(side.date, lang)}</Text>
              <Text selectable={interactive} style={v.text}>{`“${side.quote}”`}</Text>
            </View>)}
            {short.thenAndNow.count && short.thenAndNow.phrase
              ? <Text selectable={interactive} style={v.text}>{thenNowCount(short.thenAndNow.count, short.thenAndNow.phrase, lang)}</Text> : null}
          </View>
          <View style={v.art}>{art('oneMore', 50, WEEKLY_ART.oneMore)}</View>
        </View>
      </> });
      right.push(...loop);
      if (short.card && cardArt) right.push({ key: 'card', node: <>
        {rule}
        {eyebrow(copy.card)}
        <View style={s.card}>
          <Image source={cardArt} contentFit="contain" style={v.cardArt} accessibilityLabel={short.card.name} />
          <Text style={v.pairLabel}>{short.card.name}</Text>
          <Text selectable={interactive} style={[v.text, s.stretch]}>{short.card.line}</Text>
          <Text selectable={interactive} style={[v.text, s.stretch]}>{short.card.text}</Text>
          {short.card.reason && <Text selectable={interactive} style={[v.text, s.stretch]}>{short.card.reason}</Text>}
          <Text selectable={interactive} style={[v.text, s.stretch]}>{short.card.fact}</Text>
        </View>
        {canMark && short.cardIndex !== null && <View style={v.marks}>
          {quiet(kept.has(short.cardIndex) ? copy.kept : copy.keep, () => void keep(short.cardIndex!), kept.has(short.cardIndex))}
        </View>}
        {loopNote && loopNote.index === short.cardIndex && <Text accessibilityRole="alert" style={v.text}>{loopNote.text}</Text>}
      </> });
      if (question) right.push({ key: 'question', node: <>{rule}{question}</> });
      if (report) right.push({ key: 'report', node: report });
    }
    if (part === 'left') return <Paged blocks={left} testID="weekly-left-page" copy={copy} />;
    if (part === 'right') return <Paged blocks={right} testID="weekly-right-page" copy={copy} />;
    return <Paged blocks={[...left, ...right]} testID="short-weekly-report" copy={copy} />;
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
// One page of the book: blocks laid out once, split into pages that fit the page's height (a block never splits; a
// block taller than the page scrolls on its own page). Other pages' blocks stay laid out but hidden, so they keep their
// measured place; "‹ 1 / 2 ›" turns.
function Paged({ blocks, testID, copy }: { blocks: { key: string; node: ReactNode }[]; testID: string; copy: ShortCopy }) {
  const [height, setHeight] = useState(0);
  // Block heights only: positions are their running sum (on the web a block's measured y is not updated when a block
  // above it changes height).
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const room = Math.max(0, height - PAGER);
  const pages: number[][] = [];
  let current: number[] = [], used = 0;
  const tops: number[] = [];
  blocks.forEach((block, i) => {
    const h = sizes[block.key] ?? 0;
    tops.push(i ? tops[i - 1] + (sizes[blocks[i - 1].key] ?? 0) : 0);
    if (current.length && used + h > room) { pages.push(current); current = []; used = 0; }
    current.push(i); used += h;
  });
  if (current.length) pages.push(current);
  const count = Math.max(1, pages.length), at = Math.min(page, count - 1), shown = new Set(pages[at] ?? []);
  const start = tops[pages[at]?.[0] ?? 0] ?? 0;
  const overflow = (pages[at] ?? []).reduce((sum, i) => sum + (sizes[blocks[i].key] ?? 0), 0) > room;
  useEffect(() => { scroller.current?.scrollTo({ y: start, animated: false }); }, [start, at]);
  return <View testID={testID} style={{ flex: 1, minHeight: 0 }} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
    <ScrollView ref={scroller} style={{ flex: 1 }} scrollEnabled={overflow} showsVerticalScrollIndicator={overflow}>
      {blocks.map((block, i) => <View key={block.key} aria-hidden={!shown.has(i)} importantForAccessibility={shown.has(i) ? 'auto' : 'no-hide-descendants'}
        pointerEvents={shown.has(i) ? 'auto' : 'none'} style={!shown.has(i) ? { opacity: 0 } : undefined}
        onLayout={event => { const h = event.nativeEvent.layout.height;
          setSizes(sizes => sizes[block.key] === h ? sizes : { ...sizes, [block.key]: h }); }}>
        {block.node}
      </View>)}
      <View style={{ height: room }} />
    </ScrollView>
    {count > 1 && <View style={v.pager}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.previousCard} disabled={at === 0} onPress={() => setPage(at - 1)}
        style={[v.arrow, at === 0 && { opacity: .3 }]}><Text style={v.arrowText}>‹</Text></Pressable>
      <Text accessibilityLiveRegion="polite" style={v.pageText}>{`${at + 1} / ${count}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.nextCard} disabled={at === count - 1} onPress={() => setPage(at + 1)}
        style={[v.arrow, at === count - 1 && { opacity: .3 }]}><Text style={v.arrowText}>›</Text></Pressable>
    </View>}
  </View>;
}
const PAGER = 40;

// Weekly 2.0 type: one body size for every block, smaller labels, gold hairlines.
const v = StyleSheet.create({
  eyebrow: { fontFamily: 'Georgia', fontSize: 11, letterSpacing: 2, color: GOLD, marginBottom: 6 },
  range: { fontFamily: 'Georgia', fontSize: 13, color: SOFT, marginBottom: 10 },
  headline: { fontFamily: 'Georgia', fontSize: 21, lineHeight: 30, color: INK, marginBottom: 16 },
  block: { marginBottom: 12 },
  rule: { height: 1, backgroundColor: '#A8823F40', marginVertical: 16 },
  entryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  art: { width: 50, alignItems: 'center', paddingTop: 2 },
  artMain: { width: 60, alignItems: 'center', paddingTop: 2 },
  text: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: INK, marginBottom: 6 },
  good: { paddingLeft: 12, borderLeftWidth: 1, borderColor: '#A8823F55', marginBottom: 2 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  date: { minHeight: 32, justifyContent: 'center' },
  dateText: { fontFamily: 'Georgia', fontSize: 12, color: GOLD, textDecorationLine: 'underline', textDecorationColor: '#A8823F66' },
  dateOn: { color: INK },
  marks: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
  markOn: { color: GOLD },
  markButton: { minHeight: 32, justifyContent: 'center' },
  markText: { fontFamily: 'Georgia', fontSize: 12, color: '#9A8261' },
  marked: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  markedText: { fontFamily: 'Georgia', fontSize: 12, color: SOFT },
  link: { fontFamily: 'Georgia', fontSize: 12, color: GOLD, textDecorationLine: 'underline' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: PAGER },
  arrow: { minWidth: 44, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontFamily: 'Georgia', fontSize: 22, color: GOLD },
  pageText: { fontFamily: 'Georgia', fontSize: 11, letterSpacing: 2, color: SOFT },
  pair: { marginBottom: 4 },
  pairLabel: { fontFamily: 'Georgia', fontSize: 11, letterSpacing: 1, color: '#8C6E3A', marginBottom: 2 },
  cardArt: { width: 132, height: 198, borderRadius: 8, marginBottom: 8 },
});
