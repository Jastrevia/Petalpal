import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Canvas, Picture, createPicture, type SkImage } from '@shopify/react-native-skia';
import { useFonts } from 'expo-font';
import { formatLocalDate, journalLocked, weekdayOf, type JournalCheckIn, type JournalDay } from '../../services/bookhouse';
import { journalCount, monthDay, monthYear, treehouseZh, tt } from '../../services/treehouseCopy';
import { clothRgb, CLOTH, LIGHT_CLOTH } from './book3d/assets';
import { pullAt, pullOrigin, ROOM_ARTWORK, type PullGeometry } from './book3d/scene';
import { drawBook, drawFloatShadow, pageShade } from './book3d/engine';
import { SPEC } from './book3d/math';
import { bookLayout, deskBookLayout, closeTiming, CLOSE_MS, CLOSE_STAGES, DESK_CLOSE_MS, DESK_CLOSE_STAGES, DESK_HANDOFF_T, DESK_OPEN_MS, DESK_OPEN_STAGES, focusOffsets, LEAN_MS, OPEN_MS, OPEN_STAGES, openTiming, openingFrame, pageCentres, projectPoint, pullOf, readingFrame, RIFFLE_STAGGER, TURN_MS, turnPages, type ShelfOrigin } from './book3d/motion';
import { useLayoutWindow } from './book3d/layoutWindow';
import { RecordsPage } from './book3d/RecordsPage';
import { SaveCeremony } from './book3d/SaveCeremony';
import { defaultSlot, rightPageOf, usePageFaces } from './book3d/usePageFaces';
import { WritingPage, type Draft, type WritingPageHandle } from './book3d/WritingPage';
import { ICONS, RoundButton } from './TreehouseArt';
import type { ShelfRect } from './TreehouseShelf';

const GARAMOND = 'EBGaramond-Regular', GARAMOND_ITALIC = 'EBGaramond-MediumItalic';
const FADE_MS = 200;
// Time → the book's timeline t, stage by stage (book3d/motion.ts): from the bookshelf, and at the desk.
const OPEN_EASE = openTiming(OPEN_STAGES), CLOSE_EASE = closeTiming(CLOSE_STAGES);
const DESK_OPEN_EASE = openTiming(DESK_OPEN_STAGES), DESK_CLOSE_EASE = closeTiming(DESK_CLOSE_STAGES);

// ---------- transition state ----------
// Exactly one of these at a time. Turns and lean-ins only start from `idle` (the whole spread on the desk); anything
// requested meanwhile is ignored, except a bookmark/arrow target, which waits for the current turn.
export type BookMode = 'opening' | 'idle' | 'turning-forward' | 'turning-backward' | 'leaning-in' | 'focused' | 'panning' | 'leaning-out' | 'closing';
/** A turn in progress: the leaves it moves (their day indices, top-most first). */
type TurnPlan = { from: number; to: number; dir: 1 | -1; pages: number[];
  /** The leaves have landed: the pages beneath them already carry the destination, so they can be lifted away. */
  landed?: boolean };
/** side: the page brought close (1 right: the journal; −1 left: the day's records). */
type BookView = { mode: BookMode; index: number; turn: TurnPlan | null; side: 1 | -1 };
/** `column`: the open book's column once on the desk (the portrait Treehouse sizes it to the bookcase). */
export type SceneLink = { pull: SharedValue<number>; geometry: PullGeometry | null; rootX: number; scrollY: number; column?: number;
  /** Portrait: room kept under the date controls. */
  footer?: number;
  /** Switching months at the desk: this book comes out of `deskRect`, its slot in the bookcase seen from the desk,
   *  with the camera already pulled back (it stays where it is). */
  held?: boolean; deskRect?: ShelfRect | null };
/** Where a closed book went: back onto the bookshelf (camera moved in), into its slot in the desk-view bookcase
 *  (switching months), or nowhere (a switch the book could not start). */
export type ClosedTo = 'shelf' | 'desk' | 'stayed';
const toOrigin = (r: ShelfRect): ShelfOrigin => ({ cam: r.camera, x: r.x + r.width / 2, bottom: r.y + r.height, height: r.height });

// Close up, a horizontal swipe pans to the other page of the same day. It only counts once it is clearly sideways (well
// past the vertical movement, so a slightly diagonal scroll never turns the view) and toward the other page.
const PAN_START = 16, PAN_SLOPE = 2.2;
/** Share of the way across, or a flick this fast (px/ms), that carries the pan on to the other page when let go. */
const PAN_COMMIT = .25, PAN_FLICK = .35;
const PAN_MS = 420;
/** Panning, the page coming in swaps its spread arrangement for its own live page within this share of the way (while
 *  it is still off the screen's edge on a phone, so the two never show over each other), and the page going out swaps
 *  back as it leaves. */
const PAN_REVEAL = .1;
// A text field with focus (typing, selecting) is never interrupted by a swipe: the page swipes once editing ends.
const textFieldFocused = () => {
  const state = TextInput.State as unknown as { currentlyFocusedInput?: () => unknown; currentlyFocusedField?: () => unknown };
  return !!(state.currentlyFocusedInput?.() ?? state.currentlyFocusedField?.());
};
// On the web a mouse drag that starts in a text box selects text: it never becomes a page swipe. (A finger swiping across
// a text box that is not being edited selects nothing, so touch swipes work across the whole page.)
const startsInTextBox = (e: GestureResponderEvent) => {
  if (Platform.OS !== 'web') return false;
  const event = e.nativeEvent as unknown as { type?: string; target?: { tagName?: string; isContentEditable?: boolean } };
  if (!event.type?.startsWith('mouse')) return false;
  const target = event.target;
  return !!target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || !!target.isContentEditable);
};

const afterFrames = (frames: number, fn: () => void) => { if (frames <= 0) fn(); else requestAnimationFrame(() => afterFrames(frames - 1, fn)); };

/** One month's journal as a physical book: it slides out of its shelf slot while the camera pulls back to the writing
 *  desk, floats down onto the desk and opens to the day's spread — left: what the day recorded (flower, Event, mood);
 *  right: the private journal, written in place. Bookmarks turn to other days; either page can be brought close. */
export function MonthBook({ year, month, shelfRect, days, userId, today, reducedMotion, closeSignal, returnTo, waiting = false, scene, drafts, onShown, onClosed, onMode, onHomeward, onSaved, onActions }: {
  year: number; month: number; shelfRect: ShelfRect; days: JournalDay[]; userId: string; today: string; reducedMotion: boolean; night?: boolean;
  closeSignal: number; scene: SceneLink; drafts: Map<string, Draft>;
  /** Close into this slot of the desk-view bookcase without moving the camera (another month was chosen there); a new
   *  `run` asks once. A null rect: the slot where the bookshelf's own slot lands once pulled back. */
  returnTo?: { run: number; rect: ShelfRect | null } | null;
  /** Switching months: mounted early so its pages are ready, but stays in its slot (not drawn) until this is false. */
  waiting?: boolean;
  /** Closing into the desk-view bookcase: the book is nearly home (the next month's book may start out). */
  onHomeward?: () => void;
  onShown?: () => void; onClosed: (to: ClosedTo) => void; onMode?: (mode: BookMode) => void;
  /** Reloads the shelf after a confirmed save; resolves once the new journals are in `days`. */
  onSaved: (journalId: string) => Promise<void>; onActions: (entry: JournalCheckIn) => void;
}) {
  const { width, height } = useLayoutWindow();
  const insets = useSafeAreaInsets();
  const deskColumn = scene.column;
  const footerRoom = scene.footer ?? 0;
  const L = useMemo(() => ROOM_ARTWORK ? deskBookLayout(width, height, insets) : bookLayout(width, height, insets, 0, deskColumn ?? Infinity, footerRoom), [width, height, insets, deskColumn, footerRoom]);
  const origin = useMemo<ShelfOrigin>(() => toOrigin(shelfRect), [shelfRect]);
  const [textFonts] = useFonts({ [GARAMOND]: require('../../../assets/fonts/EBGaramond-Regular.ttf'), [GARAMOND_ITALIC]: require('../../../assets/fonts/EBGaramond-MediumItalic.ttf') });

  // ---------- state machine ----------
  // The book opens at today when this is the current month, otherwise at its latest day.
  const [view, setViewState] = useState<BookView>(() => {
    const todayAt = days.findIndex(d => d.localDate === today);
    return { mode: 'opening', index: todayAt >= 0 ? todayAt : Math.max(0, days.length - 1), turn: null, side: 1 };
  });
  const viewRef = useRef(view);
  const setView = useCallback((next: Partial<BookView>) => { viewRef.current = { ...viewRef.current, ...next }; setViewState(viewRef.current); }, []);
  // Every animation carries the generation it started in; a callback from an older one changes nothing.
  const generation = useRef(0);
  const pending = useRef<number | null>(null);
  const { mode, index, turn: plan, side } = view;
  const day = days[index];
  useEffect(() => { onMode?.(mode); }, [mode, onMode]);

  // Which of a day's journals its right page shows (the day's latest unless another is chosen).
  const [slots, setSlots] = useState(() => new Map<string, number>());
  const slotOf = useCallback((i: number) => { const d = days[i]; return d ? slots.get(d.localDate) ?? defaultSlot(d) : 0; }, [days, slots]);
  const slot = slotOf(index);

  // ---------- page faces ----------
  const faces = usePageFaces({ month, year, days, today, page: L.page });
  const { base } = faces;
  const closeUp = mode === 'leaning-in' || mode === 'focused' || mode === 'panning' || mode === 'leaning-out';
  let left: SkImage | null, right: SkImage | null, rightPreview: SkImage | null = null, leftPreview: SkImage | null = null;
  let leaves: (SkImage | null)[] = [], leafBacks: (SkImage | null)[] = [];
  if (plan) {
    // Beneath the moving leaves: forward, the left page is still the day being left and the right page already the
    // destination; backward, the reverse. Once landed both carry the destination (identical to the leaves on them).
    left = faces.left(plan.dir < 0 || plan.landed ? plan.to : plan.from);
    right = faces.right(plan.dir > 0 || plan.landed ? plan.to : plan.from, slotOf(plan.dir > 0 || plan.landed ? plan.to : plan.from));
    // Each leaf is one sheet: the journal page of one day on its front, the next day's records on its back.
    leaves = plan.pages.map(p => faces.right(p, slotOf(p)));
    leafBacks = plan.pages.map(p => faces.left(p + 1));
  } else if (closeUp && base) {
    // Close up: plain paper under both pages, each page's spread arrangement lying over it — faded off the page being
    // brought close (its live page arrives on the plain paper), and kept on the other one until a pan brings that
    // page's own live page across (the picture mixes them; see previewMixes below).
    left = base.blank; right = base.blank;
    rightPreview = faces.right(index, slot); leftPreview = faces.left(index);
  } else {
    left = faces.left(index);
    right = faces.right(index, slot);
  }
  const faceKey = [left, right, rightPreview, leftPreview, ...leaves, ...leafBacks].map(faceId).join('|');
  const ribbonOn = days.some(d => d.journals.length > 0);
  const tex = useMemo(() => base && faces.images.spine && faces.images.grain && faces.images.edges && faces.images.parchment ? {
    cover: base.cover, spine: faces.images.spine, grain: faces.images.grain, edges: faces.images.edges, parchment: faces.images.parchment,
    tint: clothRgb(month), flyleaf: base.flyleaf, left, right, rightPreview, leftPreview, leaves, leafBacks,
    // The same ribbon the shelf shows on months with journals.
    ribbon: ribbonOn ? hexRgb('#A8443A') : null,
    // faceKey stands for the page pictures (the same pictures give the same key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  } : null, [base, faces.images, month, faceKey, ribbonOn]);

  // ---------- motion (UI thread) ----------
  const t = useSharedValue(0), lean = useSharedValue(0), turn = useSharedValue(0), dir = useSharedValue(0), count = useSharedValue(1), reading3d = useSharedValue(0);
  const leanSide = useSharedValue(1);
  const { pull, geometry, rootX, scrollY } = scene;
  // Held (1): the camera stays pulled back and the book comes from / goes to `deskOrigin`, its slot in the bookcase seen
  // from the desk — switching months. Otherwise (0) the camera's pull-back follows the book's own timeline (and runs
  // backwards with it when the book closes) and the book's slot recedes with the shelf.
  const heldOpen = useRef(!!(scene.held && scene.deskRect)).current;
  const held = useSharedValue(heldOpen ? 1 : 0);
  const deskOrigin = useSharedValue<ShelfOrigin | null>(heldOpen && scene.deskRect ? toOrigin(scene.deskRect) : null);
  useAnimatedReaction(() => t.value, v => { if (held.value !== 1) pull.value = pullOf(v); }, [pull]);
  // Closing at the desk: once nearly home, say so once (the chosen month's book then starts out of its own slot).
  const homeward = useSharedValue(0);
  const homewardRef = useRef(onHomeward);
  useLayoutEffect(() => { homewardRef.current = onHomeward; }, [onHomeward]);
  const nearlyHome = useCallback(() => homewardRef.current?.(), []);
  useAnimatedReaction(() => t.value, v => { if (homeward.value === 1 && v <= DESK_HANDOFF_T) { homeward.value = 0; runOnJS(nearlyHome)(); } }, [nearlyHome]);
  // Nothing is drawn until the book starts (a waiting book's slot still shows the shelf's own book).
  const drawn = useSharedValue(0);
  const picture = useDerivedValue(() => createPicture(canvas => {
    if (!tex || drawn.value === 0) return;
    let f;
    if (reading3d.value === 1) f = readingFrame(L, lean.value, turn.value, dir.value, count.value, leanSide.value);
    else {
      const p = pullOf(t.value);
      const from = held.value === 1 && deskOrigin.value ? deskOrigin.value : pullOrigin(origin, geometry && p > 0 ? pullAt(p, geometry) : null, geometry, rootX, scrollY);
      f = openingFrame(t.value, from, L);
    }
    drawFloatShadow(canvas, f.cam, f.pose, f.state, f.shadow, f.lift);
    const opening = reading3d.value !== 1;
    drawBook(canvas, f.cam, f.pose, f.state, {
      cover: tex.cover, spine: tex.spine, grain: tex.grain, edges: tex.edges, parchment: tex.parchment, tint: tex.tint,
      left: f.leftBlank ? tex.flyleaf : tex.left, right: tex.right, rightPreview: tex.rightPreview, leftPreview: tex.leftPreview,
      leaves: opening ? [tex.flyleaf] : tex.leaves, leafBacks: opening ? [tex.left] : tex.leafBacks,
    }, { ribbon: tex.ribbon ? f.ribbon : 0, ribbonTint: tex.ribbon || undefined, ...previewMixes(f.previewMix, leanSide.value) });
  }), [tex, L, origin, geometry, rootX, scrollY]);
  // Leaning close dims the room a little, so the page holds the eye; the desk scene itself keeps its warm light.
  const dimStyle = useAnimatedStyle(() => ({ opacity: reading3d.value === 1 ? .5 * Math.min(1, lean.value * 1.4) : 0 }));
  // The live close-up page arrives on the plain paper (its own paper is identical) and leaves before the page moves.
  const live = useSharedValue(0);
  // Close up, each live page lies exactly on its 3D page as the book pans between them (and is hidden while its page is
  // off to the side, where the 3D page keeps showing the spread's arrangement instead).
  const rightLiveStyle = useAnimatedStyle(() => {
    const [dx, dy] = focusOffsets(L, leanSide.value);
    return { opacity: live.value * reveal(leanSide.value, 1), transform: [{ translateX: dx }, { translateY: dy }] };
  });
  const leftLiveStyle = useAnimatedStyle(() => {
    const o = focusOffsets(L, leanSide.value);
    return { opacity: live.value * reveal(leanSide.value, -1), transform: [{ translateX: o[2] }, { translateY: o[3] }] };
  });

  // Opening starts once every face is ready, so the book leaves the shelf without a blank frame.
  const ready = !!tex && faces.ready && !!right;
  const started = useRef(false);
  useEffect(() => {
    if (!ready || started.current || waiting) return;
    started.current = true;
    drawn.value = 1;
    onShown?.();
    const id = ++generation.current;
    const finish = () => { if (id !== generation.current) return; reading3d.value = 1; setView({ mode: 'idle' }); };
    if (reducedMotion) { t.value = 1; finish(); return; }
    t.value = withTiming(1, { duration: heldOpen ? DESK_OPEN_MS : OPEN_MS, easing: heldOpen ? DESK_OPEN_EASE : OPEN_EASE }, done => { if (done) runOnJS(finish)(); });
  }, [ready, waiting, reducedMotion, onShown, t, reading3d, setView, heldOpen, drawn]);

  // ---------- page turns ----------
  const turnRef = useRef<(to: number) => void>(() => undefined);
  const finishTurn = useCallback((id: number) => {
    if (id !== generation.current) return;
    const p = viewRef.current.turn;
    if (!p) return;
    // 1. The pages under the landed leaves take the destination's pictures (identical to the leaves on top of them).
    setView({ turn: { ...p, landed: true } });
    afterFrames(2, () => {
      if (id !== generation.current) return;
      // 2. Lift the leaves away (nothing visible changes), 3. then settle the state on the new day.
      dir.value = 0; turn.value = 0;
      afterFrames(1, () => {
        if (id !== generation.current) return;
        setView({ mode: 'idle', index: p.to, turn: null });
        const next = pending.current; pending.current = null;
        if (next !== null && next !== p.to) afterFrames(1, () => turnRef.current(next));
      });
    });
  }, [setView, dir, turn]);
  const turnTo = useCallback((to: number) => {
    const v = viewRef.current;
    if (to < 0 || to >= days.length) return;
    if (v.mode === 'turning-forward' || v.mode === 'turning-backward') { pending.current = to; return; }
    if (v.mode !== 'idle' || to === v.index) return;
    const id = ++generation.current;
    const forward = to > v.index;
    const pages = turnPages(v.index, to);
    if (reducedMotion) { setView({ index: to }); return; }
    // 1. Commit the turn's pictures; 2. lay the leaves on the pages at rest, showing exactly what is there now;
    // 3. turn. Frames separate the steps so each one's pictures are on screen before the next becomes visible.
    setView({ mode: forward ? 'turning-forward' : 'turning-backward', turn: { from: v.index, to, dir: forward ? 1 : -1, pages } });
    afterFrames(2, () => {
      if (id !== generation.current) return;
      turn.value = 0; count.value = pages.length; dir.value = forward ? 1 : -1;
      afterFrames(1, () => {
        if (id !== generation.current) return;
        turn.value = withTiming(1, { duration: TURN_MS * (1 + (pages.length - 1) * RIFFLE_STAGGER), easing: Easing.linear },
          done => { if (done) runOnJS(finishTurn)(id); });
      });
    });
  }, [days.length, reducedMotion, turn, count, dir, setView, finishTurn]);
  // Refs are updated after commit, never while rendering (a discarded render must leave no trace).
  useLayoutEffect(() => { turnRef.current = turnTo; }, [turnTo]);

  // ---------- leaning in and out ----------
  const leanIn = useCallback((toSide: 1 | -1) => {
    const v = viewRef.current;
    if (v.mode !== 'idle' || !days[v.index]) return;
    const id = ++generation.current;
    leanSide.value = toSide;
    const end = () => {
      if (id !== generation.current) return;
      setView({ mode: 'focused' });
      live.value = withTiming(1, { duration: reducedMotion ? 0 : FADE_MS, easing: Easing.out(Easing.quad) });
    };
    setView({ mode: 'leaning-in', side: toSide });
    if (reducedMotion) { lean.value = 1; end(); return; }
    lean.value = withTiming(1, { duration: LEAN_MS, easing: Easing.linear }, done => { if (done) runOnJS(end)(); });
  }, [days, reducedMotion, lean, leanSide, live, setView]);
  // ---------- panning between the two pages, close up ----------
  // A sideways swipe moves the book under the camera from one page to the other (the same day: no page turns, no date
  // change), following the finger and settling on whichever page it is let go nearer (or flicked toward).
  const pageTravel = useMemo(() => {
    const [rc, lc] = pageCentres();
    return Math.max(1, Math.abs(projectPoint(L.cam, L.lean, rc)[0] - projectPoint(L.cam, L.lean, lc)[0]));
  }, [L]);
  const panFrom = useRef<1 | -1>(1);
  const inTextBox = useRef(false);
  const finishPan = useCallback((id: number, to: 1 | -1) => {
    if (id !== generation.current) return;
    setView({ mode: 'focused', side: to });
  }, [setView]);
  const settlePan = useCallback((dx: number, vx: number) => {
    const from = panFrom.current, to = (-from) as 1 | -1;
    const toward = from < 0 ? -1 : 1;                       // the swipe direction that leads to the other page
    const moved = toward * dx / pageTravel, flick = toward * vx;
    const target = moved > PAN_COMMIT || flick > PAN_FLICK ? to : from;
    const id = ++generation.current;
    const rest = Math.abs(target - leanSide.value) / 2;
    if (reducedMotion) { leanSide.value = target; finishPan(id, target); return; }
    leanSide.value = withTiming(target, { duration: Math.max(140, PAN_MS * rest), easing: Easing.out(Easing.cubic) },
      done => { if (done) runOnJS(finishPan)(id, target); });
  }, [pageTravel, leanSide, reducedMotion, finishPan]);
  const pageSwipe = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: e => { inTextBox.current = startsInTextBox(e); return false; },
    onMoveShouldSetPanResponderCapture: (_, g) => {
      const v = viewRef.current;
      if (v.mode !== 'focused' || inTextBox.current || textFieldFocused()) return false;
      if (Math.abs(g.dx) < PAN_START || Math.abs(g.dx) < Math.abs(g.dy) * PAN_SLOPE) return false;
      // Left page: swipe left to the journal. Right page: swipe right back to the records.
      return v.side < 0 ? g.dx < 0 : g.dx > 0;
    },
    onPanResponderGrant: () => {
      generation.current++;
      panFrom.current = viewRef.current.side;
      setView({ mode: 'panning' });
    },
    onPanResponderMove: (_, g) => {
      leanSide.value = Math.max(-1, Math.min(1, panFrom.current - 2 * g.dx / pageTravel));
    },
    onPanResponderRelease: (_, g) => settlePan(g.dx, g.vx),
    onPanResponderTerminate: () => settlePan(0, 0),
    onPanResponderTerminationRequest: () => false,
  }), [pageTravel, leanSide, setView, settlePan]);

  const leanOut = useCallback((then?: () => void) => {
    const v = viewRef.current;
    if (v.mode !== 'focused') return;
    Keyboard.dismiss();
    const id = ++generation.current;
    const end = () => { if (id !== generation.current) return; setView({ mode: 'idle' }); then?.(); };
    const go = () => {
      if (id !== generation.current) return;
      setView({ mode: 'leaning-out' });
      if (reducedMotion) { lean.value = 0; end(); return; }
      lean.value = withTiming(0, { duration: LEAN_MS, easing: Easing.linear }, done => { if (done) runOnJS(end)(); });
    };
    // The live page's text leaves the paper first; the 3D page beneath already shows the same plain paper.
    live.value = withTiming(0, { duration: reducedMotion ? 0 : FADE_MS }, done => { if (done) runOnJS(go)(); });
  }, [reducedMotion, lean, live, setView]);

  // ---------- closing ----------
  const close = useCallback(() => {
    const v = viewRef.current;
    if (v.mode === 'focused') { leanOut(() => closeRef.current()); return; }
    if (v.mode !== 'idle') return;
    const id = ++generation.current;
    pending.current = null;
    setView({ mode: 'closing' });
    // Back to the bookshelf itself (also for a book that came from the desk-view bookcase): the camera follows again.
    held.value = 0;
    if (reducedMotion) { t.value = 0; onClosed('shelf'); return; }
    // The opening played backwards: the book closes, lifts off the desk and flies back into its slot while the
    // camera moves back in to the shelf.
    afterFrames(1, () => {
      if (id !== generation.current) return;
      reading3d.value = 0; lean.value = 0;
      t.value = withTiming(0, { duration: CLOSE_MS, easing: CLOSE_EASE }, done => { if (done) runOnJS(onClosed)('shelf'); });
    });
  }, [reducedMotion, onClosed, lean, reading3d, t, setView, leanOut, held]);
  const closeRef = useRef(close);
  useLayoutEffect(() => { closeRef.current = close; }, [close]);
  const lastClose = useRef(closeSignal);
  useEffect(() => { if (closeSignal !== lastClose.current) { lastClose.current = closeSignal; close(); } }, [closeSignal, close]);

  // ---------- switching months at the desk ----------
  // The same closing, but the camera stays pulled back: the book closes on the desk, lifts and flies back into its slot
  // in the bookcase seen from the desk (where the chosen month's book is about to come out).
  const returnToDesk = useCallback((rect: ShelfRect | null) => {
    const v = viewRef.current;
    if (v.mode === 'focused') { leanOut(() => returnRef.current(rect)); return; }
    if (v.mode !== 'idle') { onClosed('stayed'); return; }
    const id = ++generation.current;
    pending.current = null;
    setView({ mode: 'closing' });
    deskOrigin.value = rect ? toOrigin(rect) : geometry ? pullOrigin(origin, pullAt(1, geometry), geometry, rootX, scrollY) : origin;
    held.value = 1;
    if (reducedMotion) { t.value = 0; onClosed('desk'); return; }
    afterFrames(1, () => {
      if (id !== generation.current) return;
      reading3d.value = 0; lean.value = 0; homeward.value = 1;
      t.value = withTiming(0, { duration: DESK_CLOSE_MS, easing: DESK_CLOSE_EASE }, done => { if (done) runOnJS(onClosed)('desk'); });
    });
  }, [reducedMotion, onClosed, lean, reading3d, t, held, homeward, deskOrigin, setView, leanOut, geometry, origin, rootX, scrollY]);
  const returnRef = useRef(returnToDesk);
  useLayoutEffect(() => { returnRef.current = returnToDesk; }, [returnToDesk]);
  const lastReturn = useRef(returnTo?.run ?? 0);
  useEffect(() => {
    if (!returnTo || returnTo.run === lastReturn.current) return;
    lastReturn.current = returnTo.run;
    returnToDesk(returnTo.rect);
  }, [returnTo, returnToDesk]);

  // ---------- the days changing underneath (a save, a delete) ----------
  const shownDate = useRef<string | null>(days[view.index]?.localDate || null);
  useEffect(() => { shownDate.current = days[index]?.localDate || null; }, [index, days]);
  const lastDays = useRef(days);
  useEffect(() => {
    if (lastDays.current === days) return;
    lastDays.current = days;
    const v = viewRef.current;
    const found = days.findIndex(d => d.localDate === shownDate.current);
    const nextIndex = found >= 0 ? found : Math.max(0, Math.min(v.index, days.length - 1));
    // A turn planned over the old days is abandoned at rest; the page shown is the same day (or its neighbour).
    if (v.turn) { generation.current++; pending.current = null; dir.value = 0; turn.value = 0; setView({ mode: 'idle', turn: null, index: nextIndex }); }
    else if (nextIndex !== v.index) setView({ index: nextIndex });
  }, [days, dir, turn, setView]);

  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
    onPanResponderRelease: (_, g) => { const i = viewRef.current.index; if (g.dx < -40) turnTo(i + 1); else if (g.dx > 40) turnTo(i - 1); },
  }), [turnTo]);

  // ---------- saving ----------
  const writing = useRef<WritingPageHandle>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<{ run: number; from: { x: number; y: number } } | null>(null);
  const select = useRef<string | null>(null);
  const draftKey = (d: JournalDay, s: number) => { const which = rightPageOf(d, s, today); return `${d.localDate}|${which.kind === 'journal' ? d.journals[which.index].journal?.id : which.kind}`; };
  const afterSave = async (saved: { id: string }) => {
    // Played only now that the server has confirmed: the glow starts at the Save control (the quill's place).
    const button = await writing.current?.saveButton();
    select.current = saved.id;
    setJustSaved(saved.id);
    setCeremony({ run: Date.now(), from: button ? { x: button.x + button.width / 2, y: button.y + button.height / 2 } : { x: L.page.x + L.page.width - 60, y: L.page.y + L.page.height - 40 } });
    await onSaved(saved.id);
  };
  // A journal written on today's blank page joins the day's journals: show it (the same words, now saved).
  useEffect(() => {
    const id = select.current;
    if (!id) return;
    const i = days.findIndex(d => d.journals.some(e => e.journal?.id === id));
    if (i < 0) return;
    select.current = null;
    const at = days[i].journals.findIndex(e => e.journal?.id === id);
    setSlots(previous => new Map(previous).set(days[i].localDate, at));
  }, [days]);
  const chooseSlot = (s: number) => { if (day) setSlots(previous => new Map(previous).set(day.localDate, s)); };

  // ---------- overlay geometry ----------
  const { W, H, over: o, gap: g } = SPEC;
  const zh = L.read.pz;
  const at = (x: number, y: number) => projectPoint(L.cam, L.read, [x, y, zh]);
  const [rx0, ry0] = at(g, o), [rx1] = at(W - o, o), [, ry1] = at(W - o, H - o);
  const [lx0] = at(-(W - o), o);
  const spread = mode === 'idle' || !!plan;
  const settled = mode === 'idle' || mode === 'focused' || mode === 'panning' || !!plan;
  const ribbon = LIGHT_CLOTH.has(month) ? '#A8443A' : CLOTH[month - 1];
  const italicFace = textFonts ? GARAMOND_ITALIC : undefined;
  const shade = pageShade();

  const tabs = useRef<ScrollView>(null);
  const TAB_H = 34, TAB_GAP = 3, TAB_ARROW = 26;
  // The rail never leaves the book: when every bookmark fits it shows them all, centred on the fore-edge; otherwise
  // the column scrolls on its own (the book stays put), between two small brass arrows inside the rail's own height.
  const tabsHeight = days.length * (TAB_H + TAB_GAP) - TAB_GAP;
  const tabsScroll = tabsHeight > L.tabHeight;
  const tabView = tabsScroll ? L.tabHeight - 2 * TAB_ARROW : L.tabHeight;
  const tabMax = Math.max(0, tabsHeight - tabView);
  const [tabOffset, setTabOffset] = useState(0);
  // Keep the selected bookmark in view.
  const showTab = useCallback((animated: boolean) => {
    tabs.current?.scrollTo({ y: Math.max(0, Math.min(tabMax, index * (TAB_H + TAB_GAP) - tabView / 2 + TAB_H / 2)), animated });
  }, [index, tabMax, tabView]);
  useEffect(() => { showTab(!reducedMotion); }, [showTab, reducedMotion]);
  const pageTabs = (direction: 1 | -1) => tabs.current?.scrollTo({ y: Math.max(0, Math.min(tabMax, tabOffset + direction * (tabView - TAB_H))), animated: !reducedMotion });
  const target = plan ? plan.to : index;
  const todayIndex = days.findIndex(d => d.localDate === today);
  const shownDay = days[target];
  const which = rightPageOf(day, slot, today);
  const entry = which.kind === 'journal' && day ? day.journals[which.index] : null;

  // box-none: the bookcase seen from the desk, behind the book, takes taps on its books (switching months).
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="month-book" accessibilityLabel={`Book mode ${mode}`}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#140A03' }, dimStyle]} />
    {/* (Skia's Canvas ignores pointerEvents on the web: the wrapper lets taps through to the bookcase behind.) */}
    {tex && <View pointerEvents="none" style={StyleSheet.absoluteFill}><Canvas pointerEvents="none" style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas></View>}

    {/* The whole spread on the desk: tap a page to bring it close; bookmarks stand out of the fore-edge. */}
    {spread && <>
      {day && mode === 'idle' && <View {...swipe.panHandlers} style={{ position: 'absolute', left: lx0, top: ry0, width: rx1 - lx0, height: ry1 - ry0, flexDirection: 'row' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={treehouseZh() ? `${formatLocalDate(day.localDate)}的记录` : `Records for ${formatLocalDate(day.localDate)}`} accessibilityHint={tt("Brings the left page close: the day's flower, Event and mood")}
          onPress={() => leanIn(-1)} style={{ width: rx0 - lx0, height: '100%' }} />
        <Pressable accessibilityRole="button" accessibilityLabel={treehouseZh()
            ? `${formatLocalDate(day.localDate)}${which.kind === 'new' ? '，写今天的日记' : which.kind === 'journal' ? (entry && journalLocked(entry) ? '，阅读日记' : '，阅读或编辑日记') : '的日记页'}`
            : which.kind === 'new' ? `Write today's journal, ${formatLocalDate(day.localDate)}` : which.kind === 'journal' ? `${entry && journalLocked(entry) ? 'Read' : 'Read or write'} the journal for ${formatLocalDate(day.localDate)}` : `Journal page for ${formatLocalDate(day.localDate)}`}
          accessibilityHint={tt('Brings the right page close')} onPress={() => leanIn(1)} style={{ flex: 1, height: '100%' }} />
      </View>}
      {days.length > 0 && <View style={{ position: 'absolute', left: L.tabLeft, top: L.tabTop, width: L.width - L.tabLeft, height: L.tabHeight }}>
        {/* More bookmarks above or below: small brass arrows page the column (inside the rail, never past the book). */}
        {tabsScroll && <Pressable accessibilityRole="button" accessibilityLabel={tt('Earlier bookmarks')} disabled={tabOffset <= 2} onPress={() => pageTabs(-1)} hitSlop={{ top: 6, bottom: 2, left: 8, right: 8 }}
          style={[styles.tabArrow, { top: 1 }, tabOffset <= 2 && styles.tabArrowOff]}><Text style={styles.tabArrowText}>▴</Text></Pressable>}
        <View style={{ position: 'absolute', left: 0, right: 0, top: tabsScroll ? TAB_ARROW : 0, height: tabView, overflow: 'hidden' }}>
          <ScrollView ref={tabs} showsVerticalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={tt('Date bookmarks')}
            onContentSizeChange={() => showTab(false)} scrollEventThrottle={16} onScroll={event => setTabOffset(event.nativeEvent.contentOffset.y)}
            scrollEnabled={tabsScroll} bounces={false} overScrollMode="never" decelerationRate="fast"
            contentContainerStyle={{ gap: TAB_GAP, paddingVertical: tabsScroll ? 0 : Math.max(0, (tabView - tabsHeight) / 2) }}>
            {days.map((d, i) => <Bookmark key={d.localDate} day={d} today={d.localDate === today} selected={i === target} ribbon={ribbon} height={TAB_H} onPress={() => turnTo(i)} />)}
          </ScrollView>
          {/* A slim brass scroll indicator along the rail's outer edge. */}
          {tabsScroll && <View pointerEvents="none" style={[styles.tabTrack, { height: tabView }]}>
            <View style={[styles.tabThumb, { height: Math.max(18, tabView * tabView / tabsHeight),
              top: (tabView - Math.max(18, tabView * tabView / tabsHeight)) * Math.max(0, Math.min(1, tabOffset / Math.max(1, tabMax))) }]} />
          </View>}
        </View>
        {tabsScroll && <Pressable accessibilityRole="button" accessibilityLabel={tt('Later bookmarks')} disabled={tabOffset >= tabMax - 2} onPress={() => pageTabs(1)} hitSlop={{ top: 2, bottom: 6, left: 8, right: 8 }}
          style={[styles.tabArrow, { top: L.tabHeight - TAB_ARROW + 3 }, tabOffset >= tabMax - 2 && styles.tabArrowOff]}><Text style={styles.tabArrowText}>▾</Text></Pressable>}
      </View>}
    </>}

    {/* Close up: the live pages, each lying exactly on its 3D page (which shows the same plain paper beneath it). Both
        stay mounted while close up, so panning across and back keeps each page's scroll, journal tab and draft; only
        the page in view takes touches. A sideways swipe pans to the other page (pageSwipe). */}
    {(mode === 'focused' || mode === 'panning' || mode === 'leaning-out') && day && base && <View {...pageSwipe.panHandlers} pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, rightLiveStyle]} pointerEvents={mode === 'focused' && side > 0 ? 'box-none' : 'none'}
        accessibilityElementsHidden={side < 0} importantForAccessibility={side < 0 ? 'no-hide-descendants' : 'auto'}>
        <WritingPage ref={writing} key={draftKey(day, slot)} active={side > 0} rect={L.page} m={faces.metrics} background={base.readingBackgroundUri} shade={shade}
          fontRegular={textFonts ? GARAMOND : undefined} fontItalic={italicFace} day={day} slot={slot} today={today} userId={userId}
          draft={drafts.get(draftKey(day, slot)) || null} onDraft={next => { const key = draftKey(day, slot); if (next) drafts.set(key, next); else drafts.delete(key); }}
          justSaved={!!justSaved && entry?.journal?.id === justSaved} onSlot={chooseSlot} onActions={() => entry && onActions(entry)}
          onSaving={() => setJustSaved(null)} onSaved={afterSave} onFailed={() => setJustSaved(null)} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, leftLiveStyle]} pointerEvents={mode === 'focused' && side < 0 ? 'box-none' : 'none'}
        accessibilityElementsHidden={side > 0} importantForAccessibility={side > 0 ? 'no-hide-descendants' : 'auto'}>
        <RecordsPage rect={L.page} m={faces.metrics} background={base.readingBackgroundUri} shade={shade} fontRegular={textFonts ? GARAMOND : undefined} fontItalic={italicFace} day={day} />
      </Animated.View>
    </View>}

    {/* Controls sit around the book, never on it. */}
    {settled && <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Top buttons stay where the Treehouse's own are (the window's column), even when the book's column is narrower. */}
      <View style={{ position: 'absolute', top: insets.top + 3, left: (width - Math.min(width, 560)) / 2 + 12 }}>
        {closeUp ? <RoundButton label={tt('Back to both pages')} icon={ICONS.back} disabled={mode !== 'focused'} onPress={() => leanOut()} />
          : <RoundButton label={tt('Back to bookshelf')} icon={ICONS.back} disabled={mode !== 'idle'} onPress={close} />}
      </View>
      {/* (No close button: a tap anywhere off the open book — the desk, the bookcase behind it — closes it; see the
          Treehouse screen. The back button above does too.) */}
      {spread && <View style={[styles.controls, { top: L.below + 8, left: L.side + 12, right: L.side + 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={tt('Previous day')} disabled={target <= 0} onPress={() => turnTo(viewRef.current.index - 1)}
          style={[styles.turn, target <= 0 && { opacity: .35 }]}><Text style={styles.arrow}>‹</Text></Pressable>
        <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: 'center' }}>
          <Text numberOfLines={1} style={[styles.pageNumber, { fontFamily: italicFace }]}>{shownDay ? (treehouseZh()
            ? `${monthDay(Number(shownDay.localDate.slice(5, 7)), Number(shownDay.localDate.slice(8)))} ${weekdayOf(shownDay.localDate)}`
            : `${weekdayOf(shownDay.localDate)}, ${monthDay(Number(shownDay.localDate.slice(5, 7)), Number(shownDay.localDate.slice(8)))}`) : monthYear(year, month)}</Text>
          {/* An unsaved draft on this day is never mistaken for a saved journal: it replaces the month line. */}
          {shownDay && [...drafts.keys()].some(k => k.startsWith(`${shownDay.localDate}|`))
            ? <Text numberOfLines={1} style={[styles.pageSub, styles.draftNote, { fontFamily: italicFace }]}>{tt('Unsaved draft · tap the page to finish')}</Text>
            : <Text numberOfLines={1} style={[styles.pageSub, { fontFamily: italicFace }]}>{shownDay ? `${monthYear(year, month)} · ${treehouseZh() ? `第 ${target + 1} / ${days.length} 页` : `${target + 1} of ${days.length}`}` : tt('No journals or records this month')}</Text>}
        </View>
        {todayIndex >= 0 && target !== todayIndex ? <Pressable accessibilityRole="button" accessibilityLabel={tt('Turn to today')} onPress={() => turnTo(todayIndex)} style={styles.today}>
          <Text style={[styles.todayText, { fontFamily: italicFace }]}>{tt('Today')}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={tt('Next day')} disabled={target >= days.length - 1} onPress={() => turnTo(viewRef.current.index + 1)}
          style={[styles.turn, target >= days.length - 1 && { opacity: .35 }]}><Text style={styles.arrow}>›</Text></Pressable>
      </View>}
    </View>}
    {ceremony && <SaveCeremony run={ceremony.run} from={ceremony.from} to={{ x: L.page.x + L.page.width * .58, y: L.page.y + faces.metrics.padTop + 20 }}
      label={{ x: 0, y: Math.min(L.height - insets.bottom - 50, L.page.y + L.page.height + 8) }} reducedMotion={reducedMotion} onDone={() => setCeremony(null)} />}
  </View>;
}

/** Close up at `side` (−1..1): how much of a page's own live page shows (1 its side in view, 0 off to the side). */
function reveal(side: number, page: 1 | -1) {
  'worklet';
  return Math.max(0, Math.min(1, (1 + page * side) / (2 * PAN_REVEAL)));
}
/** How much of each page's spread arrangement lies over its plain paper: what the lean leaves (`lean`, 1 on the spread
 *  → 0 close up) on the page brought close, and fully on a page off to the side until a pan brings its live page in. */
function previewMixes(lean: number, side: number) {
  'worklet';
  return { previewMix: Math.max(lean, 1 - reveal(side, 1)), leftMix: Math.max(lean, 1 - reveal(side, -1)) };
}

// Stable identities for page pictures, so the 3D picture is rebuilt only when what it shows changes.
const faceIds = new WeakMap<object, number>();
let nextFaceId = 1;
function faceId(image: SkImage | null) {
  if (!image) return 0;
  let id = faceIds.get(image);
  if (!id) { id = nextFaceId++; faceIds.set(image, id); }
  return id;
}

function hexRgb(hex: string, k = 1): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255 * k) as [number, number, number];
}

function Bookmark({ day, today, selected, ribbon, height, onPress }: { day: JournalDay; today: boolean; selected: boolean; ribbon: string; height: number; onPress: () => void }) {
  const n = day.journals.length;
  const label = `${formatLocalDate(day.localDate)}${today ? `, ${tt('today')}` : ''}, ${n ? journalCount(n) : tt('no journal')}`;
  return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} hitSlop={{ top: 1.5, bottom: 1.5, left: 4, right: 10 }}
    style={[styles.bookmark, { height, width: selected ? 38 : 32 }, today && !selected && styles.bookmarkToday, selected && { backgroundColor: ribbon, borderColor: '#D9B56A' }]}>
    {!selected && <View style={[styles.bookmarkBand, { backgroundColor: today ? '#B98E45' : ribbon }]} />}
    <Text numberOfLines={1} style={[styles.bookmarkText, selected && { color: '#FFF4DE', fontWeight: '600' }]}>{Number(day.localDate.slice(8))}</Text>
    {/* A day with a private journal carries a small gilt dot; Daily Grow or Event records alone do not. */}
    {n > 0 && <View style={[styles.bookmarkDot, selected && { backgroundColor: '#FFE6A8' }]} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  bookmark: { justifyContent: 'center', paddingLeft: 7, borderTopRightRadius: 7, borderBottomRightRadius: 7, backgroundColor: '#F1E2C2',
    borderWidth: 1, borderLeftWidth: 0, borderColor: '#C7AA77', overflow: 'hidden',
    shadowColor: '#0B0603', shadowOpacity: .4, shadowRadius: 3, shadowOffset: { width: 1, height: 1 } },
  bookmarkToday: { backgroundColor: '#FBEFCF', borderColor: '#B98E45' },
  bookmarkBand: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  bookmarkText: { fontFamily: 'Georgia', fontSize: 13, color: '#5A4630' },
  bookmarkDot: { position: 'absolute', right: 5, top: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: '#B98E45' },
  tabArrow: { position: 'absolute', left: 1, width: 30, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E2C2', borderWidth: 1, borderColor: '#C7AA77' },
  tabArrowText: { fontSize: 13, lineHeight: 15, color: '#5A4630' },
  tabArrowOff: { opacity: .35 },
  tabTrack: { position: 'absolute', right: 2, top: 0, width: 3, borderRadius: 1.5, backgroundColor: '#F1E2C230' },
  tabThumb: { position: 'absolute', left: 0, right: 0, borderRadius: 1.5, backgroundColor: '#D9B56AC0' },
  controls: { position: 'absolute', height: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  turn: { minWidth: 46, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#F7EBD2E8', borderWidth: 1, borderColor: '#C9A264' },
  arrow: { fontFamily: 'Georgia', fontSize: 26, lineHeight: 30, color: '#5C4630' },
  today: { minHeight: 36, paddingHorizontal: 10, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7EBD2E8', borderWidth: 1, borderColor: '#C9A264' },
  todayText: { fontSize: 15, color: '#5C4630' },
  pageNumber: { fontSize: 17, color: '#FFF1D2', textShadowColor: '#0B0603', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  draftNote: { color: '#FFE2A8' },
  pageSub: { fontSize: 12.5, color: '#F3DFB6', textShadowColor: '#0B0603', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
});
