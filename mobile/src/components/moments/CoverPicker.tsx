import { usePanelTheme } from '../features/PanelTheme';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { MOMENT_COVER_IDS, MOMENT_COVERS } from './momentCovers';

// Choose the cover at the top of her Moments. The first tile restores her own photo (null).
export function CoverPicker({ visible, title, selected, busy = false, error = '', closeLabel, defaultCover, defaultLabel, optionLabel, onSelect, onClose }: {
  visible: boolean; title: string; selected: string | null; busy?: boolean; error?: string; closeLabel: string;
  defaultCover: ImageSourcePropType; defaultLabel: string; optionLabel: (n: number) => string;
  onSelect: (cover: string | null) => void; onClose: () => void;
}) {
  const tiles = [{ id: null as string | null, source: defaultCover, label: defaultLabel },
    ...MOMENT_COVER_IDS.map((id, i) => ({ id, source: MOMENT_COVERS[id] as ImageSourcePropType, label: optionLabel(i + 1) }))];
  const { theme } = usePanelTheme();
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={styles.backdrop}>
      <Pressable accessibilityViewIsModal onPress={() => undefined} style={[styles.sheet, { backgroundColor: theme.surface }]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={[styles.close, { backgroundColor: theme.input }]}>
            <Text style={[styles.closeText, { color: theme.text }]}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {tiles.map(tile => {
            const chosen = tile.id === selected;
            return <Pressable key={tile.id ?? 'default'} accessibilityRole="button" accessibilityLabel={tile.label}
              accessibilityState={{ selected: chosen, disabled: busy }} disabled={busy} onPress={() => onSelect(tile.id)}
              style={({ pressed }) => [styles.tile, chosen && styles.chosen, pressed && styles.pressed]}>
              <Image source={tile.source} style={styles.art} resizeMode="cover" accessibilityIgnoresInvertColors />
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
  sheet: { width: '100%', maxWidth: 460, maxHeight: '86%', borderRadius: 22, padding: 16, backgroundColor: '#FBF7EE' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { flex: 1, fontFamily: 'serif', fontSize: 18, color: '#3E3355' },
  close: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEE7F6' },
  closeText: { fontSize: 26, lineHeight: 30, color: '#3E3355' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 4 },
  tile: { width: '48%', aspectRatio: 2.4, borderRadius: 12, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent' },
  chosen: { borderColor: '#C9A44C' },
  pressed: { opacity: 0.7 },
  art: { width: '100%', height: '100%' },
  error: { marginTop: 10, textAlign: 'center', color: '#A23B4A' },
});
