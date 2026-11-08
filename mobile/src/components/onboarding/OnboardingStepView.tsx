import { useEffect, type ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../services/auth';
import { OnboardingGuide, serif } from './OnboardingGuide';
import { onboardingLocale, stepLine, UI_COPY, type OnboardingLocale } from './onboardingCopy';
import { dispatchOnboarding, tourRunning, useOnboarding } from './onboardingStore';
import { STEP_SPECS, type OnboardingStep, type OnboardingSurface } from './onboardingSteps';
import { scrollOnboardingTargetIntoView, useOnboardingTargetRect } from './onboardingTargets';
import { Spotlight } from './Spotlight';
import type { Box } from './onboardingLayout';

export const useTourLocale = (): OnboardingLocale => onboardingLocale(useAuth().experience?.user.preferredLocale);

/** One spotlight step: the veil with its opening, and the guide beside it. */
export function OnboardingStepView({ step, locale, speaker, anchor, hole, onHolePress, showNext, onNext, prefer, children }: {
  step: OnboardingStep; locale: OnboardingLocale; speaker: string | null; anchor: Box | null;
  hole?: 'pass' | 'next'; onHolePress?: () => void; showNext: boolean; onNext?: () => void;
  prefer?: 'auto' | 'below' | 'above'; children?: ReactNode;
}) {
  const spec = STEP_SPECS[step];
  if (!spec) return null;
  const next = onNext ?? (() => dispatchOnboarding({ type: 'next' }));
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
    <Spotlight rect={anchor} dim={spec.dim !== false} hole={hole ?? spec.hole}
      blockOutside={spec.surface !== 'events'} holeLabel={UI_COPY[locale].next}
      onHolePress={onHolePress ?? next} />
    <OnboardingGuide step={step} anchor={anchor} text={stepLine(step, locale)} speaker={speaker} showNext={showNext}
      onNext={next} nextLabel={UI_COPY[locale].next} prefer={prefer}>{children}</OnboardingGuide>
  </View>;
}

/** The tour inside the Events or Friends panel (drawn within the panel's own modal), or the Treehouse. */
export function OnboardingPanelLayer({ surface, scroller = 'panel' }: { surface: Exclude<OnboardingSurface, 'garden'>; scroller?: string }) {
  const tour = useOnboarding();
  if (!tourRunning(tour) || STEP_SPECS[tour.step].surface !== surface) return null;
  return <PanelStep step={tour.step} speaker={tour.fairyName} draftHasText={tour.draftHasText} scroller={scroller} />;
}

function PanelStep({ step, speaker, draftHasText, scroller }: { step: OnboardingStep; speaker: string | null; draftHasText: boolean; scroller: string }) {
  const locale = useTourLocale();
  const spec = STEP_SPECS[step];
  if (!spec) return null;
  const anchor = useOnboardingTargetRect(spec.target);
  useEffect(() => { if (spec.target) void scrollOnboardingTargetIntoView(spec.target, scroller); }, [spec.target, scroller]);
  const showNext = spec.kind === 'info' || (step === 'event.write' && draftHasText);
  const prefer = step === 'treehouse.archive' || step === 'treehouse.journal' ? 'below' : 'auto';
  return <OnboardingStepView step={step} locale={locale} speaker={speaker} anchor={anchor} showNext={showNext} prefer={prefer}>
    {step === 'friends.house' ? <HouseLegend locale={locale} /> : null}
  </OnboardingStepView>;
}

// The real house art from the Friends list, lit and unlit, as it appears under a friend's name.
function HouseLegend({ locale }: { locale: OnboardingLocale }) {
  const copy = UI_COPY[locale];
  const house = require('../../../assets/friends/garden-house.png');
  return <View style={styles.legend}>
    <View style={styles.legendItem}><Image source={house} style={styles.house} resizeMode="contain" accessible={false} />
      <Text style={styles.legendText}>{copy.litHouse}</Text></View>
    <View style={styles.legendItem}><Image source={house} style={[styles.house, styles.unlit]} resizeMode="contain" accessible={false} />
      <Text style={styles.legendText}>{copy.unlitHouse}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { zIndex: 2000, elevation: 2000 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  legendItem: { alignItems: 'center', gap: 2 },
  house: { width: 58, height: 46 },
  unlit: { opacity: .38, filter: [{ grayscale: 1 }, { brightness: .7 }] },
  legendText: { fontFamily: serif, fontSize: 12, color: '#5D7468' },
});
