import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KEEPSAKE_ART } from '../bond/keepsakeArt';

import { getApprovedMonthWorldBounds } from '../garden/planting/approvedPlantingMasks';
import { usePlanting } from '../garden/planting/PlantingContext';
import { GARDEN_WORLD_BOUNDS } from '../garden/rendering/gardenWorldBounds';
import { TREEHOUSE_MAP_SCALE, TREEHOUSE_MAP_X, TREEHOUSE_MAP_Y } from '../garden/treehouseMapPlacement';
import { FairyFinale } from './FairyFinale';
import { FairyIntro } from './FairyIntro';
import type { GardenCameraApi } from './gardenCamera';
import { MonthLabels, monthLabelAnchors } from './MonthLabels';
import { stepLine, UI_COPY, type OnboardingLocale } from './onboardingCopy';
import { OnboardingGuide, serif } from './OnboardingGuide';
import { boundsOf, frameWorldBox, worldBoxToScreen, type Box, type Insets } from './onboardingLayout';
import { dispatchOnboarding, tourRunning, useOnboarding } from './onboardingStore';
import { STEP_SPECS, type OnboardingStep } from './onboardingSteps';
import { useOnboardingTargetRect } from './onboardingTargets';
import { OnboardingStepView, useTourLocale } from './OnboardingStepView';

// The tour's Garden-side layer, drawn by GardenScene above the live Garden. It starts only once
// the Garden has finished loading, and it moves the real camera with eased frames.

// Treehouse art registration (1448 × 1086 source pixels): its canopy and trunk, and its mailbox.
const tree = (x: number, y: number, width: number, height: number): Box => ({
  x: TREEHOUSE_MAP_X + x * TREEHOUSE_MAP_SCALE, y: TREEHOUSE_MAP_Y + y * TREEHOUSE_MAP_SCALE,
  width: width * TREEHOUSE_MAP_SCALE, height: height * TREEHOUSE_MAP_SCALE });
export const TREEHOUSE_BOX = tree(80, 40, 1260, 990);
export const MAILBOX_BOX = tree(900, 660, 176, 280);
// Below the planting banner: the fairy's line about the bed (about four lines of text) and a gap.
const PLACE_GUIDE_ROOM = 136;

export function OnboardingGardenLayer({ camera, onOpenTreehouse }: { camera: GardenCameraApi; onOpenTreehouse: () => void }) {
  const tour = useOnboarding();
  const locale = useTourLocale();
  const planting = usePlanting();
  const active = tourRunning(tour) && Boolean(tour.step && STEP_SPECS[tour.step]);

  // Synchronize Garden planting mode with the active onboarding step: the tour's own planting
  // ends when the tour moves off `plant.place` or ends. Only that transition cancels: planting
  // outside the tour (every owner once it is finished) is never touched.
  const placing = active && tour.step === 'plant.place';
  const wasPlacing = useRef(placing);
  useEffect(() => {
    const left = wasPlacing.current && !placing;
    wasPlacing.current = placing;
    if (left && planting.activeMode !== 'normal') planting.cancelPlacement();
  }, [placing, planting.activeMode, planting.cancelPlacement]);

  useEffect(() => {
    if (active && (tour.step === 'plant.growth' || tour.step === 'plant.months')) {
      void planting.refreshGarden();
    }
  }, [active, tour.step, planting.refreshGarden]);

  if (!active || STEP_SPECS[tour.step].surface !== 'garden') return null;
  const step = tour.step;
  if (step === 'intro.name' || step === 'intro.celebrate') {
    return <View style={[StyleSheet.absoluteFill, styles.layer]}><FairyIntro step={step} locale={locale} fairyName={tour.fairyName} /></View>;
  }
  if (step === 'finale') {
    return <View style={[StyleSheet.absoluteFill, styles.layer]}>
      <FairyFinale onLead={() => void camera.animateTo(homeFrame(camera), 2100)} onDone={() => dispatchOnboarding({ type: 'finaleDone' })} />
    </View>;
  }
  return <GardenStep step={step} camera={camera} locale={locale} speaker={tour.fairyName}
    firstFlowerId={tour.firstFlowerId} onOpenTreehouse={onOpenTreehouse} />;
}

/** The Garden's opening view, a little closer: where the visitor is led back in. */
function homeFrame(camera: GardenCameraApi) {
  return frameWorldBox(GARDEN_WORLD_BOUNDS, camera.viewport, camera.fit, camera.baseX, camera.baseY,
    { top: 0, bottom: 0, left: 0, right: 0 }, { min: camera.limits.min * 1.12, max: camera.limits.max }, 1);
}
const currentFrame = (camera: GardenCameraApi) => ({ x: camera.x.value, y: camera.y.value, zoom: camera.zoom.value });

function GardenStep({ step, camera, locale, speaker, firstFlowerId, onOpenTreehouse }: {
  step: Exclude<OnboardingStep, 'intro.name' | 'intro.celebrate' | 'finale'>; camera: GardenCameraApi; locale: OnboardingLocale;
  speaker: string | null; firstFlowerId: string | null; onOpenTreehouse: () => void;
}) {
  const insets = useSafeAreaInsets();
  const planting = usePlanting();
  const spec = STEP_SPECS[step];
  if (!spec) return null;
  const measured = useOnboardingTargetRect(spec.target && !spec.target.startsWith('world.') ? spec.target
    : step === 'plant.place' ? 'planting.banner' : undefined);
  const [world, setWorld] = useState<{ step: OnboardingStep; box: Box } | null>(null);
  const [monthsState, setMonthsState] = useState<'arriving' | 'sweeping' | 'shown' | 'hiding'>('arriving');
  const version = useRef(0);
  const viewInsets: Insets = { top: insets.top + 24, bottom: insets.bottom + 210, left: insets.left + 16, right: insets.right + 16 };
  const placeWorld = (box: Box, forStep: OnboardingStep) =>
    setWorld({ step: forStep, box: worldBoxToScreen(box, currentFrame(camera), camera.fit, camera.baseX, camera.baseY) });

  const plantedFlower = planting.placements.find(item => item.flowerId === firstFlowerId);

  // Camera choreography for the steps that own the camera; each move is cancelled if the step changes.
  useEffect(() => {
    const run = ++version.current;
    const live = () => run === version.current;
    setWorld(null);
    const frame = (box: Box, fill: number, ms: number, edge: Insets = viewInsets) => {
      if (camera.fit <= 0 || camera.viewport.width <= 0 || camera.viewport.height <= 0) return Promise.resolve(false);
      return camera.animateTo(frameWorldBox(box, camera.viewport, camera.fit, camera.baseX, camera.baseY, edge, camera.limits, fill), ms);
    };
    if (step === 'treehouse.enter') void frame(TREEHOUSE_BOX, .78, 1500).then(() => { if (live()) placeWorld(TREEHOUSE_BOX, step); });
    if (step === 'mailbox') void frame(MAILBOX_BOX, .5, 1200).then(() => { if (live()) placeWorld(MAILBOX_BOX, step); });
    if (step === 'plant.growth') {
      const fallbackBed = getApprovedMonthWorldBounds(new Date().getMonth() + 1);
      const box = plantedFlower
        ? { x: plantedFlower.worldX - 80, y: plantedFlower.worldY - 120, width: 160, height: 160 }
        : fallbackBed;
      void frame(box, .35, 1200).then(() => { if (live()) placeWorld(box, step); });
    }
    if (step === 'plant.months') {
      setMonthsState('arriving');
      const anchors = monthLabelAnchors();
      const all = boundsOf(anchors, 140);
      void (async () => {
        await frame(all, 1, 1800, { top: insets.top, bottom: insets.bottom + 90, left: 8, right: 8 });
        if (!live()) return;
        setMonthsState('sweeping');
        // Where the screen is narrower than the twelve beds (a phone held upright), the camera
        // stays inside the Garden and glides across them instead, so every number is seen.
        const visible = anchors.every(point => {
          const at = worldBoxToScreen({ x: point.x, y: point.y, width: 0, height: 0 }, currentFrame(camera), camera.fit, camera.baseX, camera.baseY);
          return at.x > 20 && at.x < camera.viewport.width - 20 && at.y > insets.top + 10 && at.y < camera.viewport.height - insets.bottom - 90;
        });
        if (visible) { setMonthsState('shown'); return; }
        const west = boundsOf(anchors.filter(point => point.x < all.x + all.width / 2), 120);
        const east = boundsOf(anchors.filter(point => point.x >= all.x + all.width / 2), 120);
        for (const side of [west, east, all]) {
          if (!live()) return;
          await frame(side, 1, 2200, { top: insets.top, bottom: insets.bottom + 90, left: 8, right: 8 });
        }
        if (live()) setMonthsState('shown');
      })();
    }
    return () => { version.current++; };
  }, [step, camera.fit, camera.viewport.width, camera.viewport.height, camera.resets, plantedFlower?.worldX, plantedFlower?.worldY]);

  // Planting the first Flower: the real planting mode, limited to this month's bed and framed on it.
  // Track autoStartedAttemptRef so clicking Cancel exits planting mode cleanly into a retryable state
  // instead of immediately forcing planting mode back on.
  const framedMonth = useRef<number | null>(null);
  const framedKey = useRef<string | null>(null);
  const autoStartedAttemptRef = useRef<number | null>(null);
  const [plantAttempt, setPlantAttempt] = useState(0);
  useEffect(() => {
    if (step !== 'plant.place') {
      framedMonth.current = null;
      framedKey.current = null;
      autoStartedAttemptRef.current = null;
      return;
    }
    if (!firstFlowerId || autoStartedAttemptRef.current === plantAttempt) return;
    autoStartedAttemptRef.current = plantAttempt;
    if (planting.activeMode === 'normal') {
      void planting.startPlanting({ flowerId: firstFlowerId, month: new Date().getMonth() + 1, flowerName: '' });
    }
  }, [step, planting.activeMode, firstFlowerId, plantAttempt, planting.startPlanting]);

  const plantError = step === 'plant.place' && planting.activeMode === 'normal' ? planting.detailError : '';
  const plantCancelled = step === 'plant.place' && planting.activeMode === 'normal' && autoStartedAttemptRef.current === plantAttempt && !plantError;

  // The month is the owner's own: the Flower's month, which is this month on the phone's local
  // calendar. The Garden puts its camera back to the whole view whenever its size changes, even for
  // a moment (an Events sheet closing, the bars making way for planting, a turned phone), so the bed
  // is framed again after every such reset, not only once: the gold bed is what the tour opens on.
  const framedFor = `${planting.targetFlower?.month ?? ''}:${camera.viewport.width}x${camera.viewport.height}:${camera.fit}:${camera.resets}`;
  useEffect(() => {
    const month = planting.targetFlower?.month;
    if (step !== 'plant.place' || !month || camera.fit <= 0 || framedKey.current === framedFor) return;
    framedKey.current = framedFor;
    framedMonth.current = month;
    // Room above the bed for the planting banner and the fairy's line under it.
    const top = (measured ? measured.y + measured.height : insets.top + 130) + PLACE_GUIDE_ROOM;
    const target = frameWorldBox(getApprovedMonthWorldBounds(month), camera.viewport, camera.fit, camera.baseX, camera.baseY,
      { top, bottom: insets.bottom + 110, left: insets.left + 12, right: insets.right + 12 }, camera.limits, .92);
    // A move cut short by another camera move (the Garden settling as the Events sheet closes) is tried
    // again from where the camera stopped, so the tour never leaves the owner looking somewhere else.
    let tries = 0, gone = false;
    const glide = (ms: number) => void camera.animateTo(target, ms).then(done => {
      if (!done && !gone && tries++ < 2 && framedKey.current === framedFor) glide(700);
    });
    glide(1400);
    return () => { gone = true; };
  }, [step, planting.targetFlower?.month, measured?.height, framedFor]);

  const isWorld = spec.target?.startsWith('world.');
  const anchor = isWorld ? (world?.step === step ? world.box : null)
    : step === 'plant.growth' ? (world?.step === step ? world.box : null) : measured;
  const copy = UI_COPY[locale];

  if (step === 'plant.place') {
    // No veil: the bed is the stage. Planting's own controls stay in charge of taps.
    return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <PlacementGuide step={step} locale={locale} speaker={speaker} anchor={measured} error={plantError}
        cancelled={plantCancelled} onRetry={() => { framedMonth.current = null; framedKey.current = null; setPlantAttempt(count => count + 1); }} />
    </View>;
  }
  if (step === 'plant.months') {
    return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <MonthLabels camera={camera} visible={monthsState === 'shown' || monthsState === 'sweeping'} onHidden={() => dispatchOnboarding({ type: 'monthsShown' })} />
      <OnboardingStepView step={step} locale={locale} speaker={speaker} anchor={null} showNext={monthsState === 'shown'}
        onNext={() => setMonthsState('hiding')} prefer="below">
        <Text style={styles.caption}>{copy.monthsTitle}</Text>
      </OnboardingStepView>
    </View>;
  }
  return <OnboardingStepView step={step} locale={locale} speaker={speaker} anchor={anchor}
    showNext={spec.kind === 'info' && (!isWorld || Boolean(anchor))}
    hole={step === 'treehouse.enter' ? 'next' : undefined}
    onHolePress={step === 'treehouse.enter' ? onOpenTreehouse : undefined}
    prefer={step === 'plant.growth' ? 'above' : 'auto'}>
    {step === 'plant.growth' && !firstFlowerId ? <Text style={styles.caption}>{copy.noFlower}</Text> : null}
    {step === 'fairy.feed' ? <View style={styles.art}>
      <Image source={require('@/assets/fairy-entry/moments-book.webp')} style={styles.artImage} resizeMode="contain" accessible={false} />
      <Image source={require('@/assets/fairy-entry/bond-heart.webp')} style={styles.artImage} resizeMode="contain" accessible={false} />
    </View> : null}
    {step === 'fairy.keepsakes' ? <View style={styles.art}>
      {['dewdrop', 'glowing-petal', 'tiny-lantern'].map(id => <Image key={id} source={KEEPSAKE_ART[id]} style={styles.keepsake} resizeMode="contain" accessible={false} />)}
    </View> : null}
  </OnboardingStepView>;
}

function PlacementGuide({ step, locale, speaker, anchor, error, cancelled, onRetry }: { step: OnboardingStep; locale: OnboardingLocale;
  speaker: string | null; anchor: Box | null; error: string; cancelled: boolean; onRetry: () => void }) {
  const retryLabel = error ? UI_COPY[locale].retry : (locale === 'zh-Hans' ? '种下这朵花' : 'Plant flower');
  return <OnboardingGuide step={step} anchor={anchor} text={stepLine(step, locale)} speaker={speaker}
    showNext={Boolean(error) || cancelled} onNext={onRetry} nextLabel={retryLabel} prefer="below" maxWidth={280}>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </OnboardingGuide>;
}

const styles = StyleSheet.create({
  layer: { zIndex: 2000, elevation: 2000 },
  caption: { fontFamily: serif, fontSize: 13, lineHeight: 19, color: '#6F7F72' },
  error: { fontSize: 13, color: '#9A3F3A' },
  art: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  artImage: { width: 64, height: 56 },
  keepsake: { width: 46, height: 46 },
});
