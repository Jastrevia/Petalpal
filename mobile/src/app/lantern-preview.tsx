import { Link, Redirect } from 'expo-router';
import { Text } from 'react-native';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GardenScene from '@/components/garden/GardenScene';

export default function LanternPreview() {
  useEffect(() => { if (__DEV__) void SplashScreen.hideAsync(); }, []);
  if (!__DEV__) return <Redirect href="/" />;
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <GardenScene mode="development" initialWaterfallVersion="v2" enableFairyWalk />
    <Link href="/" style={{ position: 'absolute', left: 12, bottom: 16, padding: 10, backgroundColor: '#e3d5bc', zIndex: 10001 }}>
      <Text>Open normal Garden</Text>
    </Link>
  </GestureHandlerRootView>;
}
