import { router } from 'expo-router';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setPreviewPlacementMemory } from '../../garden/planting/plantingPersistence';
import { observeOnboardingSignals } from '../onboardingSignals';
import { onboardingSessionVersion, onboardingState, previewOnboardingAt, useOnboarding } from '../onboardingStore';
import { ONBOARDING_STEPS, STEP_SPECS, stepIndex, type OnboardingStep } from '../onboardingSteps';
import { PREVIEW_OWNER_ID, previewBackend } from './previewBackend';
import { setPreviewLocale, usePreviewLocale } from './OnboardingPreviewShell';

// DEV-only controls for /onboarding-preview. They only move the real tour around (jumping
// sets up the preview account the step needs); the tour itself is the real one.
const LABELS: Record<OnboardingStep, string> = {
  'intro.name': '1 · Fairy arrives · naming', 'intro.celebrate': '1 · Joy · somersault',
  'garden.zoom': '2 · Zoom controls',
  'event.nav': '3.1 · Events button', 'event.write': '3.2 · Write the Event', 'event.mood': '3.2 · Choose mood',
  'event.save': '3.2 · Save Event', 'event.flower': '3.3 · First flower',
  'plant.place': '3.4 · Plant in this month', 'plant.growth': '3.5 · Garden grows', 'plant.months': '3.6 · Twelve months',
  'treehouse.enter': '4 · Treehouse', 'treehouse.shelf': '4 · Shelf years', 'treehouse.books': '4 · Month books',
  'treehouse.archive': '4 · Flower History', 'treehouse.journal': '4 · Journal', 'treehouse.back': '4 · Back to Garden',
  'mailbox': '5 · Mailbox',
  'friends.nav': '6 · Friends button', 'friends.search': '6 · Search friends', 'friends.house': '6 · Garden house',
  'friends.visit': '6 · Support & messages', 'friends.return': '6 · Return to Garden',
  'fairy.feed': '7 · Moments & bond', 'fairy.bond': '7 · Daily closeness', 'fairy.keepsakes': '7 · Keepsakes',
  'me.space': '8 · Me', 'me.privacy': '8 · Privacy & permissions',
  'finale': "9 · It's your turn!", 'done': 'Finished',
};
// Steps that continue something typed in a panel restart that panel from its first step.
const landing = (step: OnboardingStep): OnboardingStep =>
  step === 'event.mood' || step === 'event.save' || step === 'event.flower' ? 'event.write' : step;

export function OnboardingPreviewControls({ onRemount }: { onRemount: () => void }) {
  const tour = useOnboarding();
  const locale = usePreviewLocale();
  const insets = useSafeAreaInsets();
  // Folded on phone-sized windows so the controls never sit over the Fairy; one tap opens them.
  const [open, setOpen] = useState(() => Dimensions.get('window').width >= 700);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__previewJump = (step: OnboardingStep) => run(() => jumpTo(step));
      (window as any).__previewState = () => onboardingState();
    }
  });
  const where = useRef<{ panel: 'events' | 'friends' | null; treehouse: boolean }>({ panel: null, treehouse: false });
  const waiters = useRef(new Set<(type: string) => void>());
  useEffect(() => observeOnboardingSignals(signal => {
    if (signal.type === 'featureOpened') where.current.panel = signal.feature;
    if (signal.type === 'featureClosed') where.current.panel = null;
    if (signal.type === 'bookhouseOpened') where.current.treehouse = true;
    if (signal.type === 'gardenFocused') where.current.treehouse = false;
    waiters.current.forEach(waiter => waiter(signal.type));
  }), []);
  // Resolve when the app reports a signal (the Garden regained focus, a panel opened …).
  const until = (type: string) => new Promise<void>(resolve => {
    const waiter = (seen: string) => { if (seen === type) { waiters.current.delete(waiter); resolve(); } };
    waiters.current.add(waiter);
  });
  // Resolve once the remounted Garden has started a new tour session and loaded it.
  const untilTour = (since: number) => new Promise<void>(resolve => {
    const check = () => onboardingSessionVersion() >= since + 2 && ['active', 'completed', 'unavailable'].includes(onboardingState().phase)
      ? resolve() : requestAnimationFrame(check);
    check();
  });

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setPicking(false);
    try { await work(); } finally { setBusy(false); }
  }
  async function backToGarden() {
    if (!where.current.treehouse) return;
    const focused = until('gardenFocused');
    router.back();
    await focused;
  }
  /** Fresh Garden screen, resumed from the preview account exactly as a reopened app would. */
  async function remountGarden() {
    await backToGarden();
    const since = onboardingSessionVersion();
    onRemount();
    await untilTour(since);
  }
  async function jumpTo(target: OnboardingStep) {
    const step = landing(target);
    if (stepIndex(step) <= stepIndex('plant.place')) {
      setPreviewPlacementMemory(PREVIEW_OWNER_ID);
    }
    const progress = previewBackend.prepareFor(step, locale);
    const surface = STEP_SPECS[step].surface;
    if (where.current.treehouse && surface !== 'bookhouse') {
      await backToGarden();
    }
    if (surface === 'events' || surface === 'friends') {
      const opened = until('featureOpened');
      router.setParams({ feature: surface, mode: undefined, flowerId: undefined });
      await opened;
    } else if (surface === 'bookhouse' && !where.current.treehouse) {
      router.setParams({ feature: undefined, mode: undefined, flowerId: undefined });
      const arrived = until('bookhouseOpened');
      router.push('/bookhouse');
      await arrived;
    } else {
      router.setParams({
        feature: where.current.panel && surface !== 'bookhouse' ? undefined : undefined,
        mode: undefined,
        flowerId: undefined,
      });
    }
    previewOnboardingAt(PREVIEW_OWNER_ID, step, {
      fairyName: progress.fairyName,
      fairyNamed: progress.fairyNamed,
      firstEventId: progress.firstEventId,
      firstFlowerId: progress.firstFlowerId,
      flowerPlanted: progress.flowerPlanted,
    });
  }
  const start = () => run(async () => {
    previewBackend.reset();
    setPreviewPlacementMemory(PREVIEW_OWNER_ID);
    if (where.current.treehouse) await backToGarden();
    router.setParams({ feature: undefined, mode: undefined, flowerId: undefined });
    previewOnboardingAt(PREVIEW_OWNER_ID, 'intro.name', {
      fairyName: null, fairyNamed: false, firstEventId: null, firstFlowerId: null, flowerPlanted: false,
    });
  });
  const reset = () => run(async () => {
    previewBackend.reset();
    setPreviewPlacementMemory(PREVIEW_OWNER_ID);
    previewBackend.prepareFor('done', locale);
    if (where.current.treehouse) await backToGarden();
    router.setParams({ feature: undefined, mode: undefined, flowerId: undefined });
    previewOnboardingAt(PREVIEW_OWNER_ID, 'done', {
      fairyName: '小月', fairyNamed: true, firstEventId: null, firstFlowerId: null, flowerPlanted: false,
    });
  });
  const current = tour.phase === 'active' ? tour.step : null;
  const neighbour = (offset: number) => {
    if (!current) return null;
    let index = stepIndex(current) + offset;
    // Steps inside the typed Event form are reached by typing; jumps pass over them.
    while (index > 0 && index < ONBOARDING_STEPS.length - 2 && landing(ONBOARDING_STEPS[index]) !== ONBOARDING_STEPS[index]) index += offset;
    const step = ONBOARDING_STEPS[Math.max(0, Math.min(ONBOARDING_STEPS.length - 2, index))];
    return step === current ? null : step;
  };
  const previous = neighbour(-1), next = neighbour(1);

  const panel = <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 54, right: insets.right + 8 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Toggle onboarding preview controls" onPress={() => setOpen(value => !value)} style={styles.tab}>
      <Text style={styles.tabText}>{open ? 'Tour preview ▾' : 'Tour preview ▸'}</Text>
    </Pressable>
    {open ? <View style={styles.card}>
      <Text style={styles.status} numberOfLines={2}>{tour.phase === 'active' ? `${LABELS[tour.step]}  (${tour.step})`
        : tour.phase === 'completed' ? 'Tour finished or not started' : tour.phase === 'loading' ? 'Loading…' : tour.phase}</Text>
      <View style={styles.row}>
        <Button label="Start Tutorial" onPress={start} disabled={busy || tour.phase === 'active'} />
        <Button label="Restart Tutorial" onPress={start} disabled={busy} />
      </View>
      <View style={styles.row}>
        <Button label="◀ Previous Step" onPress={() => previous && run(() => jumpTo(previous))} disabled={busy || !previous} />
        <Button label="Next Step ▶" onPress={() => next && run(() => jumpTo(next))} disabled={busy || !next} />
      </View>
      <View style={styles.row}>
        <Button label={picking ? 'Close step list' : 'Skip to Step…'} onPress={() => setPicking(value => !value)} disabled={busy} />
        <Button label="Reset Preview State" onPress={reset} disabled={busy} />
      </View>
      <View style={styles.row}>
        <Button label={locale === 'zh-Hans' ? 'English' : '中文'} onPress={() => run(async () => {
          setPreviewLocale(locale === 'zh-Hans' ? 'en' : 'zh-Hans');
          await remountGarden();
        })} disabled={busy} />
      </View>
      {picking ? <ScrollView style={styles.list}>
        {ONBOARDING_STEPS.filter(step => step !== 'done').map(step => <Pressable key={step} accessibilityRole="button"
          onPress={() => run(() => jumpTo(step))} style={({ pressed }) => [styles.item, step === current && styles.itemCurrent, pressed && styles.pressed]}>
          <Text style={styles.itemText}>{LABELS[step]}{landing(step) !== step ? '  → starts at 3.2' : ''}</Text>
        </Pressable>)}
      </ScrollView> : null}
      <Text style={styles.note}>Local preview · synthetic account · nothing is sent to Render or saved to a database.</Text>
    </View> : null}
  </View>;
  // On the web the controls sit above the panels' own modal layers so every step stays reachable.
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const { createPortal } = require('react-dom') as { createPortal: (node: React.ReactNode, container: Element) => React.ReactElement };
    return createPortal(<View style={styles.portal} pointerEvents="box-none">{panel}</View>, document.body);
  }
  return panel;
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  portal: { position: 'fixed' as 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 },
  wrap: { position: 'absolute', alignItems: 'flex-end', gap: 6, maxWidth: 300 },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#1D2B2AE6', borderWidth: 1, borderColor: '#C9A55C' },
  tabText: { color: '#F7EFD8', fontSize: 12, fontWeight: '600' },
  card: { width: 290, padding: 10, gap: 8, borderRadius: 14, backgroundColor: '#1D2B2AF0', borderWidth: 1, borderColor: '#C9A55C' },
  status: { color: '#F7EFD8', fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', gap: 6 },
  button: { flex: 1, minHeight: 34, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 9, backgroundColor: '#2F6F67' },
  buttonText: { color: '#FFF8E6', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: .4 },
  pressed: { opacity: .75 },
  list: { maxHeight: 260, borderRadius: 9, backgroundColor: '#0F1A19' },
  item: { paddingHorizontal: 10, paddingVertical: 7 },
  itemCurrent: { backgroundColor: '#2F6F6788' },
  itemText: { color: '#E8DFC6', fontSize: 12 },
  note: { color: '#B9B29B', fontSize: 10, lineHeight: 14 },
});
