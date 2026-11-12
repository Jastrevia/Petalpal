import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookhouseArt } from './BookhouseArt';
import { Icon, ICONS, palette, serif } from './TreehouseArt';
import { treehouseZh, tt } from '../../services/treehouseCopy';
import { PORTRAIT_MODAL_ORIENTATIONS } from '../../constants/orientation';

// Styled action sheet for a journal page. Delete always passes through a confirmation step.
type SheetState = 'menu' | 'confirm' | 'deleting';
// Styled action sheet for the reading view. Delete always passes through a confirmation step.
export function JournalActions({ visible, locked, date, onClose, onEdit, onDelete, reducedMotion }: {
  visible: boolean; locked: boolean; date: string; onClose: () => void; onEdit?: () => void; onDelete: () => Promise<void>; reducedMotion: boolean;
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
    catch (e) { setError(e instanceof Error ? e.message : tt('Unable to delete this journal. Please try again.')); setState('confirm'); }
  };
  return <Modal supportedOrientations={PORTRAIT_MODAL_ORIENTATIONS} transparent visible={visible} animationType="fade" onRequestClose={close}>
    <Pressable accessibilityRole="button" accessibilityLabel={tt('Close journal actions')} onPress={close} style={styles.scrim} />
    <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 14, opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }]}>
      {state === 'menu' ? <>
        {onEdit && <Pressable accessibilityRole="button" accessibilityLabel={tt('Edit this journal')} accessibilityState={{ disabled: locked }} disabled={locked} onPress={onEdit}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed, locked && styles.actionDisabled]}>
          <Icon source={ICONS.pencil} size={22} /><Text style={styles.actionText}>{tt('Edit this journal')}</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={tt('Delete this journal')} accessibilityState={{ disabled: locked }} disabled={locked} onPress={() => setState('confirm')}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed, locked && styles.actionDisabled]}>
          <Icon source={ICONS.trash} size={22} /><Text style={styles.actionText}>{tt('Delete this journal')}</Text>
        </Pressable>
        {locked && <Text accessibilityLiveRegion="polite" style={styles.lockedNote}>{tt('This journal grew a flower through Daily Grow, so it stays as written to keep your Flower History whole.')}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={tt('Cancel')} onPress={close} style={({ pressed }) => [styles.cancel, pressed && styles.actionPressed]}>
          <Text style={styles.cancelText}>{tt('Cancel')}</Text>
        </Pressable>
      </> : <View accessibilityViewIsModal style={{ gap: 12 }}>
        <BookhouseArt index={14} width={56} height={60} />
        <Text accessibilityRole="header" style={styles.confirmTitle}>{tt('Delete this journal?')}</Text>
        <Text style={styles.confirmBody}>{treehouseZh() ? `${date}的这篇日记会从树屋里删除，删除后无法恢复。` : `Your ${date} journal will be removed from the Treehouse. This can't be undone.`}</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={tt('Keep journal')} disabled={state === 'deleting'} onPress={() => setState('menu')}
            style={({ pressed }) => [styles.cancel, { flex: 1, marginTop: 0 }, pressed && styles.actionPressed]}><Text style={styles.cancelText}>{tt('Keep it')}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={tt('Confirm delete journal')} disabled={state === 'deleting'} onPress={() => void remove()}
            style={({ pressed }) => [styles.danger, pressed && { opacity: .85 }]}>
            {state === 'deleting' ? <ActivityIndicator color="#FFF3E6" /> : <Text style={styles.dangerText}>{tt('Delete')}</Text>}
          </Pressable>
        </View>
      </View>}
    </Animated.View>
  </Modal>;
}

const styles = StyleSheet.create({
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
