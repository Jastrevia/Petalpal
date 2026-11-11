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
  // A tap on the mailbox, treehouse or pavilion opens it straight away; a second tap (or another
  // place) while the Garden is leaving does nothing, so a double tap never stacks two screens.
  const leaving = useRef(false);
  const leaveTo = useCallback((path: '/mailbox' | '/bookhouse' | '/reflection' | { pathname: '/reflection'; params: { month: string } }) => {
    if (leaving.current) return;
    leaving.current = true;
    router.push(path);
  }, []);
  const openMailbox = useCallback(() => leaveTo('/mailbox'), [leaveTo]);
  const openBookhouse = useCallback(() => leaveTo('/bookhouse'), [leaveTo]);
  // A month sign opens the pavilion at its month; the pavilion itself opens at the current one.
  const openReflection = useCallback((month?: number) =>
    leaveTo(month ? { pathname: '/reflection', params: { month: String(month) } } : '/reflection'), [leaveTo]);
  useFocusEffect(useCallback(() => {
    dispatchOnboarding({ type: 'gardenFocused' }); leaving.current = false; }, []));
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  // First-time tour: progress loads with the Garden; returning owners are untouched. While the
  // tour runs, PPL travels with the visitor as the guide, so her in-Garden walk waits until the
  // finale hands her back to the Garden.
  // One tour session per signed-in owner: it must not restart when the session refreshes mid-tour.
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
  const renderOnboarding = useCallback((camera: Parameters<typeof OnboardingGardenLayer>[0]['camera']) =>
    <OnboardingGardenLayer camera={camera} onOpenTreehouse={openBookhouse} />, [openBookhouse]);

  // Guest mode: the Garden with no account and no server reads (flowers come from this device only, none at first);
  // the Fairy can walk and swing, and the treehouse opens to look around. The rest asks for an account.
  if (!session && guest) return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene ref={gardenRef} enableFairyWalk={!tourHoldsFairy} renderOverlay={renderOnboarding} key="guest" initialWaterfallVersion="v2" backendMode={false}
      onOpenBookhouse={openBookhouse} onOpenEvents={guest.requestAccount} onOpenReflection={guest.requestAccount}
      onMailboxOpened={guest.requestAccount} showDevControls={false}>
      <GuestGardenHud onFocusFairy={focusFairy} onAccount={guest.requestAccount} />
    </GardenScene>
  </GestureHandlerRootView>;
  if (!session) return null;
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene ref={gardenRef} enableFairyWalk={!tourHoldsFairy} renderOverlay={renderOnboarding} key={session.user.id} initialWaterfallVersion="v2" monthLawnOpensEvents session={session} gardenOwnerUserId={session.user.id} backendMode showCalendar holdIntroCards={tourHoldsFairy} locale={experience?.user.preferredLocale} onOpenBookhouse={openBookhouse} onOpenEvents={openEvents} onOpenReflection={openReflection} onMailboxOpened={openMailbox} showDevControls={false}>
      <GardenHud onFocusFairy={focusFairy} paused={tourHoldsFairy} />
    </GardenScene>
  </GestureHandlerRootView>;
}
