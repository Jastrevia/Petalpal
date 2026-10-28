import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { loadGardenVisits, type GardenVisit } from '../../services/garden';
import { subscribeUserRealtime } from '../../services/userRealtime';
import type { AppLocale } from '../../services/locale';
import { UserAvatar } from '../avatars/UserAvatar';
import type { PanelTheme } from './PanelTheme';

const COPY = {
  en: {
    empty: 'No visitors yet. When friends drop by, you’ll see it here.',
    error: 'Your Garden history could not load. Please try again.', retry: 'Try again', today: 'Today', yesterday: 'Yesterday', friend: 'A friend',
    action: (action: string) => ({ 'started visiting your garden': 'came to visit 🌸', 'left your garden': 'left your Garden',
      support: 'sent a flower some support 💗', message: 'left a message on a flower 💌' } as Record<string, string>)[action] ?? action,
  },
  'zh-Hans': {
    empty: '还没有人来过。朋友来逛时，会记录在这里。',
    error: '花园记录加载失败，请再试一次。', retry: '再试一次', today: '今天', yesterday: '昨天', friend: '一位朋友',
    action: (action: string) => ({ 'started visiting your garden': '来逛你的花园 🌸', 'left your garden': '离开了你的花园',
      support: '给你的花送来了支持 💗', message: '在你的花上留了言 💌' } as Record<string, string>)[action] ?? action,
  },
};

// Who came by the owner's Garden, grouped by day: a live log (the server keeps the latest 30).
// `revision` lets a screen reload it, e.g. each time it comes into focus.
export function GardenVisitLog({ ownerId, locale, theme, revision = 0 }: { ownerId?: string; locale: AppLocale; theme: PanelTheme; revision?: number }) {
  const copy = COPY[locale], zh = locale === 'zh-Hans';
  const [visits, setVisits] = useState<GardenVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (ownerId) loadGardenVisits(ownerId)
      .then(items => { if (active) setVisits(items); })
      .catch(() => { if (active) setError(copy.error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ownerId, revision, reloads, copy.error]);
  // New visits appear while the log is open.
  useEffect(() => subscribeUserRealtime({ visit: (_record, gardenOwnerId) => {
    if (gardenOwnerId === ownerId) setReloads(value => value + 1);
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

  return <View style={styles.log}>
    {loading && !visits.length ? <ActivityIndicator color={theme.gold} /> : null}
    {error ? <View style={styles.center}>
      <Text accessibilityRole="alert" style={[styles.note, { color: theme.text }]}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={() => setReloads(value => value + 1)}
        style={({ pressed }) => [styles.retry, { borderColor: theme.gold }, pressed && styles.pressed]}>
        <Text style={[styles.retryText, { color: theme.text }]}>{copy.retry}</Text></Pressable>
    </View> : null}
    {!loading && !error && !visits.length ? <Text style={[styles.note, { color: theme.muted }]}>{copy.empty}</Text> : null}
    {groups.map(group => <View key={group.day} style={styles.group}>
      <Text style={[styles.day, { color: theme.gold }]}>✿ <Text style={{ color: theme.text }}>{group.day}</Text></Text>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {group.items.map((visit, index) => <View key={visit.id}
          style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
            visit.action === 'left your garden' && styles.quiet]}>
          <UserAvatar avatar={visit.visitorAvatar} size={36} />
          <Text style={[styles.text, { color: theme.text }]}>
            <Text style={styles.name}>{visit.visitorName || copy.friend}</Text>  {copy.action(visit.action)}
          </Text>
          <Text style={[styles.time, { color: theme.muted }]}>
            {new Date(visit.createdAt).toLocaleTimeString(zh ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>)}
      </View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  log: { gap: 12 },
  retry: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  retryText: { fontFamily: 'serif', fontSize: 15 },
  pressed: { opacity: 0.8 },
  center: { alignItems: 'center', gap: 10 },
  note: { fontFamily: 'serif', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  day: { fontFamily: 'serif', fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  quiet: { opacity: 0.6 },
  text: { flex: 1, fontSize: 14, lineHeight: 20 },
  name: { fontWeight: '700' },
  time: { fontSize: 12 },
});
