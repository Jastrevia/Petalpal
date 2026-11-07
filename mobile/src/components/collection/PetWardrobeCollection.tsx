import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { loadPets, onPetsChanged, type PetId, type PetsSummary } from '../../services/gardenPets';
import { ACCESSORY_ICONS, OWN_PIECE_ICONS } from '../garden/critters/accessoryIcons';
import { isWorn, petShelf, SHELVES, type Piece, type Shelf } from '../garden/critters/petRing';
import { usePanelTheme, type PanelTheme } from '../features/PanelTheme';
import type { BondLocale } from '../bond/bondCopy';

// Pet dress-up in Collection (owner, 2026-11-06): the golden puppy's and Xiaobai's wardrobes, each
// by part (hats, capes, pendants), every piece shown as worn, owned or opening at a later Bond
// level. Only to look at: dressing stays in the Garden's ring, where a pet changes only while it
// walks or sits (hugs and tug-of-war finish first).
export const PET_IMAGES: Record<'puppy' | 'maltese', number> = {
  puppy: require('@/assets/garden/pets/ring/pat-puppy.webp'),
  maltese: require('@/assets/garden/pets/ring/pat-xiaobai.webp'),
};
const PETS = ['puppy', 'maltese'] as const;
export const WARDROBE_COPY = {
  en: { title: 'Pet dress-up', close: 'Close', loading: 'Opening the wardrobe…', failed: "The wardrobe didn't open. Try again.", retry: 'Try again',
    off: 'Pets are not open for this account yet.', pets: { puppy: 'Golden Puppy', maltese: 'Xiaobai' } as Record<PetId, string>,
    shelves: { hat: 'Hats', collar: 'Capes', pendant: 'Pendants' } as Record<Shelf, string>,
    worn: 'Wearing', owned: 'Yours', opens: (level: number | null) => (level ? `Lv ${level}` : 'Locked'),
    hint: 'Tap a pet in the Garden, then Dress up, to change what it wears.', count: (owned: number, total: number) => `${owned} / ${total}` },
  'zh-Hans': { title: '宠物换装', close: '关闭', loading: '正在打开衣柜…', failed: '衣柜没打开，再试一次。', retry: '再试一次',
    off: '这个账号还没有开放宠物。', pets: { puppy: '小金毛', maltese: '小白' } as Record<PetId, string>,
    shelves: { hat: '帽子', collar: '披肩', pendant: '挂饰' } as Record<Shelf, string>,
    worn: '穿着', owned: '已拥有', opens: (level: number | null) => (level ? `Lv ${level}` : '未解锁'),
    hint: '在花园里点一下宠物，选「换装」就能换衣服。', count: (owned: number, total: number) => `${owned} / ${total}` },
};

// Each pet's pieces, shelf by shelf, as its closet shows them (Xiaobai: its own six, renamed).
export function wardrobeOf(pets: PetsSummary, petId: 'puppy' | 'maltese', locale: BondLocale) {
  return SHELVES.map(shelf => ({ shelf, pieces: petShelf(pets.accessories, shelf, petId, locale) }));
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
  const { theme, light } = usePanelTheme();
  const styles = useMemo(() => makeStyles(theme), [theme, light]);
  const [pet, setPet] = useState<'puppy' | 'maltese'>('puppy');
  const { pets, off, failed, retry } = usePetsSummary(visible);
  useEffect(() => { if (visible) setPet('puppy'); }, [visible]);
  const outfit = pets?.outfits[pet] ?? null;
  const rows = pets ? wardrobeOf(pets, pet, locale) : [];
  const icon = (piece: Piece) => OWN_PIECE_ICONS[pet]?.[piece.id] ?? ACCESSORY_ICONS[piece.id];

  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal accessibilityLabel={copy.title} style={styles.sheet} testID="pet-wardrobe">
        <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        <View accessibilityRole="tablist" style={styles.pets}>
          {PETS.map(id => {
            const count = pets ? wardrobeOf(pets, id, locale).flatMap(row => row.pieces) : [];
            return <Pressable key={id} testID={`wardrobe-pet-${id}`} accessibilityRole="tab" accessibilityState={{ selected: pet === id }}
              accessibilityLabel={copy.pets[id]} onPress={() => setPet(id)} style={[styles.petTab, pet === id && styles.petTabOn]}>
              <Image source={PET_IMAGES[id]} style={styles.petImage} resizeMode="contain" accessible={false} />
              <View>
                <Text style={[styles.petName, pet === id && styles.petNameOn]}>{copy.pets[id]}</Text>
                {pets ? <Text style={styles.small}>{copy.count(count.filter(piece => piece.unlocked).length, count.length)}</Text> : null}
              </View>
            </Pressable>;
          })}
        </View>
        {!pets && !off && !failed ? <ActivityIndicator color={theme.gold} style={styles.status} accessibilityLabel={copy.loading} /> : null}
        {off ? <Text style={[styles.small, styles.status]}>{copy.off}</Text> : null}
        {failed && !pets ? <Pressable accessibilityRole="button" onPress={retry} style={styles.status}><Text style={styles.small}>{copy.failed} {copy.retry}</Text></Pressable> : null}
        {pets ? <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
          {rows.map(({ shelf, pieces }) => <View key={shelf} style={styles.shelf}>
            <View style={styles.shelfHead}>
              <Text style={styles.shelfTitle}>{copy.shelves[shelf]}</Text>
              <Text style={styles.small}>{copy.count(pieces.filter(piece => piece.unlocked).length, pieces.length)}</Text>
            </View>
            <View style={styles.grid}>
              {pieces.map(piece => {
                const worn = isWorn(outfit, piece);
                const state = worn ? copy.worn : piece.unlocked ? copy.owned : copy.opens(piece.unlockedAtLevel);
                return <View key={piece.id} testID={`wardrobe-piece-${piece.id}`} accessible accessibilityLabel={`${piece.name}, ${state}`} style={styles.cell}>
                  <View style={[styles.ring, worn && styles.ringWorn, !piece.unlocked && styles.ringLocked]}>
                    {icon(piece) ? <Image source={icon(piece)} style={[styles.art, !piece.unlocked && styles.artLocked]} resizeMode="contain" accessible={false} /> : null}
                    {worn ? <Text style={styles.check}>✓</Text> : null}
                  </View>
                  <Text numberOfLines={2} style={[styles.pieceName, !piece.unlocked && styles.muted]}>{piece.name}</Text>
                  <Text style={[styles.state, worn && styles.stateWorn]}>{state}</Text>
                </View>;
              })}
            </View>
          </View>)}
          <Text style={[styles.small, styles.hint]}>{copy.hint}</Text>
        </ScrollView> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

const TILE = 56;
function makeStyles(theme: PanelTheme) {
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#0B1F1B99' },
    sheet: { width: '100%', maxWidth: 440, maxHeight: '92%', paddingTop: 18, paddingBottom: 10, borderRadius: 26,
      backgroundColor: theme.background, borderWidth: 1, borderColor: theme.gold },
    title: { textAlign: 'center', fontFamily: 'serif', fontSize: 26, color: theme.text },
    pets: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12 },
    petTab: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 16, borderWidth: 1, borderColor: `${theme.gold}66` },
    petTabOn: { borderColor: theme.gold, backgroundColor: theme.surface },
    petImage: { width: 40, height: 40 },
    petName: { fontFamily: 'serif', fontSize: 16, color: theme.muted },
    petNameOn: { color: theme.text },
    status: { marginVertical: 24, alignSelf: 'center' },
    scroll: { marginTop: 8 },
    scrollBody: { paddingHorizontal: 16, paddingBottom: 12 },
    shelf: { marginTop: 14 },
    shelfHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: `${theme.gold}55`, paddingBottom: 4 },
    shelfTitle: { fontFamily: 'serif', fontSize: 18, color: theme.text },
    grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 10, marginTop: 10 },
    cell: { width: TILE + 14, alignItems: 'center', gap: 3 },
    ring: { width: TILE, height: TILE, borderRadius: TILE / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
      borderColor: `${theme.gold}AA`, backgroundColor: '#EAE8D7' },
    ringWorn: { borderWidth: 3, borderColor: theme.gold },
    ringLocked: { borderStyle: 'dashed', borderColor: `${theme.gold}77`, backgroundColor: '#DCD8C4' },
    art: { width: TILE - 10, height: TILE - 10 },
    artLocked: { opacity: 0.45 },
    check: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, overflow: 'hidden', textAlign: 'center',
      lineHeight: 20, fontSize: 12, fontWeight: '700', color: '#FFFFFF', backgroundColor: theme.gold },
    pieceName: { fontSize: 11, textAlign: 'center', color: theme.text },
    muted: { color: theme.muted },
    state: { fontSize: 9.5, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: theme.muted },
    stateWorn: { color: theme.gold },
    small: { fontSize: 12, color: theme.muted },
    hint: { marginTop: 16, textAlign: 'center', fontStyle: 'italic' },
    close: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.gold },
    closeText: { fontSize: 22, lineHeight: 26, color: theme.text },
  });
}
