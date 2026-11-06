import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../services/auth';
import { claimAvatarReward, rewardFor, useAvatarCollection, type AvatarCollection as Collection } from '../../services/avatars';
import { markAvatarsSeen, useCollectionAlertsSnapshot } from '../../services/collectionAlerts';
import type { BondLocale } from '../bond/bondCopy';
import { usePanelTheme, type PanelTheme } from '../features/PanelTheme';
import { AVATAR_ART, AVATAR_TIERS, avatarTier, type AvatarTier } from './avatarArt';
import { avatarCopy } from './avatarCopy';

type TileState = 'equipped' | 'owned' | 'available' | 'locked';
export function tileState(id: string, collection: Collection, equipped: string | undefined): TileState {
  if (id === equipped && collection.owned.includes(id)) return 'equipped';
  if (collection.owned.includes(id)) return 'owned';
  const tier = AVATAR_TIERS.find(entry => entry.ids.includes(id))!;
  return tier.tier === 1 || (collection.level ?? 0) >= tier.unlockLevel ? 'available' : 'locked';
}

// Unlocked avatars appear first in each tab: Equipped (Wearing) -> Owned (Yours) -> Unowned (To unlock / Level-locked).
export function sortTierAvatars(ids: string[], collection: Collection | null, equipped: string | undefined): string[] {
  if (!collection) return ids;
  const indexMap = new Map(ids.map((id, index) => [id, index]));
  return [...ids].sort((a, b) => {
    const stateA = tileState(a, collection, equipped);
    const stateB = tileState(b, collection, equipped);
    const rank = (state: TileState) => {
      if (state === 'equipped') return 0;
      if (state === 'owned') return 1;
      return 2;
    };
    const diff = rank(stateA) - rank(stateB);
    if (diff !== 0) return diff;
    return (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0);
  });
}

// The avatar collection: three tiers as tabs (Level 1 from the start, Level 2 from Fairy Bond Lv 6,
// Level 3 from Lv 14), each avatar marked wearing / yours / to unlock / locked by level. Owned
// avatars are worn with a tap; a waiting Fairy Bond reward lets the owner pick one avatar to unlock.
// Higher tiers can be looked at before their level. Claiming never changes the avatar worn.
// Opened from Collection, Me or Our Bond alike: the avatars given at sign-up read New, and closing it
// counts as having seen them and any reward waiting (Collection's red dot goes out).
export function AvatarCollection({ visible, locale, onClose }: { visible: boolean; locale: BondLocale; onClose: () => void }) {
  const newIds = useCollectionAlertsSnapshot().newAvatars;
  const wasVisible = useRef(false);
  useEffect(() => { if (wasVisible.current && !visible) markAvatarsSeen(); wasVisible.current = visible; }, [visible]);
  const copy = avatarCopy(locale);
  const { theme, light } = usePanelTheme();
  const styles = useMemo(() => makeStyles(theme, light), [theme, light]);
  const { session, updateAvatar } = useAuth();
  const { collection, failed, error, retry } = useAvatarCollection(visible);
  const [tab, setTab] = useState<AvatarTier>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const bloom = useRef(new Animated.Value(0)).current;
  const equipped = session?.user.avatar ?? collection?.equipped;
  const firstReady = collection?.pending.find(reward => reward.eligible > 0);

  // Each visit starts on the first tier; a waiting reward is shown at the top.
  useEffect(() => { if (visible) { setTab(1); setSelected(null); setNote(''); setUnlocked(null); } }, [visible]);
  useEffect(() => {
    if (!unlocked) return;
    bloom.setValue(0);
    Animated.spring(bloom, { toValue: 1, friction: 6, tension: 55, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [bloom, unlocked]);

  const selectedReward = collection && selected ? rewardFor(collection.pending, avatarTier(selected)) : undefined;
  const tier = AVATAR_TIERS.find(entry => entry.tier === tab)!;
  const tierInfo = collection?.tiers.find(entry => entry.tier === tab);
  const sortedIds = useMemo(() => sortTierAvatars(tier.ids, collection, equipped), [tier.ids, collection, equipped]);

  async function wear(id: string) {
    if (busy) return;
    setBusy(true); setNote('');
    try { await updateAvatar(id); } catch { setNote(copy.wearFailed); } finally { setBusy(false); }
  }
  async function claim() {
    if (!selected || !selectedReward || busy) return;
    setBusy(true); setNote('');
    try {
      await claimAvatarReward(selectedReward.level, selected);
      setUnlocked(selected); setSelected(null);
    } catch { setNote(copy.claimFailed); } finally { setBusy(false); }
  }
  function press(id: string, state: TileState) {
    if (!collection || busy || state === 'locked') return;
    setNote('');
    if (state === 'owned') { void wear(id); return; }
    if (state === 'available') {
      if (rewardFor(collection.pending, avatarTier(id))) setSelected(current => (current === id ? null : id));
      else setNote(collection.bondOn ? copy.noReward(collection.nextRewardLevel) : copy.bondOff);
      return;
    }
  }

  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal accessibilityLabel={copy.title} style={styles.sheet}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
          {collection ? <Text style={styles.count}>{copy.owned(collection.owned.length, collection.total)}</Text> : null}
        </View>
        {!collection ? <View style={styles.status}>
          {failed ? <View style={styles.errorBox}>
            <Text style={styles.muted}>{copy.error}</Text>
            {error?.message ? <Text style={styles.errorDetail} numberOfLines={2}>({error.message})</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={copy.retry} onPress={() => retry()}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed, styles.focus]}>
              <Text style={styles.retryText}>{copy.retry}</Text>
            </Pressable>
          </View> : <ActivityIndicator color={theme.gold} accessibilityLabel={copy.loading} />}
        </View> : <>
          {firstReady ? <View style={styles.banner}>
            <Text style={styles.bannerTitle}>✿ {copy.rewardBanner(selectedReward?.level ?? firstReady.level)}</Text>
            <Text style={styles.bannerText}>{copy.rewardTiers((selectedReward ?? firstReady).tier)}{collection.ready > 1 ? ` · ${copy.moreRewards(collection.ready - 1)}` : ''}</Text>
            {!selected ? <Text style={styles.bannerHint}>{copy.pickHint}</Text> : null}
          </View> : null}

          <View accessibilityRole="tablist" style={styles.tabs}>
            {AVATAR_TIERS.map(entry => {
              const active = entry.tier === tab;
              const info = collection.tiers.find(item => item.tier === entry.tier);
              const ownedHere = entry.ids.filter(id => collection.owned.includes(id)).length;
              // "!" marks a tab holding an avatar that a waiting Fairy Bond reward can choose now.
              const choosable = ownedHere < entry.ids.length && Boolean(rewardFor(collection.pending, entry.tier));
              return <Pressable key={entry.tier} testID={`avatar-tab-${entry.tier}`} accessibilityRole="tab" accessibilityState={{ selected: active }}
                accessibilityLabel={`${copy.tiers[entry.tier].name}, ${copy.tiers[entry.tier].note}${choosable ? `, ${copy.entryPending(1)}` : ''}`}
                onPress={() => { setTab(entry.tier); setNote(''); }} style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed, styles.focus]}>
                <Text style={[styles.tabName, active && styles.tabNameActive]}>{copy.tiers[entry.tier].name}</Text>
                <Text style={styles.tabCount}>{info && !info.unlocked && entry.tier > 1 ? `Lv ${entry.unlockLevel}` : `${ownedHere} / ${entry.ids.length}`}</Text>
                {choosable ? <Text testID={`avatar-tab-${entry.tier}-alert`} style={styles.tabAlert}>!</Text> : null}
              </Pressable>;
            })}
          </View>
          <Text style={styles.tierNote}>{copy.tiers[tab].note}{tierInfo && !tierInfo.unlocked && tab > 1 ? ` · ${copy.tierLocked(tier.unlockLevel)}` : ''}</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
            {sortedIds.map((id, index) => {
              const state = tileState(id, collection, equipped);
              const isUnowned = state !== 'equipped' && state !== 'owned';
              const chosen = selected === id;
              const canPick = state === 'available' && Boolean(rewardFor(collection.pending, tab));
              const label = state === 'locked' ? copy.stateLabel.locked(tier.unlockLevel) : copy.stateLabel[state];
              const disabled = busy || state === 'locked';
              const isNew = !isUnowned && newIds.includes(id);
              return <Pressable key={id} testID={isNew ? `avatar-new-${id}` : undefined} accessibilityRole="button"
                accessibilityLabel={`${copy.avatar(index + 1, tab)}, ${label}${isNew ? `, ${copy.isNew}` : ''}`}
                accessibilityState={{ selected: chosen || state === 'equipped', disabled }} disabled={disabled} onPress={() => press(id, state)}
                style={({ pressed }) => [styles.cell, pressed && !disabled && styles.pressed, styles.focus]}>
                <View style={[styles.ring, state === 'equipped' && styles.ringEquipped, state === 'owned' && styles.ringOwned,
                  canPick && styles.ringAvailable, chosen && styles.ringChosen]}>
                  <Image source={AVATAR_ART[id]} style={[styles.art, isUnowned && styles.artUnowned, chosen && styles.artChosen]} accessibilityIgnoresInvertColors />
                  {isUnowned && !chosen ? <View style={styles.veil} /> : null}
                </View>
                {isNew ? <Text style={styles.newTag}>{copy.isNew}</Text> : null}
                <Text numberOfLines={1} style={[styles.state, state === 'equipped' && styles.stateEquipped, state === 'owned' && styles.stateOwned, canPick && styles.stateAvailable]}>
                  {state === 'locked' ? copy.states.locked(tier.unlockLevel) : copy.states[state]}
                </Text>
              </Pressable>;
            })}
          </ScrollView>

          {note ? <Text accessibilityLiveRegion="polite" style={styles.note}>{note}</Text> : null}
          {selected && selectedReward ? <View style={styles.confirmRow}>
            <Image source={AVATAR_ART[selected]} style={styles.confirmArt} accessibilityIgnoresInvertColors />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void claim()} style={({ pressed }) => [styles.confirm, pressed && styles.pressed, styles.focus]}>
              {busy ? <ActivityIndicator color={theme.background} accessibilityLabel={copy.unlocking} /> : <Text style={styles.confirmText}>{copy.confirm}</Text>}
            </Pressable>
          </View> : null}
        </>}

        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={[styles.close, styles.focus]}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>

        {unlocked ? <View style={styles.unlockLayer}>
          <View accessibilityViewIsModal style={styles.unlockCard}>
            <Animated.View style={[styles.halo, { opacity: bloom, transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }]}>
              <Image source={AVATAR_ART[unlocked]} style={styles.unlockArt} accessibilityIgnoresInvertColors />
            </Animated.View>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.unlockTitle}>{copy.unlocked}</Text>
            <Text style={styles.muted}>{copy.unlockedHint}</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { const id = unlocked; setUnlocked(null); void wear(id); }}
              style={({ pressed }) => [styles.confirm, styles.stretch, pressed && styles.pressed, styles.focus]}>
              <Text style={styles.confirmText}>{copy.wearNow}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setUnlocked(null)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed, styles.focus]}>
              <Text style={styles.secondaryText}>{copy.keepBrowsing}</Text>
            </Pressable>
          </View>
        </View> : null}
      </View>
    </View>
  </Modal>;
}

const TILE = 70;
function makeStyles(theme: PanelTheme, light: boolean) {
  const hair = `${theme.gold}73`;
  const goldText = light ? '#7E5F25' : theme.gold;
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#0B1F1B99' },
    sheet: { width: '100%', maxWidth: 460, maxHeight: '94%', borderRadius: 26, overflow: 'hidden', paddingTop: 20, paddingBottom: 14,
      backgroundColor: theme.background, borderWidth: 1, borderColor: hair },
    head: { alignItems: 'center', paddingHorizontal: 56 },
    title: { fontFamily: 'serif', fontSize: 28, color: theme.text, textAlign: 'center' },
    count: { fontFamily: 'serif', fontStyle: 'italic', fontSize: 14, color: theme.muted, marginTop: 2 },
    status: { padding: 32, alignItems: 'center' },
    muted: { fontSize: 13, color: theme.muted, textAlign: 'center' },
    errorBox: { alignItems: 'center', gap: 10 },
    errorDetail: { fontSize: 11, color: theme.muted, textAlign: 'center', marginTop: 2, paddingHorizontal: 12 },
    retry: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.surface },
    retryText: { fontFamily: 'serif', fontSize: 14, color: theme.text },
    banner: { marginHorizontal: 18, marginTop: 14, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: theme.gold, backgroundColor: `${theme.gold}1F` },
    bannerTitle: { fontFamily: 'serif', fontSize: 16, color: theme.text, textAlign: 'center' },
    bannerText: { fontSize: 12, color: theme.muted, textAlign: 'center', marginTop: 2 },
    bannerHint: { fontFamily: 'serif', fontStyle: 'italic', fontSize: 13, color: goldText, textAlign: 'center', marginTop: 4 },
    tabs: { flexDirection: 'row', gap: 6, marginHorizontal: 18, marginTop: 14 },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: hair },
    tabActive: { backgroundColor: theme.surface, borderColor: theme.gold },
    tabName: { fontFamily: 'serif', fontSize: 15, color: theme.muted },
    tabNameActive: { color: theme.text },
    newTag: { position: 'absolute', top: 0, left: 2, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
      fontSize: 10, fontWeight: '600', color: '#FFFFFF', backgroundColor: '#7E62AE' },
    tabAlert: { position: 'absolute', top: -6, right: -2, overflow: 'hidden', width: 18, height: 18, borderRadius: 9, textAlign: 'center', lineHeight: 18,
      fontSize: 12, fontWeight: '700', color: '#FFFFFF', backgroundColor: '#E2554B' },
    tabCount: { fontSize: 10, letterSpacing: 1, color: theme.muted, marginTop: 1 },
    tierNote: { fontFamily: 'serif', fontStyle: 'italic', fontSize: 13, color: theme.muted, textAlign: 'center', marginTop: 8, marginHorizontal: 18 },
    scroll: { flexShrink: 1, marginTop: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 10 },
    cell: { width: TILE + 12, alignItems: 'center', gap: 4, paddingVertical: 2 },
    ring: { width: TILE + 8, height: TILE + 8, borderRadius: (TILE + 8) / 2, padding: 3, borderWidth: 1.5, borderColor: 'transparent' },
    ringOwned: { borderColor: hair },
    ringEquipped: { borderWidth: 3, borderColor: theme.gold, padding: 1.5 },
    ringAvailable: { borderStyle: 'dashed', borderColor: theme.gold },
    ringChosen: { borderStyle: 'solid', borderWidth: 3, padding: 1.5, borderColor: theme.text, transform: [{ scale: 1.05 }] },
    art: { width: '100%', height: '100%', borderRadius: TILE / 2 },
    artUnowned: {
      opacity: 0.45,
      ...(Platform.OS === 'web' ? { filter: 'grayscale(100%) brightness(0.85) contrast(0.92)' } : {}),
    },
    artChosen: {
      opacity: 1,
      ...(Platform.OS === 'web' ? { filter: 'none' } : {}),
    },
    veil: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: TILE / 2, backgroundColor: `${theme.background}55` },
    state: { fontSize: 9.5, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: theme.muted },
    stateEquipped: { color: goldText },
    stateOwned: { color: theme.text },
    stateAvailable: { color: goldText },
    note: { fontFamily: 'serif', fontStyle: 'italic', fontSize: 14, color: theme.muted, textAlign: 'center', marginHorizontal: 22, marginTop: 4 },
    confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 18, marginTop: 8 },
    confirmArt: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.gold },
    confirm: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: theme.gold },
    confirmText: { fontFamily: 'serif', fontSize: 16, color: light ? '#1E3A33' : theme.background },
    stretch: { alignSelf: 'stretch', flex: 0, marginTop: 10 },
    secondary: { alignSelf: 'stretch', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: hair, marginTop: 8 },
    secondaryText: { fontFamily: 'serif', fontSize: 15, color: theme.text },
    close: { position: 'absolute', top: 12, right: 12, zIndex: 2, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.gold },
    closeText: { fontSize: 22, lineHeight: 26, color: theme.text },
    unlockLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: `${theme.background}E6` },
    unlockCard: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 6, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.surface },
    halo: { width: 176, height: 176, borderRadius: 88, alignItems: 'center', justifyContent: 'center', backgroundColor: `${theme.gold}2B`, borderWidth: 1, borderColor: hair, marginBottom: 6 },
    unlockArt: { width: 150, height: 150, borderRadius: 75 },
    unlockTitle: { fontFamily: 'serif', fontSize: 22, color: theme.text, textAlign: 'center' },
    pressed: { opacity: 0.8 },
    focus: Platform.OS === 'web' ? { outlineColor: light ? '#416651' : '#D6C58B' } : {},
  });
}
