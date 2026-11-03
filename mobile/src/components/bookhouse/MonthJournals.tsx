import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatLocalDate, journalLocked, journalPreview, type JournalCheckIn } from '../../services/bookhouse';
import { BookhouseArt } from './BookhouseArt';
import { ART, ArtCrop, Icon, ICONS, ParchmentButton, palette, serif } from './TreehouseArt';

// The month's floral spine, framed as a small pressed-flower cameo.
export function FlowerCameo({ month, size }: { month: number; size: number }) {
  const spineHeight = size / .31;
  return <View pointerEvents="none" style={[styles.cameo, { width: size, height: size * 1.18 }]}>
    <View style={{ position: 'absolute', top: -spineHeight * .2, left: 0 }}><BookhouseArt index={month - 1} width={size} height={spineHeight} /></View>
  </View>;
}

export function MonthJournalList({ width, height, month, entries, onOpen, onScroll }: {
  width: number; height: number; month: number; entries: JournalCheckIn[]; onOpen: (entry: JournalCheckIn) => void; onScroll?: () => void;
}) {
  // The board hugs a short month and scrolls a long one, so there is no empty wall under a few cards.
  const [content, setContent] = useState(entries.length * 84 + 24);
  const boardHeight = Math.min(height, content + 4);
  return <View testID="treehouse-month-list" style={[styles.board, { width, height: boardHeight }]}>
    {/* The painted bookcase back, planks included, as the board the cards rest on. */}
    <ArtCrop rect={ART.shelfBack} width={width} height={boardHeight} alignY={0} style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#2A170A', opacity: .22 }]} />
    <ScrollView onContentSizeChange={(_, h) => setContent(h)} onScroll={onScroll} scrollEventThrottle={64} contentContainerStyle={{ padding: 12, gap: 10 }} showsVerticalScrollIndicator={false}>
      {entries.map(entry => {
        const locked = journalLocked(entry);
        const preview = journalPreview(entry.journal?.content || '');
        return <Pressable key={entry.id} accessibilityRole="button"
          accessibilityLabel={`${formatLocalDate(entry.localDate)}. ${preview}${locked ? '. From Daily Grow' : ''}`} accessibilityHint="Opens this journal"
          onPress={() => onOpen(entry)} style={({ pressed }) => [styles.card, pressed && { backgroundColor: '#FFF7E4', transform: [{ scale: .985 }] }]}>
          <FlowerCameo month={month} size={40} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={styles.cardDate}>{formatLocalDate(entry.localDate)}{locked ? '  ·  Daily Grow' : ''}</Text>
            <Text numberOfLines={2} style={styles.cardTitle}>{preview}</Text>
          </View>
          <Icon source={ICONS.chevron} size={18} opacity={.7} />
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

export function EmptyMonth({ width, onNew, hint }: { width: number; onNew: () => void; hint?: string }) {
  return <View testID="treehouse-empty-month" style={[styles.emptyPanel, { width }]}>
    <View pointerEvents="none" style={styles.emptyInset} />
    <View pointerEvents="none" style={{ opacity: .9 }}><BookhouseArt index={14} width={Math.min(150, width * .5)} height={Math.min(150, width * .5) * 1.06} /></View>
    <View style={styles.flourish}><View style={styles.flourishLine} /><View style={styles.flourishDot} /><View style={styles.flourishLine} /></View>
    <Text accessibilityRole="header" style={styles.emptyTitle}>No journal yet{'\n'}for this month.</Text>
    <Text style={styles.emptyBody}>Start writing and keep your{'\n'}little moments here.</Text>
    <ParchmentButton label="New Journal" onPress={onNew} art={<BookhouseArt index={13} width={30} height={34} />} style={{ marginTop: 6, alignSelf: 'stretch' }} />
    {!!hint && <Text style={styles.emptyHint}>{hint}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  board: { borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: '#8A6236',
    shadowColor: '#140A03', shadowOpacity: .5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 74, paddingVertical: 9, paddingLeft: 10, paddingRight: 10,
    backgroundColor: palette.parchment, borderRadius: 14, borderWidth: 1.5, borderColor: palette.gold,
    shadowColor: '#1B0E06', shadowOpacity: .35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  cameo: { borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: '#C9A264', backgroundColor: '#E9D9B6' },
  cardDate: { fontFamily: serif, fontSize: 13, color: palette.inkSoft, letterSpacing: .2 },
  cardTitle: { fontFamily: serif, fontSize: 17, lineHeight: 22, color: palette.ink },
  emptyPanel: { alignSelf: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 22,
    backgroundColor: '#F7ECD4F7', borderRadius: 18, borderWidth: 2, borderColor: palette.gold,
    shadowColor: '#140A03', shadowOpacity: .5, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  emptyInset: { position: 'absolute', left: 6, right: 6, top: 6, bottom: 6, borderRadius: 13, borderWidth: 1, borderColor: '#D9BE87' },
  flourish: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  flourishLine: { width: 54, height: 1, backgroundColor: '#C2A06B' },
  flourishDot: { width: 6, height: 6, transform: [{ rotate: '45deg' }], backgroundColor: '#C2A06B' },
  emptyTitle: { fontFamily: serif, fontStyle: 'italic', fontSize: 24, lineHeight: 31, color: '#4E4330', textAlign: 'center' },
  emptyBody: { fontFamily: serif, fontSize: 16, lineHeight: 23, color: '#6E5A40', textAlign: 'center', marginBottom: 4 },
  emptyHint: { fontFamily: serif, fontSize: 13, lineHeight: 18, color: '#7A6447', textAlign: 'center' },
});
