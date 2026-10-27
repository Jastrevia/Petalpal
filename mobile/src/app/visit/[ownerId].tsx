import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/auth';
import { gardenVisitAccess, startGardenVisit, leaveGardenVisit } from '../../services/gardenVisits';
import GardenScene from '../../components/garden/GardenScene';
import { gardenLoadingStyles } from '../../components/garden/loading/GardenLoadingOverlay';
import { WakingFlowerFacts } from '../../components/loading/WakingFlowerFacts';
import { FEATURE_COLORS as colors, FeatureActionButton, ui } from '../../components/features/FeatureUI';

export default function VisitGardenScreen() {
  const { session, experience } = useAuth();
  const zh = experience?.user.preferredLocale === 'zh-Hans';
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const viewerId = session?.user.id;
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState<{ ownerId: string; viewerId: string } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, joined = false;
    setReady(null); setError('');
    async function enter() {
      if (!ownerId || !viewerId || ownerId === viewerId) { if (active) setError('Select a friend’s Garden to visit.'); return; }
      try {
        // Recheck access at entry: list permissions may have changed meanwhile.
        const access = await gardenVisitAccess(ownerId);
        if (!active) return;
        if (access !== 'allowed') throw new Error(access === 'denied' ? 'This Garden is private or unavailable.' : 'Garden access could not be verified. Please try again.');
        await startGardenVisit(ownerId);
        joined = true;
        if (!active) { await leaveGardenVisit(ownerId); return; }
        setReady({ ownerId, viewerId });
      } catch (err) { if (active) setError((err as Error).message); }
    }
    void enter();
    return () => { active = false; if (joined) void leaveGardenVisit(ownerId).catch(() => {}); };
  }, [ownerId, viewerId, attempt]);
  const visiting = session && ready?.ownerId === ownerId && ready.viewerId === viewerId;
  return <GestureHandlerRootView style={styles.root}>
    {visiting ? <GardenScene key={`${viewerId}:${ownerId}`} session={session} gardenOwnerUserId={ownerId}
      backendMode readOnly showDevControls={false} initialWaterfallVersion="v2" locale={experience?.user.preferredLocale} /> : null}
    {visiting ? <Pressable accessibilityRole="button" accessibilityLabel="Return to My Garden"
      accessibilityHint="Leave this friend's Garden and return to your own"
      testID="visitor-return-home" onPress={() => router.dismissTo('/')}
      style={({ pressed }) => [styles.home, { bottom: insets.bottom + 16, left: insets.left + 16 }, pressed && styles.homePressed]}>
      <Image source={require('../../../assets/friends/visitor-home-transparent.png')} style={styles.homeArtwork}
        resizeMode="contain" accessible={false} />
    </Pressable> : <View style={[gardenLoadingStyles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      {error ? <View style={styles.status}><Text accessibilityRole="alert" style={ui.text}>{error}</Text>
        <FeatureActionButton secondary title="Retry Garden visit" onPress={() => setAttempt(value => value + 1)} /></View>
        : <>
          {/* Same look as loading your own Garden, flower cards included for slow connections. */}
          <ActivityIndicator accessibilityLabel="Opening friend Garden" color="#365b42" />
          <Text accessibilityLiveRegion="polite" style={gardenLoadingStyles.title}>{zh ? '正在走进朋友的花园…' : 'Walking into your friend’s Garden…'}</Text>
          <WakingFlowerFacts delayMs={2500} showNote={false} />
        </>}
      <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')} style={({ pressed }) => [styles.back, pressed && styles.homePressed]}>
        <Text style={styles.backText}>{zh ? '回到我的花园' : 'Return to My Garden'}</Text>
      </Pressable>
    </View>}
  </GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  home: { position: 'absolute', width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  homeArtwork: { width: 60, height: 60 },
  homePressed: { opacity: .8, transform: [{ scale: .96 }] },
  status: { maxWidth: 300, padding: 12, gap: 8, borderRadius: 18, backgroundColor: colors.paper },
  back: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#b9c8ad' },
  backText: { fontSize: 14, color: '#365b42' },
});
