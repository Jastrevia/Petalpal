import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/auth';
import { gardenVisitAccess, startGardenVisit, leaveGardenVisit } from '../../services/gardenVisits';
import GardenScene from '../../components/garden/GardenScene';
import { FEATURE_COLORS as colors, FeatureActionButton, ui } from '../../components/features/FeatureUI';
import { VisitorEncouragement } from '../../components/encouragement/VisitorEncouragement';

export default function VisitGardenScreen() {
  const { session } = useAuth();
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
      backendMode readOnly showDevControls={false} initialWaterfallVersion="v2" /> : null}
    {visiting ? <VisitorEncouragement key={`encouragement:${viewerId}:${ownerId}`} ownerId={ownerId} /> : null}
    {visiting ? <Pressable accessibilityRole="button" accessibilityLabel="Return to My Garden"
      accessibilityHint="Leave this friend's Garden and return to your own"
      testID="visitor-return-home" onPress={() => router.dismissTo('/')}
      style={({ pressed }) => [styles.home, { bottom: insets.bottom + 16, left: insets.left + 16 }, pressed && styles.homePressed]}>
      <Image source={require('../../../assets/friends/visitor-home-transparent.png')} style={styles.homeArtwork}
        resizeMode="contain" accessible={false} />
    </Pressable> : <View style={[styles.status, { top: insets.top + 12 }]}>
      {error ? <><Text accessibilityRole="alert" style={ui.text}>{error}</Text>
        <FeatureActionButton secondary title="Retry Garden visit" onPress={() => setAttempt(value => value + 1)} /></>
        : <ActivityIndicator accessibilityLabel="Opening friend Garden" color={colors.primary} />}
      <FeatureActionButton title="Return to My Garden" onPress={() => router.dismissTo('/')} />
    </View>}
  </GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  home: { position: 'absolute', width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  homeArtwork: { width: 60, height: 60 },
  homePressed: { opacity: .8, transform: [{ scale: .96 }] },
  status: { position: 'absolute', alignSelf: 'center', maxWidth: 300, padding: 12, gap: 8,
    borderRadius: 18, backgroundColor: colors.paper },
});
