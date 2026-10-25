import { PanelThemeProvider } from '../components/features/PanelTheme';
import { AuthProvider, useAuth } from "../services/auth";
import { ProductionRouteGate } from "../components/ProductionRouteGate";
import { AuthGate } from "../components/AuthGate";
import { nativeSecurityEnabled } from '../services/nativeSecurity';
import { DarkTheme, DefaultTheme, Slot, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import type React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { FeedbackDraftProvider, GlobalHelpFeedback } from '../components/feedback';
import { WorldTimeProvider } from '@/components/garden/world-time';

// Partner login/entrance preview host: DEV-only, so production keeps its plain Stack.
const DevLoginEntranceHost: React.ComponentType<{ children: React.ReactNode }> = __DEV__
  ? require('../components/auth/LoginEntranceTransitionHost').LoginEntranceTransitionHost
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

SplashScreen.preventAutoHideAsync();

export default function Layout() {
  if (__DEV__ && nativeSecurityEnabled) {
    const HarnessScreen = require('../components/NativeSecurityHarnessScreen').default;
    return <AuthProvider><HarnessScreen /></AuthProvider>;
  }
  return <AuthProvider><AuthGate><RoutedContent /></AuthGate></AuthProvider>;
}

function RoutedContent() {
  const pathname = usePathname();
  return <ProductionRouteGate pathname={pathname}><TabLayout /></ProductionRouteGate>;
}

function TabLayout() {
  const { session } = useAuth();
  const colorScheme = useColorScheme();
  const pathname = usePathname();

  // DEV previews need a stable parent navigator outside NativeTabs' route list.
  // Functional Garden routes also need this navigator in exported builds.
  // Other existing preview/tab routes retain their current presentation.
  let content;
  if (__DEV__ || pathname === '/' || pathname === '/journal' || pathname === '/garden-history' || pathname === '/bookhouse' || pathname === '/mailbox' || pathname === '/reflection' || pathname.startsWith('/feature/') || pathname.startsWith('/visit/')) {
    content = (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <DevLoginEntranceHost>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'Garden', headerShown: false }} />
          <Stack.Screen name="reflection" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="bookhouse" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="mailbox" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="journal" options={{ title: 'Events / Flowers' }} />
          <Stack.Screen name="garden-history" options={{ title: 'Garden history' }} />
          <Stack.Screen name="feature/[feature]" options={{ title: 'PetalPal' }} />
          <Stack.Screen name="visit/[ownerId]" options={{ title: 'Friend Garden', headerShown: false }} />
          <Stack.Screen name="garden-test" options={{ title: 'Garden preview' }} />
          {__DEV__ && <Stack.Screen name="treehouse-test" options={{ title: 'Treehouse preview' }} />}
          {__DEV__ && <Stack.Screen name="swing-test" options={{ title: 'Swing preview' }} />}
          {__DEV__ && <Stack.Screen name="moon-bed-test" options={{ title: 'Moon Bed preview' }} />}
          {__DEV__ && <Stack.Screen name="water-test" options={{ title: 'Water preview' }} />}
          {__DEV__ && <Stack.Screen name="player-preview" options={{ headerShown: false, animation: 'none' }} />}
          {__DEV__ && <Stack.Screen name="login-preview" options={{ headerShown: false, animation: 'none' }} />}
          {__DEV__ && <Stack.Screen name="fairy-loading-test" options={{ headerShown: false }} />}
        </Stack>
        </DevLoginEntranceHost>
      </ThemeProvider>
    );
  } else if (pathname === '/treehouse-test') {
    content = <Slot />;
  } else {
    content = (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AppTabs />
      </ThemeProvider>
    );
  }

  // Partner Help/Feedback overlay: DEV-only until a real feedback backend and a
  // production placement decision exist (its transport only records locally).
  return <PanelThemeProvider key={session?.user.id} userId={session?.user.id}><WorldTimeProvider key={session?.user.id}>
    {__DEV__ ? <FeedbackDraftProvider>
      <View style={styles.rootShell}>
        {content}
        <GlobalHelpFeedback />
      </View>
    </FeedbackDraftProvider> : content}
  </WorldTimeProvider></PanelThemeProvider>;
}

const styles = StyleSheet.create({
  rootShell: {
    flex: 1,
    position: 'relative',
    width: '100%',
    height: '100%',
  },
});
