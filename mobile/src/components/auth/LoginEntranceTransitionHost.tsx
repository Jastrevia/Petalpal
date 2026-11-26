import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GardenExperience from '../garden/GardenExperience';
import { LoginPreviewPage } from './LoginPreviewPage';

export type LoginHandoffState = 'idle' | 'transitioning' | 'entered' | 'resetting';

const LoginEntranceHostContext = createContext(false);

export function useIsHostedByLoginTransition(): boolean {
  return useContext(LoginEntranceHostContext);
}

/**
 * Coordinates the continuous transition from /login-preview to /player-preview:
 * 1. Pre-warms and retains a single player GardenExperience instance underneath
 *    LoginPreviewPage once the lightweight entrance assets finish loading on /login-preview
 *    (or immediately when navigating directly to /player-preview).
 * 2. Keeps LoginPreviewPage mounted above the live Garden while the entrance animation runs
 *    and navigates the route to /player-preview once at animation start without remounting
 *    the Garden or duplicating Skia canvases.
 * 3. Cross-dissolves LoginPreviewPage (handoffOpacity: 1 -> 0) over the already-decoded
 *    live Player Garden during the perspective transition phase (2800–3700ms).
 * 4. Disposes LoginPreviewPage once handoff completes at 3700ms, leaving the live
 *    interactive Player Garden on screen and preserving it across DEV · Reset Entrance cycles.
 */
export function LoginEntranceTransitionHost({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [handoffState, setHandoffState] = useState<LoginHandoffState>('idle');
  const [sessionKey, setSessionKey] = useState(0);
  const [gardenPrewarmed, setGardenPrewarmed] = useState(pathname === '/player-preview');
  const navigatingRef = useRef(false);

  // Synchronize state when route changes externally (the prewarm flag is set while rendering)
  if (pathname === '/player-preview' && !gardenPrewarmed) setGardenPrewarmed(true);
  useEffect(() => {
    if (pathname === '/login-preview' && handoffState !== 'transitioning') {
      navigatingRef.current = false;
      if (handoffState !== 'idle') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- a route change from outside ends the handoff, with its navigation lock
        setHandoffState('idle');
      }
    } else if (
      pathname !== '/login-preview' &&
      pathname !== '/player-preview' &&
      handoffState === 'entered'
    ) {
      navigatingRef.current = false;
    }
  }, [pathname, handoffState, gardenPrewarmed]);

  const handleEntranceReady = useCallback(() => {
    if (!__DEV__) return;
    setGardenPrewarmed(true);
  }, []);

  const handleEntranceStart = useCallback(() => {
    if (!__DEV__) return;
    setGardenPrewarmed(true);
    setHandoffState('transitioning');
    if (!navigatingRef.current) {
      navigatingRef.current = true;
      router.replace('/player-preview');
    }
  }, []);

  const handleEntranceComplete = useCallback(() => {
    if (!__DEV__) return;
    navigatingRef.current = false;
    setHandoffState('entered');
  }, []);

  const handleEntranceReset = useCallback(() => {
    if (!__DEV__) return;
    navigatingRef.current = false;
    if (pathname !== '/login-preview') {
      setSessionKey((k) => k + 1);
      setHandoffState('resetting');
      router.replace('/login-preview');
    } else {
      setHandoffState('idle');
    }
  }, [pathname]);

  const isPreviewSurface = pathname === '/login-preview' || pathname === '/player-preview';
  const isRetainedGardenRoute =
    isPreviewSurface || pathname === '/mailbox' || pathname === '/journal';

  const shouldMountPlayerGarden =
    __DEV__ &&
    isRetainedGardenRoute &&
    (gardenPrewarmed || pathname === '/player-preview' || handoffState !== 'idle');

  const showLoginOverlay =
    __DEV__ &&
    (pathname === '/login-preview' ||
      handoffState === 'transitioning' ||
      handoffState === 'resetting');

  const isGardenInteractive =
    __DEV__ && pathname === '/player-preview' && !showLoginOverlay;

  const showGardenResetControls =
    __DEV__ && pathname === '/player-preview' && handoffState === 'entered';

  return (
    <LoginEntranceHostContext.Provider value={true}>
      <View style={styles.container}>
        {children}

        {shouldMountPlayerGarden && (
          <View
            testID="hosted-player-garden-layer"
            style={[
              styles.gardenLayer,
              isPreviewSurface ? styles.gardenLayerForeground : styles.gardenLayerBackground,
            ]}
            pointerEvents={isGardenInteractive ? 'auto' : 'none'}
            aria-hidden={!isGardenInteractive}
          >
            <GardenExperience mode="player" />
          </View>
        )}

        {showLoginOverlay && (
          <View
            testID="login-transition-overlay"
            style={styles.overlay}
            pointerEvents="auto"
          >
            <LoginPreviewPage
              key={sessionKey}
              isHandoffTransitioning={handoffState === 'transitioning'}
              onEntranceReady={handleEntranceReady}
              onEntranceStart={handleEntranceStart}
              onEntranceComplete={handleEntranceComplete}
              onEntranceReset={handleEntranceReset}
            />
          </View>
        )}

        {showGardenResetControls && (
          <View
            testID="entrance-dev-controls"
            pointerEvents="box-none"
            style={[
              styles.devBarContainer,
              { bottom: Math.max(insets.bottom, 8) },
            ]}
          >
            <View style={styles.devBarCard}>
              <View style={styles.devBarRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled
                  style={styles.devBtnDisabled}
                >
                  <Text style={styles.devBtnText}>DEV · Preview Successful Login</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleEntranceReset}
                  style={styles.devBtnActive}
                >
                  <Text style={styles.devBtnText}>DEV · Reset Entrance</Text>
                </Pressable>
              </View>
              <Text
                testID="entrance-phase"
                accessibilityLiveRegion="polite"
                style={styles.devPhaseText}
              >
                Entrance complete · live Player Garden active
              </Text>
            </View>
          </View>
        )}
      </View>
    </LoginEntranceHostContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  gardenLayer: {
    ...StyleSheet.absoluteFill,
  },
  gardenLayerForeground: {
    zIndex: 10,
  },
  gardenLayerBackground: {
    zIndex: 0,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
  },
  devBarContainer: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 1000,
    alignItems: 'center',
  },
  devBarCard: {
    backgroundColor: 'rgba(248, 244, 233, 0.94)',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#c8cebc',
    maxWidth: 640,
    width: '100%',
    gap: 4,
  },
  devBarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  devBtnDisabled: {
    opacity: 0.45,
    paddingVertical: 3,
  },
  devBtnActive: {
    paddingVertical: 3,
  },
  devBtnText: {
    color: '#245d55',
    fontSize: 12,
  },
  devPhaseText: {
    fontSize: 11,
    color: '#6b665b',
    textAlign: 'center',
  },
});
