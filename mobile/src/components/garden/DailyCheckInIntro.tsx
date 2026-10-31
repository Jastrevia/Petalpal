import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkInWithFairy, loadClosenessSummary, type CheckInResult } from '../../services/fairyCloseness';
import { KeepsakeReveal } from '../bond/KeepsakeReveal';
import { keepsakeArt } from '../bond/keepsakeArt';
import { useAppLocale } from '../../services/locale';
import { calendarDateKey } from './calendarDates';
import { usePlanting } from './planting/PlantingContext';

// The first time the Garden opens each day: today's check-in with PPL happens and her keepsake is
// revealed. Once closed, the keepsake on a small card shrinks into the calendar in the top-right
// corner, so the owner learns that is where check-ins live. Checked in elsewhere earlier today:
// just the card. Off with the closeness switch (summary null).
const SHOWN_KEY = 'petalpal.checkInIntro.shownOn';
const TIME_KEY = 'petalpal.checkInIntro.checkedInAt';
const HOLD_MS = 2600, SHRINK_MS = 900;
// Her own photo, the same one Fairy Moments uses as her avatar.
const PPL = require('@/assets/moments/TEA_TIME-3.jpg');
const COPY = {
  en: { title: 'Checked in for today', at: (time: string) => `Today at ${time}`, earlier: 'Earlier today', streak: (n: number) => `${n}-day streak with PPL`,
    hint: 'Your check-ins and keepsakes live in the calendar, top right.', dismiss: 'Go to the calendar' },
  'zh-Hans': { title: '今天已签到', at: (time: string) => `今天 ${time}`, earlier: '今天早些时候', streak: (n: number) => `和小花仙连续签到 ${n} 天`,
    hint: '签到记录和信物都在右上角的日历里，点开就能看。', dismiss: '去日历看看' },
};

export function DailyCheckInIntro() {
  const locale = useAppLocale(), copy = COPY[locale];
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Same size rule as the calendar button (GardenCalendar).
  const calendarWidth = Math.min(164, Math.max(125, width * .22));
  const progress = useRef(new Animated.Value(0)).current;
  const [card, setCard] = useState<{ time: string | null; streak: number; keepsake?: string } | null>(null);
  const [reveal, setReveal] = useState<CheckInResult | null>(null);
  const pendingCard = useRef<{ time: string | null; streak: number; keepsake?: string } | null>(null);
  const showCard = (next: { time: string | null; streak: number; keepsake?: string }) => {
    setCard(next);
    Animated.timing(progress, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: Platform.OS !== 'web' }).start();
  };
  const leaving = useRef(false);
  // Waits for the Garden to appear, so the card lands on her Garden, not on an empty screen.
  const { isGardenLoading } = usePlanting();

  useEffect(() => {
    if (isGardenLoading) return;
    let active = true;
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 700));
      if (!active) return;
      const today = calendarDateKey(new Date());
      if ((await AsyncStorage.getItem(SHOWN_KEY).catch(() => null)) === today) return;
      const summary = await loadClosenessSummary().catch(() => null);
      if (!summary || !active) return;
      let streak = summary.checkIn.streak, at: string | null = null, earned: CheckInResult | null = null;
      if (!summary.checkIn.checkedInToday) {
        const result = await checkInWithFairy().catch(() => null);
        if (!result || !active) return;
        streak = result.checkIn?.streak ?? streak + 1;
        if (result.created && result.keepsakes?.length) earned = result;
        at = new Date().toISOString();
        await AsyncStorage.setItem(TIME_KEY, JSON.stringify({ day: today, at })).catch(() => undefined);
      } else {
        const saved = JSON.parse((await AsyncStorage.getItem(TIME_KEY).catch(() => null)) || 'null');
        if (saved?.day === today) at = saved.at;
      }
      await AsyncStorage.setItem(SHOWN_KEY, today).catch(() => undefined);
      if (!active) return;
      const time = at ? new Date(at).toLocaleTimeString(locale === 'zh-Hans' ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' }) : null;
      if (earned) { pendingCard.current = { time, streak, keepsake: earned.keepsakes[0].id }; setReveal(earned); }
      else showCard({ time, streak });
    })();
    return () => { active = false; };
  }, [locale, progress, isGardenLoading]);

  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduced => {
      Animated.timing(progress, { toValue: 2, duration: reduced ? 0 : SHRINK_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: Platform.OS !== 'web' })
        .start(() => setCard(null));
    });
  };
  useEffect(() => {
    if (!card) return;
    const timer = setTimeout(leave, HOLD_MS);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  const closeReveal = () => {
    setReveal(null);
    if (pendingCard.current) showCard(pendingCard.current);
    pendingCard.current = null;
  };
  if (reveal) return <KeepsakeReveal result={reveal} locale={locale} onDone={closeReveal} />;
  if (!card) return null;
  const art = card.keepsake ? keepsakeArt(card.keepsake) : null;
  // From the middle of the screen into the calendar's centre, shrinking as it goes.
  const cardWidth = Math.min(340, width - 48), cardHeight = 300;
  const toX = width - insets.right - 12 - calendarWidth / 2 - width / 2;
  const toY = insets.top + 10 + 32 - height / 2;
  const scale = progress.interpolate({ inputRange: [0, 1, 2], outputRange: [.85, 1, 64 / cardHeight] });
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress.interpolate({ inputRange: [0, 1, 1.6, 2], outputRange: [0, 1, .2, 0] }) }]} />
    <Animated.View accessibilityRole="alert" accessibilityLabel={`${copy.title}. ${card.time ? copy.at(card.time) : copy.earlier}. ${copy.streak(card.streak)}. ${copy.hint}`}
      style={[styles.card, { width: cardWidth, height: cardHeight, left: (width - cardWidth) / 2, top: (height - cardHeight) / 2,
        opacity: progress.interpolate({ inputRange: [0, .4, 1, 1.75, 2], outputRange: [0, 1, 1, .9, 0] }),
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, toX] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [16, 0, toY] }) },
          { scale },
        ] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.dismiss} onPress={leave} style={styles.inner}>
        {art ? <Image source={art} resizeMode="contain" style={styles.keepsake} /> : <View style={styles.portrait}><Image source={PPL} resizeMode="cover" style={styles.pplImage} /></View>}
        <Text style={styles.check}>✓</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.time}>{card.time ? copy.at(card.time) : copy.earlier}</Text>
        <Text style={styles.streak}>✿ {copy.streak(card.streak)}</Text>
        <Text style={styles.hint}>{copy.hint}</Text>
      </Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { zIndex: 60 },
  scrim: { backgroundColor: '#10201C66' },
  card: { position: 'absolute', borderRadius: 26, borderWidth: 2, borderColor: '#C9A95C', backgroundColor: '#FAF3DF',
    boxShadow: 'inset 0 0 0 3px #FFFDF2, 0 16px 40px #0B1F1A55', overflow: 'hidden' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 18 },
  portrait: { width: 74, height: 74, borderRadius: 37, overflow: 'hidden', borderWidth: 2, borderColor: '#C9A95C', backgroundColor: '#E9DFC4' },
  pplImage: { width: '100%', height: '100%' },
  keepsake: { width: 96, height: 96 },
  check: { marginTop: 4, fontSize: 22, color: '#3F7A5E' },
  title: { fontFamily: 'Georgia', fontSize: 22, color: '#254E43' },
  time: { fontFamily: 'Georgia', fontSize: 17, color: '#3D5F52' },
  streak: { fontSize: 13, color: '#8A6A2E' },
  hint: { marginTop: 4, fontSize: 12, color: '#637562', textAlign: 'center' },
});
