import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAvatarCollection } from '../../services/avatars';
import { markKeepsakesSeen, type CollectionAlerts } from '../../services/collectionAlerts';
import { useClosenessSummary } from '../../services/fairyCloseness';
import { AvatarCollection } from '../avatars/AvatarCollection';
import { AVATAR_ART } from '../avatars/avatarArt';
import { KeepsakeBook } from '../bond/KeepsakeBook';
import { keepsakeArt } from '../bond/keepsakeArt';
import type { BondLocale } from '../bond/bondCopy';
import { usePanelTheme, type PanelTheme } from '../features/PanelTheme';
import { PET_IMAGES, PetWardrobeCollection, usePetsSummary, WARDROBE_COPY, wardrobeCount } from './PetWardrobeCollection';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';

// Collection (收藏), opened from the Garden dock under Letters: the keepsakes her check-ins give
// and the avatar collection, moved here from Our Bond (owner, 2026-11-06). Today's new keepsakes
// read "New" until the owner has opened the keepsake book; an avatar reward that can be chosen
// shows "!", and the three avatars given at sign-up read "New", until the owner has looked at the
// avatars (choosing is not required).
const CASKET = require('@/assets/garden-dock/collection-casket.webp');
const KEEPSAKE_THUMBS = ['crocus-brooch', 'acorn-teacup', 'dewdrop'];
const AVATAR_THUMBS = ['fairy-1', 'l1-02', 'l1-05'];
const MEDALLION = '#EAE8D7';
export const COLLECTION_COPY = {
  en: { title: 'Collection', close: 'Close', keepsakes: 'Keepsakes', avatars: 'Avatars', isNew: 'New', newToday: (n: number) => `${n} new today`,
    ready: 'An avatar is ready to choose', gifted: (n: number) => `${n} new, a welcome gift`, count: (owned: number, total: number) => `${owned} / ${total}`, dock: 'Collection', waiting: ', something new' },
  'zh-Hans': { title: '收藏', close: '关闭', keepsakes: '信物', avatars: '头像', isNew: '新', newToday: (n: number) => `今天新得 ${n} 个`,
    ready: '有一个头像可以选了', gifted: (n: number) => `新得 ${n} 个，见面礼`, count: (owned: number, total: number) => `${owned} / ${total}`, dock: '收藏', waiting: '，有新东西' },
};

export function CollectionPanel({ visible, locale, alerts, onClose }: { visible: boolean; locale: BondLocale; alerts: CollectionAlerts; onClose: () => void }) {
  const copy = COLLECTION_COPY[locale];
  const { theme, light } = usePanelTheme();
  const styles = useMemo(() => makeStyles(theme), [theme, light]);
  const [bookOpen, setBookOpen] = useState(false);
  const [avatarsOpen, setAvatarsOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const { pets } = usePetsSummary(visible);
  const wardrobe = wardrobeCount(pets, locale), wardrobeWords = WARDROBE_COPY[locale];
  const { summary } = useClosenessSummary(visible);
  const { collection: avatars } = useAvatarCollection(visible);
  const keepsakesOn = Boolean(summary);
  const ownedAvatars = alerts.newAvatars.length ? alerts.newAvatars.slice(0, 3) : avatars?.owned.length ? avatars.owned.slice(-3) : AVATAR_THUMBS;
  const avatarNote = alerts.reward ? copy.ready : alerts.newAvatars.length ? copy.gifted(alerts.newAvatars.length) : null;

  return <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal accessibilityLabel={copy.title} style={styles.sheet} testID="collection-panel">
        <Image source={CASKET} style={styles.casket} resizeMode="contain" accessible={false} />
        <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>

        {keepsakesOn ? <Pressable testID="collection-keepsakes" accessibilityRole="button"
          accessibilityLabel={`${copy.keepsakes}, ${copy.count(summary!.collection.owned, summary!.collection.total)}${alerts.keepsakes ? `, ${copy.newToday(alerts.newKeepsakes.length)}` : ''}`}
          onPress={() => setBookOpen(true)} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
          <View style={styles.thumbs}>
            {(alerts.keepsakes ? alerts.newKeepsakes.slice(0, 3) : KEEPSAKE_THUMBS).map((id, index) => keepsakeArt(id)
              ? <Image key={id} source={keepsakeArt(id)!} style={[styles.thumb, index > 0 && styles.overlap]} resizeMode="cover" accessible={false} /> : null)}
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>{copy.keepsakes}</Text>
            <Text style={styles.small}>{alerts.keepsakes ? copy.newToday(alerts.newKeepsakes.length) : copy.count(summary!.collection.owned, summary!.collection.total)}</Text>
          </View>
          {alerts.keepsakes ? <Text testID="collection-keepsakes-new" style={styles.newBadge}>{copy.isNew}</Text> : <Text style={styles.chevron}>›</Text>}
        </Pressable> : null}

        <Pressable testID="collection-avatars" accessibilityRole="button"
          accessibilityLabel={`${copy.avatars}${avatars ? `, ${copy.count(avatars.owned.length, avatars.total)}` : ''}${avatarNote ? `, ${avatarNote}` : ''}`}
          onPress={() => setAvatarsOpen(true)} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
          <View style={styles.thumbs}>
            {ownedAvatars.map((id, index) => AVATAR_ART[id]
              ? <Image key={id} source={AVATAR_ART[id]} style={[styles.thumb, index > 0 && styles.overlap]} resizeMode="cover" accessible={false} /> : null)}
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>{copy.avatars}</Text>
            <Text style={styles.small}>{avatarNote ?? (avatars ? copy.count(avatars.owned.length, avatars.total) : '')}</Text>
          </View>
          {alerts.reward ? <Text testID="collection-avatars-alert" style={styles.alertBadge}>!</Text>
            : alerts.newAvatars.length ? <Text testID="collection-avatars-new" style={styles.newBadge}>{copy.isNew}</Text>
            : <Text style={styles.chevron}>›</Text>}
        </Pressable>

        {/* Pet dress-up: the golden puppy's and Xiaobai's wardrobes by part (only while pets are open). */}
        {pets ? <Pressable testID="collection-wardrobe" accessibilityRole="button"
          accessibilityLabel={`${wardrobeWords.title}${wardrobe ? `, ${copy.count(wardrobe.owned, wardrobe.total)}` : ''}`}
          onPress={() => setWardrobeOpen(true)} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
          <View style={styles.thumbs}>
            {(['puppy', 'maltese'] as const).map((id, index) => <Image key={id} source={PET_IMAGES[id]}
              style={[styles.thumb, styles.petThumb, index > 0 && styles.overlap]} resizeMode="contain" accessible={false} />)}
          </View>
          <View style={styles.tileText}>
            <Text style={styles.tileTitle}>{wardrobeWords.title}</Text>
            <Text style={styles.small}>{wardrobe ? copy.count(wardrobe.owned, wardrobe.total) : ''}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable> : null}

        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
    </View>
    <KeepsakeBook visible={bookOpen} locale={locale} newIds={alerts.keepsakes ? alerts.newKeepsakes : []}
      onClose={() => { setBookOpen(false); markKeepsakesSeen(); }} />
    <PetWardrobeCollection visible={wardrobeOpen} locale={locale} onClose={() => setWardrobeOpen(false)} />
    <AvatarCollection visible={avatarsOpen} locale={locale} onClose={() => setAvatarsOpen(false)} />
  </Modal>;
}

function makeStyles(theme: PanelTheme) {
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 14, backgroundColor: '#0B1F1B99' },
    sheet: { width: '100%', maxWidth: 400, paddingTop: 18, paddingBottom: 22, paddingHorizontal: 18, borderRadius: 26,
      backgroundColor: theme.background, borderWidth: 1, borderColor: theme.gold },
    casket: { width: 96, height: 96, alignSelf: 'center' },
    title: { textAlign: 'center', fontFamily: 'serif', fontSize: 28, color: theme.text, marginTop: 2, marginBottom: 6 },
    tile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, minHeight: 64, paddingVertical: 12, paddingHorizontal: 14,
      borderRadius: 16, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.surface },
    pressed: { opacity: .8 },
    thumbs: { flexDirection: 'row', width: 86 },
    thumb: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: theme.gold, backgroundColor: MEDALLION },
    overlap: { marginLeft: -11 },
    petThumb: { padding: 2 },
    tileText: { flex: 1 },
    tileTitle: { fontFamily: 'serif', fontSize: 18, color: theme.text },
    small: { fontSize: 12, color: theme.muted, marginTop: 2 },
    chevron: { fontSize: 22, color: theme.muted },
    newBadge: { overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, fontSize: 12, fontWeight: '600', color: '#FFFFFF', backgroundColor: '#7E62AE' },
    alertBadge: { overflow: 'hidden', width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontSize: 15, fontWeight: '700', color: '#FFFFFF', backgroundColor: '#E2554B' },
    close: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.gold },
    closeText: { fontSize: 22, lineHeight: 26, color: theme.text },
  });
}
