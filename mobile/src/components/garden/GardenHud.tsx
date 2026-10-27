import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GARDEN_FEATURES, gardenFeature } from '../../services/featureCatalog';
import { usePanelTheme } from '../features/PanelTheme';
import { FeatureOverlay } from '../features/FeatureOverlay';
import { FEATURE_COLORS } from '../features/FeatureUI';
import { SidebarIllustration } from './SidebarIllustration';
import { usePlanting } from './planting/PlantingContext';
import { FairyMomentsPanel } from '../moments/FairyMomentsPanel';
import { markFairyMomentsRead, refreshFairyRuntime, useFairyRuntime } from '../../services/fairyRuntime';
import { useClosenessSummary } from '../../services/fairyCloseness';
import { useAuth } from '../../services/auth';
import { FairyEntryCard } from '../fairy/FairyEntryCard';
import { OurBondPanel } from '../bond/OurBondPanel';
import { momentLocale } from '../moments/momentFormat';
import { startUserRealtime, stopUserRealtime, subscribeUserRealtime, visitNotice } from '../../services/userRealtime';
import { UserAvatar } from '../avatars/UserAvatar';
import { zhHans } from './fairy/tapLines';

// One navigation model; only its sizing changes with the viewport.
export function GardenHud({ onFocusFairy }: { onFocusFairy?: () => void } = {}) {
  const insets = useSafeAreaInsets();
  const { theme, light } = usePanelTheme();
  const { width, height } = useWindowDimensions();
  const phone = width < 600 || (width < 900 && height < 500);
  const short = height < 500;
  const iconSize = phone ? Math.max(28, Math.min(short ? 30 : 38, (width - insets.left - insets.right) / 10)) : 42;
  const { activeMode, selectedFlower, isGardenLoading, gardenError, refreshGarden } = usePlanting();
  const [highlightedFeature, setHighlightedFeature] = useState<string>();
  const [openFeature, setOpenFeature] = useState<string>();
  const { feature: entryFeature } = useLocalSearchParams<{ feature?: string }>();
  // Fairy Moments: when the server has Moments on for this owner, the Fairy icon opens her
  // feed (with a dot for new posts); otherwise it keeps focusing the camera on her.
  // The runtime response carries `moments` only for owners on the server's Moments allowlist.
  const runtime = useFairyRuntime();
  const moments = { enabled: Boolean(runtime?.moments), unread: Boolean(runtime?.moments?.unread) };
  const [momentsOpen, setMomentsOpen] = useState(false);
  // The Fairy icon opens her entry card (亲密度 · Our Bond / 朋友圈 · Fairy Moments) when
  // either room is on; the closeness summary reloads each time the card opens.
  const [entryOpens, setEntryOpens] = useState(0);
  const [entryOpen, setEntryOpen] = useState(false);
  const [bondOpen, setBondOpen] = useState(false);
  const closeness = useClosenessSummary(entryOpens);
  const { experience, session } = useAuth();
  const locale = momentLocale(experience?.user.preferredLocale);
  // Being in the app keeps the owner online for friends; visits to their Garden pop up briefly.
  const ownerId = session?.user.id;
  const chinese = zhHans(experience?.user.preferredLocale);
  const [notice, setNotice] = useState<{ key: number; text: string; avatar?: string } | null>(null);
  useEffect(() => {
    if (!ownerId) return;
    startUserRealtime(ownerId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeUserRealtime({ visit: (record, gardenOwnerId) => {
      if (gardenOwnerId !== ownerId || !record.visitorId || record.visitorId === ownerId) return;
      const text = visitNotice(record, chinese);
      if (!text) return;
      setNotice(previous => ({ key: (previous?.key ?? 0) + 1, text, avatar: record.visitorAvatar }));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 5000);
    } });
    return () => { unsubscribe(); if (timer) clearTimeout(timer); };
  }, [ownerId, chinese]);
  useEffect(() => () => stopUserRealtime(), []);
  const bondWaiting = Boolean(closeness.summary && !closeness.summary.checkIn.checkedInToday);
  const fairyDot = moments.unread || bondWaiting;
  useEffect(() => {
    if (!entryFeature) return;
    if (entryFeature === 'fairy') {
      router.setParams({ feature: undefined });
      setOpenFeature(undefined);
      onFocusFairy?.();
      return;
    }
    if (gardenFeature(entryFeature)?.id !== 'garden') setOpenFeature(gardenFeature(entryFeature)?.id);
    router.setParams({ feature: undefined });
  }, [entryFeature, onFocusFairy]);
  if (activeMode !== 'normal' || selectedFlower) return null;
  const navigationItem = (feature: typeof GARDEN_FEATURES[number]) => {
    const selected = openFeature === feature.id || (feature.id === 'profile' && openFeature === 'settings') || (feature.id === 'garden' && !openFeature);
    return <Pressable key={feature.id} accessibilityRole="button"
      accessibilityLabel={`${feature.label}, ${feature.status}${feature.id === 'fairy' && fairyDot ? ', something new' : ''}`} accessibilityState={{ selected }} testID={`hud-${feature.id}`}
      onHoverIn={() => setHighlightedFeature(feature.id)} onHoverOut={() => setHighlightedFeature(undefined)}
      onFocus={() => setHighlightedFeature(feature.id)} onBlur={() => setHighlightedFeature(undefined)}
      onPress={() => {
        if (feature.id === 'fairy') {
          setOpenFeature(undefined);
          // Her runtime is fetched as the Garden opens; if that failed (the API still waking),
          // ask again so Fairy Moments joins the card when the answer arrives.
          if (!runtime) void refreshFairyRuntime();
          // Fairy Moments always has a tile (locked until available), so the card always opens.
          setEntryOpen(true); setEntryOpens(count => count + 1);
        } else setOpenFeature(feature.id === 'garden' ? undefined : feature.id);
      }}
      style={({ pressed }) => [styles.bottomItem,
        (selected || highlightedFeature === feature.id) && [styles.selected, { backgroundColor: light ? '#D6E5DCD9' : theme.input, borderColor: theme.gold }],
        pressed && styles.pressed]}>
      <View>
        <SidebarIllustration id={feature.id} size={iconSize} active={selected || highlightedFeature === feature.id} />
        {feature.id === 'fairy' && fairyDot ? <View style={[styles.unread, { borderColor: theme.background }]} /> : null}
      </View>
      <Text numberOfLines={1} style={[styles.label, styles.bottomLabel, { fontSize: phone ? 13 : 15, color: theme.text }]}>
        {feature.id === 'events' ? 'Events' : feature.id === 'profile' ? 'Me' : feature.label}
      </Text>
    </Pressable>;
  };
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
    <View testID="main-navigation" style={[styles.bottomBar, {
      width: Math.min(phone ? 460 : Math.max(380, Math.min(460, width * .36)), width - insets.left - insets.right - 40),
      bottom: insets.bottom + (phone ? 8 : 24), padding: phone ? 3 : 4, gap: phone ? 3 : 5,
      borderRadius: phone ? 24 : 26, backgroundColor: theme.background, borderColor: theme.gold,
    }]}>
      {GARDEN_FEATURES.filter(feature => ['garden', 'events', 'friends', 'fairy', 'profile'].includes(feature.id)).map(navigationItem)}
    </View>
    <View style={[styles.info, { top: insets.top + 8, left: insets.left + 8, maxWidth: Math.max(100, width - insets.left - insets.right - 100) }]}>
      {isGardenLoading ? <ActivityIndicator accessibilityLabel="Loading Garden" size="small" color="#365b42" /> : null}
      {gardenError ? <><Text accessibilityRole="alert" style={styles.label}>{gardenError}</Text>
        <Pressable accessibilityRole="button" onPress={() => void refreshGarden()}><Text style={styles.label}>Try again</Text></Pressable></> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/garden-history' as Href)}>
        <Text style={styles.label}>Garden history</Text>
      </Pressable>
    </View>
    {notice ? <Pressable key={notice.key} testID="visit-notice" accessibilityRole="alert" accessibilityLiveRegion="polite"
      onPress={() => setNotice(null)} style={[styles.notice, { top: insets.top + 60, backgroundColor: theme.background, borderColor: theme.gold }]}>
      <UserAvatar avatar={notice.avatar} size={30} />
      <Text style={[styles.noticeText, { color: theme.text }]}>{notice.text}</Text>
    </Pressable> : null}
    <FairyEntryCard visible={entryOpen} locale={locale} closeness={closeness.summary} closenessOn={closeness.on === true}
      momentsOn={moments.enabled} momentsUnread={moments.unread} onClose={() => setEntryOpen(false)}
      onOpenMoments={() => { setEntryOpen(false); setMomentsOpen(true); markFairyMomentsRead(); }}
      onOpenBond={() => { setEntryOpen(false); setBondOpen(true); setEntryOpens(count => count + 1); }} />
    <OurBondPanel visible={bondOpen} locale={locale} summary={closeness.summary} loading={closeness.on === null}
      onClose={() => setBondOpen(false)} />
    <FairyMomentsPanel visible={momentsOpen} onClose={() => setMomentsOpen(false)}
      onFindFairy={() => { setMomentsOpen(false); onFocusFairy?.(); }} />
    <FeatureOverlay feature={gardenFeature(openFeature)} onClose={() => setOpenFeature(undefined)} onGardenChanged={refreshGarden} onOpenSettings={() => setOpenFeature('settings')} />
  </View>;
}
const styles = StyleSheet.create({
  // Web gives every view z-index 0, so the Garden's own overlays (her speech bubble and treehouse
  // hint at 25, zoom and fairy buttons at 30) would otherwise cover the navigation when the camera
  // brings them to the bottom. The layer itself lets taps through (box-none).
  layer: { zIndex: 40 },
  bottomBar: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', padding: 5, gap: 4,
    borderRadius: 26, backgroundColor: '#FAF5E8F5', borderWidth: 1, borderColor: '#D4BD85',
    boxShadow: '0 3px 12px #163D4020' },
  bottomItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 21, padding: 2, minHeight: 52, borderWidth: 1, borderColor: 'transparent' },
  bottomLabel: { fontFamily: 'serif', fontSize: 13, lineHeight: 17, color: '#254E46' },
  selected: { backgroundColor: '#D6E5DCD9', borderColor: '#C6A164' },
  label: { color: FEATURE_COLORS.ink, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: .7, transform: [{ scale: .96 }] },
  unread: { position: 'absolute', top: 0, right: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, backgroundColor: '#E5735F' },
  notice: { position: 'absolute', alignSelf: 'center', maxWidth: 340, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, boxShadow: '0 3px 12px #163D4030' },
  noticeText: { fontFamily: 'serif', fontSize: 14, lineHeight: 19, flexShrink: 1 },
  info: { position: 'absolute', alignSelf: 'center', gap: 5, maxWidth: 220,
    borderRadius: 14, padding: 8, backgroundColor: '#fffaf0e8' },
});
