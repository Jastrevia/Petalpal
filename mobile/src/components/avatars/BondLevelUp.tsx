import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClosenessSummary } from '../../services/fairyCloseness';
import { useAvatarCollection, useBondCelebrationHeld, useWelcomeActive } from '../../services/avatars';
import { BOND_TIERS, type BondLocale } from '../bond/bondCopy';
import { usePanelTheme, type PanelTheme } from '../features/PanelTheme';
import { avatarCopy } from './avatarCopy';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';

const BLOOM = require('@/assets/bond/checkin-bloom.webp');
export const bondLevelSeenKey = (userId: string) => `petalpal_bond_avatar_level_seen_v1:${encodeURIComponent(userId)}`;

// When the Fairy Bond level has risen since this device last showed it and an avatar reward is
// waiting: a small celebration with the new level and a way into the avatar collection. Dismissing
// it only marks the level as seen here; the rewards stay waiting on the server.
export function BondLevelUp({ userId, locale, summary, paused, onChoose }: {
  userId: string; locale: BondLocale; summary: ClosenessSummary | null; paused: boolean; onChoose: () => void;
}) {
  const copy = avatarCopy(locale);
  const { theme, light } = usePanelTheme();
  const styles = useMemo(() => makeStyles(theme, light), [theme, light]);
  const held = useBondCelebrationHeld();
  const welcomeActive = useWelcomeActive();
  const level = summary?.level ?? 0;
  const { collection } = useAvatarCollection(Boolean(summary), level);
  const [seen, setSeen] = useState<number | null | undefined>(undefined);
  const bloom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(bondLevelSeenKey(userId))
      .then(value => { if (active) setSeen(value && /^\d+$/.test(value) ? Number(value) : null); })
      .catch(() => { if (active) setSeen(null); });
    return () => { active = false; };
  }, [userId]);
  const visible = !paused && !held && !welcomeActive && seen !== undefined && level >= 2 && (seen === null || level > seen)
    && Boolean(collection?.bondOn && !collection.welcome.needed && collection.ready > 0 && collection.level === level);
  useEffect(() => {
    if (!visible) return;
    bloom.setValue(0);
    Animated.spring(bloom, { toValue: 1, friction: 7, tension: 40, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [bloom, visible]);
  if (!visible || !collection) return null;
  const tier = [...BOND_TIERS].reverse().find(item => level >= item.level) ?? BOND_TIERS[0];
  const done = (choose: boolean) => {
    setSeen(level);
    AsyncStorage.setItem(bondLevelSeenKey(userId), String(level)).catch(() => undefined);
    if (choose) onChoose();
  };
  return <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible animationType="fade" onRequestClose={() => done(false)} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.card}>
        <Animated.View style={[styles.bloomWrap, { opacity: bloom, transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { rotate: bloom.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) }] }]}>
          <Image source={BLOOM} style={styles.bloom} resizeMode="contain" accessible={false} />
        </Animated.View>
        <Text style={styles.eyebrow}>{copy.levelUpEyebrow}</Text>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.level}>{copy.levelUpTitle(level)}</Text>
        <Text style={styles.tier}>{locale === 'zh-Hans' ? tier.zh : tier.en}</Text>
        <View style={styles.rule} />
        <Text style={styles.body}>{copy.levelUpBody(collection.ready)}</Text>
        <Pressable accessibilityRole="button" onPress={() => done(true)} style={({ pressed }) => [styles.button, pressed && styles.pressed, styles.focus]}>
          <Text style={styles.buttonText}>{copy.levelUpChoose}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => done(false)} style={({ pressed }) => [styles.later, pressed && styles.pressed, styles.focus]}>
          <Text style={styles.laterText}>{copy.later}</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

function makeStyles(theme: PanelTheme, light: boolean) {
  const hair = `${theme.gold}73`;
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: '#0B1F1B99' },
    card: { width: '100%', maxWidth: 340, alignItems: 'center', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 16, borderRadius: 28,
      backgroundColor: theme.background, borderWidth: 1, borderColor: hair },
    bloomWrap: { width: 86, height: 86, alignItems: 'center', justifyContent: 'center' },
    bloom: { width: 86, height: 86 },
    eyebrow: { fontSize: 10, fontWeight: '600', letterSpacing: 2.4, textTransform: 'uppercase', color: theme.muted, marginTop: 2 },
    level: { fontFamily: 'serif', fontSize: 40, color: theme.text, marginTop: 2 },
    tier: { fontFamily: 'serif', fontStyle: 'italic', fontSize: 16, color: light ? '#7E5F25' : theme.gold },
    rule: { width: 56, height: 1, backgroundColor: hair, marginVertical: 12 },
    body: { fontFamily: 'serif', fontSize: 16, lineHeight: 22, color: theme.text, textAlign: 'center' },
    button: { alignSelf: 'stretch', minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: theme.gold, marginTop: 16 },
    buttonText: { fontFamily: 'serif', fontSize: 16, color: light ? '#1E3A33' : theme.background },
    later: { alignSelf: 'stretch', minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    laterText: { fontFamily: 'serif', fontSize: 15, color: theme.muted },
    pressed: { opacity: 0.8 },
    focus: Platform.OS === 'web' ? { outlineColor: light ? '#416651' : '#D6C58B' } : {},
  });
}
