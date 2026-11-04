import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Canvas, Picture, createPicture } from '@shopify/react-native-skia';
import { FlowerThumb } from '../../garden/planting/FlowerThumb';
import { dayRecords, formatLocalDate, moodTitle, weekdayOf, type JournalDay } from '../../../services/bookhouse';
import type { ReadingMetrics } from './readingLayout';
import { drawBotanicalWatermark } from './watermark';

const INK = '#4A3B27', SOFT = '#7A6447', RULE = '#C2A06B', EMPTY = '#9A8463';

/** The left page brought close: everything the day recorded — the flowers it grew, its Events and the moods that were
 *  analysed — in full, from the stored records only. Sections with nothing say so quietly. */
export function RecordsPage({ rect, m, background, shade, fontRegular, fontItalic, day }: {
  rect: { x: number; y: number; width: number; height: number }; m: ReadingMetrics; background: string; shade: number;
  fontRegular?: string; fontItalic?: string; day: JournalDay;
}) {
  const r = dayRecords(day);
  const nothing = !r.flowers.length && !r.events.length && !r.moods.length;
  // Nothing recorded: the same faint botanical line drawing as the spread's page, in the space under the sections.
  const [blank, setBlank] = useState<number | null>(null);
  const [viewport, setViewport] = useState(0);
  const art = viewport && blank !== null ? viewport - blank - 24 : 0;
  const artWidth = rect.width - m.padLeft - m.padRight;
  const regular = { fontFamily: fontRegular }, italic = { fontFamily: fontItalic, fontStyle: fontItalic ? undefined : 'italic' as const };
  const label = (value: string) => <View style={{ marginTop: 18, marginBottom: 8 }}>
    <Text style={[regular, { fontSize: 12, letterSpacing: 2.4, color: '#8C7148' }]}>{value.toUpperCase()}</Text>
    <View style={{ height: 1, backgroundColor: RULE, marginTop: 4, opacity: .7 }} />
  </View>;
  const empty = (value: string) => <Text style={[italic, { fontSize: m.body.size * .92, color: EMPTY }]}>{value}</Text>;
  return <View testID="records-page" style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
    <Image accessible={false} source={{ uri: background }} fadeDuration={0} resizeMode="stretch" style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 1 - shade }]} />
    <View style={{ position: 'absolute', left: m.padRight, right: m.padLeft, top: m.padTop, bottom: m.padBottom }}>
      <Text style={[regular, { fontSize: m.weekday.size, lineHeight: m.weekday.line, letterSpacing: m.weekday.spacing, color: SOFT, textAlign: 'center' }]}>{weekdayOf(day.localDate).toUpperCase()}</Text>
      <Text accessibilityRole="header" style={[italic, { fontSize: m.date.size * 1.1, lineHeight: m.date.line * 1.1, color: INK, textAlign: 'center' }]}>{formatLocalDate(day.localDate)}</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator onLayout={e => setViewport(e.nativeEvent.layout.height)}>
        {label(r.flowers.length > 1 ? `The day's flowers · ${r.flowers.length}` : "The day's flower")}
        {r.flowers.length ? r.flowers.map(f => <View key={f.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 }}>
          <FlowerThumb speciesCode={f.speciesCode} name={f.name} image={f.img} size={Math.round(rect.width * .3)} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[italic, { fontSize: m.title.size * .9, lineHeight: m.title.line * .9, color: INK }]}>{f.name}</Text>
            {!!f.meaning && <Text style={[regular, { fontSize: m.body.size * .88, lineHeight: m.body.line * .85, color: SOFT }]}>{f.meaning}</Text>}
            {!!f.mood && <Text style={[regular, { fontSize: 13, color: SOFT }]}>{moodTitle(f.mood)}</Text>}
            <Text style={[regular, { fontSize: 11, letterSpacing: 1.6, color: EMPTY }]}>{f.source === 'Event' ? 'GREW FROM AN EVENT' : 'GREW FROM DAILY GROW'}</Text>
          </View>
        </View>) : empty('No flower grew on this day.')}
        {label(r.events.length > 1 ? `Events · ${r.events.length}` : 'Event')}
        {r.events.length ? r.events.map((e, i) => <Text key={i} selectable style={[regular, { fontSize: m.body.size, lineHeight: m.body.line, color: '#43361F', marginBottom: 8 }]}>{e}</Text>)
          : empty('No Event recorded.')}
        {label('Mood analysis')}
        {r.moods.length ? r.moods.map((mood, i) => <View key={i} style={{ marginBottom: 10 }}>
          <Text style={[italic, { fontSize: m.title.size * .85, lineHeight: m.title.line * .85, color: INK }]}>{moodTitle(mood.label)}</Text>
          {mood.secondary.length > 0 && <Text style={[regular, { fontSize: m.body.size * .9, lineHeight: m.body.line * .85, color: SOFT }]}>{mood.secondary.map(moodTitle).join(' · ')}</Text>}
          <Text style={[regular, { fontSize: 11, letterSpacing: 1.6, color: EMPTY }]}>{mood.source === 'Event' ? 'FROM AN EVENT' : 'FROM DAILY GROW'}</Text>
        </View>) : empty('No mood recorded.')}
        {nothing && <View onLayout={e => setBlank(e.nativeEvent.layout.y)} />}
        {nothing && art > 90 && <View pointerEvents="none" accessible={false} style={{ height: art }}>
          <Canvas style={{ width: artWidth, height: art }}><Picture picture={createPicture(c => drawBotanicalWatermark(c, artWidth / 2, art / 2, Math.min(170, art * .8)))} /></Canvas>
        </View>}
      </ScrollView>
    </View>
  </View>;
}

