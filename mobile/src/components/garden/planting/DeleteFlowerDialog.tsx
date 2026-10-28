import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppLocale } from '../../../services/locale';
import { FeatureActionButton, ui } from '../../features/FeatureUI';
import { usePanelTheme } from '../../features/PanelTheme';

/** Typed in English in both languages. */
export const DELETE_FLOWER_PHRASE = 'DELETE';
// Same pattern as Delete Account (DeleteAccountSettings): the warning is said plainly first, and
// the final button only works once the owner has typed the phrase exactly.
export const DELETE_FLOWER_COPY = {
  en: { title: 'Delete this flower?',
    warning: 'This flower will be permanently deleted. It cannot be undone or recovered.',
    quota: 'Deleting does not give back a planting. Today’s planting count stays the same, so you can’t plant an extra flower today.',
    what: 'Its spot in your Garden, its support and its messages go with it.',
    typeLabel: `To confirm, type ${DELETE_FLOWER_PHRASE} below.`,
    keep: 'Keep it', delete: 'Permanently delete flower', deleting: 'Deleting…' },
  'zh-Hans': { title: '删除这朵花？',
    warning: '这朵花会被永久删除，无法撤销，也无法恢复。',
    quota: '删除不会退还种花次数。今天已经用掉的次数不会变，删除后也不能因此多种一朵。',
    what: '它在花园里的位置、收到的支持和留言也会一起删除。',
    typeLabel: `请在下面输入英文「${DELETE_FLOWER_PHRASE}」确认。`,
    keep: '保留', delete: '永久删除这朵花', deleting: '正在删除…' },
};

export function DeleteFlowerDialog({ visible, flowerName, busy, error, onCancel, onDelete }: {
  visible: boolean; flowerName?: string; busy: boolean; error?: string;
  onCancel: () => void; onDelete: () => void;
}) {
  const copy = DELETE_FLOWER_COPY[useAppLocale()];
  const { theme } = usePanelTheme();
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!visible) setTyped(''); }, [visible]);
  const confirmed = typed.trim() === DELETE_FLOWER_PHRASE;
  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel={copy.keep} style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} />
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text accessibilityRole="header" style={[ui.title, { color: theme.text }]}>{copy.title}</Text>
        {flowerName ? <Text style={[ui.caption, { color: theme.muted }]}>{flowerName}</Text> : null}
        <Text accessibilityRole="alert" style={[ui.text, { color: theme.text, fontWeight: '700' }]}>{copy.warning}</Text>
        <Text style={[ui.text, { color: theme.text, fontWeight: '700' }]}>{copy.quota}</Text>
        <Text style={[ui.text, { color: theme.muted }]}>{copy.what}</Text>
        <Text style={[ui.text, { color: theme.text }]}>{copy.typeLabel}</Text>
        <TextInput accessibilityLabel={copy.typeLabel} value={typed} onChangeText={setTyped} editable={!busy}
          autoCapitalize="characters" autoCorrect={false} placeholder={DELETE_FLOWER_PHRASE} placeholderTextColor={theme.muted}
          style={[styles.input, { borderColor: confirmed ? theme.gold : theme.border, color: theme.text }]} />
        <FeatureActionButton danger title={busy ? copy.deleting : copy.delete} disabled={busy || !confirmed}
          onPress={() => { if (confirmed) onDelete(); }} />
        <FeatureActionButton secondary title={copy.keep} disabled={busy} onPress={onCancel} />
        {error ? <Text accessibilityRole="alert" style={[ui.text, { color: '#E0978A' }]}>{error}</Text> : null}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(8, 20, 18, 0.6)' },
  card: { width: '100%', maxWidth: 420, gap: 10, padding: 20, borderRadius: 18, borderWidth: 1 },
  input: { minHeight: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
});
