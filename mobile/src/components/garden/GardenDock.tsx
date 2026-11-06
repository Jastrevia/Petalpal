import { router } from 'expo-router';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCollectionAlerts } from '../../services/collectionAlerts';
import { useNewcomerGlow } from '../../services/newcomerTime';
import { loadPetalToday, usePetalToday, type PetalToday } from '../../services/petalCardDraw';
import { COLLECTION_COPY, CollectionPanel } from '../collection/CollectionPanel';
import { onKeepsakeLanded, registerCollectionIcon } from '../collection/collectionTarget';
import { AttentionGlow } from '../features/AttentionGlow';
import { useUnreadMail } from '../mailbox/mailboxReadState';
import { PetalRing } from '../petalCards/PetalRing';

// Under the calendar, against the right edge: single painted icons, no bar around them (the bar at
// the bottom keeps Events, Friends, Fairy and Me). From the top: Petal Tarot, Letters, Collection.
// A gold halo marks one with something waiting: today's card not drawn, an unread letter, a new
// keepsake or avatar (Collection also shows the bottom bar's red dot). For an owner's first half
// hour in the app (counted over every visit) the halo is bright and never settles, so the icons
// cannot be missed; after that it is the soft one.
const TAROT = require('@/assets/garden-dock/petal-tarot.webp');
const LETTER = require('@/assets/keepsakes/pressed-flower-envelope.webp');
const CASKET = require('@/assets/garden-dock/collection-casket.webp');
const COPY = {
  en: { tarot: 'Petal Tarot', letters: 'Letters', tarotUsed: 'Petal Tarot, 1 of 1 used today', unread: ', unread' },
  'zh-Hans': { tarot: '花语塔罗', letters: '信箱', tarotUsed: '花语塔罗，今天的 1/1 次已用完', unread: '，有未读' },
};
const FRESH_MS = 1500;

export function GardenDock({ chinese, ownerId }: { chinese: boolean; ownerId?: string }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const copy = COPY[chinese ? 'zh-Hans' : 'en'], collectionCopy = COLLECTION_COPY[chinese ? 'zh-Hans' : 'en'];
  const unreadMail = useUnreadMail();
  const newcomer = useNewcomerGlow(ownerId);
  const alerts = useCollectionAlerts(ownerId);
  const collectionDot = alerts.keepsakes || alerts.avatars;
  const [collectionOpen, setCollectionOpen] = useState(false);
  const casketRef = useRef<View>(null);
  useEffect(() => (ownerId ? registerCollectionIcon(casketRef) : undefined), [ownerId]);
  // A keepsake flying in from the check-in reveal: the casket takes it with a small bounce.
  const bounce = useRef(new Animated.Value(1)).current;
  useEffect(() => onKeepsakeLanded(() => {
    const native = Platform.OS !== 'web';
    Animated.sequence([
      Animated.timing(bounce, { toValue: 1.28, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.spring(bounce, { toValue: 1, friction: 4, tension: 120, useNativeDriver: native }),
    ]).start();
  }), [bounce]);
  const [opens, setOpens] = useState(0);
  const petal = usePetalToday(opens);
  const [ring, setRing] = useState<PetalToday | null>(null);
  const opening = useRef(false);
  // A day may have turned since the Garden opened: look again, but never keep a tap waiting long.
  async function openRing() {
    if (opening.current || !petal) return;
    opening.current = true;
    const fresh = await Promise.race([loadPetalToday().catch(() => null), new Promise<null>(resolve => setTimeout(() => resolve(null), FRESH_MS))]);
    opening.current = false;
    setRing(fresh ?? petal);
  }
  const short = height < 500;
  // The same size as the bottom bar's icons, so the Garden stays in view.
  const phone = width < 600 || (width < 900 && short);
  const size = phone ? Math.max(28, Math.min(short ? 30 : 38, (width - insets.left - insets.right) / 10)) : 42;
  const drawn = Boolean(petal?.drawn);
  const item = (id: string, image: ImageSourcePropType, label: string, a11y: string, onPress: () => void, waiting = false, note?: string, dot = false,
    ref?: RefObject<View | null>) =>
    <Pressable key={id} testID={`dock-${id}`} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Animated.View ref={ref} collapsable={false} style={ref ? { transform: [{ scale: bounce }] } : undefined}>
        <Image accessible={false} source={image} resizeMode="contain" style={{ width: size, height: size }} />
        {waiting ? <AttentionGlow key={newcomer ? 'bright' : 'soft'} soft={!newcomer} bright={newcomer} radius={size / 2} spread={newcomer ? 12 : 8} /> : null}
        {dot ? <View testID={`dock-${id}-dot`} style={styles.dot} /> : null}
      </Animated.View>
      <Text numberOfLines={1} style={styles.label}>{label}{note ? ` ${note}` : ''}</Text>
    </Pressable>;
  return <>
    <View testID="garden-dock" pointerEvents="box-none" style={[styles.dock, { top: insets.top + 78, right: insets.right + 4 }]}>
      {/* Hidden while the server's petal card switch leaves this owner out. */}
      {petal ? item('tarot', TAROT, copy.tarot, drawn ? copy.tarotUsed : copy.tarot, () => void openRing(), !drawn, drawn ? '1/1' : undefined) : null}
      {item('letters', LETTER, copy.letters, `${copy.letters}${unreadMail ? copy.unread : ''}`, () => router.push('/mailbox'), unreadMail)}
      {ownerId ? item('collection', CASKET, collectionCopy.dock, `${collectionCopy.dock}${collectionDot ? collectionCopy.waiting : ''}`,
        () => setCollectionOpen(true), collectionDot, undefined, collectionDot, casketRef) : null}
    </View>
    {ownerId ? <CollectionPanel visible={collectionOpen} locale={chinese ? 'zh-Hans' : 'en'} alerts={alerts} onClose={() => setCollectionOpen(false)} /> : null}
    {ring ? <PetalRing visible today={ring} onClose={() => { setRing(null); setOpens(count => count + 1); }} /> : null}
  </>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', alignItems: 'center' },
  item: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: .7, transform: [{ scale: .94 }] },
  dot: { position: 'absolute', top: -1, right: -3, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#FBE3D6', backgroundColor: '#E5735F' },
  label: { fontFamily: 'serif', fontSize: 10, lineHeight: 13, color: '#FFF8E4', textShadowColor: '#0B241FE6', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
