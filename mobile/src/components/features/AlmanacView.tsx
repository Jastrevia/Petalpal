import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { loadAlmanac, shortDate, weekLabel, type Almanac } from '../../services/reflections';
import { useAppLocale } from '../../services/locale';
import { petalCardArt } from '../petalCards/petalCardArt';
import { PETAL_ART } from './weeklyArt';

// 花语年鉴 (backend lib/almanac.js), inside the 花语集 book: the year's twelve gardens (one painted petal per day in that
// day's main mood, nothing where nothing was written), the theme that came back most with its first and latest words,
// the firsts, the year's small good things and its petal card with every reason stacked. On the paper, no boxes.
const COPY = {
  en: { back: '‹ Petal collection', gardens: 'Twelve gardens', echo: 'What came back most', first: 'First', latest: 'Latest', firsts: 'First times',
    goods: 'Small good things of the year', card: 'Petal card of the year', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    failed: 'The almanac can’t be opened right now.', notYet: 'This year’s almanac opens on 25 December.', retry: 'Try again', times: (n: number) => `×${n}` },
  'zh-Hans': { back: '‹ 花语集', gardens: '十二个月的花园', echo: '回声最多的主题', first: '第一次', latest: '最近一次', firsts: '第一次时间线',
    goods: '年度好事清单', card: '年度花语卡', months: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
    failed: '现在打不开花语年鉴。', notYet: '今年的花语年鉴 12 月 25 日开放。', retry: '再试一次', times: (n: number) => `${n} 次` },
} as const;

export function AlmanacView({ year, onBack, headingSize = 22 }: { year: number; onBack: () => void; headingSize?: number }) {
  const lang = useAppLocale(), t = COPY[lang];
  const [book, setBook] = useState<Almanac | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'notYet'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    loadAlmanac(year, controller.signal).then(next => { setBook(next); setState('ready'); })
      .catch(error => { if (!controller.signal.aborted) setState((error as { status?: number })?.status === 409 ? 'notYet' : 'error'); });
    return () => controller.abort();
  }, [year, attempt]);
  const eyebrow = (text: string) => <Text accessibilityRole="header" style={a.eyebrow}>{text}</Text>;
  const rule = <View accessible={false} style={a.rule} />;
  const back = <Pressable accessibilityRole="button" hitSlop={12} onPress={onBack} style={a.linkBox}><Text style={a.link}>{t.back}</Text></Pressable>;
  if (state !== 'ready' || !book) return <View>{back}
    {state === 'loading' ? <ActivityIndicator color="#8B6C44" accessibilityLabel={String(year)} />
      : <><Text style={a.text}>{state === 'notYet' ? t.notYet : t.failed}</Text>
        {state === 'error' && <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setAttempt(n => n + 1)} style={a.linkBox}><Text style={a.link}>{t.retry}</Text></Pressable>}</>}
  </View>;
  // Three months a row; each month a seven-column grid of tiny painted petals.
  const monthWidth = width ? Math.floor((width - 16) / 3) : 0, dot = monthWidth ? Math.floor(monthWidth / 7) : 0;
  const art = book.card && petalCardArt(book.card.cardId);
  return <View>
    {back}
    <Text accessibilityRole="header" style={[a.title, { fontSize: headingSize }]}>{book.title}</Text>
    <Text style={a.text}>{book.summary}</Text>
    {rule}{eyebrow(t.gardens)}
    <View style={a.months} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {dot > 0 && book.months.map((month, i) => {
        const lead = (new Date(`${month.days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
        return <View key={month.month} style={{ width: monthWidth }} accessible
          accessibilityLabel={`${t.months[i]} · ${month.entries}`}>
          <Text style={a.small}>{t.months[i]}</Text>
          <View style={a.grid}>
            {Array.from({ length: lead }, (_, k) => <View key={`l${k}`} style={{ width: dot, height: dot }} />)}
            {month.days.map(day => <View key={day.date} style={{ width: dot, height: dot, alignItems: 'center', justifyContent: 'center' }}>
              {day.mood ? <Image source={PETAL_ART[day.mood]} contentFit="contain" accessible={false} style={{ width: dot * .9, height: dot * .9 }} />
                : <View style={[a.soil, { width: dot * .28, height: dot * .28, borderRadius: dot }]} />}
            </View>)}
          </View>
        </View>;
      })}
    </View>
    {book.echo && <>{rule}{eyebrow(t.echo)}
      <Text style={a.text}>{book.echo.line}</Text>
      {([[t.first, book.echo.first], [t.latest, book.echo.last]] as const).map(([label, quote]) => <View key={label} style={a.pair}>
        <Text style={a.small}>{label} · {shortDate(quote.date, lang)}</Text>
        <Text style={a.text}>{`“${quote.text}”`}</Text>
      </View>)}</>}
    {book.firsts.length > 0 && <>{rule}{eyebrow(t.firsts)}
      {book.firsts.map((item, i) => <Text key={i} style={a.text}><Text style={{ color: SOFT }}>{shortDate(item.date, lang)}　</Text>{item.word}</Text>)}</>}
    {book.goods.length > 0 && <>{rule}{eyebrow(t.goods)}
      {book.goods.map((item, i) => <Text key={i} style={[a.text, a.good]}>{item.text}{item.count > 1 ? `  ${t.times(item.count)}` : ''}</Text>)}</>}
    {book.card && <>{rule}{eyebrow(t.card)}
      <View style={a.card}>
        {art && <Image source={art} contentFit="contain" style={a.cardArt} accessibilityLabel={book.card.name} />}
        <Text style={a.name}>{book.card.name}</Text>
        <Text style={a.text}>{book.card.line}</Text>
      </View>
      {book.card.reasons.map((item, i) => <Text key={i} style={[a.text, a.good]}>
        <Text style={{ color: SOFT }}>{weekLabel(item.periodKey, lang).title}　</Text>{item.reason ?? ''}</Text>)}</>}
  </View>;
}

const INK = '#3F2F1F', SOFT = '#6B543A', GOLD = '#A8823F';
const a = StyleSheet.create({
  title: { fontFamily: 'Georgia', color: INK, marginBottom: 8 },
  eyebrow: { fontFamily: 'Georgia', fontSize: 11, letterSpacing: 2, color: GOLD, marginBottom: 6 },
  rule: { height: 1, backgroundColor: '#A8823F40', marginVertical: 16 },
  text: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: INK },
  small: { fontFamily: 'Georgia', fontSize: 11, lineHeight: 18, color: SOFT },
  name: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: '#8C6E3A' },
  good: { paddingLeft: 12, borderLeftWidth: 1, borderColor: '#A8823F55', marginTop: 4 },
  pair: { marginTop: 6 },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  soil: { backgroundColor: '#8C6E3A33' },
  card: { alignItems: 'center', marginBottom: 6 },
  cardArt: { width: 96, height: 144, borderRadius: 8, marginBottom: 6 },
  linkBox: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { fontFamily: 'Georgia', fontSize: 12, color: GOLD, textDecorationLine: 'underline' },
});
