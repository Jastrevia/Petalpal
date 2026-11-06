import { BlurMask, Canvas, Circle, Group, Line, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Reanimated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { ApiError } from '@/services/api';
import { dressPet, feedPet, loadPets, petsChanged, type PetId, type PetsSummary } from '@/services/gardenPets';
import { ACCESSORY_ICONS, OWN_PIECE_ICONS } from './accessoryIcons';
import {
  arcOffset, isWorn, malteseHiddenPieces, outfitWith, petShelf, puppyHiddenPieces, ringArc, ringLayout, ringPoint, ringSpot, RING_ACTIONS, SHELVES,
  type Piece, type PetSpot, type RingAction, type RingLayout, type Shelf, type Viewport,
} from './petRing';

// A tapped pet's ring menu (the owner's mock-up): a translucent mauve one-third ring with a gold
// rim stands beside the pet, in three segments: feed, pat its head, dress up. Feed and dress up
// widen it into one arc panel whose cards scroll along the arc (foods with what is left, or the
// whole closet: every piece, a small lock on those not opened yet, a gold check on those worn).
// Choosing a piece saves the whole outfit and goes back to the ring. A tap anywhere outside it
// closes it. While it is open the pet sits where it is (GardenCritters `hold`).
// The puppy plays its painted eating or patting clip in whatever it wears (puppyLooks.ts
// PUPPY_ACTIONS), then small hearts float up; with reduced motion only the hearts show.
// Xiaobai (the Maltese) has the same menu in the Garden's forest green (its own TONE), a closet of
// its own pieces, two sets (petRing.ts PET_OWN_PIECES), and hearts for feeding and patting.

const COPY = {
  en: { feed: 'Feed', pat: 'Pat', dress: 'Dress up', back: 'Back', close: 'Close the menu', closeShort: 'Close', loading: 'Opening…',
    shelves: { hat: 'Hats', collar: 'Capes', pendant: 'Pendants' } as Record<Shelf, string>,
    noFood: 'No food yet: check-ins and new Bond levels bring some.', noneLeft: 'None left',
    locked: 'Opens at a higher Bond level', takeOff: 'Tap a worn piece again to take it off',
    hidden: 'not shown', failed: "That didn't go through. Try again.", off: 'Pets are not open for this account yet.',
    up: 'Scroll up', down: 'Scroll down', worn: 'worn', lockedShort: 'locked', notYet: 'Almost ready. Check back soon.' },
  'zh-Hans': { feed: '喂食', pat: '摸头', dress: '换装', back: '返回', close: '关闭菜单', closeShort: '关闭', loading: '正在打开…',
    shelves: { hat: '帽子', collar: '披肩', pendant: '挂饰' } as Record<Shelf, string>,
    noFood: '还没有食物：每天签到、亲密度升级都会得到。', noneLeft: '吃完了',
    locked: '亲密度升级后打开', takeOff: '再点一次穿着的那件就脱下',
    hidden: '暂不显示', failed: '没有成功，再试一次。', off: '这个账号还没有开放宠物。',
    up: '向上翻', down: '向下翻', worn: '穿着', lockedShort: '未打开', notYet: '这里马上就准备好了，稍后再来看看。' },
};
type Copy = typeof COPY.en;

// No painted food yet: each food shows as a small picture in a round card.
const FOOD_ICONS: Record<string, string> = { 'berry-tart': '🥧', 'flower-cookies': '🍪', 'fish-biscuit': '🐟', 'honey-seeds': '🍯' };
const ACTION_ICONS: Record<RingAction, string | number> = { feed: '🥣', pat: '✋', dress: ACCESSORY_ICONS['lilac-cape'] };

const GOLD = '#E9C979', CREAM = '#FFF3D6', MAUVE = 'rgba(84, 56, 104, 0.8)';
// Each pet's plate: the puppy's translucent mauve, Xiaobai's the Garden's forest green (the theme's
// forest #183530, raised #21443D, #2B524A), both with the same gold rim and cream text.
type Tone = { fill: string; top: string; bottom: string; shade: string; on: string; shadow: string; badge: string };
const TONES: Record<'mauve' | 'forest', Tone> = {
  mauve: { fill: MAUVE, top: 'rgba(112, 78, 128, 0.82)', bottom: 'rgba(70, 46, 92, 0.8)', shade: 'rgba(60, 38, 78, 0.72)',
    on: 'rgba(124, 88, 140, 0.92)', shadow: '#2A1638', badge: '#6B3F7E' },
  forest: { fill: 'rgba(24, 53, 48, 0.88)', top: 'rgba(43, 82, 74, 0.86)', bottom: 'rgba(24, 53, 48, 0.84)', shade: 'rgba(24, 53, 48, 0.8)',
    on: 'rgba(43, 82, 74, 0.96)', shadow: '#0B1C18', badge: '#21443D' },
};
const ToneContext = createContext<Tone>(TONES.mauve);
const toneOf = (petId: PetId) => (petId === 'maltese' ? TONES.forest : TONES.mauve);
const dressIconOf = (petId: PetId) => OWN_PIECE_ICONS[petId]?.['petal-capelet'] ?? (ACTION_ICONS.dress as number);
const ITEM_H = 50, CARD = 32;
type Mode = 'ring' | 'feed' | 'dress';

// `onAction`: plays the pet's painted eating or being-patted clip in the Garden; how long it lasts
// (0: none for its look, the menu shows its hearts instead).
export type PetRingProps = { petId: PetId; pet: PetSpot; viewport: Viewport; locale: 'en' | 'zh-Hans'; onClose: () => void; onAction?: (kind: 'eat' | 'pat') => number };

export default memo(function PetRingMenu({ petId, pet, viewport, locale, onClose, onAction }: PetRingProps) {
  const copy = COPY[locale];
  const tone = toneOf(petId);
  const [mode, setMode] = useState<Mode>('ring');
  const panel = mode === 'feed' || mode === 'dress';
  const layout = useMemo(() => ringLayout(pet, viewport, panel), [pet, viewport, panel]);
  const [pets, setPets] = useState<PetsSummary | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hearts, setHearts] = useState(0);
  // While a clip plays the menu steps aside (the hand comes in where it stands) and comes back
  // after it, a heart or two rising as it ends.
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (playTimer.current) clearTimeout(playTimer.current); }, []);
  const perform = (kind: 'eat' | 'pat') => {
    const seconds = onAction?.(kind) ?? 0;
    if (!seconds) { setHearts(n => n + 1); return; }
    setPlaying(true);
    if (playTimer.current) clearTimeout(playTimer.current);
    playTimer.current = setTimeout(() => { if (!live.current) return; setPlaying(false); setHearts(n => n + 1); }, seconds * 1000);
  };
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const reload = useCallback(() => loadPets().then(next => { if (live.current) setPets(next); }).catch(() => { if (live.current) setNote(copy.failed); }), [copy]);
  useEffect(() => { reload(); }, [reload]);
  // The ring and each panel come in with a short fade.
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [mode, appear]);

  const act = (action: RingAction) => {
    setNote(null);
    if (action === 'pat') { perform('pat'); return; }
    setMode(action);
  };
  const back = () => { setNote(null); setMode('ring'); };
  // Taps that miss every button: inside the ring or panel they do nothing (the ring's own
  // segments answer anywhere on them), outside it they close it.
  const onBackdrop = (event: GestureResponderEvent) => {
    if (playing) return;
    const { locationX: x, locationY: y } = event.nativeEvent;
    const spot = ringSpot(layout, x, y);
    if (!spot) { onClose(); return; }
    if (mode === 'ring') act(RING_ACTIONS[spot.segment]);
  };

  const feed = async (foodId: string) => {
    if (busy) return;
    if (pets && !(petId in pets.outfits)) { setNote(copy.notYet); return; }
    setBusy(true); setNote(null);
    try {
      const { count } = await feedPet(petId, foodId);
      if (!live.current) return;
      setPets(current => current && { ...current, foods: current.foods.map(food => (food.id === foodId ? { ...food, count } : food)) });
      perform('eat');
    } catch (error) {
      if (!live.current) return;
      setNote(error instanceof ApiError && error.status === 409 ? copy.noneLeft : copy.failed);
      reload();
    } finally { if (live.current) setBusy(false); }
  };
  const dress = async (piece: Piece) => {
    if (busy || !pets) return;
    if (!(petId in pets.outfits)) { setNote(copy.notYet); return; }
    const next = outfitWith(pets.outfits[petId] ?? null, piece);
    if (!next) { setNote(copy.locked); return; }
    setBusy(true); setNote(null);
    try {
      const { outfit } = await dressPet(petId, next);
      if (!live.current) return;
      setPets(current => current && { ...current, outfits: { ...current.outfits, [petId]: outfit } });
      petsChanged();
      setMode('ring');
    } catch {
      if (!live.current) return;
      setNote(copy.failed);
      reload();
    } finally { if (live.current) setBusy(false); }
  };

  return <ToneContext.Provider value={tone}><View style={StyleSheet.absoluteFill} testID="pet-ring">
    <Pressable style={StyleSheet.absoluteFill} onPress={onBackdrop} accessibilityRole="button" accessibilityLabel={copy.close} />
    {playing ? null : <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: appear }]}>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <RingShape layout={layout} segments={mode === 'ring' ? RING_ACTIONS.length : 1} tone={tone} />
      </Canvas>
      {mode === 'ring' ? <CloseButton layout={layout} viewport={viewport} label={copy.closeShort} a11y={copy.close} onPress={onClose} /> : null}
      {mode === 'ring'
        ? RING_ACTIONS.map((action, i) => <RingButton key={action} layout={layout} index={i} label={copy[action]} icon={action === 'dress' ? dressIconOf(petId) : ACTION_ICONS[action]} onPress={() => act(action)} />)
        : <Panel layout={layout} viewport={viewport} copy={copy} locale={locale} mode={mode} pets={pets} petId={petId} busy={busy} note={note} onBack={back} onFeed={feed} onDress={dress} />}
      {note && !panel ? <View pointerEvents="none" style={[styles.note, { top: Math.min(viewport.height - 130, layout.cy + layout.outer * 0.87 + 8),
        left: Math.max(8, Math.min(viewport.width - 248, layout.cx + layout.side * layout.outer * 0.5 - 120)) }]}>
        <Text style={styles.noteText}>{note}</Text></View> : null}
    </Animated.View>}
    {hearts ? <Hearts key={hearts} x={pet.x} y={pet.y - pet.body * 0.7} /> : null}
  </View></ToneContext.Provider>;
});

// The ring (or the panel): a translucent sector in the pet's tone, a soft gold glow along a thin
// gold rim, gold lines with a sparkle between segments, and small blossoms on its two ends. (Drawn
// in a Skia canvas, which React context does not reach: its tone comes as a prop.)
function RingShape({ layout, segments, tone }: { layout: RingLayout; segments: number; tone: Tone }) {
  const { cx, cy, inner, outer } = layout;
  const path = useMemo(() => {
    const { start, sweep } = ringArc(layout);
    const b = Skia.PathBuilder.Make();
    b.arcToOval(Skia.XYWHRect(cx - outer, cy - outer, outer * 2, outer * 2), start, sweep, true);
    b.arcToOval(Skia.XYWHRect(cx - inner, cy - inner, inner * 2, inner * 2), start + sweep, -sweep, false);
    b.close();
    return b.build();
  }, [layout, cx, cy, inner, outer]);
  const joints = Array.from({ length: segments - 1 }, (_, i) => -1 + 2 * (i + 1) / segments);
  const top = ringPoint(layout, outer, -1), bottom = ringPoint(layout, outer, 1);
  return <Group>
    <Path path={path} color={tone.fill}>
      <LinearGradient start={vec(cx, cy - outer)} end={vec(cx, cy + outer)} colors={[tone.top, tone.bottom]} />
    </Path>
    <Path path={path} style="stroke" strokeWidth={5} color="rgba(255, 214, 140, 0.4)"><BlurMask blur={5} style="normal" /></Path>
    <Path path={path} style="stroke" strokeWidth={1.4} color={GOLD} />
    {joints.map(t => {
      const a = ringPoint(layout, inner + 6, t), b = ringPoint(layout, outer - 4, t), s = ringPoint(layout, outer, t);
      return <Group key={t}>
        <Line p1={vec(a.x, a.y)} p2={vec(b.x, b.y)} color={GOLD} strokeWidth={1} />
        <Sparkle x={s.x} y={s.y} />
      </Group>;
    })}
    <Blossom x={top.x} y={top.y} />
    <Blossom x={bottom.x} y={bottom.y} />
  </Group>;
}

function Sparkle({ x, y }: { x: number; y: number }) {
  const star = useMemo(() => {
    const b = Skia.PathBuilder.Make(), r = 6, w = 1.6;
    b.moveTo(x, y - r); b.lineTo(x + w, y - w); b.lineTo(x + r, y); b.lineTo(x + w, y + w);
    b.lineTo(x, y + r); b.lineTo(x - w, y + w); b.lineTo(x - r, y); b.lineTo(x - w, y - w); b.close();
    return b.build();
  }, [x, y]);
  return <Group>
    <Circle cx={x} cy={y} r={5} color="rgba(255, 240, 200, 0.6)"><BlurMask blur={4} style="normal" /></Circle>
    <Path path={star} color="#FFF6DA" />
  </Group>;
}

// Five round petals, pink with a white one, around a gold heart.
function Blossom({ x, y }: { x: number; y: number }) {
  return <Group>
    {[0, 1, 2, 3, 4].map(i => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      return <Circle key={i} cx={x + Math.cos(a) * 5.2} cy={y + Math.sin(a) * 5.2} r={4.4} color={i === 2 ? '#FFF8F4' : '#F5C3D5'} />;
    })}
    <Circle cx={x} cy={y} r={2.6} color="#F2CF72" />
  </Group>;
}

// The ring's own close button, just past its top end (away from the pet): × closes the menu.
function CloseButton({ layout, viewport, label, a11y, onPress }: { layout: RingLayout; viewport: Viewport; label: string; a11y: string; onPress: () => void }) {
  const p = ringPoint(layout, layout.outer, -1), w = 72;
  const left = Math.max(8, Math.min(viewport.width - w - 8, p.x - w / 2 + layout.side * 10)), top = Math.max(8, p.y - 40);
  const tone = useContext(ToneContext);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} testID="pet-ring-close" hitSlop={8}
    style={({ pressed }) => [styles.close, { left, top, minWidth: w, backgroundColor: tone.fill }, pressed && styles.pressed]}>
    <Text style={styles.closeText}>✕ {label}</Text>
  </Pressable>;
}

function RingButton({ layout, index, label, icon, onPress }: { layout: RingLayout; index: number; label: string; icon: string | number; onPress: () => void }) {
  const t = -1 + (2 * index + 1) / RING_ACTIONS.length;
  const p = ringPoint(layout, (layout.inner + layout.outer) / 2, t);
  const tone = useContext(ToneContext);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={`pet-ring-${RING_ACTIONS[index]}`}
    style={[styles.ringButton, { left: p.x - 28, top: p.y - 25 }]}>
    {typeof icon === 'string' ? <Text style={styles.ringIcon}>{icon}</Text> : <Image source={icon} style={styles.ringImage} />}
    <Text style={[styles.ringLabel, { textShadowColor: tone.shadow }]}>{label}</Text>
  </Pressable>;
}

// The wide arc: a title (and, for the wardrobe, its three shelves) above it, the back button at
// the top left, the cards along its middle arc, and arrows with page dots on its outer edge.
function Panel({ layout, viewport, copy, locale, mode, pets, petId, busy, note, onBack, onFeed, onDress }: {
  layout: RingLayout; viewport: Viewport; copy: Copy; locale: 'en' | 'zh-Hans'; mode: 'feed' | 'dress'; pets: PetsSummary | null | undefined; petId: PetId; busy: boolean; note: string | null;
  onBack: () => void; onFeed: (foodId: string) => void; onDress: (piece: Piece) => void;
}) {
  const [shelf, setShelf] = useState<Shelf>('hat');
  const { cx, cy, side, inner, outer } = layout;
  const headerWidth = 268;
  const headerLeft = Math.max(8, Math.min(viewport.width - headerWidth - 8, cx + side * outer * 0.5 - headerWidth / 2));
  const headerTop = cy - outer * 0.87 - layout.header;
  const tone = useContext(ToneContext);
  const outfit = pets?.outfits[petId] ?? null;
  // A server from before this pet: its corner is shown, nothing in it can be chosen yet.
  const known = !pets || petId in pets.outfits;
  const hidden = useMemo(() => (petId === 'puppy' ? puppyHiddenPieces(outfit) : petId === 'maltese' ? malteseHiddenPieces(outfit) : new Set<string>()), [petId, outfit]);
  const cards: CardSpec[] = !pets ? [] : mode === 'feed'
    ? pets.foods.map(food => ({ key: food.id, label: food.name, icon: FOOD_ICONS[food.id] ?? '🍽️', badge: `×${food.count}`, dim: food.count === 0,
      a11y: `${food.name} ×${food.count}`, onPress: food.count > 0 && known ? () => onFeed(food.id) : undefined }))
    : petShelf(pets.accessories, shelf, petId, locale).map(piece => {
      const worn = isWorn(outfit, piece);
      return { key: piece.id, label: piece.name, icon: OWN_PIECE_ICONS[petId]?.[piece.id] ?? ACCESSORY_ICONS[piece.id], locked: !piece.unlocked, worn,
        sub: worn && hidden.has(piece.id) ? copy.hidden : undefined, dim: !piece.unlocked,
        a11y: `${piece.name}${worn ? `, ${copy.worn}` : ''}${piece.unlocked ? '' : `, ${copy.lockedShort}`}`, onPress: known ? () => onDress(piece) : undefined };
    });
  const empty = pets && mode === 'feed' && pets.foods.every(food => food.count === 0) ? copy.noFood : null;
  const sub = note ?? (pets === null ? copy.off : !known ? copy.notYet : empty) ?? (mode === 'dress' && pets ? (outfit && (outfit.hat || outfit.collar || outfit.pendant) ? copy.takeOff : copy.locked) : null);
  return <>
    <View style={[styles.header, { left: headerLeft, top: headerTop, width: headerWidth }]}>
      {/* Back sits on the panel itself, beside its title: one step back to the ring (then × closes it). */}
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={copy.back} testID="pet-ring-back" hitSlop={8}
          style={({ pressed }) => [styles.back, { backgroundColor: tone.fill }, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹ {copy.back}</Text>
        </Pressable>
        <View style={[styles.titleRow, { backgroundColor: tone.fill }]}>
          {mode === 'feed' ? <Text style={styles.titleIcon}>🥣</Text> : <Image source={dressIconOf(petId)} style={styles.titleImage} />}
          <Text style={styles.title}>{mode === 'feed' ? copy.feed : copy.dress}</Text>
        </View>
      </View>
      {mode === 'dress' ? <View style={styles.tabs}>
        {SHELVES.map(row => {
          const all = pets ? petShelf(pets.accessories, row, petId, locale) : [];
          return <Pressable key={row} onPress={() => setShelf(row)} accessibilityRole="tab" accessibilityState={{ selected: shelf === row }}
            testID={`pet-shelf-${row}`} style={[styles.tab, { backgroundColor: tone.shade }, shelf === row && [styles.tabOn, { backgroundColor: tone.on }]]}>
            <Text style={[styles.tabText, shelf === row && styles.tabTextOn]}>{copy.shelves[row]} {all.filter(p => p.unlocked).length}/{all.length}</Text>
          </Pressable>;
        })}
      </View> : null}
    </View>
    {pets === undefined ? <ActivityIndicator color={CREAM} style={{ position: 'absolute', left: cx + side * (inner + outer) / 2 - 10, top: cy - 10 }} accessibilityLabel={copy.loading} />
      : <ArcList key={`${mode}-${shelf}`} layout={layout} cards={cards} busy={busy} copy={copy} />}
    {sub ? <View style={[styles.sub, { top: cy + outer * 0.87 + 6, left: headerLeft, width: headerWidth }]}>
      <Text style={[styles.subText, { backgroundColor: tone.shade }, sub === note && styles.subNote]}>{sub}</Text></View> : null}
  </>;
}

type CardSpec = { key: string; label: string; icon: string | number; badge?: string; locked?: boolean; worn?: boolean; sub?: string; dim?: boolean; a11y: string; onPress?: () => void };

// Cards in a vertical scroll whose box covers the panel; each card slides sideways to sit on the
// middle arc for where it is in the box, and fades near the panel's ends.
function ArcList({ layout, cards, busy, copy }: { layout: RingLayout; cards: CardSpec[]; busy: boolean; copy: Copy }) {
  const { cx, cy, side, inner, outer } = layout;
  const mid = (inner + outer) / 2, reach = mid * 0.86, full = mid * 0.6;
  const boxTop = cy - reach, boxHeight = reach * 2;
  const boxLeft = side === 1 ? cx + inner * 0.5 - 6 : cx - outer, boxWidth = outer - inner * 0.5 + 6;
  const pad = Math.max(0, reach - full - ITEM_H / 2);
  const perPage = Math.max(1, Math.floor((boxHeight - 2 * pad) / ITEM_H));
  const pages = Math.max(1, Math.ceil((cards.length - perPage) / perPage) + 1);
  const scrollY = useSharedValue(0);
  const ref = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  useAnimatedReaction(() => Math.round(scrollY.value / (perPage * ITEM_H)), (now, before) => { if (now !== before) runOnJS(setPage)(now); }, [perPage]);
  const go = (by: number) => {
    const to = Math.max(0, Math.min(pages - 1, page + by));
    ref.current?.scrollTo({ y: to * perPage * ITEM_H, animated: true });
  };
  const dotsX = cx + side * (outer + 12);
  return <>
    <ScrollView ref={ref} onScroll={event => { scrollY.value = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
      style={{ position: 'absolute', left: boxLeft, top: boxTop, width: boxWidth, height: boxHeight }}
      contentContainerStyle={{ paddingVertical: pad }}>
      {cards.map((card, i) => <ArcCard key={card.key} card={card} index={i} scrollY={scrollY} busy={busy}
        geometry={{ cy, side, cx, mid, full, reach, boxTop, boxLeft, pad }} />)}
    </ScrollView>
    {pages > 1 ? <View style={[styles.dots, { left: dotsX - 13, top: cy - 44 }]}>
      <Pressable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel={copy.up} hitSlop={6}><Text style={[styles.arrow, page === 0 && styles.arrowOff]}>▲</Text></Pressable>
      {Array.from({ length: Math.min(pages, 7) }, (_, i) => <View key={i} style={[styles.dot, i === Math.min(page, 6) && styles.dotOn]} />)}
      <Pressable onPress={() => go(1)} accessibilityRole="button" accessibilityLabel={copy.down} hitSlop={6}><Text style={[styles.arrow, page >= pages - 1 && styles.arrowOff]}>▼</Text></Pressable>
    </View> : null}
  </>;
}

type Geometry = { cy: number; side: 1 | -1; cx: number; mid: number; full: number; reach: number; boxTop: number; boxLeft: number; pad: number };
function ArcCard({ card, index, scrollY, busy, geometry }: { card: CardSpec; index: number; scrollY: SharedValue<number>; busy: boolean; geometry: Geometry }) {
  const { cy, side, cx, mid, full, reach, boxTop, boxLeft, pad } = geometry;
  const tone = useContext(ToneContext);
  const style = useAnimatedStyle(() => {
    const centre = boxTop + pad + index * ITEM_H + ITEM_H / 2 - scrollY.value, dy = centre - cy;
    const x = cx + side * arcOffset(mid, dy);
    const fade = Math.abs(dy) <= full ? 1 : Math.max(0, 1 - (Math.abs(dy) - full) / (reach - full));
    return { transform: [{ translateX: x - boxLeft - CARD / 2 - 12 }], opacity: fade };
  });
  return <Reanimated.View style={[styles.cardRow, style]}>
    <Pressable onPress={card.onPress} disabled={!card.onPress || busy || card.locked} accessibilityRole="button" accessibilityLabel={card.a11y}
      accessibilityState={{ disabled: !card.onPress || card.locked, selected: card.worn }} testID={`pet-card-${card.key}`} style={styles.card}>
      <View style={[styles.cardCircle, card.worn && styles.cardWorn, card.dim && styles.cardDim]}>
        {typeof card.icon === 'string' ? <Text style={styles.cardEmoji}>{card.icon}</Text> : <Image source={card.icon} style={styles.cardImage} resizeMode="contain" />}
      </View>
      {card.badge ? <View style={[styles.badge, { backgroundColor: tone.badge }]}><Text style={styles.badgeText}>{card.badge}</Text></View> : null}
      {card.worn ? <View style={styles.check}><Text style={styles.checkText}>✓</Text></View> : null}
      {card.locked ? <View style={[styles.lock, { backgroundColor: tone.fill }]}><Text style={styles.lockText}>🔒</Text></View> : null}
      <Text numberOfLines={1} style={[styles.cardLabel, { textShadowColor: tone.shadow }, card.dim && styles.cardLabelDim]}>{card.label}</Text>
      {card.sub ? <Text numberOfLines={1} style={styles.cardSub}>{card.sub}</Text> : null}
    </Pressable>
  </Reanimated.View>;
}

// Small pink hearts floating up from the pet's head (after its eating or patting clip).
function Hearts({ x, y }: { x: number; y: number }) {
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [rise]);
  const spots = [[-16, 0, 15], [0, -8, 19], [15, 2, 14], [-6, 6, 12], [9, -4, 11]];
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {spots.map(([dx, dy, size], i) => <Animated.Text key={i} style={{ position: 'absolute', left: x + dx - size / 2, top: y + dy - size, fontSize: size, color: i % 2 ? '#F7A8C4' : '#F38FB3',
      opacity: rise.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.9, 0] }),
      transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, reduced ? 0 : -(34 + i * 7)] }) },
        { translateX: rise.interpolate({ inputRange: [0, 1], outputRange: [0, reduced ? 0 : (i % 2 ? 6 : -6)] }) }] }}>♥</Animated.Text>)}
  </View>;
}

const text = { color: CREAM, fontFamily: 'serif' } as const;
const styles = StyleSheet.create({
  ringButton: { position: 'absolute', width: 56, height: 50, alignItems: 'center', justifyContent: 'center' },
  ringIcon: { fontSize: 18, lineHeight: 22 },
  ringImage: { width: 22, height: 22 },
  ringLabel: { ...text, fontSize: 11.5, marginTop: 1, textShadowColor: '#2A1638', textShadowRadius: 3 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.7 },
  close: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 15,
    backgroundColor: MAUVE, borderWidth: 1, borderColor: GOLD },
  closeText: { ...text, fontSize: 12.5 },
  back: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, height: 32, borderRadius: 16,
    backgroundColor: MAUVE, borderWidth: 1, borderColor: GOLD },
  backText: { ...text, fontSize: 13.5, lineHeight: 18 },
  header: { position: 'absolute', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 16,
    backgroundColor: MAUVE, borderWidth: 1, borderColor: GOLD },
  titleIcon: { fontSize: 14 },
  titleImage: { width: 18, height: 18 },
  title: { ...text, fontSize: 14, letterSpacing: 1 },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tab: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(60, 38, 78, 0.72)', borderWidth: 1, borderColor: 'rgba(233, 201, 121, 0.45)' },
  tabOn: { backgroundColor: 'rgba(124, 88, 140, 0.92)', borderColor: GOLD },
  tabText: { ...text, fontSize: 11, opacity: 0.8 },
  tabTextOn: { opacity: 1 },
  cardRow: { height: ITEM_H, width: CARD + 24 },
  card: { width: CARD + 24, height: ITEM_H, alignItems: 'center' },
  cardCircle: { width: CARD, height: CARD, borderRadius: CARD / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255, 244, 224, 0.92)', borderWidth: 1.5, borderColor: 'rgba(233, 201, 121, 0.7)' },
  cardWorn: { borderColor: GOLD, borderWidth: 2.5 },
  cardDim: { opacity: 0.5 },
  cardEmoji: { fontSize: 16 },
  cardImage: { width: CARD - 4, height: CARD - 4 },
  cardLabel: { ...text, fontSize: 9.5, marginTop: 1, maxWidth: CARD + 24, textShadowColor: '#2A1638', textShadowRadius: 3 },
  cardLabelDim: { opacity: 0.7 },
  cardSub: { ...text, fontSize: 9, opacity: 0.75 },
  badge: { position: 'absolute', right: 6, top: CARD - 12, minWidth: 18, paddingHorizontal: 2, borderRadius: 9, backgroundColor: '#6B3F7E', borderWidth: 1, borderColor: GOLD, alignItems: 'center' },
  badgeText: { ...text, fontSize: 8.5 },
  check: { position: 'absolute', right: 8, top: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: '#E2B84E', borderWidth: 1, borderColor: '#FFF3D6', alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#4A2A10', fontSize: 9, fontWeight: '700', lineHeight: 12 },
  lock: { position: 'absolute', right: 8, top: CARD - 13, width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(60, 38, 78, 0.9)', alignItems: 'center', justifyContent: 'center' },
  lockText: { fontSize: 7, lineHeight: 10 },
  dots: { position: 'absolute', width: 26, alignItems: 'center', gap: 5 },
  arrow: { ...text, fontSize: 12, color: GOLD },
  arrowOff: { opacity: 0.35 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255, 243, 214, 0.4)' },
  dotOn: { backgroundColor: GOLD },
  sub: { position: 'absolute', alignItems: 'center' },
  subText: { ...text, fontSize: 11, textAlign: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(60, 38, 78, 0.72)', overflow: 'hidden' },
  subNote: { backgroundColor: 'rgba(120, 50, 70, 0.9)' },
  note: { position: 'absolute', width: 240, alignItems: 'center' },
  noteText: { ...text, fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 11, backgroundColor: 'rgba(120, 50, 70, 0.9)', overflow: 'hidden' },
});
