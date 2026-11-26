import { useEffect, useRef, useState } from 'react';
import { BookhouseArt } from './BookhouseArt';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';

// Keep every character, preferring a word boundary when a measured page is full.
export function pageBreak(text: string, fitting: number) {
  if (fitting >= text.length) return text.length;
  const prefix = text.slice(0, fitting);
  const boundary = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('\n'));
  let end = boundary > fitting * .6 ? boundary + 1 : Math.max(1, fitting);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end = end === 1 ? 2 : end - 1;
  return Math.max(1, end);
}

// Text indices are independent of spread/animation state; the intro is not numbered.
export function composeSpreads(pageCount: number) {
  return Array.from({ length: Math.max(1, Math.ceil((pageCount + 1) / 2)) }, (_, spread) => ({
    left: spread === 0 ? 'intro' as const : spread * 2 - 1,
    right: spread * 2 < pageCount ? spread * 2 : null,
  }));
}

type Paper = { width: number; height: number; bookWidth: number; bookHeight: number; inset: number; top: number; bottom: number; date: string; night?: boolean };
// Bounds of the right paper leaf in the existing open-book sprite, not the text box.
// Both resting and moving sheets share these bounds and the same paper texture.
const leaf = { x: .5, y: .095, width: .38, height: .755 };
function PaperTexture({ paper }: { paper: Paper }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    <View style={{ position: 'absolute', left: -paper.bookWidth * leaf.x, top: -paper.bookHeight * leaf.y }}>
      <BookhouseArt index={12} width={paper.bookWidth} height={paper.bookHeight} />
    </View>
    {paper.night && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#976635', opacity: .16 }]} />}
  </View>;
}
function Header({ date }: { date: string }) {
  return <View style={styles.header}><Text style={styles.caption}>Private journal</Text><Text style={styles.caption}>{date}</Text></View>;
}
export function JournalPages({ text, textStyle, bookWidth, bookHeight, inset, date, night, onIntroChange }: { text: string; textStyle: TextStyle; bookWidth: number; bookHeight: number; inset: number; date: string; night?: boolean; onIntroChange?: (visible: boolean) => void }) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [footerHeight, setFooterHeight] = useState(0);
  const { fontScale } = useWindowDimensions();
  const paper: Paper = { width: bookWidth * leaf.width, height: bookHeight * leaf.height, bookWidth, bookHeight, inset, top: bookHeight * .055 + 6, bottom: bookHeight * .04, date, night };
  const bodyHeight = Math.floor(area.height - footerHeight - 12);
  return <View style={{ position: 'absolute', left: bookWidth * (leaf.x - leaf.width), top: bookHeight * leaf.y, width: paper.width * 2, height: paper.height, zIndex: 2 }}>
    <View pointerEvents="none" accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { left: paper.width, opacity: 0, paddingHorizontal: inset, paddingTop: paper.top, paddingBottom: paper.bottom }]}>
      <Header date={date} />
      <View style={{ flex: 1, minHeight: 0 }} onLayout={event => setArea(event.nativeEvent.layout)} />
      <View style={[styles.turns, { position: 'absolute', width: paper.width - inset * 2 }]} onLayout={event => setFooterHeight(event.nativeEvent.layout.height)}><Text style={styles.turn}>‹</Text><Text style={styles.number}>Page 999 of 999</Text><Text style={styles.turn}>›</Text></View>
    </View>
    {area.width > 0 && bodyHeight >= Number(textStyle.lineHeight) * fontScale && footerHeight > 0 ?
      <MeasuredPages key={`${text}:${area.width}:${bodyHeight}:${fontScale}:${textStyle.fontSize}`} text={text} width={area.width} height={bodyHeight} textStyle={textStyle} paper={paper} onIntroChange={onIntroChange} /> : null}
  </View>;
}

// The probe and visible text have exactly the same width and typography. A small
// pixel allowance protects against fractional native/web line-box rounding.
export function MeasuredPages({ text, width, height, textStyle, paper, onIntroChange }: { text: string; width: number; height: number; textStyle: TextStyle; paper: Paper; onIntroChange?: (visible: boolean) => void }) {
  const [pages, setPages] = useState<string[]>([]);
  const [spread, setSpread] = useState(0);
  const spreads = composeSpreads(pages.length);
  const [turning, setTurning] = useState<{ from: number; to: number } | null>(null);
  const progress = useState(() => new Animated.Value(0))[0];
  const locked = useRef(false);
  const reduced = useRef(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) reduced.current = value; });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduced.current = value; });
    return () => { active = false; subscription.remove(); progress.stopAnimation(); };
  }, [progress]);
  const [measure, setMeasure] = useState({ offset: 0, low: 1, high: text.length, probe: text.length, best: 0 });
  const complete = measure.offset >= text.length;
  const measured = (actualHeight: number) => {
    const remaining = text.slice(measure.offset);
    const fits = actualHeight <= height - 2;
    const best = fits ? measure.probe : measure.best;
    const low = fits ? measure.probe + 1 : measure.low;
    const high = fits ? measure.high : measure.probe - 1;
    if (low <= high) {
      setMeasure({ ...measure, low, high, best, probe: Math.floor((low + high) / 2) });
      return;
    }
    const end = pageBreak(remaining, best);
    setPages(previous => [...previous, remaining.slice(0, end)]);
    const offset = measure.offset + end;
    setMeasure({ offset, low: 1, high: text.length - offset, probe: text.length - offset, best: 0 });
  };
  const turn = (direction: number) => {
    const to = spread + direction;
    if (!complete || locked.current || to < 0 || to >= spreads.length) return;
    if (reduced.current) { setSpread(to); return; }
    locked.current = true;
    progress.setValue(0);
    setTurning({ from: spread, to });
    Animated.timing(progress, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (finished) { setSpread(to); setTurning(null); locked.current = false; }
    });
  };
  useEffect(() => { onIntroChange?.(spread === 0 || turning?.to === 0); }, [spread, turning, onIntroChange]);
  useEffect(() => () => onIntroChange?.(true), [onIntroChange]);
  const backwards = !!turning && turning.to < turning.from;
  const angle = progress.interpolate({ inputRange: [0, 1], outputRange: backwards ? ['-180deg', '0deg'] : ['0deg', '-180deg'] });
  const paperShape = { ...(Platform.OS === 'web' ? { clipPath: 'polygon(0% 5%, 8% 2%, 25% 0%, 96% 0%, 100% 3%, 100% 94%, 96% 95%, 65% 94%, 30% 95%, 8% 98%, 0% 100%)' } : {}), borderTopLeftRadius: paper.height * .035, borderBottomLeftRadius: paper.height * .04, borderTopRightRadius: paper.width * .06, borderBottomRightRadius: 7 };
  const surface = (index: number | null, interactive: boolean, side: 'left' | 'right' = 'right') => <View style={[StyleSheet.absoluteFill, { ...paperShape, ...(side === 'left' && Platform.OS === 'web' ? { clipPath: 'polygon(100% 5%, 92% 2%, 75% 0%, 4% 0%, 0% 3%, 0% 94%, 4% 95%, 35% 94%, 70% 95%, 92% 98%, 100% 100%)' } : {}), overflow: 'hidden' }]}>
    <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: side === 'left' ? -1 : 1 }] }]}><PaperTexture paper={paper} /></View>
    {index !== null && <View style={{ flex: 1, paddingHorizontal: paper.inset, paddingTop: paper.top, paddingBottom: paper.bottom }}>
      <Header date={paper.date} />
      <Pressable accessibilityRole="button" accessibilityLabel={side === 'left' ? 'Turn journal page back' : 'Turn journal page'} disabled={!interactive || !complete || !!turning || (side === 'left' ? spread === 0 : spread >= spreads.length - 1)} onPress={() => turn(side === 'left' ? -1 : 1)} style={{ width, height }}>
        <View style={{ width, height, overflow: 'hidden' }}><Text selectable style={[textStyle, { width, flexShrink: 0 }]}>{pages[index] || ''}</Text></View>
      </Pressable>
      <View style={styles.turns}>
        {side === 'left' ? <Pressable accessibilityRole="button" accessibilityLabel="Previous journal page" disabled={!interactive || !complete || !!turning || spread === 0} onPress={() => turn(-1)} style={[styles.turn, { opacity: spread === 0 ? .35 : 1 }]}><Text style={styles.arrow}>‹</Text></Pressable> : <View style={styles.turn} />}
        <Text accessibilityLiveRegion={interactive ? 'polite' : 'none'} style={styles.number}>{complete ? `Page ${index + 1} of ${Math.max(1, pages.length)}` : 'Preparing pages…'}</Text>
        {side === 'right' ? <Pressable accessibilityRole="button" accessibilityLabel="Next journal page" disabled={!interactive || !complete || !!turning || spread >= spreads.length - 1} onPress={() => turn(1)} style={[styles.turn, { opacity: spread >= spreads.length - 1 ? .35 : 1 }]}><Text style={styles.arrow}>›</Text></Pressable> : <View style={styles.turn} />}
      </View>
    </View>}
  </View>;
  return <View style={StyleSheet.absoluteFill}>
    {!complete && width > 0 && <Text key={`${measure.offset}:${measure.probe}`} accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
      onLayout={event => measured(event.nativeEvent.layout.height)}
      style={[textStyle, { position: 'absolute', left: 0, top: 0, width, flexShrink: 0, opacity: 0 }]}>{text.slice(measure.offset, measure.offset + measure.probe)}</Text>}
    {(() => {
      const left = spreads[turning && backwards ? turning.to : spread].left;
      return left === 'intro' ? null : <View testID="journal-left-page" style={{ position: 'absolute', left: 0, top: 0, width: paper.width, height: paper.height }}>{surface(left, true, 'left')}</View>;
    })()}
    <View testID="journal-right-page" style={[StyleSheet.absoluteFill, { left: paper.width }]}>{surface(spreads[turning && !backwards ? turning.to : spread].right, true)}</View>
    {turning && <>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: paper.width, top: 7, bottom: 7, width: 24, backgroundColor: '#604322', opacity: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [0, .12, 0] }), transform: [{ translateX: progress.interpolate({ inputRange: [0, .5, 1], outputRange: backwards ? [0, 0, paper.width - 24] : [paper.width - 24, 0, 0] }) }] }} />
      <Animated.View testID="turning-paper-leaf" pointerEvents="none" accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { left: paper.width, zIndex: 2, ...(Platform.OS === 'web' ? { transformStyle: 'preserve-3d' as const } : {}), transform: [{ perspective: paper.width * 8 }, { translateX: -paper.width / 2 }, { rotateY: angle }, { translateX: paper.width / 2 }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backfaceVisibility: 'hidden', opacity: progress.interpolate({ inputRange: [0, .499, .501, 1], outputRange: backwards ? [0, 0, 1, 1] : [1, 1, 0, 0] }) }]}>{surface(spreads[backwards ? turning.to : turning.from].right, false)}</Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { ...paperShape, overflow: 'hidden', opacity: progress.interpolate({ inputRange: [0, .499, .501, 1], outputRange: backwards ? [1, 1, 0, 0] : [0, 0, 1, 1] }) }]}>
          <View style={[StyleSheet.absoluteFill, { transform: [{ rotateY: '180deg' }] }]}>{surface(spreads[backwards ? turning.from : turning.to].left as number, false, 'left')}</View>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#765632', opacity: .12 }]} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { ...paperShape, backgroundColor: '#664728', opacity: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [0, .15, 0] }) }]} />
        <Animated.View style={{ position: 'absolute', right: 0, top: 7, bottom: 7, width: 2, backgroundColor: '#FFF3D6', opacity: progress.interpolate({ inputRange: [0, .5, 1], outputRange: [0, .8, 0] }) }} />
      </Animated.View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', borderBottomWidth: 1, borderColor: '#CBB58E', paddingBottom: 10, marginBottom: 14 },
  caption: { color: '#51432F', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  turns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, borderTopWidth: 1, borderColor: '#CBB58E' },
  turn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: '#725332', fontSize: 28 }, number: { color: '#725C42', fontSize: 11, flexShrink: 1, textAlign: 'center' },
});
