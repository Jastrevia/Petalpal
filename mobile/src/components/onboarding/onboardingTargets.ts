import { useEffect, useState, useSyncExternalStore } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// Highlight anchors: real components register their own views, and the tour measures them in
// window coordinates whenever layout can have changed (their own layout, window size, keyboard,
// scrolling). No highlight is ever placed by a fixed screen coordinate.
export type Rect = { x: number; y: number; width: number; height: number };
type Measurable = { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void };
type ScrollerHandle = { current: { scrollTo?: (options: { y: number; animated?: boolean }) => void } & Measurable | null };

const nodes = new Map<string, Measurable>();
const refs = new Map<string, (node: unknown) => void>();
const scrollers = new Map<string, { handle: ScrollerHandle; offset: number }>();
let version = 0;
let frame: number | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const raf = (callback: () => void) => typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame(callback) : (setTimeout(callback, 16) as unknown as number);
const cancelRaf = (id: number) => typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id);

/** Something may have moved; re-measure on the next frame (bursts coalesce into one pass). */
export function bumpOnboardingLayout() {
  if (frame !== null) return;
  frame = raf(() => { frame = null; version++; listeners.forEach(listener => listener()); });
}
// Window size and keyboard changes move targets; listen once, when a highlight is first measured.
// (Required lazily so screens that only register targets stay importable outside React Native.)
let listening = false;
function listenForLayoutChanges() {
  if (listening) return;
  listening = true;
  const { Dimensions, Keyboard } = require('react-native') as typeof import('react-native');
  Dimensions.addEventListener('change', bumpOnboardingLayout);
  for (const event of ['keyboardDidShow', 'keyboardDidHide'] as const) Keyboard.addListener(event, bumpOnboardingLayout);
}

/** Stable callback ref for a target view. */
export function onboardingTargetRef(id: string) {
  let ref = refs.get(id);
  if (!ref) {
    ref = (node: unknown) => {
      if (node) nodes.set(id, node as Measurable);
      else nodes.delete(id);
      bumpOnboardingLayout();
    };
    refs.set(id, ref);
  }
  return ref;
}
/** Spread onto the target view: `<View {...onboardingTarget('nav.events')} />`. */
export const onboardingTarget = (id: string) => ({
  ref: onboardingTargetRef(id), collapsable: false as const,
  onLayout: (_event: LayoutChangeEvent) => bumpOnboardingLayout(),
});

export function measureOnboardingTarget(id: string): Promise<Rect | null> {
  const node = nodes.get(id);
  if (!node?.measureInWindow) return Promise.resolve(null);
  return new Promise(resolve => node.measureInWindow!((x, y, width, height) =>
    resolve(width > 0 && height > 0 && Number.isFinite(x) && Number.isFinite(y) ? { x, y, width, height } : null)));
}

const sameRect = (a: Rect | null, b: Rect | null) => a === b || Boolean(a && b &&
  Math.abs(a.x - b.x) < .5 && Math.abs(a.y - b.y) < .5 && Math.abs(a.width - b.width) < .5 && Math.abs(a.height - b.height) < .5);

/** The live window rectangle of a registered target, or null while it is not on screen. */
export function useOnboardingTargetRect(id: string | undefined, active = true): Rect | null {
  const current = useSyncExternalStore(subscribe, () => version, () => version);
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(listenForLayoutChanges, []);
  useEffect(() => {
    if (!id || !active) { setRect(null); return; }
    let cancelled = false;
    // Measure after this frame's layout and again one frame later, once nested layout settles.
    const measure = () => void measureOnboardingTarget(id).then(next => {
      if (!cancelled) setRect(previous => sameRect(previous, next) ? previous : next);
    });
    let second: number | null = null;
    const first = raf(() => { measure(); second = raf(measure); });
    return () => { cancelled = true; cancelRaf(first); if (second !== null) cancelRaf(second); };
  }, [id, active, current]);
  return rect;
}

/** Props for a ScrollView whose content holds targets; scrolling re-measures them. */
export function registerOnboardingScroller(id: string, handle: ScrollerHandle) {
  scrollers.set(id, { handle, offset: scrollers.get(id)?.offset ?? 0 });
  return () => { if (scrollers.get(id)?.handle === handle) scrollers.delete(id); };
}
export function onboardingScrollHandler(id: string) {
  return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const entry = scrollers.get(id);
    if (entry) entry.offset = event.nativeEvent.contentOffset.y;
    bumpOnboardingLayout();
  };
}

/** Scroll the target into the middle of its scroller when it is not comfortably visible. */
export async function scrollOnboardingTargetIntoView(targetId: string, scrollerId: string) {
  const entry = scrollers.get(scrollerId);
  const scroller = entry?.handle.current;
  if (!entry || !scroller?.scrollTo || !scroller.measureInWindow) return;
  const [target, viewport] = await Promise.all([measureOnboardingTarget(targetId),
    new Promise<Rect | null>(resolve => scroller.measureInWindow!((x, y, width, height) => resolve({ x, y, width, height })))]);
  if (!target || !viewport) return;
  const margin = 24;
  if (target.y >= viewport.y + margin && target.y + target.height <= viewport.y + viewport.height - margin) return;
  const centred = entry.offset + (target.y - viewport.y) - Math.max(margin, (viewport.height - target.height) / 2);
  scroller.scrollTo({ y: Math.max(0, centred), animated: true });
}
