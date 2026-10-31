import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { readEvent } from '../../services/events';
import { MONTHLY_COPY, MOOD_SPECIES, SHORT_COPY, shortDate, type Monthly2 } from '../../services/reflections';
import { useAppLocale } from '../../services/locale';
import { clusterPicture } from '../garden/planting/flowerClusters';
import { petalCardArt } from '../petalCards/petalCardArt';
import { Paged, type ReportPart } from './ShortWeeklyReport';
import { useEventSpecies } from './WeeklyBloom';
import { WEEKLY_ART } from './weeklyArt';

// Monthly 2.0 (backend lib/monthly-insights.js) as one spread of the blue book, written on the paper like the Weekly 2.0
// pages: left — the date, headline, this month's garden (a calendar, one painted flower per day in that day's main mood,
// empty soil where nothing was written) and the spread of Weekly cards; right — what changed, threads, small good
// things, the people of the month (folded) and the question. Pages turn (Paged), never scroll.
type Opened = { at: string; id: string; text: string | null };

export function MonthlyReport2({ month, part = 'all', interactive, date, report }: {
  month: Monthly2; part?: ReportPart; interactive: boolean; date: string; report?: ReactNode;
}) {
  const lang = useAppLocale(), copy = SHORT_COPY[lang], m = MONTHLY_COPY[lang];
  const species = useEventSpecies();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [cell, setCell] = useState(0);
  async function open(at: string, id: string) {
    if (opened?.at === at && opened.id === id) { setOpened(null); return; }
    setOpened({ at, id, text: null });
    try { const event = await readEvent(id); setOpened(current => current?.id === id ? { at, id, text: event.content } : current); }
    catch { setOpened(current => current?.id === id ? { at, id, text: copy.unavailable } : current); }
  }
  const eyebrow = (text: string) => <Text style={v.eyebrow}>{text}</Text>;
  const rule = <View accessible={false} style={v.rule} />;
  const dateLink = (ref: { date: string; eventId: string }, at: string) => <Pressable accessibilityRole="button" accessibilityLabel={shortDate(ref.date, lang)}
    accessibilityHint={opened?.at === at ? copy.close : copy.open} disabled={!interactive} hitSlop={10} onPress={() => void open(at, ref.eventId)} style={v.date}>
    <Text style={v.dateText}>{shortDate(ref.date, lang)}</Text></Pressable>;
  const panel = (at: string) => opened?.at === at ? <Text selectable={interactive} style={[v.text, v.event]}>{opened.text ?? copy.loading}</Text> : null;

  // The calendar starts on Monday; each cell is one day.
  const garden = month.garden && (() => {
    const first = new Date(`${month.garden.days[0]}T00:00:00Z`).getUTCDay(), lead = (first + 6) % 7;
    const cells: (NonNullable<Monthly2['garden']>['dayMoods'][number] | null)[] = [...Array<null>(lead).fill(null), ...month.garden.dayMoods];
    const firstEvent = (date: string) => month.garden!.points.find(point => point.date === date);
    return <View>
      <View accessible={false} style={v.week}>{m.days.map((day, i) => <Text key={i} style={[v.dayName, { width: cell || undefined }]}>{day}</Text>)}</View>
      <View style={v.calendar} onLayout={event => setCell(Math.floor(event.nativeEvent.layout.width / 7))}>
        {cell > 0 && cells.map((day, i) => {
          if (!day) return <View key={`lead-${i}`} style={{ width: cell, height: cell + 6 }} />;
          const point = firstEvent(day.date), art = day.mood ? clusterPicture(species?.get(point?.eventId ?? '') ?? MOOD_SPECIES[day.mood], '', 'S') : null;
          return <Pressable key={day.date} accessibilityRole={point ? 'button' : undefined}
            accessibilityLabel={`${shortDate(day.date, lang)} · ${day.mood ? copy.moods[day.mood] : m.empty}`} disabled={!interactive || !point}
            onPress={() => point && void open('garden', point.eventId)} style={{ width: cell, height: cell + 6, alignItems: 'center', justifyContent: 'flex-end' }}>
            {art ? <Image source={art.source} contentFit="contain" accessible={false} style={{ width: cell * .82, height: cell * .82 }} />
              : <Image source={WEEKLY_ART.ground} contentFit="contain" accessible={false} style={{ width: cell * .7, height: cell * .3, opacity: .55 }} />}
            <Text style={v.dayNumber}>{Number(day.date.slice(8))}</Text>
          </Pressable>;
        })}
      </View>
      <Text selectable={interactive} style={v.text}>{month.garden.claim}</Text>
      {panel('garden')}
    </View>;
  })();

  const left: { key: string; node: ReactNode }[] = [{ key: 'head', node: <>
    <Text style={v.eyebrow}>{date}</Text>
    <Text accessibilityRole="header" style={v.headline}>{month.headline}</Text>
  </> }];
  if (garden) left.push({ key: 'garden', node: <>{eyebrow(m.garden)}{garden}</> });
  if (month.spread.length) left.push({ key: 'spread', node: <>{rule}{eyebrow(m.spread)}
    <View style={v.spread}>{month.spread.map(card => {
      const art = petalCardArt(card.cardId);
      return <View key={card.periodKey} style={v.card}>
        <Text style={v.label}>{m.roles[card.role]}</Text>
        {art && <Image source={art} contentFit="contain" style={v.cardArt} accessibilityLabel={card.name} />}
        <Text style={v.label}>{card.name}</Text>
        {card.headline && <Text selectable={interactive} style={[v.text, v.center]}>{card.headline}</Text>}
      </View>;
    })}</View></> });

  const right: { key: string; node: ReactNode }[] = [];
  month.changes.forEach((change, i) => right.push({ key: `change-${i}`, node: <>{i ? rule : null}{eyebrow(m.change)}
    <Text selectable={interactive} style={v.text}>{change.claim}</Text>
    {([[m.lastMonth, change.then, `then-${i}`], [m.thisMonth, change.now, `now-${i}`]] as const).map(([label, ref, at]) => <View key={at} style={v.pair}>
      <Text style={v.label}>{label}</Text>
      <Text selectable={interactive} style={v.text}>{`“${ref.text}”`}</Text>
      {dateLink(ref, at)}{panel(at)}
    </View>)}</> }));
  if (month.threads.length) right.push({ key: 'threads', node: <>{right.length ? rule : null}{eyebrow(m.threads)}
    {month.threads.map((item, i) => <View key={i} style={v.pair}>
      <Text selectable={interactive} style={v.text}>{`“${item.quote.text}”`}</Text>
      <Text selectable={interactive} style={v.text}>{item.line}</Text>
      {dateLink(item.quote, `thread-${i}`)}{panel(`thread-${i}`)}
    </View>)}</> });
  if (month.goods.length) right.push({ key: 'goods', node: <>{right.length ? rule : null}{eyebrow(m.goods)}
    {month.goods.map((item, i) => <Text key={i} selectable={interactive} style={[v.text, v.good]}>
      {item.text}{item.count > 1 ? `  ${m.times(item.count)}` : ''}</Text>)}</> });
  // Folded by default: who the month was with is the owner's own and stays closed until asked for.
  if (month.people.length) right.push({ key: 'people', node: <>{right.length ? rule : null}
    <View style={v.row}>{eyebrow(m.people)}<View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: peopleOpen }} hitSlop={12} onPress={() => setPeopleOpen(value => !value)} style={v.date}>
        <Text style={v.dateText}>{peopleOpen ? m.hide : m.show}</Text></Pressable></View>
    {peopleOpen && month.people.map(item => <Text key={item.word} selectable={interactive} style={v.text}>
      {`“${item.word}” · ${m.peopleLine(item.count, item.mood, item.moodCount)}`}</Text>)}</> });
  if (month.question) right.push({ key: 'question', node: <>{right.length ? rule : null}{eyebrow(m.question)}
    <Text selectable={interactive} style={v.text}>{month.question}</Text></> });
  if (report) right.push({ key: 'report', node: report });

  if (part === 'left') return <Paged blocks={left} testID="monthly-left-page" copy={copy} />;
  if (part === 'right') return <Paged blocks={right} testID="monthly-right-page" copy={copy} />;
  return <Paged blocks={[...left, ...right]} testID="monthly-report-2" copy={copy} />;
}

const INK = '#3F2F1F', SOFT = '#6B543A', GOLD = '#A8823F';
const v = StyleSheet.create({
  eyebrow: { fontFamily: 'Georgia', fontSize: 11, letterSpacing: 2, color: GOLD, marginBottom: 6 },
  headline: { fontFamily: 'Georgia', fontSize: 21, lineHeight: 30, color: INK, marginBottom: 16 },
  rule: { height: 1, backgroundColor: '#A8823F40', marginVertical: 16 },
  text: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: INK, marginBottom: 6 },
  event: { color: SOFT },
  label: { fontFamily: 'Georgia', fontSize: 11, letterSpacing: 1, color: '#8C6E3A', marginBottom: 2 },
  center: { textAlign: 'center' },
  good: { paddingLeft: 12, borderLeftWidth: 1, borderColor: '#A8823F55', marginBottom: 2 },
  pair: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  date: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  dateText: { fontFamily: 'Georgia', fontSize: 12, color: GOLD, textDecorationLine: 'underline', textDecorationColor: '#A8823F66' },
  week: { flexDirection: 'row' },
  dayName: { fontFamily: 'Georgia', fontSize: 11, color: SOFT, textAlign: 'center' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  dayNumber: { fontFamily: 'Georgia', fontSize: 11, color: SOFT },
  spread: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  card: { width: 96, alignItems: 'center' },
  cardArt: { width: 72, height: 108, borderRadius: 6, marginBottom: 4 },
});
