import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/auth';
import { gardenVisitAccess, startGardenVisit, leaveGardenVisit } from '../../services/gardenVisits';
import { loadFriends } from '../../services/friends';
import GardenScene from '../../components/garden/GardenScene';
import { gardenLoadingStyles } from '../../components/garden/loading/GardenLoadingOverlay';
import { WakingFlowerFacts } from '../../components/loading/WakingFlowerFacts';
import { PigeonLoadingScreen } from '../../components/loading/PigeonLoadingExperience';
import { FEATURE_COLORS as colors, FeatureActionButton, ui } from '../../components/features/FeatureUI';

// "Luna’s Garden", "James’ Garden", "Luna的花园". The name and its ending are separate Texts so a
// long name is shortened with an ellipsis while the ending stays whole.
const visitTitleEnding = (name: string, zh: boolean) => zh ? '的花园' : /s$/i.test(name) ? '’ Garden' : '’s Garden';

export default function VisitGardenScreen() {
  const { session, experience } = useAuth();
  const zh = experience?.user.preferredLocale === 'zh-Hans';
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const viewerId = session?.user.id;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
  // The owner's name comes from the visitor's own friends list, read once the visit has started.
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const started = Boolean(visiting);
  useEffect(() => {
    if (!started || !viewerId || !ownerId) return;
    let active = true;
    loadFriends(viewerId).then(friends => {
      const friend = Array.isArray(friends) ? friends.find(item => item.id === ownerId) : undefined;
      const name = friend?.displayName?.trim() || friend?.name?.trim() || friend?.accountId?.trim() || '';
      if (active && name) setOwner({ id: ownerId, name });
    }).catch(() => {});
    return () => { active = false; };
  }, [started, viewerId, ownerId]);
  const ownerName = visiting && owner?.id === ownerId ? owner.name : '';
  const sideRoom = Math.max(insets.left, insets.right) + (width < 600 ? 24 : 96);
  const backButton = <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')} style={({ pressed }) => [styles.back, pressed && styles.homePressed]}>
    <Text style={styles.backText}>{zh ? '回到我的花园' : 'Return to My Garden'}</Text>
  </Pressable>;
  return <GestureHandlerRootView style={styles.root}>
    {visiting ? <GardenScene key={`${viewerId}:${ownerId}`} session={session} gardenOwnerUserId={ownerId}
      backendMode readOnly showDevControls={false} initialWaterfallVersion="v2" locale={experience?.user.preferredLocale} /> : null}
    {ownerName ? <View testID="visit-garden-title" pointerEvents="none" accessible accessibilityRole="header"
      accessibilityLabel={`${ownerName}${visitTitleEnding(ownerName, zh)}`}
      style={[styles.titleRow, { top: insets.top + (width < 600 ? 14 : 20), paddingHorizontal: sideRoom }]}>
      <View style={styles.titlePlate}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.title, styles.titleName, width >= 600 && styles.titleWide]}>{ownerName}</Text>
        <Text numberOfLines={1} style={[styles.title, styles.titleEnding, width >= 600 && styles.titleWide]}>{visitTitleEnding(ownerName, zh)}</Text>
      </View>
    </View> : null}
    {visiting ? <Pressable accessibilityRole="button" accessibilityLabel="Return to My Garden"
      accessibilityHint="Leave this friend's Garden and return to your own"
      testID="visitor-return-home" onPress={() => router.dismissTo('/')}
      style={({ pressed }) => [styles.home, { bottom: insets.bottom + 16, left: insets.left + 16 }, pressed && styles.homePressed]}>
      <Image source={require('../../../assets/friends/visitor-home-transparent.webp')} style={styles.homeArtwork}
        resizeMode="contain" accessible={false} />
      <Text numberOfLines={1} style={styles.homeLabel}>{zh ? '返回' : 'Return'}</Text>
    </Pressable> : error ? <View style={[gardenLoadingStyles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.status}><Text accessibilityRole="alert" style={ui.text}>{error}</Text>
        <FeatureActionButton secondary title="Retry Garden visit" onPress={() => setAttempt(value => value + 1)} /></View>
      {backButton}
    </View> : <PigeonLoadingScreen overlay testID="visit-loading" progress={null}
      message={zh ? '正在走进朋友的花园…' : 'Walking into your friend’s Garden…'}>
      {/* Same look as loading your own Garden, flower cards included for slow connections. Access is
          checked first (not measurable), then the Garden's own measured loading takes over. */}
      <WakingFlowerFacts delayMs={2500} showNote={false} />
      {backButton}
    </PigeonLoadingScreen>}
  </GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  // Same 64×64 footprint as before: the artwork keeps its drawn size (the image is 1436×1095), the label fits under it.
  home: { position: 'absolute', width: 64, height: 64, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 12 },
  homeArtwork: { width: 60, height: 46 },
  homeLabel: { fontFamily: 'serif', fontSize: 11, lineHeight: 14, color: '#FFF8E4', textShadowColor: '#0B241FE6', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  titleRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  titlePlate: { maxWidth: '100%', flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 14, paddingVertical: 3, borderRadius: 999, backgroundColor: '#0B241F33' },
  title: { fontFamily: 'serif', fontSize: 17, lineHeight: 23, letterSpacing: .3, color: '#FFF8E4', textShadowColor: '#0B241FE6', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  titleName: { flexShrink: 1 },
  titleEnding: { flexShrink: 0 },
  titleWide: { fontSize: 20, lineHeight: 27 },
  homePressed: { opacity: .8, transform: [{ scale: .96 }] },
  status: { maxWidth: 300, padding: 12, gap: 8, borderRadius: 18, backgroundColor: colors.paper },
  back: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#b9c8ad' },
  backText: { fontSize: 14, color: '#365b42' },
});
