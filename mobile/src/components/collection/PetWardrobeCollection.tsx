import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { loadPets, onPetsChanged, type PetId, type PetsSummary } from '../../services/gardenPets';
import { ACCESSORY_ICONS, OWN_PIECE_ICONS } from '../garden/critters/accessoryIcons';
import { forPet, isWorn, petShelf, SHELVES, type Piece, type Shelf } from '../garden/critters/petRing';
import { CREAM, GOLD, RING_ICONS, TONES } from '../garden/critters/PetRingMenu';
import type { BondLocale } from '../bond/bondCopy';

// Pet dress-up in Collection (owner, 2026-11-06): the golden puppy's and Xiaobai's wardrobes, two
// pieces per part (hats, capes, pendants), each worn, owned or opening at a later Bond level, drawn
// like the Garden's Dress up panel (PetRingMenu). Only to look at: dressing stays in the Garden's
// ring, where a pet changes only while it walks or sits (hugs and tug-of-war finish first).
export const PET_IMAGES: Record<'puppy' | 'maltese', number> = {
  puppy: require('@/assets/garden/pets/ring/pat-puppy.webp'),
  maltese: require('@/assets/garden/pets/ring/pat-xiaobai.webp'),
};
const PETS = ['puppy', 'maltese'] as const;
export const WARDROBE_COPY = {
  en: { title: 'Pet dress-up', close: 'Close', loading: 'Opening the wardrobe…', failed: "The wardrobe didn't open. Try again.", retry: 'Try again',
    off: 'Pets are not open for this account yet.', pets: { puppy: 'Golden Puppy', maltese: 'Xiaobai' } as Record<PetId, string>,
    shelves: { hat: 'Hats', collar: 'Capes', pendant: 'Pendants' } as Record<Shelf, string>,
    worn: 'Wearing', owned: 'Yours', locked: 'Locked',
    hint: 'Tap a pet in the Garden, then Dress up, to change what it wears.', count: (owned: number, total: number) => `${owned} / ${total}` },
  'zh-Hans': { title: '宠物换装', close: '关闭', loading: '正在打开衣柜…', failed: '衣柜没打开，再试一次。', retry: '再试一次',
    off: '这个账号还没有开放宠物。', pets: { puppy: '小金毛', maltese: '小白' } as Record<PetId, string>,
    shelves: { hat: '帽子', collar: '披肩', pendant: '挂饰' } as Record<Shelf, string>,
    worn: '穿着', owned: '已拥有', locked: '未解锁',
    hint: '在花园里点一下宠物，选「换装」就能换衣服。', count: (owned: number, total: number) => `${owned} / ${total}` },
};

// Each pet's pieces, shelf by shelf, as its closet shows them (Xiaobai: its own six, renamed).
export function wardrobeOf(pets: PetsSummary, petId: 'puppy' | 'maltese', locale: BondLocale) {
  return SHELVES.map(shelf => ({ shelf, pieces: petShelf(forPet(pets, petId), shelf, petId, locale) }));
}
export function wardrobeCount(pets: PetsSummary | null, locale: BondLocale) {
  if (!pets) return null;
  const all = PETS.flatMap(petId => wardrobeOf(pets, petId, locale).flatMap(row => row.pieces));
  return { owned: all.filter(piece => piece.unlocked).length, total: all.length };
}

// The pets summary while `enabled`; reloads when an outfit changes in the Garden.
export function usePetsSummary(enabled: boolean) {
  const [state, setState] = useState<{ pets: PetsSummary | null; off: boolean; failed: boolean }>({ pets: null, off: false, failed: false });
  const [changes, setChanges] = useState(0);
  useEffect(() => onPetsChanged(() => setChanges(count => count + 1)), []);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState(current => ({ ...current, failed: false }));
    loadPets().then(pets => { if (live) setState({ pets, off: !pets, failed: false }); })
      .catch(() => { if (live) setState(current => ({ ...current, failed: true })); });
    return () => { live = false; };
  }, [enabled, changes]);
  return { ...state, retry: () => setChanges(count => count + 1) };
}

export function PetWardrobeCollection({ visible, locale, onClose }: { visible: boolean; locale: BondLocale; onClose: () => void }) {
  const copy = WARDROBE_COPY[locale];
  const { width } = useWindowDimensions();
  const [pet, setPet] = useState<'puppy' | 'maltese'>('puppy');
  const [shelf, setShelf] = useState<Shelf>('hat');
  const { pets, off, failed, retry } = usePetsSummary(visible);
  useEffect(() => { if (visible) { setPet('puppy'); setShelf('hat'); } }, [visible]);
  // The Garden's Dress up panel, as a card: the puppy's mauve plate or Xiaobai's forest green,
  // the gold rim, the hanger title, its three shelves as tabs and the same cream cards.
  const tone = pet === 'maltese' ? TONES.forest : TONES.mauve;
  // The panel is see-through over the Garden; here it sits over Collection, so it gets a solid ground.
  const ground = pet === 'maltese' ? '#163029' : '#3F2A52';
  const outfit = pets?.outfits[pet] ?? null;
  const pieces = pets ? petShelf(forPet(pets, pet), shelf, pet, locale) : [];
  const icon = (piece: Piece) => OWN_PIECE_ICONS[pet]?.[piece.id] ?? ACCESSORY_ICONS[piece.id];
  const plate = Math.min(400, width - 24);
  const circle = Math.max(76, Math.min(104, (plate - 96) / 2.6));

  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal accessibilityLabel={copy.title} testID="pet-wardrobe"
        style={[styles.plate, { width: plate, backgroundColor: ground, boxShadow: `0 10px 30px ${tone.shadow}AA` }]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.plateTint, { backgroundColor: tone.fill }]} />
        <View style={styles.headerRow}>
          <View style={[styles.titleRow, { backgroundColor: tone.on }]}>
            <Image source={RING_ICONS.dress} style={styles.titleImage} resizeMode="contain" accessible={false} />
            <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} hitSlop={8}
            style={({ pressed }) => [styles.close, { backgroundColor: tone.shade }, pressed && styles.pressed]}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <View accessibilityRole="tablist" style={styles.pets}>
          {PETS.map(id => {
            const own = pets ? wardrobeOf(pets, id, locale).flatMap(row => row.pieces) : [];
            const on = pet === id, petTone = id === 'maltese' ? TONES.forest : TONES.mauve;
            return <Pressable key={id} testID={`wardrobe-pet-${id}`} accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={`${copy.pets[id]}${pets ? `, ${copy.count(own.filter(piece => piece.unlocked).length, own.length)}` : ''}`}
              onPress={() => { setPet(id); setShelf('hat'); }}
              style={({ pressed }) => [styles.petPill, { backgroundColor: on ? petTone.on : petTone.shade }, on && styles.petPillOn, pressed && styles.pressed]}>
              <Image source={PET_IMAGES[id]} style={styles.petImage} resizeMode="contain" accessible={false} />
              <View style={styles.petText}>
                <Text numberOfLines={1} style={[styles.petName, !on && styles.dimText]}>{copy.pets[id]}</Text>
                {pets ? <Text style={styles.petCount}>{copy.count(own.filter(piece => piece.unlocked).length, own.length)}</Text> : null}
              </View>
            </Pressable>;
          })}
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          {SHELVES.map(row => {
            const all = pets ? petShelf(forPet(pets, pet), row, pet, locale) : [];
            return <Pressable key={row} testID={`wardrobe-shelf-${row}`} onPress={() => setShelf(row)} accessibilityRole="tab" accessibilityState={{ selected: shelf === row }}
              style={[styles.tab, { backgroundColor: tone.shade }, shelf === row && [styles.tabOn, { backgroundColor: tone.on }]]}>
              <Text style={[styles.tabText, shelf === row && styles.tabTextOn]}>{copy.shelves[row]} {all.filter(p => p.unlocked).length}/{all.length}</Text>
            </Pressable>;
          })}
        </View>

        <View style={styles.cards}>
          {!pets && !off && !failed ? <ActivityIndicator color={CREAM} accessibilityLabel={copy.loading} /> : null}
          {off ? <Text style={styles.sub}>{copy.off}</Text> : null}
          {failed && !pets ? <Pressable accessibilityRole="button" onPress={retry}><Text style={styles.sub}>{copy.failed} {copy.retry}</Text></Pressable> : null}
          {pieces.map(piece => {
            const worn = isWorn(outfit, piece);
            const state = worn ? copy.worn : piece.unlocked ? copy.owned : copy.locked;
            return <View key={piece.id} testID={`wardrobe-piece-${piece.id}`} accessible accessibilityLabel={`${piece.name}, ${state}`} style={[styles.card, { width: circle + 28 }]}>
              <View style={[styles.cardCircle, { width: circle, height: circle, borderRadius: circle / 2 }, worn && styles.cardWorn, !piece.unlocked && styles.cardDim]}>
                {icon(piece) ? <Image source={icon(piece)} style={{ width: circle - 14, height: circle - 14 }} resizeMode="contain" accessible={false} /> : null}
              </View>
              {worn ? <View style={styles.check}><Text style={styles.checkText}>✓</Text></View> : null}
              {!piece.unlocked ? <View style={[styles.lock, { backgroundColor: tone.fill, top: circle - 22 }]}><Text style={styles.lockText}>🔒</Text></View> : null}
              <Text numberOfLines={2} style={[styles.cardLabel, { textShadowColor: tone.shadow }, !piece.unlocked && styles.dimText]}>{piece.name}</Text>
              <Text style={[styles.cardState, worn && styles.cardStateWorn]}>{state}</Text>
            </View>;
          })}
        </View>

        <Text style={[styles.sub, { backgroundColor: tone.shade }]}>{copy.hint}</Text>
      </View>
    </View>
  </Modal>;
}

const text = { color: CREAM, fontFamily: 'serif' } as const;
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: 'rgba(11, 20, 18, 0.55)' },
  plateTint: { borderRadius: 25 },
  plate: { maxHeight: '92%', overflow: 'hidden', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 16, borderRadius: 26, borderWidth: 1.5, borderColor: GOLD, alignItems: 'center' },
  pressed: { opacity: 0.7 },
  headerRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 18, borderWidth: 1, borderColor: GOLD },
  titleImage: { width: 30, height: 28 },
  title: { ...text, fontSize: 17, letterSpacing: 1 },
  close: { position: 'absolute', right: 0, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GOLD },
  closeText: { ...text, fontSize: 14 },
  pets: { alignSelf: 'stretch', flexDirection: 'row', gap: 8, marginTop: 14 },
  petPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 8, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(233, 201, 121, 0.45)' },
  petPillOn: { borderColor: GOLD, borderWidth: 1.5 },
  petImage: { width: 38, height: 38 },
  petText: { flexShrink: 1 },
  petName: { ...text, fontSize: 14 },
  petCount: { ...text, fontSize: 11, opacity: 0.8 },
  dimText: { opacity: 0.7 },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 12 },
  tab: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(233, 201, 121, 0.45)', minHeight: 32, justifyContent: 'center' },
  tabOn: { borderColor: GOLD },
  tabText: { ...text, fontSize: 12.5, opacity: 0.8 },
  tabTextOn: { opacity: 1 },
  cards: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 18, marginBottom: 14, minHeight: 150 },
  card: { alignItems: 'center' },
  cardCircle: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 244, 224, 0.92)', borderWidth: 1.5, borderColor: 'rgba(233, 201, 121, 0.7)' },
  cardWorn: { borderColor: GOLD, borderWidth: 3 },
  cardDim: { opacity: 0.5 },
  check: { position: 'absolute', right: 10, top: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#E2B84E', borderWidth: 1, borderColor: CREAM, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#4A2A10', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  lock: { position: 'absolute', right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(233, 201, 121, 0.7)' },
  lockText: { fontSize: 10, lineHeight: 14 },
  cardLabel: { ...text, fontSize: 13, marginTop: 6, textAlign: 'center', textShadowRadius: 3 },
  cardState: { ...text, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75, marginTop: 2 },
  cardStateWorn: { color: GOLD, opacity: 1 },
  sub: { ...text, fontSize: 11.5, textAlign: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
});
