import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GardenScene from '@/components/garden/GardenScene';

export default function FireflyPreview() {
  useEffect(() => { if (__DEV__) void SplashScreen.hideAsync(); }, []);
  if (!__DEV__) return <Redirect href="/" />;
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene mode="player" initialWaterfallVersion="v2" enableFairyWalk />
  </GestureHandlerRootView>;
}
