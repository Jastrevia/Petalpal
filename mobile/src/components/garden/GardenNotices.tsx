import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { subscribeUserRealtime, visitNotice, type VisitRecord } from '../../services/userRealtime';
import { UserAvatar } from '../avatars/UserAvatar';

// Who came, who sent support or a message, who left: each stays on the Garden until its × is tapped,
// so a busy owner still finds it later (and after reopening: kept on this device, per account). The
// same person doing the same thing again moves up instead of piling on. A few show at a time.
interface Notice { id: string; visitorName?: string; visitorAvatar?: string; action?: string; at: number }
const KEEP = 12;
const storageKey = (ownerId: string) => `petalpal.gardenNotices.v1.${ownerId}`;

export function GardenNotices({ ownerId, chinese, top, left, maxWidth, visible }: { ownerId: string; chinese: boolean; top: number; left: number; maxWidth: number; visible: number }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const loaded = useRef(false), latest = useRef<Notice[]>([]);
  const save = useCallback((next: Notice[]) => {
    latest.current = next; setNotices(next);
    if (loaded.current) AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(next)).catch(() => undefined);
  }, [ownerId]);
  useEffect(() => {
    let active = true;
    loaded.current = false; latest.current = []; setNotices([]);
    AsyncStorage.getItem(storageKey(ownerId)).catch(() => null).then(stored => {
      if (!active) return;
      let saved: Notice[] = [];
      try { const value: unknown = stored ? JSON.parse(stored) : []; if (Array.isArray(value)) saved = value.filter(item => typeof item?.id === 'string' && typeof item?.at === 'number'); } catch { /* start empty */ }
      loaded.current = true;
      // Anything that arrived while reading comes first.
      const fresh = latest.current, ids = new Set(fresh.map(item => item.id));
      save([...fresh, ...saved.filter(item => !ids.has(item.id))].slice(0, KEEP));
    });
    return () => { active = false; };
  }, [ownerId, save]);
  useEffect(() => subscribeUserRealtime({ visit: (record: VisitRecord, gardenOwnerId) => {
    if (gardenOwnerId !== ownerId || !record.visitorId || record.visitorId === ownerId || !visitNotice(record, false)) return;
    const id = `${record.visitorId}:${record.action}`;
    save([{ id, visitorName: record.visitorName, visitorAvatar: record.visitorAvatar, action: record.action, at: Date.now() },
      ...latest.current.filter(item => item.id !== id)].slice(0, KEEP));
  } }), [ownerId, save]);
  const shown = notices.slice(0, visible);
  if (!shown.length) return null;
  const closeLabel = chinese ? '关闭这条提醒' : 'Dismiss';
  return <View pointerEvents="box-none" testID="garden-notices" style={[styles.stack, { top, left, maxWidth }]}>
    {shown.map(notice => <View key={notice.id} testID="visit-notice" accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={styles.notice}>
      <UserAvatar avatar={notice.visitorAvatar} size={20} />
      <Text style={styles.text}>{visitNotice(notice, chinese)}<Text style={styles.time}>  {new Date(notice.at).toLocaleTimeString(chinese ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' })}</Text></Text>
      <Pressable testID="visit-notice-close" accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={12}
        onPress={() => save(latest.current.filter(item => item.id !== notice.id))} style={({ pressed }) => [styles.close, pressed && { opacity: .6 }]}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>)}
    {notices.length > visible ? <Text style={styles.more}>
      {chinese ? `还有 ${notices.length - visible} 条` : `${notices.length - visible} more`}</Text> : null}
  </View>;
}

// A thin pane of dark glass over the Garden, in either theme; the shadow keeps the words readable on it.
const GLASS = '#0B241F66';
const WORDS = { color: '#FFF8E4', textShadowColor: '#0B241FE6', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 };
const styles = StyleSheet.create({
  stack: { position: 'absolute', gap: 4, alignItems: 'flex-start' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, paddingLeft: 4, paddingRight: 2, borderRadius: 13, backgroundColor: GLASS },
  text: { ...WORDS, flexShrink: 1, fontFamily: 'serif', fontSize: 12, lineHeight: 15 },
  time: { fontSize: 9, opacity: .8 },
  close: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  closeText: { ...WORDS, fontSize: 15, lineHeight: 17 },
  more: { ...WORDS, overflow: 'hidden', fontSize: 10, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 9, backgroundColor: GLASS },
});
