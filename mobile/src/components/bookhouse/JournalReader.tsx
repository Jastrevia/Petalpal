import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatLocalDate, type JournalCheckIn } from '../../services/bookhouse';
import { LETTER_PAPER_BACKGROUND } from '../mailbox/paperTextures';
import { BookhouseArt } from './BookhouseArt';
import { JournalCover } from './JournalCover';
import { Icon, ICONS, palette, serif } from './TreehouseArt';

const paperTexture = Platform.select({ web: { backgroundImage: LETTER_PAPER_BACKGROUND } as object, default: {} });

// One leaf of the open journal: teal cloth cover at the outer edge, parchment page, shading toward the spine.
function BookPage({ side, width, height, night, children, testID }: { side: 'left' | 'right'; width: number; height: number; night: boolean; children: ReactNode; testID?: string }) {
  const outer = side === 'left' ? { left: 0 } : { right: 0 };
  const spine = side === 'left' ? { right: 0 } : { left: 0 };
  return <View testID={testID} style={{ width, height, paddingVertical: 8, [side === 'left' ? 'paddingLeft' : 'paddingRight']: 8 }}>
    <View pointerEvents="none" style={[styles.cover, outer, side === 'left' ? styles.coverLeft : styles.coverRight]} />
    <View style={[styles.page, side === 'left' ? styles.pageLeft : styles.pageRight, paperTexture]}>
      {[0, 1, 2, 3, 4, 5].map(i => <View key={i} pointerEvents="none" style={[styles.gutter, spine, { width: 26 - i * 4, opacity: .05 + i * .025 }]} />)}
      <View pointerEvents="none" style={[styles.gilt, side === 'left' ? { left: 10, right: 6 } : { left: 6, right: 10 }]} />
      {night && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#976635', opacity: .14 }]} />}
      {children}
    </View>
  </View>;
}

export function JournalReader({ entry, userId, width, height, night, reducedMotion }: {
  entry: JournalCheckIn; userId: string; width: number; height: number; night: boolean; reducedMotion: boolean;
}) {
  const spread = width >= 680;
  const pageWidth = spread ? Math.min(width / 2, 460) : width;
  const controls = spread ? 0 : 48;
  const pageHeight = height - controls;
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const coverSize = Math.min(230, pageWidth * .62, pageHeight * .42);
  const date = formatLocalDate(entry.localDate);
  const turn = (to: number) => { setPage(to); pager.current?.scrollTo({ x: to * pageWidth, animated: !reducedMotion }); };
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  const left = <BookPage key="left" side="left" width={pageWidth} height={pageHeight} night={night} testID="journal-cover-page">
    <ScrollView contentContainerStyle={styles.coverContent} showsVerticalScrollIndicator={false}>
      {entry.journal && <JournalCover key={entry.journal.id} userId={userId} journalId={entry.journal.id} size={coverSize} />}
      <View style={styles.rule} />
      <Text style={styles.keepsake}>Small moments{'\n'}still matter. ♡</Text>
    </ScrollView>
  </BookPage>;
  const right = <BookPage key="right" side="right" width={pageWidth} height={pageHeight} night={night} testID="journal-text-page">
    <View style={styles.textPage}>
      <View style={styles.pageHeader}><Text style={styles.caption}>Private journal</Text>{spread && <Text style={styles.caption}>{date}</Text>}</View>
      <ScrollView testID="journal-text-scroll" nestedScrollEnabled contentContainerStyle={{ paddingBottom: 18 }}>
        <Text selectable style={styles.body}>{entry.journal?.content}</Text>
        <Text accessible={false} style={styles.end}>❦</Text>
      </ScrollView>
    </View>
  </BookPage>;
  if (spread) return <View style={{ flexDirection: 'row', alignSelf: 'center' }}>{left}{right}</View>;
  return <View style={{ width, height }}>
    <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={settle} onScroll={Platform.OS === 'web' ? settle : undefined}
      scrollEventThrottle={100} style={{ width, height: pageHeight, flexGrow: 0 }} accessibilityLabel="Journal pages">{left}{right}</ScrollView>
    <View style={styles.turns}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous journal page" disabled={page === 0} onPress={() => turn(0)} style={[styles.turn, page === 0 && { opacity: .35 }]}><Text style={styles.arrow}>‹</Text></Pressable>
      <View accessible accessibilityLabel={`Page ${page + 1} of 2`} style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1].map(i => <View key={i} style={[styles.dot, page === i && styles.dotActive]} />)}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Next journal page" disabled={page === 1} onPress={() => turn(1)} style={[styles.turn, page === 1 && { opacity: .35 }]}><Text style={styles.arrow}>›</Text></Pressable>
    </View>
  </View>;
}

type SheetState = 'menu' | 'confirm' | 'deleting';
// Styled action sheet for the reading view. Delete always passes through a confirmation step.
export function JournalActions({ visible, locked, date, onClose, onEdit, onDelete, reducedMotion }: {
  visible: boolean; locked: boolean; date: string; onClose: () => void; onEdit: () => void; onDelete: () => Promise<void>; reducedMotion: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SheetState>('menu');
  const [error, setError] = useState('');
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    setState('menu'); setError('');
    rise.setValue(reducedMotion ? 1 : 0);
    Animated.timing(rise, { toValue: 1, duration: reducedMotion ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, rise, reducedMotion]);
  const close = () => { if (state !== 'deleting') onClose(); };
  const remove = async () => {
    setState('deleting'); setError('');
    try { await onDelete(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete this journal. Please try again.'); setState('confirm'); }
  };
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close journal actions" onPress={close} style={styles.scrim} />
    <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 14, opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
      {state === 'menu' ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit this journal" accessibilityState={{ disabled: locked }} disabled={locked} onPress={onEdit}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed, locked && styles.actionDisabled]}>
          <Icon source={ICONS.pencil} size={22} /><Text style={styles.actionText}>Edit this journal</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete this journal" accessibilityState={{ disabled: locked }} disabled={locked} onPress={() => setState('confirm')}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed, locked && styles.actionDisabled]}>
          <Icon source={ICONS.trash} size={22} /><Text style={styles.actionText}>Delete this journal</Text>
        </Pressable>
        {locked && <Text accessibilityLiveRegion="polite" style={styles.lockedNote}>This journal grew a flower through Daily Grow, so it stays as written to keep your Flower History whole.</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={close} style={({ pressed }) => [styles.cancel, pressed && styles.actionPressed]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </> : <View accessibilityViewIsModal style={{ gap: 12 }}>
        <BookhouseArt index={14} width={56} height={60} />
        <Text accessibilityRole="header" style={styles.confirmTitle}>Delete this journal?</Text>
        <Text style={styles.confirmBody}>Your {date} journal will be removed from the Treehouse. This can't be undone.</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Keep journal" disabled={state === 'deleting'} onPress={() => setState('menu')}
            style={({ pressed }) => [styles.cancel, { flex: 1, marginTop: 0 }, pressed && styles.actionPressed]}><Text style={styles.cancelText}>Keep it</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Confirm delete journal" disabled={state === 'deleting'} onPress={() => void remove()}
            style={({ pressed }) => [styles.danger, pressed && { opacity: .85 }]}>
            {state === 'deleting' ? <ActivityIndicator color="#FFF3E6" /> : <Text style={styles.dangerText}>Delete</Text>}
          </Pressable>
        </View>
      </View>}
    </Animated.View>
  </Modal>;
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, bottom: 0, width: 40, backgroundColor: palette.teal, borderWidth: 1, borderColor: '#173A36' },
  coverLeft: { borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  coverRight: { borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  page: { flex: 1, backgroundColor: '#F4E6C9', overflow: 'hidden', borderColor: '#D5BC8E', borderWidth: 1,
    shadowColor: '#1B0E06', shadowOpacity: .45, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  pageLeft: { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  pageRight: { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  gutter: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#7A5A30' },
  gilt: { position: 'absolute', top: 8, bottom: 8, borderWidth: 1, borderColor: '#D8BE88', borderRadius: 6, opacity: .7 },
  coverContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24, paddingVertical: 26 },
  rule: { width: '78%', height: 1, backgroundColor: '#BEA27A' },
  keepsake: { fontFamily: serif, fontStyle: 'italic', fontSize: 23, lineHeight: 32, color: '#8E6B47', textAlign: 'center' },
  textPage: { flex: 1, paddingLeft: 28, paddingRight: 26, paddingTop: 26 },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, borderBottomWidth: 1, borderColor: '#CBB58E', paddingBottom: 10, marginBottom: 16 },
  caption: { fontFamily: serif, fontSize: 14, color: '#6A563B' },
  body: { fontFamily: serif, fontSize: 18, lineHeight: 29, color: '#4F412D' },
  end: { fontFamily: serif, fontSize: 18, color: '#B49770', textAlign: 'center', marginTop: 18 },
  turns: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  turn: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#F7EBD2E0', borderWidth: 1, borderColor: palette.gold },
  arrow: { fontFamily: serif, fontSize: 26, lineHeight: 30, color: '#5C4630' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F2DFB8', opacity: .55 },
  dotActive: { opacity: 1, backgroundColor: '#FFF1D2', transform: [{ scale: 1.25 }] },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1A1009B3' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, alignSelf: 'center', width: '100%', maxWidth: 520, paddingHorizontal: 16, paddingTop: 16, gap: 10,
    backgroundColor: '#F4E7CB', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1.5, borderBottomWidth: 0, borderColor: palette.gold },
  action: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, borderRadius: 14,
    backgroundColor: '#FBF4E4', borderWidth: 1, borderColor: '#E1CBA0' },
  actionPressed: { backgroundColor: '#FFF9EC' },
  actionDisabled: { opacity: .45 },
  actionText: { fontFamily: serif, fontSize: 17, color: '#3F3221' },
  lockedNote: { fontFamily: serif, fontSize: 14, lineHeight: 20, color: '#6E5A40', paddingHorizontal: 6 },
  cancel: { minHeight: 54, marginTop: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E8D3AB', borderWidth: 1, borderColor: '#CDB07C' },
  cancelText: { fontFamily: serif, fontSize: 17, color: '#4A3A27' },
  confirmTitle: { fontFamily: serif, fontStyle: 'italic', fontSize: 23, color: '#4E4330' },
  confirmBody: { fontFamily: serif, fontSize: 16, lineHeight: 23, color: '#5E4B33' },
  error: { fontFamily: serif, fontSize: 14, color: '#8A3B2A' },
  danger: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#8E4436', borderWidth: 1, borderColor: '#6E2F24' },
  dangerText: { fontFamily: serif, fontSize: 17, color: '#FFF3E6' },
});
