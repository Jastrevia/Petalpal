import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

// PetalPal's loading screen: Letterwing (the mailbox's spirit bird) flies along a turquoise
// progress bar as a living progress indicator. It only reflects real work: `progress` is a
// measured fraction (0–1), and the bird's centre always sits over the leading edge of the fill.
// When nothing is measurable (`progress` null) the bar stays empty, three dots pulse in place
// inside it and the bird waits over the start, wings beating; no fake progress, no sweeping.
// `done` is set by the caller only once the screen behind it is genuinely ready: the bar and the
// bird reach the end together, the bird flaps there a moment, then the whole screen fades and
// `onExited` fires. The bird never leaves the bar. public/index.html draws the same screen
// before React starts; keep the two in step.

// Letterwing sheet (see garden/Letterwing.tsx): 220 × 150 cells, 11 to a row, painted facing
// right at 12 fps. Frames 0–61 are FLY, one whole flying clip whose first frame equals its last,
// so it loops seamlessly. TURN and FOLD (the letter) are never used here.
const LETTERWING = require('@/assets/garden/spirits/letterwing.webp');
const CELL = { w: 220, h: 150, columns: 11, rows: 14, fps: 12 };
const FLY_FRAMES = 62;
const WING_SECONDS = FLY_FRAMES / CELL.fps;

// Bar and bird move together: one target value, one duration, one easing for both.
const MOVE_MS = 600, REDUCED_MOVE_MS = 200;
const MOVE_EASING_CSS = 'cubic-bezier(0.33, 1, 0.68, 1)'; // the same ease-out cubic
const FADE_MS = 450;
// After the last move to the end, the bird keeps flapping at the end of the full bar this long
// before the screen fades.
const DONE_HOLD_MS = 250;
// Waiting dots (nothing measurable yet): size, gap, and one pulse running across all three.
const DOT_SIZE = 5, DOT_GAP = 6;
const DOT_PULSE_SECONDS = 1.2, DOT_STAGGER = 0.2;

// One clock for every loading screen (the web boot screen in public/index.html uses the same
// page clock), so the wingbeat and the waiting dots carry on unbroken when one loading screen
// hands over to the next.
const CLOCK_ORIGIN = Date.now();
function clockSeconds() {
  return (Platform.OS === 'web' && typeof performance !== 'undefined' ? performance.now() : Date.now() - CLOCK_ORIGIN) / 1000;
}

const TURQUOISE = '#5AA4AB';
const GOLD = '#C8A55E';
const SAGE = '#7FA88E';
const BLUSH = '#F2CFCA';
// Room on each side of the bar for the blossom-and-vine end ornaments.
const ORNAMENT_PAD = 52;
// Inside the bar's 1.5 px gold border and 1.5 px padding.
const TRACK_INSET = 3;
const WEB_FILL = { backgroundColor: TURQUOISE, backgroundImage: `linear-gradient(180deg, #7DBDC2 0%, ${TURQUOISE} 55%, #4F979E 100%)` };

export type PigeonLoadingProps = {
  /** Measured fraction 0–1, or null when progress can't be measured (indeterminate bar). */
  progress: number | null;
  message: string;
  /** Small line under the message (real progress detail, failures). */
  hint?: ReactNode;
  /** True only when the target screen is ready: completes the bar, then the screen fades. */
  done?: boolean;
  onExited?: () => void;
  /** Shown below the message (flower notes); it never moves the bird or the bar. */
  children?: ReactNode;
  /** Cover the parent (Garden overlay) instead of filling a flex parent. */
  overlay?: boolean;
  testID?: string;
};

export function PigeonLoadingScreen({
  progress, message, hint, done = false, onExited, children, overlay = false, testID = 'pigeon-loading',
}: PigeonLoadingProps) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotionPreference();
  const compact = width < 600;
  const birdHeight = compact ? 92 : 116;
  const birdWidth = birdHeight * CELL.w / CELL.h;
  // Narrow enough that the bird is never clipped with its centre over either end of the bar.
  const barWidth = Math.max(120, Math.min(compact ? 300 : 380, width - birdWidth - 24, width - 2 * ORNAMENT_PAD - 16));
  const fade = useRef(new Animated.Value(1)).current;
  const exitedRef = useRef(onExited);
  exitedRef.current = onExited;

  useEffect(() => {
    if (!done) { fade.setValue(1); return; }
    // The bar and the bird finish their last move to the end together (same duration as every
    // move), the bird flaps at the end for a moment, then the screen fades over the Garden, which is already ready and receives touches.
    const run = Animated.sequence([
      Animated.delay((reduced ? REDUCED_MOVE_MS : MOVE_MS) + DONE_HOLD_MS),
      Animated.timing(fade, { toValue: 0, duration: reduced ? 250 : FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    ]);
    run.start(({ finished }) => { if (finished) exitedRef.current?.(); });
    return () => run.stop();
  }, [done, reduced, fade]);

  // The bird, bar and message keep one fixed place (a little above centre, leaving room below);
  // hints and flower notes hang underneath it, so nothing that appears later moves the bird.
  const room = height >= 700 ? 240 : 140;
  return <Animated.View testID={testID} pointerEvents={done ? 'none' : 'box-none'}
    style={[styles.root, overlay && styles.overlay, { opacity: fade, paddingBottom: room }]}>
    {Platform.OS === 'web' ? <View pointerEvents="none" style={styles.halo} /> : null}
    <View style={styles.stage}>
      <ProgressFlight progress={done ? 1 : progress} barWidth={barWidth} birdHeight={birdHeight} reduced={reduced} />
      <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
      <View style={[styles.below, { width: Math.min(360, width - 32) }]}>
        {hint ? <View style={styles.hint}>{typeof hint === 'string' ? <Text style={styles.hintText}>{hint}</Text> : hint}</View> : null}
        {children}
      </View>
    </View>
  </Animated.View>;
}

function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }, () => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => setReduced(value));
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}

// The bar with Letterwing flying just above it. Geometry comes from the bar's rendered inner
// width (measured), and the bird's rail is laid exactly over the bar's inside: rail x = 0 is the
// fill's start, rail x = inner is its end. One position drives both: the fill's leading edge and
// the bird's centre sit at `at` × inner and ease there together with MOVE_MS. Measured progress →
// `at` is that fraction. Nothing measurable yet → `at` stays 0: the bar is empty, three dots pulse
// in place inside it and the bird hovers over the start with its wings beating. It never sweeps,
// never turns round, and moves only when real progress arrives.
function ProgressFlight({ progress, barWidth, birdHeight, reduced }: { progress: number | null; barWidth: number; birdHeight: number; reduced: boolean }) {
  const determinate = progress !== null && Number.isFinite(progress);
  const at = determinate ? Math.max(0, Math.min(1, progress as number)) : 0;
  const birdWidth = birdHeight * CELL.w / CELL.h;
  const [measured, setMeasured] = useState<number | null>(null);
  const inner = measured ?? barWidth - 2 * TRACK_INSET;
  const lane = birdHeight + 26;
  // Inset so Letterwing's feet hover slightly (~3-4 px) above the top edge of the track.
  const birdBottomInset = Math.round(birdHeight * 0.15) - 4;
  const railHeight = lane + 14 + birdBottomInset;
  const motion = useFlightMotion(at, reduced);
  const moveMs = reduced ? REDUCED_MOVE_MS : MOVE_MS;

  const web = Platform.OS === 'web';
  // Web: the first paint is at the start of the bar (where the boot screen's bird waits), then
  // transitions carry every change, so the bird never jumps.
  const webAt = motion.armed ? at : 0;
  const webMove = motion.armed ? `transform ${moveMs}ms ${MOVE_EASING_CSS}` : 'none';

  const fillNode = web
    ? <div data-testid="pigeon-loading-fill" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%', borderRadius: 6, overflow: 'hidden', ...WEB_FILL,
        transform: `translateX(${(webAt - 1) * 100}%)`, transition: webMove }}><View style={styles.fillShine} /></div>
    : <Animated.View testID="pigeon-loading-fill" style={[styles.fill, { position: 'absolute', left: 0, top: 0, bottom: 0, width: inner,
        transform: [{ translateX: motion.fill.interpolate({ inputRange: [0, 1], outputRange: [-inner, 0] }) }] }]}>
        <View style={styles.fillShine} />
      </Animated.View>;

  // Bird centre on the rail = the fill's leading edge (at × inner).
  const birdNode = web
    ? <div data-testid="pigeon-loading-mover" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
        transform: `translateX(${webAt * 100}%)`, transition: webMove }}>
        <div style={{ position: 'absolute', left: -birdWidth / 2, bottom: 0, width: birdWidth, height: birdHeight }}>
          <WebLetterwing height={birdHeight} reduced={reduced} />
        </div>
      </div>
    : <Animated.View testID="pigeon-loading-mover" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
        transform: [{ translateX: motion.bird.interpolate({ inputRange: [0, 1], outputRange: [0, inner] }) }] }}>
        <View style={{ position: 'absolute', left: -birdWidth / 2, bottom: 0, width: birdWidth, height: birdHeight }}>
          <NativeLetterwing height={birdHeight} reduced={reduced} />
        </View>
      </Animated.View>;

  return <View style={{ width: barWidth + 2 * ORNAMENT_PAD, height: lane + 44 }}>
    {web ? <style>{WEB_CSS}</style> : null}
    <View style={{ position: 'absolute', left: 0, right: 0, top: lane, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View accessibilityRole="progressbar" accessibilityLabel="Loading progress"
        accessibilityValue={determinate ? { min: 0, max: 100, now: Math.round(at * 100) } : undefined}
        accessibilityState={{ busy: true }} testID="pigeon-loading-bar"
        {...(web ? { dataSet: { progress: determinate ? at.toFixed(3) : 'indeterminate' } } as object : {})}
        style={[styles.track, { width: barWidth }]}>
        <View style={styles.trackInner} onLayout={event => {
          const next = event.nativeEvent.layout.width;
          if (next > 0 && Math.abs(next - inner) > 0.5) setMeasured(next);
        }}>{fillNode}<WaitingDots visible={!determinate} reduced={reduced} /></View>
      </View>
      <View pointerEvents="none" style={[styles.endCap, { left: 0 }]}><EndOrnament /></View>
      <View pointerEvents="none" style={[styles.endCap, { right: 0, transform: [{ scaleX: -1 }] }]}><EndOrnament /></View>
      {[0.24, 0.5, 0.76].map((spot, index) => <View key={spot} pointerEvents="none"
        style={[styles.sprig, { left: ORNAMENT_PAD + barWidth * spot - 11, transform: index === 1 ? [] : [{ scaleX: index === 0 ? -1 : 1 }] }]}>
        <Sprig small={index === 1} />
      </View>)}
    </View>
    {/* The bird's rail: exactly over the inside of the bar, sitting slightly above the bar. */}
    <View pointerEvents="none" testID="pigeon-loading-rail"
      style={{ position: 'absolute', left: ORNAMENT_PAD + TRACK_INSET, width: inner, top: 0, height: railHeight }}>{birdNode}</View>
  </View>;
}

// The waiting sign while nothing is measurable: three dots in the middle of the empty bar that
// brighten one after another. They stay in place (no number, no sweeping band) and fade out as
// soon as real progress starts filling the bar. Same dots, sizes and timing as public/index.html.
function WaitingDots({ visible, reduced }: { visible: boolean; reduced: boolean }) {
  const [delay] = useState(() => -(clockSeconds() % DOT_PULSE_SECONDS));
  if (Platform.OS === 'web') {
    return <div data-testid="pigeon-loading-waiting" aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: DOT_GAP, opacity: visible ? 1 : 0, transition: 'opacity 300ms ease-out' }}>
      {[0, 1, 2].map(i => <div key={i} style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: TURQUOISE,
        opacity: reduced ? 0.7 : 0.3, animation: reduced ? undefined : `ppl-wait ${DOT_PULSE_SECONDS}s ease-in-out ${delay + i * DOT_STAGGER}s infinite` }} />)}
    </div>;
  }
  return visible ? <NativeWaitingDots reduced={reduced} /> : null;
}

function NativeWaitingDots({ reduced }: { reduced: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { pulse.setValue(0); return; }
    const run = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: DOT_PULSE_SECONDS * 1000, easing: Easing.linear, useNativeDriver: true }));
    run.start();
    return () => run.stop();
  }, [reduced, pulse]);
  return <View testID="pigeon-loading-waiting" pointerEvents="none" style={styles.waiting}>
    {[0, 1, 2].map(i => <Animated.View key={i} style={[styles.dot, { opacity: reduced ? 0.7
      : pulse.interpolate({ inputRange: DOT_STEPS, outputRange: DOT_STEPS.map(t => dotOpacity(t - i * DOT_STAGGER / DOT_PULSE_SECONDS)) }) }]} />)}
  </View>;
}

// One dot's brightness over a pulse (0–1): 0.3 → 1 at 40 %, back to 0.3 (the web keyframes).
const DOT_STEPS = Array.from({ length: 25 }, (_, i) => i / 24);
function dotOpacity(phase: number) {
  const u = ((phase % 1) + 1) % 1;
  return u < 0.4 ? 0.3 + 0.7 * (u / 0.4) : 1 - 0.7 * ((u - 0.4) / 0.6);
}

// Drives the shared position. Web: `armed` turns transitions on after the first paint. Native:
// `fill` and `bird` ease to the same target with the same duration and easing.
function useFlightMotion(at: number, reduced: boolean) {
  const [armed, setArmed] = useState(false);
  const fill = useRef(new Animated.Value(0)).current;
  const bird = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setArmed(true)); });
    // A page in a background tab gets no animation frames: arm anyway, so the bar and the bird
    // still show the real progress there.
    const fallback = setTimeout(() => setArmed(true), 100);
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(fallback); };
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const config = { toValue: at, duration: reduced ? REDUCED_MOVE_MS : MOVE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true };
    const run = Animated.parallel([Animated.timing(fill, config), Animated.timing(bird, config)]);
    run.start();
    return () => run.stop();
  }, [at, reduced, fill, bird]);
  return { armed, fill, bird };
}

// Web: the FLY frames from a one-row strip (public/loading/letterwing-fly.webp, made from the
// sheet above and shared with the boot screen in public/index.html), stepped and bobbed by CSS
// transform animations. Those run on the compositor, so the wings keep beating while the Garden's
// graphics engine starts up and holds the main thread. Reduced motion: one still flying pose.
const WEB_STRIP = '/loading/letterwing-fly.webp';
const WEB_CSS = `
@keyframes ppl-wings { from { transform: translateX(0); } to { transform: translateX(-${(FLY_FRAMES - 1) / FLY_FRAMES * 100}%); } }
@keyframes ppl-bob { from { transform: translateY(-1.5px) rotate(-0.5deg); } to { transform: translateY(1.5px) rotate(0.5deg); } }
@keyframes ppl-wait { 0%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
`;
function WebLetterwing({ height, reduced }: { height: number; reduced: boolean }) {
  const width = height * CELL.w / CELL.h;
  // Start mid-cycle where the shared clock is, so a remount doesn't restart the wingbeat.
  const [delays] = useState(() => {
    const elapsed = clockSeconds();
    return { wings: -(elapsed % WING_SECONDS), bob: -(elapsed % 5.2) };
  });
  return <div data-testid="pigeon-loading-bird" role="img" aria-label="Letterwing the pigeon flying"
    style={{ width, height, overflow: 'hidden', position: 'relative', filter: 'drop-shadow(0 5px 6px #6B5A3A22)',
      animation: reduced ? undefined : `ppl-bob 2.6s ease-in-out ${delays.bob}s infinite alternate` }}>
    <div data-testid="pigeon-loading-strip" style={{ position: 'absolute', left: 0, top: 0, height, width: width * FLY_FRAMES,
      backgroundImage: `url(${WEB_STRIP})`, backgroundSize: '100% 100%', willChange: 'transform',
      animation: reduced ? undefined : `ppl-wings ${WING_SECONDS}s steps(${FLY_FRAMES}, jump-none) ${delays.wings}s infinite` }} />
  </div>;
}

// Native: the sheet itself, frame stepped from requestAnimationFrame with a small bob; values are
// set straight on Animated nodes, so React never re-renders per frame. Reduced motion: still.
function NativeLetterwing({ height, reduced }: { height: number; reduced: boolean }) {
  const width = height * CELL.w / CELL.h;
  const sheetX = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { bob.setValue(0); tilt.setValue(0); sheetX.setValue(0); sheetY.setValue(0); return; }
    let raf = 0, lastFrame = -1;
    const tick = () => {
      const t = clockSeconds();
      const frame = Math.floor(t * CELL.fps) % FLY_FRAMES;
      if (frame !== lastFrame) {
        lastFrame = frame;
        sheetX.setValue(-(frame % CELL.columns) * width);
        sheetY.setValue(-Math.floor(frame / CELL.columns) * height);
      }
      bob.setValue(1.5 * Math.sin(t * Math.PI / 2.6));
      tilt.setValue(0.5 * Math.sin(t * Math.PI / 2.6));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, height, reduced, sheetX, sheetY, bob, tilt]);

  return <Animated.View testID="pigeon-loading-bird" accessible accessibilityRole="image"
    accessibilityLabel="Letterwing the pigeon flying"
    style={{ width, height, overflow: 'hidden', transform: [
      { translateY: bob }, { rotate: tilt.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) },
    ] }}>
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, transform: [{ translateX: sheetX }, { translateY: sheetY }] }}>
      <Image source={LETTERWING} resizeMode="stretch" style={{ width: width * CELL.columns, height: height * CELL.rows }}
        accessible={false} />
    </Animated.View>
  </Animated.View>;
}

// A five-petal blossom just off the bar's rounded end, with a curl of vine and leaves (drawn for the left end).
function EndOrnament() {
  if (Platform.OS === 'web') {
    return <svg width="65" height="44" viewBox="0 0 50 34" fill="none" aria-hidden="true">
      <path d="M38 17.2 C39.5 17.3 40.6 17.2 42 17" stroke={SAGE} strokeWidth="1" strokeLinecap="round" />
      <path d="M29 18 C23 19.5 17 24 10.5 22 C4.5 20 3 13.5 7 11 C10 9.2 13 11.6 11.2 14" stroke={SAGE} strokeWidth="1.15" strokeLinecap="round" />
      <path d="M18 21.6 C16.8 26.5 12.8 29 9 28.4 C10.6 24.6 13.8 22.2 18 21.6 Z" fill={SAGE} opacity="0.85" />
      <path d="M24 19.2 C24.4 14.6 27 11.4 29.6 10.6 C29.4 14.6 27.4 17.8 24 19.2 Z" fill="#94B9A0" opacity="0.9" />
      <path d="M9.5 21.5 C6.5 23.3 3.4 23 1.6 21 C4.6 19.4 7.4 19.6 9.5 21.5 Z" fill="#94B9A0" opacity="0.8" />
      {[0, 72, 144, 216, 288].map(angle => <ellipse key={angle} cx="33" cy="13.6" rx="2.5" ry="3.5" fill={BLUSH}
        stroke="#E3B0AA" strokeWidth="0.4" transform={`rotate(${angle} 33 17)`} />)}
      <circle cx="33" cy="17" r="1.9" fill="#D9B25C" />
    </svg>;
  }
  return <View style={{ position: 'absolute', left: 7.5, top: 5, width: 50, height: 34, transform: [{ scale: 1.3 }] }}>
    <View style={[styles.leaf, { left: 9, top: 21, transform: [{ rotate: '-30deg' }] }]} />
    <View style={[styles.leaf, { left: 21, top: 11, transform: [{ rotate: '-130deg' }] }]} />
    <View style={[styles.stem, { left: 7, top: 19, width: 35, transform: [{ rotate: '-4deg' }] }]} />
    {[0, 72, 144, 216, 288].map(angle => <View key={angle} style={[styles.petal, { transform: [{ rotate: `${angle}deg` }, { translateY: -3 }] }]} />)}
    <View style={styles.bud} />
  </View>;
}

function Sprig({ small }: { small: boolean }) {
  if (Platform.OS === 'web') {
    return <svg width="22" height="16" viewBox="0 0 18 13" fill="none" aria-hidden="true" style={{ transform: small ? 'scale(0.8)' : undefined, transformOrigin: '50% 100%' }}>
      <path d="M9 13 C9 9.5 9.8 6.4 12.6 4" stroke={SAGE} strokeWidth="1" strokeLinecap="round" />
      <path d="M12.6 4 C13.4 1.6 15.6 0.6 17.6 1 C16.8 3.2 14.8 4.4 12.6 4 Z" fill={SAGE} opacity="0.85" />
      <path d="M9.4 8.4 C7.6 6.6 5.2 6.2 3.4 7 C4.8 8.8 7.2 9.2 9.4 8.4 Z" fill="#94B9A0" opacity="0.85" />
    </svg>;
  }
  return <View style={{ width: 18, height: 13, transform: [{ scale: small ? 1 : 1.2 }] }}>
    <View style={[styles.leaf, { width: 7, height: 4, left: 10, top: 2, transform: [{ rotate: '-35deg' }] }]} />
    <View style={[styles.leaf, { width: 6, height: 3.5, left: 3, top: 6, transform: [{ rotate: '20deg' }] }]} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#EEF3E6', overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 5 },
  // Web only: a soft warm glow behind the bird and the bar.
  halo: { position: 'absolute', width: 640, height: 640, alignSelf: 'center', top: '50%', marginTop: -400,
    backgroundImage: 'radial-gradient(closest-side, #FFF9EAF2 0%, #FFF9EA99 45%, #FFF9EA00 100%)' } as object,
  stage: { alignItems: 'center' },
  message: { marginTop: 6, fontFamily: 'serif', fontSize: 17, lineHeight: 24, color: '#254E43', textAlign: 'center' },
  hint: { alignItems: 'center', gap: 6, maxWidth: 320, marginBottom: 14 },
  hintText: { fontSize: 13, lineHeight: 18, color: '#5d7263', textAlign: 'center' },
  // Hangs under the message without taking part in layout, so late content never moves the stage.
  below: { position: 'absolute', top: '100%', marginTop: 4, alignItems: 'center' },
  track: { height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: GOLD, backgroundColor: '#FBF6EA', padding: 1.5,
    boxShadow: '0 1px 6px #9E804D33, inset 0 1px 2px #9E804D22' },
  trackInner: { flex: 1, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, backgroundColor: TURQUOISE, overflow: 'hidden' },
  waiting: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: DOT_GAP },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: TURQUOISE },
  fillShine: { position: 'absolute', left: 4, right: 4, top: 1.5, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF', opacity: 0.32 },
  endCap: { position: 'absolute', top: 0, width: 65, height: 44 },
  sprig: { position: 'absolute', top: -2, width: 22, height: 16 },
  leaf: { position: 'absolute', width: 9, height: 5, backgroundColor: SAGE, opacity: 0.85, borderTopLeftRadius: 5, borderBottomRightRadius: 5 },
  stem: { position: 'absolute', height: 1, backgroundColor: SAGE },
  petal: { position: 'absolute', left: 30.5, top: 13.5, width: 5, height: 7, borderRadius: 3, backgroundColor: BLUSH },
  bud: { position: 'absolute', left: 31, top: 15, width: 4, height: 4, borderRadius: 2, backgroundColor: '#D9B25C' },
});
