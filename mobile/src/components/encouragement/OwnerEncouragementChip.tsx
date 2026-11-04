import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { loadReceivedEncouragement } from '../../services/gardenEncouragement';
import { supportSummary, unreadNotesLabel, type ReceivedEncouragement } from './encouragementFormat';

// In the owner's own Garden: a quiet line when friends supported the Garden today or left
// notes not yet read. Tapping it opens the mailbox, where the notes wait as letters.
// Nothing shows when there is nothing new, and a failed load stays silent.
export function OwnerEncouragementChip() {
  const [received, setReceived] = useState<ReceivedEncouragement | null>(null);
  const glow = useRef(new Animated.Value(0)).current;
  const refresh = useCallback(() => {
    let active = true;
    loadReceivedEncouragement().then(next => { if (active) setReceived(next); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => { if (status === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  const unread = (received?.messages.unread ?? 0) + (received?.support.unread ?? 0);
  useEffect(() => {
    if (!unread) { glow.setValue(0); return; }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [unread, glow]);
  if (!received) return null;
  const supportLine = received.support.today > 0 || received.support.unread > 0 ? supportSummary(received.support) : null;
  const notesLine = unreadNotesLabel(received.messages.unread);
  if (!supportLine && !notesLine) return null;
  const label = [supportLine, notesLine].filter(Boolean).join('. ');
  return <Pressable testID="owner-encouragement" accessibilityRole="button" accessibilityLabel={`${label}. Open the mailbox`}
    onPress={() => router.push('/mailbox')} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
    {unread ? <Animated.View style={[styles.glow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [.45, 1] }),
      transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [.85, 1.15] }) }] }]} /> : <Text style={styles.spark}>✧</Text>}
    <View style={styles.lines}>
      {supportLine ? <Text style={styles.text}>{supportLine}</Text> : null}
      {notesLine ? <Text style={styles.text}>✉ {notesLine}</Text> : null}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12,
    backgroundColor: '#FBF4DFE6', borderWidth: 1, borderColor: '#E3D3A8' },
  pressed: { opacity: .75 },
  glow: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#F2C75C', boxShadow: '0 0 8px #F2C75C' },
  spark: { fontSize: 12, color: '#C9A44C' },
  lines: { flexShrink: 1, gap: 1 },
  text: { fontSize: 11, lineHeight: 15, fontWeight: '600', color: '#254E46',
    fontFamily: Platform.OS === 'web' ? '"Cormorant Garamond", Georgia, serif' : undefined },
});
