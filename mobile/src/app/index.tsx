import { refreshFairyRuntime } from '../services/fairyRuntime';
import { OnboardingGardenLayer } from '../components/onboarding/OnboardingGardenLayer';
import { beginOnboarding, dispatchOnboarding, endOnboardingSession, tourRunning, useOnboarding } from '../components/onboarding/onboardingStore';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GardenScene, { type GardenSceneHandle } from '../components/garden/GardenScene';
import { GardenHud } from '../components/garden/GardenHud';
import { useAuth } from '../services/auth';
import { openGardenPanel } from '../components/garden/gardenPanelBus';
import { GuestGardenHud } from '../components/garden/GuestGardenHud';
import { useGuest } from '../services/guest';

export default function HomeScreen() {
  const { session, experience } = useAuth();
  const guest = useGuest();
  const gardenRef = useRef<GardenSceneHandle>(null);
  const focusFairy = useCallback(() => gardenRef.current?.focusFairy(), []);
  const openEvents = useCallback(() => openGardenPanel('events'), []);
  // A tap on the mailbox opens it straight away; a second tap while it opens does nothing.
  const atMailbox = useRef(false);
  const openMailbox = useCallback(() => {
    if (atMailbox.current) return;
    atMailbox.current = true;
    router.push('/mailbox');
  }, []);
  useFocusEffect(useCallback(() => {
    dispatchOnboarding({ type: 'gardenFocused' }); atMailbox.current = false; }, []));
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  // First-time tour: progress loads with the Garden; returning owners are untouched. While the
  // tour runs, PPL travels with the visitor as the guide, so her in-Garden walk waits until the
  // finale hands her back to the Garden.
  const userId = session?.user.id;
  const onboardingCompleted = experience?.fairyState?.onboardingCompleted;
  useEffect(() => {
    if (!userId) return;
    void beginOnboarding(userId, onboardingCompleted);
    return () => endOnboardingSession();
  }, [userId, onboardingCompleted]);
  const tour = useOnboarding();
  const tourHoldsFairy = tour.phase === 'idle' || tour.phase === 'loading' || tourRunning(tour);
  const tourFinished = tour.step === 'done';
  useEffect(() => { if (tourFinished) void refreshFairyRuntime(); }, [tourFinished]);
  const openTreehouse = useCallback(() => router.push('/bookhouse'), []);
  const renderOnboarding = useCallback((camera: Parameters<typeof OnboardingGardenLayer>[0]['camera']) =>
    <OnboardingGardenLayer camera={camera} onOpenTreehouse={openTreehouse} />, [openTreehouse]);

  // Guest mode: the Garden with no account and no server reads (flowers come from this device only, none at first);
  // the Fairy can walk and swing, and the treehouse opens to look around. The rest asks for an account.
  if (!session && guest) return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene ref={gardenRef} enableFairyWalk={!tourHoldsFairy} renderOverlay={renderOnboarding} key="guest" initialWaterfallVersion="v2" backendMode={false}
      onOpenBookhouse={() => router.push('/bookhouse')} onOpenEvents={guest.requestAccount} onOpenReflection={guest.requestAccount}
      onMailboxOpened={guest.requestAccount} showDevControls={false}>
      <GuestGardenHud onFocusFairy={focusFairy} onAccount={guest.requestAccount} />
    </GardenScene>
  </GestureHandlerRootView>;
  if (!session) return null;
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene ref={gardenRef} enableFairyWalk={!tourHoldsFairy} renderOverlay={renderOnboarding} key={session.user.id} initialWaterfallVersion="v2" monthLawnOpensEvents session={session} gardenOwnerUserId={session.user.id} backendMode showCalendar locale={experience?.user.preferredLocale} onOpenBookhouse={() => router.push('/bookhouse')} onOpenEvents={openEvents} onOpenReflection={month => router.push(month ? { pathname: '/reflection', params: { month: String(month) } } : '/reflection')} onMailboxOpened={openMailbox} showDevControls={false}>
      <GardenHud onFocusFairy={focusFairy} />
    </GardenScene>
  </GestureHandlerRootView>;
}
