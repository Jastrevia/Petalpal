import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { MONTH_NAMES, MONTHS, monthKey, monthLocked, yearLocked } from '../../services/bookhouse';
import { BookhouseArt } from './BookhouseArt';
import { ArtWindow, Icon, LOCK_ICON, palette, serif } from './TreehouseArt';
import { useShelfImages } from './book3d/assets';
import { SPINE_RATIO, type Camera } from './book3d/engine';
import { ShelfBooks, type ShelfBookSpec } from './book3d/ShelfBooks';
import { SHELF } from './book3d/desk';
import { shelfTransform, type PullGeometry } from './book3d/scene';

// Measurements on interior.png (see book3d/desk.ts). The bookcase is recomposed from contiguous slices of the painting at
// one scale: carved pillar | left shelf (left décor) | right shelf (right décor) | right post. The two shelf slices meet
// once, behind the middle books, and the outer joins fall on the pillar's and post's own vertical edges.
export { SHELF };
// A spine is as wide as the 3D book is thick (the painted spine wraps its rounded back).
const SPINE_ASPECT = SPINE_RATIO;
const FEATHER = 8;
// Décor is never cropped: when space is short the books stand in front of the inner part of the painted
// end décor (as on a real shelf) rather than shrinking, up to this share of each décor's width.
const DECOR_OVERLAP = .55;

/** `fill`: as wide as the column (up to the whole painting), not only as much backboard as the books need — the
 *  bookcase seen from the writing desk, as wide as the desk below it (book3d/composed.ts, portrait layout). */
export function shelfLayout(column: number, cabinetTop: number, cabinetBottom: number, fill = false) {
  const { x0, x1, pillarEdge, postEdge, decorLeft, decorRight } = SHELF;
  const scale = (cabinetBottom - cabinetTop) / (SHELF.bottom - SHELF.top);
  const gap = Math.max(4, 6 * scale);
  const tallest = Math.max(...SHELF.rows.map(row => row.base - row.top - 3)) * scale;
  const cluster = tallest * SPINE_ASPECT * 3 + gap * 2 + 10;
  const ends = (decorLeft - x0 + x1 - decorRight) * scale;
  // Wide windows show only as much bare backboard as the books need.
  const width = Math.min(column, (x1 - x0) * scale, fill ? Infinity : ends + cluster + 40);
  const span = width / scale;
  // Shelf slices [pillarEdge, a] and [c, postEdge]; a + c centres the join between the two décor ends.
  const a = (decorLeft + decorRight + span - (x1 - x0)) / 2;
  const c = decorLeft + decorRight - a;
  const slices: { sx: number; from: number; to: number }[] = [
    { sx: x0, from: 0, to: (pillarEdge - x0) * scale },
    { sx: pillarEdge, from: (pillarEdge - x0) * scale, to: (a - x0) * scale },
  ];
  const seam = slices[1].to;
  slices.push({ sx: c, from: seam, to: seam + (postEdge - c) * scale });
  slices.push({ sx: postEdge, from: slices[2].to, to: width });
  return {
    scale, width, gap, slices, seam,
    interior: [seam - (a - decorLeft) * scale, seam + (decorRight - c) * scale] as const,
    overlap: Math.min(decorLeft - pillarEdge, postEdge - decorRight) * DECOR_OVERLAP * scale,
    rail: [(SHELF.pillar[0] - x0) * scale, (SHELF.pillar[1] - x0) * scale] as const,
    y: (sourceY: number) => cabinetTop + (sourceY - SHELF.top) * scale,
  };
}
type Layout = ReturnType<typeof shelfLayout>;

type Target = Record<string, unknown>;
/** A book's slot in window coordinates, with the shelf's camera there (the monthly book flies out of, and back
 *  into, this rect, starting from exactly the perspective the shelf drew it in). */
export type ShelfRect = { x: number; y: number; width: number; height: number; camera: Camera };
/** A mounted book button and where the shelf camera sits relative to its top-left corner. */
export type ShelfSlot = { node: View; camera: { dx: number; dy: number; d: number } };
export function measureBook(slot: ShelfSlot | null | undefined) {
  return new Promise<ShelfRect | null>(resolve => {
    if (!slot?.node?.measureInWindow) { resolve(null); return; }
    const { dx, dy, d } = slot.camera;
    slot.node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0
      ? { x, y, width, height, camera: { cx: x + dx, cy: y + dy, d } } : null));
  });
}

type Slot = { month: number; row: number; column: number; left: number; top: number; width: number; height: number };
/** Every book's slot inside the books area (whose origin is interior[0] − overlap, cabinetTop). */
function bookSlots(layout: Layout, cabinetTop: number): Slot[] {
  const { scale, gap, interior, seam, overlap } = layout;
  const room = interior[1] - interior[0] + overlap * 2;
  return SHELF.rows.flatMap((row, index) => {
    // Fill the compartment's height; only if three spines would not fit across does the whole book scale down.
    let bookHeight = (row.base - row.top - 3) * scale;
    let bookWidth = bookHeight * SPINE_ASPECT;
    if (bookWidth * 3 + gap * 2 > room) { bookWidth = (room - gap * 2) / 3; bookHeight = bookWidth / SPINE_ASPECT; }
    const base = layout.y(row.base) - cabinetTop;
    const start = seam - (interior[0] - overlap) - (bookWidth * 3 + gap * 2) / 2;
    return [0, 1, 2].map(column => ({ month: index * 3 + column + 1, row: index, column,
      left: start + column * (bookWidth + gap), top: base - bookHeight, width: bookWidth, height: bookHeight }));
  });
}
/** The shelf is seen from the middle column, level with the second shelf's books, from 3.5 cabinets away:
 *  books show a sliver of their covers toward the centre and the lower rows show the tops of their page blocks. */
function shelfCamera(layout: Layout, cabinetTop: number, cabinetBottom: number): Camera {
  const row = SHELF.rows[1];
  return { cx: layout.seam - (layout.interior[0] - layout.overlap), cy: layout.y((row.top + row.base) / 2) - cabinetTop, d: (cabinetBottom - cabinetTop) * 3.5 };
}

export function TreehouseShelf({ column, height, cabinetTop, cabinetBottom, railBottom, years, year, today, counts, reducedMotion,
  onSelectYear, onOpenMonth, onLocked, targets, footer, hiddenMonth, bookNodes, pull, pullGeometry, fill = false, deskTouch = false }: {
  column: number; height: number; cabinetTop: number; cabinetBottom: number; railBottom: number;
  years: number[]; year: number; today: string; counts: Map<string, number>; reducedMotion: boolean;
  onSelectYear: (year: number) => void; onOpenMonth: (year: number, month: number, rect: ShelfRect | null) => void; onLocked: (message: string) => void;
  targets: { years: Target; books: Target; shelf: Target }; footer: (left: number, right: number) => ReactNode;
  /** Months whose books are out of the shelf (drawn by their open books instead), by monthKey. */
  hiddenMonth?: string | string[] | null; bookNodes: RefObject<Map<string, ShelfSlot>>;
  /** Camera pull-back toward the writing desk (0 at rest), and where it ends (null while no book is open). */
  pull?: SharedValue<number>; pullGeometry?: PullGeometry | null;
  /** The bookcase as seen from the writing desk: as wide as the column (see shelfLayout). */
  fill?: boolean;
  /** Seen from the desk, its books are small: each one's touch area widens to the middle of the gap beside it (never
   *  into its neighbour's). */
  deskTouch?: boolean;
}) {
  const layout = shelfLayout(column, cabinetTop, cabinetBottom, fill);
  const isHidden = (key: string) => Array.isArray(hiddenMonth) ? hiddenMonth.includes(key) : hiddenMonth === key;
  const slots = bookSlots(layout, cabinetTop);
  const camera = shelfCamera(layout, cabinetTop, cabinetBottom);
  const images = useShelfImages();
  const drawn = !!(images.atlas && images.grain && images.edges);
  const [pressed, setPressed] = useState<number | null>(null);
  // Re-record the 3D shelf only when what it shows changes (not on every parent render).
  const drawnBooks: ShelfBookSpec[] = slots.map(slot => {
    const count = counts.get(monthKey(year, slot.month)) || 0;
    return { month: slot.month, x: slot.left + slot.width / 2, bottom: slot.top + slot.height, height: slot.height,
      locked: monthLocked(year, slot.month, today, count), hidden: isHidden(monthKey(year, slot.month)), lifted: pressed === slot.month };
  });
  const sceneKey = JSON.stringify([camera, drawnBooks]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => ({ camera, books: drawnBooks }), [sceneKey]);
  const { scale, width } = layout;
  const sourceTop = SHELF.top - cabinetTop / scale;
  const fade = useRef(new Animated.Value(1)).current;
  const shownYear = useRef(year);
  useEffect(() => {
    if (shownYear.current === year) return;
    shownYear.current = year;
    fade.setValue(reducedMotion ? 1 : .2);
    Animated.timing(fade, { toValue: 1, duration: reducedMotion ? 0 : 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [year, fade, reducedMotion]);
  const booksLeft = layout.interior[0] - layout.overlap;
  // ---------- the camera pulling back to the desk ----------
  // The whole shelf (painting, books, year rail) is one rigid picture: a single uniform scale about its top centre,
  // then a translation (book3d/scene.ts, shelfTransform).
  const g = pullGeometry || null;
  const zero = useDerivedValue(() => 0);
  const p = pull || zero;
  const pulledStyle = useAnimatedStyle(() => {
    const t = shelfTransform(p.value, g);
    return { transform: [{ translateX: t.tx }, { translateY: t.ty }, { scale: t.k }] };
  });
  const footerStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - p.value * 5) }));

  return <Reanimated.View testID="treehouse-shelf" style={[{ width, height, transformOrigin: [width / 2, 0, 0] }, pulledStyle]}>
    {/* The painting itself, slice by slice; each join gets a short cross-fade from the slice before it. */}
    {layout.slices.map((slice, i) => <ArtWindow key={`s${i}`} scale={scale} sx={slice.sx} sy={sourceTop} width={slice.to - slice.from} height={height}
      style={[StyleSheet.absoluteFill, { left: slice.from }]} />)}
    {layout.slices.slice(1).map((slice, i) => {
      const before = layout.slices[i];
      return Array.from({ length: FEATHER }, (_, k) => <ArtWindow key={`f${i}-${k}`} scale={scale} sx={before.sx + (before.to - before.from + k * 2) / scale} sy={sourceTop}
        width={2} height={height} style={[StyleSheet.absoluteFill, { left: slice.from + k * 2, opacity: 1 - (k + 1) / (FEATHER + 1) }]} />);
    })}
    <View {...targets.shelf} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: cabinetTop, height: cabinetBottom - cabinetTop }} />
    <YearRail layout={layout} cabinetTop={cabinetTop} railBottom={railBottom} years={years} year={year} today={today} counts={counts}
      onSelectYear={onSelectYear} onLocked={onLocked} target={targets.years} />
    <Animated.View {...targets.books} accessibilityLabel={`${year} bookshelf`}
      style={{ position: 'absolute', left: booksLeft, top: cabinetTop, width: layout.interior[1] - layout.interior[0] + layout.overlap * 2, height: cabinetBottom - cabinetTop, opacity: fade }}>
      {drawn && <ShelfBooks width={layout.interior[1] - layout.interior[0] + layout.overlap * 2} height={cabinetBottom - cabinetTop}
        camera={scene.camera} books={scene.books} images={images} />}
      {slots.map(slot => {
        const key = monthKey(year, slot.month);
        const count = counts.get(key) || 0;
        return <Book key={slot.month} month={slot.month} year={year} count={count} locked={monthLocked(year, slot.month, today, count)} drawn={drawn}
          left={slot.left} top={slot.top} width={slot.width} height={slot.height} hidden={isHidden(key)}
          hitSlop={deskTouch ? { left: slot.column === 0 ? 8 : layout.gap / 2, right: slot.column === 2 ? 8 : layout.gap / 2, top: Math.max(4, 3 * scale), bottom: 6 } : undefined}
          register={node => {
            if (node) bookNodes.current?.set(key, { node, camera: { dx: camera.cx - slot.left, dy: camera.cy - slot.top, d: camera.d } });
            else bookNodes.current?.delete(key);
          }}
          onPressIn={() => setPressed(slot.month)} onPressOut={() => setPressed(month => month === slot.month ? null : month)}
          onPress={() => void measureBook(bookNodes.current?.get(key)).then(rect => onOpenMonth(year, slot.month, rect))}
          onLocked={() => onLocked('This month has not arrived yet.')} />;
      })}
    </Animated.View>
    <Reanimated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, footerStyle]}>{footer(layout.rail[1] + 6, 8)}</Reanimated.View>
  </Reanimated.View>;
}

function Book({ month, year, count, locked, drawn, left, top, width, height, hidden, hitSlop, register, onPress, onPressIn, onPressOut, onLocked }: {
  month: number; year: number; count: number; locked: boolean; drawn: boolean; left: number; top: number; width: number; height: number;
  hitSlop?: { left: number; right: number; top: number; bottom: number };
  hidden: boolean; register: (node: View | null) => void; onPress: () => void; onPressIn: () => void; onPressOut: () => void; onLocked: () => void;
}) {
  const name = `${MONTH_NAMES[month - 1]} ${year}`;
  const lock = Math.max(14, Math.min(19, width * .44));
  return <Pressable ref={register} testID={`book-${monthKey(year, month)}`} accessibilityRole="button"
    accessibilityLabel={locked ? `${name}, locked` : `${name}, ${count ? `${count} ${count === 1 ? 'journal' : 'journals'}` : 'no journals yet'}`}
    accessibilityHint={locked ? 'This month has not arrived yet.' : undefined} accessibilityState={{ disabled: locked }}
    onPress={locked ? onLocked : onPress} onPressIn={locked ? undefined : onPressIn} onPressOut={onPressOut} hitSlop={hitSlop || { left: 2, right: 2, top: 4, bottom: 4 }}
    disabled={hidden} style={({ pressed }) => [{ position: 'absolute', left, top, width, height, opacity: hidden ? 0 : 1 }, pressed && !locked && { transform: [{ translateY: -4 }] }]}>
    {/* The web ignores hitSlop: there the wider touch area is an invisible margin around the book (the measured slot
        stays the book itself). */}
    {hitSlop && Platform.OS === 'web' && <View style={{ position: 'absolute', left: -hitSlop.left, right: -hitSlop.right, top: -hitSlop.top, bottom: -hitSlop.bottom }} />}
    {/* The 3D book itself is drawn by ShelfBooks underneath; until its textures load, the flat painted spine stands in. */}
    {!drawn && <><View pointerEvents="none" style={[styles.backShadow, { borderRadius: width * .18 }]} />
    <View pointerEvents="none" style={styles.contactShadow} />
    <View style={{ width, height, isolation: 'isolate' }}>
      {/* The month's original floral spine, never redrawn or stretched. */}
      <BookhouseArt index={month - 1} width={width} height={height} />
      {/* Not yet arrived: a spine-shaped grey copy desaturates the painting in place (saturation blend),
          and a pale copy lifts it slightly so the book reads grey, never dark. */}
      {locked && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.desaturate]}><BookhouseArt index={month - 1} width={width} height={height} tint="#8F8C87" /></View>}
      {locked && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil]}><BookhouseArt index={month - 1} width={width} height={height} tint="#F4EEE3" /></View>}
    </View></>}
    <View pointerEvents="none" style={[styles.label, locked && styles.labelLocked, { top: height * .2 }]}>
      <Text numberOfLines={1} style={[styles.labelText, locked && { color: '#4A453C' }, { fontSize: Math.max(11, Math.min(15, width * .34)) }]}>{MONTHS[month - 1]}</Text>
    </View>
    {locked && <View pointerEvents="none" style={[styles.lock, { top: height * .045, right: -lock * .32 }]}><Icon source={LOCK_ICON} size={lock} /></View>}
    {!!count && <View pointerEvents="none" style={[styles.ribbon, { right: width * .16 }]}><View style={styles.ribbonNotch} /></View>}
  </Pressable>;
}

function YearRail({ layout, cabinetTop, railBottom, years, year, today, counts, onSelectYear, onLocked, target, inert = false }: {
  inert?: boolean; layout: Layout; cabinetTop: number; railBottom: number; years: number[]; year: number; today: string; counts: Map<string, number>;
  onSelectYear: (year: number) => void; onLocked: (message: string) => void; target: Target;
}) {
  const [left, right] = layout.rail;
  const label = 26;
  // Five years sit under the pillar's five carvings; any other count is spaced evenly down the pillar.
  const carved = years.length === SHELF.carvings.length;
  const step = Math.max(44, (railBottom - cabinetTop) / Math.max(1, years.length));
  const tops: number[] = carved ? SHELF.carvings.map(c => layout.y(c.bottom) + 2) : years.map((_, i) => cabinetTop + step * (i + 1) - label - 6);
  for (let i = tops.length - 1; i >= 0; i--) tops[i] = Math.min(tops[i], (i === tops.length - 1 ? railBottom : tops[i + 1]) - label - (i === tops.length - 1 ? 0 : 6));
  const current = Number(today.slice(0, 4));
  const contentHeight = Math.max(railBottom, tops[tops.length - 1] + label + 4) - cabinetTop;
  return <View {...target} pointerEvents={inert ? 'none' : 'auto'} accessibilityElementsHidden={inert} importantForAccessibility={inert ? 'no-hide-descendants' : 'auto'}
    style={{ position: 'absolute', left, width: right - left, top: cabinetTop, height: railBottom - cabinetTop }}>
    <ScrollView scrollEnabled={contentHeight > railBottom - cabinetTop + 1} showsVerticalScrollIndicator={false} bounces={false}
      accessibilityRole="tablist" accessibilityLabel="Journal years" contentContainerStyle={{ height: contentHeight }}>
      {years.map((value, i) => {
        const saved = Array.from({ length: 12 }, (_, m) => counts.get(monthKey(value, m + 1)) || 0).reduce((a, b) => a + b, 0);
        const locked = yearLocked(value, today, saved);
        const selected = value === year;
        const slotTop = i === 0 ? 0 : tops[i - 1] + label - cabinetTop;
        return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected, disabled: locked }}
          accessibilityLabel={`${value}${value === current ? ', this year' : ''}${locked ? ', locked' : saved ? `, ${saved} ${saved === 1 ? 'journal' : 'journals'}` : ''}`}
          accessibilityHint={locked ? 'This year has not arrived yet.' : undefined}
          onPress={() => locked ? onLocked(`${value} has not arrived yet.`) : onSelectYear(value)}
          style={{ position: 'absolute', left: 0, right: 0, top: slotTop, height: tops[i] + label - cabinetTop - slotTop, justifyContent: 'flex-end', alignItems: 'center' }}>
          <View style={[styles.year, selected ? styles.yearSelected : locked ? styles.yearLocked : value === current ? styles.yearCurrent : styles.yearInlay]}>
            <Text numberOfLines={1} style={[styles.yearText, selected ? styles.yearSelectedText : locked ? styles.yearLockedText : value === current ? styles.yearCurrentText : null]}>{value}</Text>
            {locked && <Icon source={LOCK_ICON} size={12} />}
          </View>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  backShadow: { position: 'absolute', left: 3, right: -3, top: 4, bottom: 0, backgroundColor: '#140A03', opacity: .22 },
  contactShadow: { position: 'absolute', left: -3, right: -3, bottom: -2, height: 5, borderRadius: 4, backgroundColor: '#140A03', opacity: .42 },
  desaturate: { mixBlendMode: 'saturation', opacity: .9 },
  veil: { opacity: .2 },
  label: { position: 'absolute', alignSelf: 'center', backgroundColor: '#F7E4BEF2', paddingHorizontal: 2, borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#B89462' },
  labelLocked: { backgroundColor: '#ECE6DBF2', borderColor: '#A49C8E' },
  labelText: { fontFamily: serif, color: '#3B3525' },
  lock: { position: 'absolute', shadowColor: '#140A03', shadowOpacity: .5, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  ribbon: { position: 'absolute', top: -5, width: 6, height: 16, backgroundColor: '#A8443A', borderTopLeftRadius: 1, borderTopRightRadius: 1 },
  ribbonNotch: { position: 'absolute', bottom: -3, left: 0, width: 0, height: 0, borderLeftWidth: 3, borderRightWidth: 3, borderTopWidth: 3,
    borderLeftColor: '#A8443A', borderRightColor: '#A8443A', borderTopColor: 'transparent' },
  year: { minWidth: '76%', height: 26, paddingHorizontal: 5, borderRadius: 6, borderWidth: 1, flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center' },
  yearText: { fontFamily: serif, fontSize: 14, color: '#F1DDB3' },
  // Past years: honey-wood inlays. This year: a gilt edge. Selected: lifted parchment. Future: grey with a lock.
  yearInlay: { backgroundColor: '#3A2412B8', borderColor: '#B48A52' },
  yearCurrent: { backgroundColor: '#4A2E14D0', borderColor: '#E9C77E', borderWidth: 1.5 },
  yearCurrentText: { color: '#FFE9B8', fontWeight: '600' },
  yearSelected: { backgroundColor: palette.parchment, borderColor: palette.gold, borderWidth: 1.5,
    shadowColor: '#1B0E06', shadowOpacity: .45, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  yearSelectedText: { fontSize: 15, fontWeight: '600', color: '#4B3218', letterSpacing: .3 },
  yearLocked: { backgroundColor: '#5B5650B0', borderColor: '#9D978C' },
  yearLockedText: { color: '#D9D3C8' },
});
