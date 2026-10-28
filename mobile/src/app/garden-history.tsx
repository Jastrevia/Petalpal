import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../services/auth';
import { useAppLocale } from '../services/locale';
import { GardenVisitLog } from '../components/features/GardenVisitLog';
import { usePanelTheme } from '../components/features/PanelTheme';

const COPY = {
  en: { title: 'Garden history', subtitle: 'Who came by your Garden', back: 'Close' },
  'zh-Hans': { title: '花园记录', subtitle: '谁来过你的花园', back: '关闭' },
};

// Garden history: the visit log on its own page. The same log is the Visitors tab in Friends,
// which is where the app links to it now.
export default function GardenHistoryScreen() {
  const { session } = useAuth();
  const { theme } = usePanelTheme();
  const insets = useSafeAreaInsets();
  const locale = useAppLocale(), copy = COPY[locale];
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => { setRevision(value => value + 1); }, []));

  return <View style={{ flex: 1, backgroundColor: theme.background }}><ScrollView style={{ backgroundColor: theme.background }}
    contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
    <Text style={[styles.subtitle, { color: theme.muted }]}>{copy.subtitle}</Text>
    <GardenVisitLog ownerId={session?.user.id} locale={locale} theme={theme} revision={revision} />
  </ScrollView>
  {/* Fixed in the corner whatever is scrolled. */}
  <Pressable accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => router.dismissTo('/')} hitSlop={6}
    style={({ pressed }) => [styles.close, { top: insets.top + 10, right: insets.right + 12, borderColor: theme.gold, backgroundColor: theme.surface }, pressed && styles.pressed]}>
    <Text style={[styles.closeText, { color: theme.text }]}>✕</Text>
  </Pressable></View>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, gap: 12 },
  close: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20 },
  pressed: { opacity: 0.8 },
  title: { fontFamily: 'serif', fontSize: 30, fontWeight: '600', marginTop: 6 },
  subtitle: { fontFamily: 'serif', fontSize: 15, marginTop: -6 },
});
