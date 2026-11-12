import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppLocale } from '../../services/locale';
import { FONT_BODY, FONT_TITLE } from './ExpandedLetter';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';

export const DELETE_LETTER_COPY = {
  en: { title: 'Delete this letter?', body: 'This letter will be permanently removed from your mailbox. This action cannot be undone.',
    cancel: 'Cancel', delete: 'Delete', deleting: 'Deleting…', failed: 'This letter could not be deleted. Please try again.' },
  'zh-Hans': { title: '删除这封信？', body: '这封信会从你的信箱里永久移除，此操作无法撤销。',
    cancel: '取消', delete: '删除', deleting: '正在删除…', failed: '没能删除这封信，请再试一次。' },
};

// A parchment note in the Mailbox's own paper and ink, asking before a read letter is removed.
export function DeleteLetterDialog({ visible, busy, error, onCancel, onDelete }: {
  visible: boolean; busy: boolean; error?: string; onCancel: () => void; onDelete: () => void;
}) {
  const copy = DELETE_LETTER_COPY[useAppLocale()];
  return <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent animationType="fade" visible={visible} onRequestClose={busy ? undefined : onCancel}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel={copy.cancel} style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} />
      <View accessibilityViewIsModal testID="delete-letter-dialog" style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable testID="delete-letter-cancel" accessibilityRole="button" disabled={busy} onPress={onCancel}
            style={({ pressed }) => [styles.button, pressed && styles.pressed, busy && styles.disabled]}>
            <Text style={styles.buttonText}>{copy.cancel}</Text>
          </Pressable>
          <Pressable testID="delete-letter-confirm" accessibilityRole="button" accessibilityState={{ busy }} disabled={busy} onPress={onDelete}
            style={({ pressed }) => [styles.button, styles.danger, pressed && styles.pressed, busy && styles.disabled]}>
            <Text style={[styles.buttonText, styles.dangerText]}>{busy ? copy.deleting : copy.delete}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(14, 22, 18, 0.62)' },
  card: { width: '100%', maxWidth: 340, gap: 10, paddingVertical: 20, paddingHorizontal: 22, borderRadius: 10, borderWidth: 1,
    backgroundColor: '#F7F0DF', borderColor: '#D9C9A6',
    ...Platform.select({ web: { boxShadow: '0 10px 28px rgba(20, 14, 8, 0.38)' } }) },
  title: { fontFamily: FONT_TITLE, fontSize: 19, fontWeight: '700', color: '#4B3A22' },
  body: { fontFamily: FONT_BODY, fontSize: 14.5, lineHeight: 21, color: '#5E4E36' },
  error: { fontFamily: FONT_BODY, fontSize: 13.5, color: '#9A3B2E' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  button: { minHeight: 36, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 18, borderWidth: 1, justifyContent: 'center',
    backgroundColor: '#EFE5CC', borderColor: '#CDBB93' },
  danger: { backgroundColor: '#8E4638', borderColor: '#733629' },
  buttonText: { fontFamily: FONT_TITLE, fontSize: 13.5, fontWeight: '700', color: '#5A4526', letterSpacing: 0.3 },
  dangerText: { color: '#FFF4E4' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.6 },
});
