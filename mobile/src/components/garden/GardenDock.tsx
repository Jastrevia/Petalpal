import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadPetalToday, usePetalToday, type PetalToday } from '../../services/petalCardDraw';
import { usePanelTheme } from '../features/PanelTheme';
import { useUnreadMail } from '../mailbox/mailboxReadState';
import { PetalRing } from '../petalCards/PetalRing';

// Under the calendar, against the right edge: single painted icons, no bar around them (the bar at
// the bottom keeps Events, Friends, Fairy and Me). From the top: Petal Tarot, Pet, Letters.
const TAROT = require('@/assets/garden-dock/petal-tarot.webp');
const PET = require('@/assets/garden-dock/pet.webp');
const LETTER = require('@/assets/keepsakes/pressed-flower-envelope.webp');
const COPY = {
  en: { tarot: 'Petal Tarot', pet: 'Pet', letters: 'Letters', tarotUsed: 'Petal Tarot, 1 of 1 used today', unread: ', unread',
    soonTitle: 'Your pet is on the way', soon: 'A little friend will settle in here soon.', close: 'Close' },
  'zh-Hans': { tarot: '花语塔罗', pet: '宠物', letters: '信箱', tarotUsed: '花语塔罗，今天的 1/1 次已用完', unread: '，有未读',
    soonTitle: '小宠物正在路上', soon: '很快就会有一位小伙伴住进这里。', close: '关闭' },
};
const FRESH_MS = 1500;

export function GardenDock({ chinese }: { chinese: boolean }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { theme } = usePanelTheme();
  const copy = COPY[chinese ? 'zh-Hans' : 'en'];
  const unreadMail = useUnreadMail();
  const [opens, setOpens] = useState(0);
  const petal = usePetalToday(opens);
  const [ring, setRing] = useState<PetalToday | null>(null);
  const [petOpen, setPetOpen] = useState(false);
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
  const size = short ? 40 : Math.min(58, Math.max(46, width * .135));
  const drawn = Boolean(petal?.drawn);
  const item = (id: string, image: ImageSourcePropType, label: string, a11y: string, onPress: () => void, dot = false, note?: string) =>
    <Pressable key={id} testID={`dock-${id}`} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress}
      style={({ pressed }) => [styles.item, { width: Math.max(62, size + 10) }, pressed && styles.pressed]}>
      <View>
        <Image accessible={false} source={image} resizeMode="contain" style={{ width: size, height: size }} />
        {dot ? <View testID={`dock-${id}-dot`} style={[styles.dot, { borderColor: theme.background }]} /> : null}
      </View>
      <Text numberOfLines={1} style={[styles.label, { fontSize: short ? 10 : 11 }]}>{label}{note ? ` ${note}` : ''}</Text>
    </Pressable>;
  return <>
    <View testID="garden-dock" pointerEvents="box-none" style={[styles.dock, { top: insets.top + 78, right: insets.right + 8, gap: short ? 0 : 4 }]}>
      {/* Hidden while the server's petal card switch leaves this owner out. */}
      {petal ? item('tarot', TAROT, copy.tarot, drawn ? copy.tarotUsed : copy.tarot, () => void openRing(), false, drawn ? '1/1' : undefined) : null}
      {item('pet', PET, copy.pet, copy.pet, () => setPetOpen(true))}
      {item('letters', LETTER, copy.letters, `${copy.letters}${unreadMail ? copy.unread : ''}`, () => router.push('/mailbox'), unreadMail)}
    </View>
    {ring ? <PetalRing visible today={ring} onClose={() => { setRing(null); setOpens(count => count + 1); }} /> : null}
    {petOpen ? <Modal transparent visible animationType="fade" onRequestClose={() => setPetOpen(false)} statusBarTranslucent>
      <View style={styles.scrim}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={() => setPetOpen(false)} style={StyleSheet.absoluteFill} />
        <View testID="pet-soon" accessibilityViewIsModal style={[styles.card, { backgroundColor: theme.background, borderColor: theme.gold }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.close} hitSlop={8} onPress={() => setPetOpen(false)} style={styles.close}>
            <Text style={[styles.closeText, { color: theme.text }]}>×</Text>
          </Pressable>
          <Image accessible={false} source={PET} resizeMode="contain" style={styles.petArt} />
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{copy.soonTitle}</Text>
          <Text style={[styles.body, { color: theme.muted }]}>{copy.soon}</Text>
        </View>
      </View>
    </Modal> : null}
  </>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', alignItems: 'center' },
  item: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: .7, transform: [{ scale: .94 }] },
  label: { fontFamily: 'serif', lineHeight: 14, color: '#FFF8E4', textShadowColor: '#0B241FE6', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  dot: { position: 'absolute', top: 0, right: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, backgroundColor: '#E5735F' },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0A1A1799' },
  card: { width: '100%', maxWidth: 320, alignItems: 'center', gap: 8, padding: 22, borderRadius: 22, borderWidth: 1.5 },
  close: { position: 'absolute', top: 6, right: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24, lineHeight: 28 },
  petArt: { width: 120, height: 120 },
  title: { fontFamily: 'serif', fontSize: 19, textAlign: 'center' },
  body: { fontFamily: 'serif', fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
