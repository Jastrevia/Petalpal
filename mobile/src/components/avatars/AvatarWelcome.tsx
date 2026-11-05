import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../services/auth';
import { holdBondCelebration, receiveWelcomeAvatars, setWelcomeActive, useAvatarCollection } from '../../services/avatars';
import type { BondLocale } from '../bond/bondCopy';
import { usePanelTheme, type PanelTheme } from '../features/PanelTheme';
import { AVATAR_ART, AVATAR_TIERS } from './avatarArt';
import { avatarCopy } from './avatarCopy';

// A new account's first avatar: the whole Level 1 collection to choose from, then PPL's gift of
// three more at random. The server gives the gift once per account; accounts from before the
// collection were marked as done, so they never see this.
export function AvatarWelcome({ locale, enabled }: { locale: BondLocale; enabled: boolean }) {
  const copy = avatarCopy(locale);
  const { theme, light } = usePanelTheme();
  const styles = useMemo(() => makeStyles(theme, light), [theme, light]);
  const { rememberAvatar } = useAuth();
  const { collection } = useAvatarCollection(enabled);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [gift, setGift] = useState<string[] | null>(null);
  const grow = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!gift) return;
    grow.forEach(value => value.setValue(0));
    Animated.stagger(180, grow.map(value => Animated.spring(value, { toValue: 1, friction: 6, tension: 55, useNativeDriver: Platform.OS !== 'web' }))).start();
  }, [gift, grow]);

  // The welcome flow (choosing avatar + 3 gifts reveal) goes first and holds celebrations.
  const active = Boolean(collection?.welcome.needed || gift);
  useEffect(() => {
    setWelcomeActive(active);
    if (!active) return;
    const release = holdBondCelebration();
    return () => {
      release();
      setWelcomeActive(false);
    };
  }, [active]);

  const choosing = Boolean(collection?.welcome.needed) && !gift;
  if (!choosing && !gift) return null;

  async function begin() {
    if (!choice || busy) return;
    setBusy(true); setError('');
    try {
      const result = await receiveWelcomeAvatars(choice);
      rememberAvatar(result.equipped);
      // A repeat (another device got there first) has nothing new to open.
      if (result.created) setGift(result.welcome.gifted);
      else setGift(null);
    } catch { setError(copy.welcomeFailed); } finally { setBusy(false); }
  }

  return <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => { if (gift) setGift(null); }}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.sheet}>
        {gift ? <View style={styles.giftBody}>
          <Text style={styles.eyebrow}>✿</Text>
          <Text accessibilityRole="header" style={styles.title}>{copy.giftTitle}</Text>
          <Text style={styles.body}>{copy.giftBody}</Text>
          <View style={styles.gifts}>
            {gift.map((id, index) => <Animated.View key={id} style={[styles.giftHalo, { opacity: grow[index], transform: [{ scale: grow[index].interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
              <Image source={AVATAR_ART[id]} style={styles.giftArt} accessibilityIgnoresInvertColors />
            </Animated.View>)}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setGift(null)} style={({ pressed }) => [styles.button, pressed && styles.pressed, styles.focus]}>
            <Text style={styles.buttonText}>{copy.giftDone}</Text>
          </Pressable>
        </View> : <>
          <View style={styles.head}>
            <Text accessibilityRole="header" style={styles.title}>{copy.welcomeTitle}</Text>
            <Text style={styles.body}>{copy.welcomeBody}</Text>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
            {AVATAR_TIERS[0].ids.map((id, index) => {
              const chosen = choice === id;
              return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={copy.avatar(index + 1, 1)} accessibilityState={{ selected: chosen, disabled: busy }}
                disabled={busy} onPress={() => setChoice(id)} style={({ pressed }) => [styles.tile, chosen && styles.chosen, pressed && styles.pressed, styles.focus]}>
                <Image source={AVATAR_ART[id]} style={styles.art} accessibilityIgnoresInvertColors />
              </Pressable>;
            })}
          </ScrollView>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !choice || busy }} disabled={!choice || busy} onPress={() => void begin()}
            style={({ pressed }) => [styles.button, styles.buttonInset, (!choice || busy) && styles.disabled, pressed && styles.pressed, styles.focus]}>
            {busy ? <ActivityIndicator color={theme.background} accessibilityLabel={copy.welcomeSaving} /> : <Text style={styles.buttonText}>{copy.welcomeConfirm}</Text>}
          </Pressable>
        </>}
      </View>
    </View>
  </Modal>;
}

function makeStyles(theme: PanelTheme, light: boolean) {
  const hair = `${theme.gold}73`;
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#0B1F1BB3' },
    sheet: { width: '100%', maxWidth: 460, maxHeight: '94%', borderRadius: 26, overflow: 'hidden', paddingVertical: 20, backgroundColor: theme.background, borderWidth: 1, borderColor: hair },
    head: { paddingHorizontal: 22, gap: 6 },
    eyebrow: { textAlign: 'center', fontSize: 18, color: theme.gold },
    title: { fontFamily: 'serif', fontSize: 26, color: theme.text, textAlign: 'center' },
    body: { fontFamily: 'serif', fontStyle: 'italic', fontSize: 15, lineHeight: 21, color: theme.muted, textAlign: 'center' },
    scroll: { flexShrink: 1, marginTop: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
    tile: { width: 70, height: 70, borderRadius: 35, padding: 3, borderWidth: 1.5, borderColor: hair },
    chosen: { borderWidth: 3, padding: 1.5, borderColor: theme.gold, transform: [{ scale: 1.06 }] },
    art: { width: '100%', height: '100%', borderRadius: 32 },
    error: { textAlign: 'center', color: light ? '#A23B4A' : '#F2A7A7', marginTop: 6 },
    button: { alignSelf: 'stretch', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: theme.gold, marginTop: 14 },
    buttonInset: { marginHorizontal: 22 },
    buttonText: { fontFamily: 'serif', fontSize: 17, color: light ? '#1E3A33' : theme.background },
    disabled: { opacity: 0.5 },
    giftBody: { alignItems: 'center', gap: 6, paddingHorizontal: 22 },
    gifts: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 14 },
    giftHalo: { width: 88, height: 88, borderRadius: 44, padding: 5, borderWidth: 1, borderColor: theme.gold, backgroundColor: `${theme.gold}24` },
    giftArt: { width: '100%', height: '100%', borderRadius: 39 },
    pressed: { opacity: 0.8 },
    focus: Platform.OS === 'web' ? { outlineColor: light ? '#416651' : '#D6C58B' } : {},
  });
}
