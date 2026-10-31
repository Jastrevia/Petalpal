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
  useFocusEffect(useCallback(() => { atMailbox.current = false; }, []));
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  // Guest mode: the Garden with no account and no server reads (flowers come from this device only, none at first);
  // the Fairy can walk and swing, and the treehouse opens to look around. The rest asks for an account.
  if (!session && guest) return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene ref={gardenRef} enableFairyWalk key="guest" initialWaterfallVersion="v2" backendMode={false}
      onOpenBookhouse={() => router.push('/bookhouse')} onOpenEvents={guest.requestAccount} onOpenReflection={guest.requestAccount}
      onMailboxOpened={guest.requestAccount} showDevControls={false}>
      <GuestGardenHud onFocusFairy={focusFairy} onAccount={guest.requestAccount} />
    </GardenScene>
  </GestureHandlerRootView>;
  if (!session) return null;
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene ref={gardenRef} enableFairyWalk key={session.user.id} initialWaterfallVersion="v2" session={session} gardenOwnerUserId={session.user.id} backendMode showCalendar locale={experience?.user.preferredLocale} onOpenBookhouse={() => router.push('/bookhouse')} onOpenEvents={openEvents} onOpenReflection={() => router.push('/reflection')} onMailboxOpened={openMailbox} showDevControls={false}>
      <GardenHud onFocusFairy={focusFairy} />
    </GardenScene>
  </GestureHandlerRootView>;
}
