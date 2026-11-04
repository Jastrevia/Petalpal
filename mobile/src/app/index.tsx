import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GardenScene, { type GardenSceneHandle } from '../components/garden/GardenScene';
import { GardenHud } from '../components/garden/GardenHud';
import { useAuth } from '../services/auth';
import { refreshFairyRuntime } from '../services/fairyRuntime';
import { OnboardingGardenLayer } from '../components/onboarding/OnboardingGardenLayer';
import { beginOnboarding, dispatchOnboarding, endOnboardingSession, tourRunning, useOnboarding } from '../components/onboarding/onboardingStore';

export default function HomeScreen() {
  const { session, experience } = useAuth();
  const gardenRef = useRef<GardenSceneHandle>(null);
  const focusFairy = useCallback(() => gardenRef.current?.focusFairy(), []);
  // PPL fetches the letters, then the mailbox opens; back in the Garden she stands beside it again.
  const atMailbox = useRef(false);
  const openMailbox = useCallback(() => {
    if (atMailbox.current) return;
    atMailbox.current = true;
    router.push('/mailbox');
  }, []);
  useFocusEffect(useCallback(() => {
    dispatchOnboarding({ type: 'gardenFocused' });
    if (!atMailbox.current) return;
    atMailbox.current = false;
    gardenRef.current?.returnFromMailbox();
  }, []));
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  // First-time tour: progress loads with the Garden; returning owners are untouched. While the
  // tour runs, PPL travels with the visitor as the guide, so her in-Garden walk waits until the
  // finale hands her back to the Garden.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    void beginOnboarding(userId);
    return () => endOnboardingSession();
  }, [userId]);
  const tour = useOnboarding();
  const tourHoldsFairy = tour.phase === 'idle' || tour.phase === 'loading' || tourRunning(tour);
  const tourFinished = tour.step === 'done';
  useEffect(() => { if (tourFinished) void refreshFairyRuntime(); }, [tourFinished]);
  const openTreehouse = useCallback(() => router.push('/bookhouse'), []);
  const renderOnboarding = useCallback((camera: Parameters<typeof OnboardingGardenLayer>[0]['camera']) =>
    <OnboardingGardenLayer camera={camera} onOpenTreehouse={openTreehouse} />, [openTreehouse]);
  if (!session) return null;
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene ref={gardenRef} enableFairyWalk={!tourHoldsFairy} renderOverlay={renderOnboarding} key={session.user.id} initialWaterfallVersion="v2" session={session} gardenOwnerUserId={session.user.id} backendMode showCalendar locale={experience?.user.preferredLocale} onOpenBookhouse={() => router.push('/bookhouse')} onOpenReflection={() => router.push('/reflection')} onMailboxOpened={openMailbox} showDevControls={false}>
      <GardenHud onFocusFairy={focusFairy} />
    </GardenScene>
  </GestureHandlerRootView>;
}
