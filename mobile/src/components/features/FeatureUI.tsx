import { usePanelTheme } from './PanelTheme';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeatureStatus } from '../../services/featureCatalog';

export const FEATURE_COLORS = {
  primary: '#5AA4AB', secondary: '#A67EB7', ink: '#17262A', muted: '#64777B',
  paper: '#F7FBFB', line: '#5AA4AB40', tealWash: '#5AA4AB18', purpleWash: '#A67EB71C',
};

export function StatusChip({ status }: { status: FeatureStatus }) {
  const { theme } = usePanelTheme();
  return <View style={[ui.chip, status === 'REAL' ? ui.tealWash : ui.purpleWash]}>
    <View style={[ui.dot, { backgroundColor: status === 'REAL' ? FEATURE_COLORS.primary : FEATURE_COLORS.secondary }]} />
    <Text style={[ui.chipText, { color: theme.text }]}>{status}</Text>
  </View>;
}

export function FeatureActionButton({ title, onPress, disabled = false, secondary = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={6}
    style={({ pressed }) => [ui.button, secondary && ui.secondaryButton, disabled && ui.disabled, pressed && ui.pressed]}>
    <Text style={ui.buttonText}>{title}</Text>
  </Pressable>;
}

// A quiet list entry (policies, support): text and a chevron, not a big button.
// `expanded` makes it a row that unfolds its content in place (chevron turns down).
export function FeatureLinkRow({ title, onPress, first = false, expanded, note, danger = false }: {
  title: string; onPress: () => void; first?: boolean; expanded?: boolean; note?: string; danger?: boolean;
}) {
  const { theme } = usePanelTheme();
  return <Pressable accessibilityRole={expanded === undefined ? 'link' : 'button'} accessibilityLabel={title}
    accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress}
    style={({ pressed }) => [ui.linkRow, { borderColor: theme.border }, first && { borderTopWidth: 0 }, pressed && { opacity: .6 }]}>
    <Text style={[ui.linkText, { color: danger ? '#E0978A' : theme.text, flex: 1 }]}>{title}</Text>
    {note ? <Text style={[ui.caption, { color: theme.muted, marginRight: 8 }]}>{note}</Text> : null}
    <Text style={[ui.linkText, { color: theme.muted }]}>{expanded ? '⌄' : '›'}</Text>
  </Pressable>;
}

export function FeatureSection({ title, children }: { title?: string; children: ReactNode }) {
  const { theme } = usePanelTheme();
  return <View style={[ui.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>{title ? <Text style={[ui.sectionTitle, { color: theme.text }]}>{title}</Text> : null}{children}</View>;
}

export const ui = StyleSheet.create({
  body: { gap: 18 },
  text: { fontSize: 14, lineHeight: 21, color: FEATURE_COLORS.muted },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: FEATURE_COLORS.ink },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: FEATURE_COLORS.ink },
  caption: { fontSize: 12, lineHeight: 18, color: FEATURE_COLORS.muted },
  section: { borderRadius: 20, padding: 16, borderWidth: 1, borderColor: FEATURE_COLORS.line, backgroundColor: '#FFFFFF', gap: 12 },
  chip: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  chipText: { fontSize: 10, fontWeight: '700', letterSpacing: .4, color: FEATURE_COLORS.ink },
  dot: { width: 5, height: 5, borderRadius: 3 },
  tealWash: { backgroundColor: FEATURE_COLORS.tealWash },
  purpleWash: { backgroundColor: FEATURE_COLORS.purpleWash },
  // Just big enough to tap (hitSlop adds the rest): sized to its words, not the panel.
  button: { minHeight: 36, alignSelf: 'flex-start', justifyContent: 'center', alignItems: 'center', borderRadius: 18, paddingHorizontal: 16,
    paddingVertical: 7, backgroundColor: FEATURE_COLORS.primary },
  secondaryButton: { backgroundColor: FEATURE_COLORS.secondary },
  buttonText: { fontSize: 13, fontWeight: '700', color: FEATURE_COLORS.ink, textAlign: 'center' },
  linkRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 2 },
  linkText: { fontSize: 15 },
  disabled: { opacity: .45 },
  pressed: { opacity: .8, transform: [{ scale: .98 }] },
  notice: { borderRadius: 16, padding: 13, gap: 8, backgroundColor: FEATURE_COLORS.purpleWash },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
