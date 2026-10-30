import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { keepSection, loadCollection, setMute, SHORT_COPY, shortDate, unfollowThread, weekLabel, withdrawLetter, writeLetter,
  type PetalCollection as Collection } from '../../services/reflections';
import { useAppLocale } from '../../services/locale';

// The cream book on the pavilion shelf (Weekly 2.0 闭环, backend lib/insight-loop.js): every petal card the Weekly
// reports drew with each week's "why this card" stacked, the insights the owner kept, the threads they follow, letters
// to a later self and the words kept out of insights. Never "N more to collect". Written on the paper, no boxes.
const COPY = {
  en: { title: 'Petal collection', cards: 'Petal cards', kept: 'Kept', insights: 'Insights you kept', letGo: 'Let go',
    threads: 'Threads you follow', threadsNote: 'Follow an insight from a Weekly reflection; each Weekly then tells you how the thread went. Up to three.',
    letters: 'Letters to a later you', letterHint: 'One sentence for a later week…', send: 'Send', withdraw: 'Withdraw',
    due: (date: string) => `Arrives the week of ${date}`, arrived: (date: string) => `Arrived ${date}`,
    later: [['In 2 weeks', 14], ['In a month', 30], ['In 3 months', 91]] as [string, number][],
    mutes: 'Kept out of insights', muteHint: 'A name or topic', add: 'Add', remove: (word: string) => `Remove ${word}`,
    mutesNote: 'Insights never use these words, and lines that carry them are left out.',
    empty: 'Nothing here yet. Cards and kept insights gather here week by week.', failed: 'That didn’t save. Try again in a moment.',
    loadFailed: 'The collection can’t be opened right now.', retry: 'Try again' },
  'zh-Hans': { title: '花语集', cards: '花语卡', kept: '已收藏', insights: '收藏的洞察', letGo: '放下',
    threads: '你在跟进的线', threadsNote: '在周报的洞察下点“跟进”，之后每份周报都会说说这条线的新动静。最多 3 条。',
    letters: '给未来的信', letterHint: '写一句话给之后的自己……', send: '寄出', withdraw: '撤回',
    due: (date: string) => `会在 ${date} 那周的周报里出现`, arrived: (date: string) => `已在 ${date} 送达`,
    later: [['两周后', 14], ['一个月后', 30], ['三个月后', 91]] as [string, number][],
    mutes: '不参与洞察的词', muteHint: '一个人名或主题', add: '添加', remove: (word: string) => `移除 ${word}`,
    mutesNote: '洞察不会用到这些词，带着它们的句子也不会被引用。',
    empty: '这里还是空的。花语卡和收藏的洞察会一周一周地留在这里。', failed: '没有保存成功，稍后再试。',
    loadFailed: '现在打不开花语集。', retry: '再试一次' },
} as const;
const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export function PetalCollection({ headingSize = 22 }: { headingSize?: number }) {
  const lang = useAppLocale(), t = COPY[lang], types = SHORT_COPY[lang].types;
  const [book, setBook] = useState<Collection | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [note, setNote] = useState('');
  const [letter, setLetter] = useState(''), [later, setLater] = useState(1), [word, setWord] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    try { const next = await loadCollection(signal); setBook(next); setState('ready'); }
    catch { if (!signal?.aborted) setState('error'); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  // Every change saves first and then reads the book again, so the page shows only what the server kept.
  async function change(run: () => Promise<unknown>) {
    setNote('');
    try { await run(); await load(); } catch { setNote(t.failed); }
  }
  const week = (periodKey: string) => weekLabel(periodKey, lang).title;
  const eyebrow = (text: string) => <Text accessibilityRole="header" style={c.eyebrow}>{text}</Text>;
  const rule = <View accessible={false} style={c.rule} />;
  const link = (label: string, onPress: () => void, a11y = label) => <Pressable accessibilityRole="button" accessibilityLabel={a11y} hitSlop={12} onPress={onPress}
    style={({ pressed }) => [c.linkBox, pressed && { opacity: .6 }]}><Text style={c.link}>{label}</Text></Pressable>;

  if (state !== 'ready' || !book) return <View style={{ flex: 1 }}>
    <Text accessibilityRole="header" style={[c.title, { fontSize: headingSize }]}>{t.title}</Text>
    {state === 'loading' ? <ActivityIndicator color="#8B6C44" accessibilityLabel={t.title} />
      : <><Text style={c.text}>{t.loadFailed}</Text>{link(t.retry, () => void load())}</>}
  </View>;
  const empty = !book.cards.length && !book.insights.length;
  return <View style={{ flex: 1, minHeight: 0 }}>
    <Text accessibilityRole="header" style={[c.title, { fontSize: headingSize }]}>{t.title}</Text>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 18 }} keyboardShouldPersistTaps="handled">
      {!!note && <Text accessibilityRole="alert" style={c.text}>{note}</Text>}
      {empty && <Text style={c.text}>{t.empty}</Text>}
      {book.cards.length > 0 && <>{eyebrow(t.cards)}
        {book.cards.map(card => <View key={card.cardId} style={c.entry}>
          <Text style={c.name}>{card.name}{card.kept ? `  · ${t.kept}` : ''}</Text>
          <Text style={c.text}>{card.line}</Text>
          {card.appearances.map(item => <Text key={item.reportId} style={[c.text, c.reason]}>
            <Text style={{ color: SOFT }}>{week(item.periodKey)}　</Text>{item.reason ?? ''}
          </Text>)}
        </View>)}</>}
      {book.insights.length > 0 && <>{rule}{eyebrow(t.insights)}
        {book.insights.map(item => <View key={`${item.reportId}-${item.index}`} style={c.entry}>
          <Text style={c.small}>{types[item.type] ?? ''} · {week(item.periodKey)}</Text>
          <Text style={c.text}>{item.text}</Text>
          {item.items.map((thing, i) => <Text key={i} style={[c.text, c.reason]}>{thing.text}</Text>)}
          {link(t.letGo, () => void change(() => keepSection(item.reportId, item.index, false)))}
        </View>)}</>}
      {rule}{eyebrow(t.threads)}
      {book.threads.map(thread => <View key={thread.id} style={c.row}>
        <Text style={[c.text, { flex: 1 }]}>“{thread.word}”</Text>
        {link(t.letGo, () => void change(() => unfollowThread(thread.id)))}
      </View>)}
      <Text style={c.small}>{t.threadsNote}</Text>
      {rule}{eyebrow(t.letters)}
      {book.letters.map(item => <View key={item.id} style={c.entry}>
        <Text style={c.text}>{item.text}</Text>
        <View style={c.row}>
          <Text style={[c.small, { flex: 1 }]}>{item.delivered ? t.arrived(shortDate(item.deliverOn, lang)) : t.due(shortDate(item.deliverOn, lang))}</Text>
          {!item.delivered && link(t.withdraw, () => void change(() => withdrawLetter(item.id)))}
        </View>
      </View>)}
      <TextInput accessibilityLabel={t.letters} placeholder={t.letterHint} placeholderTextColor="#9A8261" multiline maxLength={280}
        value={letter} onChangeText={setLetter} style={c.input} />
      <View style={c.row}>
        {t.later.map(([label], i) => <Pressable key={label} accessibilityRole="radio" accessibilityState={{ selected: later === i }} hitSlop={8}
          onPress={() => setLater(i)} style={c.linkBox}><Text style={[c.small, later === i && c.on]}>{label}</Text></Pressable>)}
        <View style={{ flex: 1 }} />
        {link(t.send, () => { const text = letter.trim(); if (!text) return;
          void change(async () => { await writeLetter(text, addDays(book.today, t.later[later][1])); setLetter(''); }); })}
      </View>
      {rule}{eyebrow(t.mutes)}
      <View style={c.chips}>
        {book.mutes.map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={t.remove(item)} hitSlop={6}
          onPress={() => void change(() => setMute(item, false))} style={c.linkBox}><Text style={c.text}>{item} ×</Text></Pressable>)}
      </View>
      <View style={c.row}>
        <TextInput accessibilityLabel={t.mutes} placeholder={t.muteHint} placeholderTextColor="#9A8261" maxLength={64}
          value={word} onChangeText={setWord} style={[c.input, { flex: 1, minHeight: 36 }]} />
        {link(t.add, () => { const next = word.trim(); if (!next) return; void change(async () => { await setMute(next, true); setWord(''); }); })}
      </View>
      <Text style={c.small}>{t.mutesNote}</Text>
    </ScrollView>
  </View>;
}

const INK = '#3F2F1F', SOFT = '#6B543A', GOLD = '#A8823F';
const c = StyleSheet.create({
  title: { fontFamily: 'Georgia', color: INK, marginBottom: 12 },
  eyebrow: { fontFamily: 'Georgia', fontSize: 11, letterSpacing: 2, color: GOLD, marginBottom: 6 },
  rule: { height: 1, backgroundColor: '#A8823F40', marginVertical: 16 },
  entry: { marginBottom: 12 },
  name: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: '#8C6E3A' },
  text: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: INK },
  small: { fontFamily: 'Georgia', fontSize: 11, lineHeight: 18, color: SOFT },
  reason: { paddingLeft: 12, borderLeftWidth: 1, borderColor: '#A8823F55', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  linkBox: { minHeight: 36, justifyContent: 'center' },
  link: { fontFamily: 'Georgia', fontSize: 12, color: GOLD, textDecorationLine: 'underline' },
  on: { color: GOLD, textDecorationLine: 'underline' },
  // Ink on the page: a quiet underline, no box.
  input: { fontFamily: 'Georgia', fontSize: 14, lineHeight: 22, color: INK, borderBottomWidth: 1, borderColor: '#A8823F66', paddingVertical: 6, minHeight: 44 },
});
