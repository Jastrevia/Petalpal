import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loadKeepsakeBook, type KeepsakeBook as Book } from '../../services/fairyCloseness';
import { BOND, bondCopy, type BondLocale } from './bondCopy';
import { useFairyName } from '../../services/fairyName';
import { keepsakeArt } from './keepsakeArt';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';

type Filter = 'ALL' | 'COMMON' | 'RARE' | 'MONTHLY';
type Entry = Book['keepsakes'][number];

// The keepsake book (design screens 9 and 10): every keepsake, collected ones in colour,
// the rest as faded silhouettes; tap a collected one for her note and the day it came.
// `newIds`: keepsakes today's check-in gave that the owner has not looked at yet (Collection marks them seen on close).
export function KeepsakeBook({ visible, locale, onClose, newIds = [] }: { visible: boolean; locale: BondLocale; onClose: () => void; newIds?: string[] }) {
  const fairyName = useFairyName();
  const copy = bondCopy(locale, fairyName);
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [open, setOpen] = useState<Entry | null>(null);
  const load = () => {
    setError(false);
    loadKeepsakeBook().then(setBook).catch(() => setError(true));
  };
  useEffect(() => { if (visible) load(); else { setOpen(null); setFilter('ALL'); } }, [visible]);
  // Today's new keepsakes come first, so they are the first thing seen.
  const shown = (book?.keepsakes.filter(keepsake => filter === 'ALL' || keepsake.rarity === filter) ?? [])
    .sort((a, b) => Number(newIds.includes(b.id) && b.owned) - Number(newIds.includes(a.id) && a.owned));
  return <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible={visible} animationType="fade" onRequestClose={() => (open ? setOpen(null) : onClose())} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>{copy.book}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <View style={styles.filters}>
          {(['ALL', 'COMMON', 'RARE', 'MONTHLY'] as Filter[]).map(key => <Pressable key={key} accessibilityRole="button"
            accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)}
            style={[styles.chip, filter === key && styles.chipOn]}>
            <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>{copy.filters[key]}</Text>
          </Pressable>)}
        </View>
        {!book && !error ? <ActivityIndicator color={BOND.gold} style={styles.status} accessibilityLabel={copy.loading} /> : null}
        {error ? <Pressable accessibilityRole="button" onPress={load} style={styles.status}><Text style={styles.muted}>{copy.error}</Text></Pressable> : null}
        <ScrollView contentContainerStyle={styles.grid}>
          {shown.map(keepsake => {
            const art = keepsakeArt(keepsake.id);
            return <Pressable key={keepsake.id} accessibilityRole="button" disabled={!keepsake.owned}
              accessibilityLabel={keepsake.owned ? `${keepsake.name}${newIds.includes(keepsake.id) ? `, ${copy.isNew}` : ''}` : `${keepsake.name}, ${copy.locked}`}
              onPress={() => setOpen(keepsake)} style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
              {art ? <Image source={art} resizeMode="contain" accessibilityIgnoresInvertColors
                style={[styles.cellArt, !keepsake.owned && styles.silhouette]} /> : null}
              {keepsake.count > 1 ? <Text style={styles.count}>{copy.times(keepsake.count)}</Text> : null}
              {keepsake.owned && newIds.includes(keepsake.id) ? <Text testID={`keepsake-new-${keepsake.id}`} style={styles.isNew}>{copy.isNew}</Text> : null}
            </Pressable>;
          })}
        </ScrollView>
        {book ? <Text style={styles.footer}>{copy.collected(book.owned, book.total)}</Text> : null}
      </View>
      {open ? <View style={styles.detailBackdrop}>
        <View accessibilityViewIsModal style={styles.detail}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={() => setOpen(null)} style={[styles.close, styles.detailClose]}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          {keepsakeArt(open.id) ? <Image source={keepsakeArt(open.id)!} style={styles.detailArt} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
          <Text style={styles.detailName}>{open.name}</Text>
          <Text style={styles.detailRarity}>{copy.rarity[open.rarity]}</Text>
          {open.note ? <Text style={styles.detailNote}>{open.note}</Text> : null}
          {open.firstLocalDate ? <Text style={styles.muted}>{copy.receivedOn} · {open.firstLocalDate}</Text> : null}
        </View>
      </View> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 14, backgroundColor: '#0B1F1B99' },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '90%', padding: 16, borderRadius: 22, backgroundColor: BOND.paper, borderWidth: 1.5, borderColor: BOND.edge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { flex: 1, textAlign: 'center', fontFamily: 'serif', fontSize: 20, color: BOND.ink, marginLeft: 40 },
  close: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFE6CF' },
  closeText: { fontSize: 26, lineHeight: 30, color: BOND.ink },
  filters: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: BOND.rule },
  chipOn: { backgroundColor: BOND.green, borderColor: BOND.green },
  chipText: { fontSize: 13, color: BOND.ink },
  chipTextOn: { color: '#F3EBD3' },
  status: { padding: 16, alignItems: 'center' },
  muted: { fontSize: 12, color: BOND.muted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingBottom: 6 },
  cell: { width: '22.5%', aspectRatio: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: BOND.card, borderWidth: 1, borderColor: BOND.rule },
  pressed: { opacity: 0.75 },
  cellArt: { width: '88%', height: '88%' },
  silhouette: { opacity: 0.22 }, // faded, so the shape still hints at what is waiting
  count: { position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: BOND.muted },
  isNew: { position: 'absolute', top: 4, left: 4, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, fontSize: 10, fontWeight: '600', color: '#FFFFFF', backgroundColor: BOND.purple },
  footer: { marginTop: 8, textAlign: 'center', fontFamily: 'serif', fontSize: 13, color: BOND.ink },
  detailBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#0B1F1B88' },
  detail: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 8, padding: 20, borderRadius: 20, backgroundColor: BOND.paper, borderWidth: 1.5, borderColor: BOND.edge },
  detailClose: { position: 'absolute', top: 10, right: 10 },
  detailArt: { width: 180, height: 180 },
  detailName: { fontFamily: 'serif', fontSize: 20, color: BOND.ink },
  detailRarity: { fontSize: 12, color: '#fff', backgroundColor: BOND.purple, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
  detailNote: { fontFamily: 'serif', fontSize: 15, lineHeight: 24, color: BOND.ink, textAlign: 'center', marginVertical: 4 },
});
