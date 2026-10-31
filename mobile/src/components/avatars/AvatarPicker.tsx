import { usePanelTheme } from '../features/PanelTheme';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { AVATAR_ART, AVATAR_IDS } from './avatarArt';

// Choose a portrait from the avatar library. `defaultOption` adds a first tile that
// clears the choice (onSelect(null)), such as the Fairy's own Moments photo.
export function AvatarPicker({ visible, title, selected, busy = false, error = '', closeLabel, optionLabel, defaultOption, onSelect, onClose }: {
  visible: boolean; title: string; selected?: string | null; busy?: boolean; error?: string; closeLabel: string;
  optionLabel: (number: number) => string;
  defaultOption?: { source: ImageSourcePropType; label: string };
  onSelect: (avatar: string | null) => void; onClose: () => void;
}) {
  const tiles: { id: string | null; source: ImageSourcePropType; label: string }[] = [
    ...(defaultOption ? [{ id: null, ...defaultOption }] : []),
    ...AVATAR_IDS.map((id, index) => ({ id, source: AVATAR_ART[id], label: optionLabel(index + 1) })),
  ];
  const current = selected ?? null;
  const { theme } = usePanelTheme();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={styles.backdrop}>
      <Pressable accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => undefined}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={[styles.close, { backgroundColor: theme.input }]}>
            <Text style={[styles.closeText, { color: theme.text }]}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {tiles.map(tile => {
            const chosen = tile.id === current;
            return <Pressable key={tile.id ?? 'default'} accessibilityRole="button" accessibilityLabel={tile.label}
              accessibilityState={{ selected: chosen, disabled: busy }} disabled={busy} onPress={() => onSelect(tile.id)}
              style={({ pressed }) => [styles.tile, chosen && styles.chosen, pressed && styles.pressed]}>
              <Image source={tile.source} style={styles.art} accessibilityIgnoresInvertColors />
            </Pressable>;
          })}
        </ScrollView>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#1A142899' },
  sheet: { width: '100%', maxWidth: 420, maxHeight: '86%', borderRadius: 22, padding: 16, backgroundColor: '#FBF7EE' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#3E3355' },
  close: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEE7F6' },
  closeText: { fontSize: 26, lineHeight: 30, color: '#3E3355' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, paddingBottom: 4 },
  tile: { width: 84, height: 84, borderRadius: 42, padding: 3, borderWidth: 3, borderColor: 'transparent' },
  chosen: { borderColor: '#C9A44C' },
  pressed: { opacity: 0.7 },
  art: { width: '100%', height: '100%', borderRadius: 39 },
  error: { marginTop: 10, textAlign: 'center', color: '#A23B4A' },
});
