import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../services/auth';
import { loadGardenVisits, type GardenVisit } from '../services/garden';
import { subscribeUserRealtime } from '../services/userRealtime';
import { UserAvatar } from '../components/avatars/UserAvatar';
import { usePanelTheme } from '../components/features/PanelTheme';

const COPY = {
  en: {
    title: 'Garden history', subtitle: 'Who came by your Garden', back: 'Back to Garden', empty: 'No visitors yet. When friends drop by, you’ll see it here.',
    error: 'Your Garden history could not load. Please try again.', retry: 'Try again', today: 'Today', yesterday: 'Yesterday', friend: 'A friend',
    action: (action: string) => ({ 'started visiting your garden': 'came to visit 🌸', 'left your garden': 'left your Garden',
      support: 'sent a flower some support 💗', message: 'left a message on a flower 💌' } as Record<string, string>)[action] ?? action,
  },
  'zh-Hans': {
    title: '花园记录', subtitle: '谁来过你的花园', back: '回到花园', empty: '还没有人来过。朋友来逛时，会记录在这里。',
    error: '花园记录加载失败，请再试一次。', retry: '再试一次', today: '今天', yesterday: '昨天', friend: '一位朋友',
    action: (action: string) => ({ 'started visiting your garden': '来逛你的花园 🌸', 'left your garden': '离开了你的花园',
      support: '给你的花送来了支持 💗', message: '在你的花上留了言 💌' } as Record<string, string>)[action] ?? action,
  },
};

// Garden history: a live log of visits to the owner's Garden (the server keeps the latest 30).
export default function GardenHistoryScreen() {
  const { session, experience } = useAuth();
  const { theme } = usePanelTheme();
  const insets = useSafeAreaInsets();
  const zh = experience?.user.preferredLocale === 'zh-Hans';
  const copy = COPY[zh ? 'zh-Hans' : 'en'];
  const ownerId = session?.user.id;
  const [visits, setVisits] = useState<GardenVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    if (ownerId) loadGardenVisits(ownerId)
      .then(items => { if (active) setVisits(items); })
      .catch(() => { if (active) setError(copy.error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ownerId, revision, copy.error]));
  // New visits appear while the page is open.
  useEffect(() => subscribeUserRealtime({ visit: (_record, gardenOwnerId) => {
    if (gardenOwnerId === ownerId) setRevision(value => value + 1);
  } }), [ownerId]);

  const day = (iso: string) => {
    const at = new Date(iso), today = new Date();
    const key = (d: Date) => d.toDateString();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (key(at) === key(today)) return copy.today;
    if (key(at) === key(yesterday)) return copy.yesterday;
    return at.toLocaleDateString(zh ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', weekday: 'short' });
  };
  const groups: { day: string; items: GardenVisit[] }[] = [];
  for (const visit of visits) {
    const label = day(visit.createdAt);
    if (groups.at(-1)?.day === label) groups.at(-1)!.items.push(visit);
    else groups.push({ day: label, items: [visit] });
  }

  return <ScrollView style={{ backgroundColor: theme.background }}
    contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}>
    <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')}
      style={({ pressed }) => [styles.back, { borderColor: theme.gold }, pressed && styles.pressed]}>
      <Text style={[styles.backText, { color: theme.text }]}>‹ {copy.back}</Text>
    </Pressable>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
    <Text style={[styles.subtitle, { color: theme.muted }]}>{copy.subtitle}</Text>
    {loading && !visits.length ? <ActivityIndicator accessibilityLabel={copy.title} color={theme.gold} /> : null}
    {error ? <View style={styles.center}>
      <Text accessibilityRole="alert" style={[styles.note, { color: theme.text }]}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => setRevision(value => value + 1)}
        style={({ pressed }) => [styles.back, { borderColor: theme.gold }, pressed && styles.pressed]}>
        <Text style={[styles.backText, { color: theme.text }]}>{copy.retry}</Text></Pressable>
    </View> : null}
    {!loading && !error && !visits.length ? <Text style={[styles.note, { color: theme.muted }]}>{copy.empty}</Text> : null}
    {groups.map(group => <View key={group.day} style={styles.group}>
      <Text style={[styles.day, { color: theme.gold }]}>✿ {group.day}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {group.items.map((visit, index) => <View key={visit.id}
          style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
            visit.action === 'left your garden' && styles.quiet]}>
          <UserAvatar avatar={visit.visitorAvatar} size={36} />
          <Text style={[styles.text, { color: theme.text }]}>
            <Text style={styles.name}>{visit.visitorName || copy.friend}</Text> {copy.action(visit.action)}
          </Text>
          <Text style={[styles.time, { color: theme.muted }]}>
            {new Date(visit.createdAt).toLocaleTimeString(zh ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>)}
      </View>
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, gap: 12 },
  back: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  backText: { fontFamily: 'serif', fontSize: 15 },
  pressed: { opacity: 0.8 },
  title: { fontFamily: 'serif', fontSize: 30, fontWeight: '600', marginTop: 6 },
  subtitle: { fontFamily: 'serif', fontSize: 15, marginTop: -6 },
  center: { alignItems: 'center', gap: 10 },
  note: { fontFamily: 'serif', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 24 },
  group: { gap: 8, marginTop: 8 },
  day: { fontFamily: 'serif', fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  quiet: { opacity: 0.6 },
  text: { flex: 1, fontSize: 15, lineHeight: 21 },
  name: { fontWeight: '700' },
  time: { fontSize: 12 },
});
