import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';

import { FONT_BODY, FONT_DISPLAY, FONT_TITLE } from '../components/mailbox/ExpandedLetter';
import { FloatingPetalsOverlay } from '../components/mailbox/FloatingPetalsOverlay';
import { LoginEntranceScene } from '../components/auth/LoginEntranceScene';
import {
  FairyLoadingExperience,
  FairyLoadingProps,
} from '../components/auth/FairyLoadingExperience';
import {
  ACTION_DURATION_MS,
  CYCLE_DURATION_MS,
  FairyLoadingFrame,
  getActionHoldTime,
} from '../components/auth/fairyLoadingTimeline';

const INVITATION_MATERIALS = require('../../assets/auth/invitation_materials_repaired.webp');

// Botanical fleuron for card title
function CardFleuron({ size = 18, color = '#9E804D' }: { size?: number; color?: string }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ color, fontSize: size * 0.8, textAlign: 'center' }}>❧</Text>;
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 } as any}>
      <svg width={size} height={size * 0.65} viewBox="0 0 24 16" fill="none">
        <path d="M12 1 C10.8 5 10.8 9 12 14 C13.2 9 13.2 5 12 1 Z" fill={color} />
        <path d="M11.5 9 C8.5 7 5 7.8 2.5 11 C6 12.2 9.5 10.8 11.5 9 Z" fill={color} />
        <path d="M12.5 9 C15.5 7 19 7.8 21.5 11 C18 12.2 14.5 10.8 12.5 9 Z" fill={color} />
      </svg>
    </div>
  );
}

// Rosette divider
function RosetteDivider({ color = '#B89F70' }: { color?: string }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ color, fontSize: 13, textAlign: 'center', marginVertical: 3 }}>— ✿ —</Text>;
  }
  return (
    <div
      style={
        {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          width: '100%',
          maxWidth: '148px',
          margin: '2px auto 6px auto',
        } as any
      }
    >
      <div style={{ flex: 1, height: '1px', backgroundColor: color, opacity: 0.55 }} />
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="1.8" fill={color} />
        <circle cx="8" cy="4" r="1.2" fill={color} opacity="0.8" />
        <circle cx="8" cy="12" r="1.2" fill={color} opacity="0.8" />
        <circle cx="4" cy="8" r="1.2" fill={color} opacity="0.8" />
        <circle cx="12" cy="8" r="1.2" fill={color} opacity="0.8" />
      </svg>
      <div style={{ flex: 1, height: '1px', backgroundColor: color, opacity: 0.55 }} />
    </div>
  );
}

// Sparkle icon for Log In button
function SparkleIcon({ size = 13, color = '#FAF7F0' }: { size?: number; color?: string }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ fontSize: size * 0.8, color }}>✦</Text>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M10 2 C10 6.5 13.5 10 18 10 C13.5 10 10 13.5 10 18 C10 13.5 6.5 10 2 10 C6.5 10 10 6.5 10 2 Z"
        fill={color}
      />
    </svg>
  );
}

const BackgroundScene = memo(function BackgroundScene({ reducedMotion }: { reducedMotion: boolean }) {
  const entranceProgress = useRef(new Animated.Value(0)).current;
  return (
    <View style={styles.scenicBackground} pointerEvents="none">
      <LoginEntranceScene
        progress={entranceProgress as any}
        reduced={reducedMotion}
        onReady={() => {}}
        onError={() => {}}
      />
      {!reducedMotion && <FloatingPetalsOverlay />}
    </View>
  );
});

export default function FairyLoadingTestRoute() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // Loading animation controls
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(true);
  const [manualTime, setManualTime] = useState<number | null>(null);
  const [forcedAction, setForcedAction] = useState<0 | 1 | 2 | null>(null);
  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Live telemetry readout
  const [currentFrame, setCurrentFrame] = useState<FairyLoadingFrame | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);

  // Form input mock state
  const [email, setEmail] = useState('player@petalpal.me');
  const [password, setPassword] = useState('••••••••');

  // Invitation card layout measurements
  const [cardLayout, setCardLayout] = useState({ width: 420, height: 546 });

  // Play / Pause toggle
  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
    setManualTime(null);
  }, []);

  // Reset to 0s
  const handleReset = useCallback(() => {
    setManualTime(0);
    setForcedAction(null);
    setIsLoadingActive(true);
    setCompletionNotice(null);
    setIsPlaying(true);
  }, []);

  // Expose test automation hook on Web
  useEffect(() => {
    if (Platform.OS === 'web') {
      (window as any).__SEEK_FAIRY = (ms: number) => {
        setIsPlaying(false);
        setForcedAction(null);
        setManualTime(ms);
      };
    }
    return () => {
      if (Platform.OS === 'web') {
        delete (window as any).__SEEK_FAIRY;
      }
    };
  }, []);

  // Jump to specific action
  const handleSelectAction = useCallback((action: 0 | 1 | 2) => {
    setForcedAction(action);
    setManualTime(getActionHoldTime(action));
    setIsPlaying(false);
  }, []);

  // Simulate loading complete
  const handleSimulateComplete = useCallback(() => {
    setIsLoadingActive(false);
    setCompletionNotice('Loading finished! Fairy gently departed. Ready for garden entrance.');
  }, []);

  // Live frame callback (throttled to ~16 Hz for telemetry readout to prevent full-tree React CPU thrashing at 60 FPS)
  const lastTelemetryTimeRef = useRef<number>(0);
  const currentFrameRef = useRef<FairyLoadingFrame | null>(null);
  const handleFrameUpdate = useCallback((frame: FairyLoadingFrame) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prev = currentFrameRef.current;
    if (
      !prev ||
      now - lastTelemetryTimeRef.current >= 60 ||
      frame.actionIndex !== prev.actionIndex ||
      frame.isTransitioning !== prev.isTransitioning ||
      frame.sparkleActive !== prev.sparkleActive
    ) {
      lastTelemetryTimeRef.current = now;
      currentFrameRef.current = frame;
      setCurrentFrame(frame);
    }
  }, []);

  const isWide = windowWidth > 740;

  return (
    <View style={styles.container}>
      {/* Background Scenic Entrance Atmosphere */}
      <BackgroundScene reducedMotion={reducedMotion} />

      {/* Main Content Area */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top + 24, 32),
              paddingBottom: insets.bottom + 150, // Space for DEV controls panel
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Completion notification banner */}
          {completionNotice && (
            <View style={styles.completionBanner}>
              <Text style={styles.completionBannerText}>🌸 {completionNotice}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setCompletionNotice(null)}
                style={styles.closeBannerBtn}
              >
                <Text style={styles.closeBannerText}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Approved Invitation Card */}
          <View
            testID="loading-invitation-card"
            style={styles.envelopeCard}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) {
                setCardLayout({ width, height });
              }
            }}
          >
            {/* Card Material Artwork (zIndex: 4, sits in front of fairy during peekaboo, behind fairy during flight/sitting) */}
            <View style={[StyleSheet.absoluteFill, { zIndex: 4 }]} pointerEvents="none">
              <Image
                testID="invitation-materials-image"
                source={INVITATION_MATERIALS}
                style={styles.invitationLayerImage}
                resizeMode="contain"
              />
            </View>

            {/* REAL FAIRY LOADING ANIMATION SYSTEM */}
            <FairyLoadingExperience
              character="fairy"
              isLoading={isLoadingActive}
              onComplete={() => {
                setCompletionNotice('Fairy departure complete! Garden ready.');
              }}
              isPaused={!isPlaying}
              manualTimeMs={manualTime}
              forceAction={forcedAction}
              loop={isLooping}
              isReducedMotion={reducedMotion}
              onFrameUpdate={handleFrameUpdate}
              cardWidth={cardLayout.width}
              cardHeight={cardLayout.height}
              debugMode={debugMode}
            />

            {/* Form Controls Content (Safely inside paper borders) */}
            <View style={[styles.cardContent, isWide && styles.cardContentWide]}>
              {/* Header */}
              <View style={styles.invitationHeader}>
                <CardFleuron size={16} color="#9E804D" />
                <Text style={styles.invitationBrandTitle}>PetalPal</Text>
                <RosetteDivider color="#B89F70" />
                <Text style={styles.welcomeTitle}>You’re always welcome here.</Text>
              </View>

              {/* Email Input */}
              <View style={styles.inputGroup}>
                <View style={styles.inputPill}>
                  <Text style={styles.inputIconText}>✉</Text>
                  <View style={styles.inputTextColumn}>
                    <Text style={styles.inputLabel}>Email address</Text>
                    <TextInput
                      style={styles.textInput}
                      value={email}
                      onChangeText={setEmail}
                      editable={!isLoadingActive}
                      placeholder="you@example.com"
                      placeholderTextColor="#71685B"
                    />
                  </View>
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <View style={styles.inputPill}>
                  <Text style={styles.inputIconText}>🔒</Text>
                  <View style={styles.inputTextColumn}>
                    <Text style={styles.inputLabel}>Password</Text>
                    <TextInput
                      style={styles.textInput}
                      value={password}
                      onChangeText={setPassword}
                      editable={!isLoadingActive}
                      secureTextEntry
                      placeholder="Enter password"
                      placeholderTextColor="#71685B"
                    />
                  </View>
                </View>
              </View>

              {/* Primary Log In Button */}
              <Pressable
                accessibilityRole="button"
                style={styles.primaryButton}
                disabled={isLoadingActive}
              >
                <View style={styles.buttonInnerContent}>
                  <SparkleIcon size={13} color="#FAF7F0" />
                  <Text style={styles.buttonText}>Log In</Text>
                  <Text style={styles.buttonArrow}>→</Text>
                </View>
              </Pressable>

              {/* Social or divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerHairline} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerHairline} />
              </View>

              {/* Social buttons */}
              <View style={styles.socialButtonsRow}>
                <View style={styles.socialButton}>
                  <Text style={styles.socialButtonText}>Apple</Text>
                </View>
                <View style={styles.socialButton}>
                  <Text style={styles.socialButtonText}>Google</Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* DEV CONTROLS LAB PANEL (Docked at bottom, strictly outside composition) */}
      <View style={[styles.devPanel, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.devPanelCard}>
          {/* Header & Status Readout */}
          <View style={styles.devHeaderRow}>
            <Text style={styles.devTitleText}>
              🧚 Fairy Loading Lab · {currentFrame ? `${(currentFrame.cycleMs / 1000).toFixed(2)}s / 20.0s` : '20s Cycle'}
            </Text>
            <View style={styles.devBadge}>
              <Text style={styles.devBadgeText}>
                {currentFrame?.isTransitioning
                  ? `Flight Transition (0${(currentFrame.currentPoseIndex + 1)} → 0${(currentFrame.nextPoseIndex + 1)})`
                  : currentFrame?.actionIndex === 0
                  ? currentFrame.cycleMs < 5000
                    ? '01 · Resting (Tilt Cycle 1)'
                    : '01 · Resting (Tilt Cycle 2)'
                  : currentFrame?.actionIndex === 1
                  ? '02 · Sitting & Looking Down'
                  : '03 · Flying & Tapping'}
              </Text>
            </View>
            {currentFrame?.sparkleActive && (
              <View style={[styles.devBadge, { backgroundColor: '#FFF3B3' }]}>
                <Text style={[styles.devBadgeText, { color: '#B57E12' }]}>✦ Sparkle Contact</Text>
              </View>
            )}
          </View>

          {/* Action Jump Buttons */}
          <View style={styles.devButtonsRow}>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.devActionBtn,
                currentFrame?.actionIndex === 0 && !currentFrame?.isTransitioning && styles.devActionBtnActive,
              ]}
              onPress={() => handleSelectAction(0)}
            >
              <Text style={styles.devActionBtnText}>01 Resting</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={[
                styles.devActionBtn,
                currentFrame?.actionIndex === 1 && !currentFrame?.isTransitioning && styles.devActionBtnActive,
              ]}
              onPress={() => handleSelectAction(1)}
            >
              <Text style={styles.devActionBtnText}>02 Sitting</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={[
                styles.devActionBtn,
                currentFrame?.actionIndex === 2 && !currentFrame?.isTransitioning && styles.devActionBtnActive,
              ]}
              onPress={() => handleSelectAction(2)}
            >
              <Text style={styles.devActionBtnText}>03 Tapping</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={[styles.devActionBtn, styles.devActionBtnSpecial]}
              onPress={handleSimulateComplete}
            >
              <Text style={[styles.devActionBtnText, { color: '#FFFFFF' }]}>✓ Complete</Text>
            </Pressable>
          </View>

          {/* Playback Controls Row */}
          <View style={styles.devControlsRow}>
            <Pressable
              accessibilityRole="button"
              style={styles.devCtrlBtn}
              onPress={handlePlayPause}
            >
              <Text style={styles.devCtrlBtnText}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={styles.devCtrlBtn}
              onPress={handleReset}
            >
              <Text style={styles.devCtrlBtnText}>↺ Reset</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={[styles.devCtrlBtn, isLooping && styles.devCtrlBtnActive]}
              onPress={() => setIsLooping((v) => !v)}
            >
              <Text style={styles.devCtrlBtnText}>Loop: {isLooping ? 'ON' : 'OFF'}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={[styles.devCtrlBtn, reducedMotion && styles.devCtrlBtnActive]}
              onPress={() => setReducedMotion((v) => !v)}
            >
              <Text style={styles.devCtrlBtnText}>Reduced: {reducedMotion ? 'ON' : 'OFF'}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={[styles.devCtrlBtn, debugMode && styles.devCtrlBtnActive]}
              onPress={() => setDebugMode((v) => !v)}
            >
              <Text style={styles.devCtrlBtnText}>Debug: {debugMode ? 'ON' : 'OFF'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#5AA4AB',
  },
  scenicBackground: {
    ...StyleSheet.absoluteFill,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  completionBanner: {
    backgroundColor: '#E7F7ED',
    borderColor: '#73C89B',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 440,
    width: '100%',
    shadowColor: '#103823',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 50,
  },
  completionBannerText: {
    color: '#1A5A35',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  closeBannerBtn: {
    padding: 6,
  },
  closeBannerText: {
    color: '#1A5A35',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Approved Botanical Invitation Card Assembly
  envelopeCard: {
    width: '100%',
    maxWidth: 440,
    aspectRatio: 608 / 792,
    position: 'relative',
    marginTop: 20,
  },
  invitationLayerImage: {
    position: 'absolute',
    left: '-4.8%',
    top: '-3.41%',
    width: '107.24%',
    height: '109.72%',
  },
  cardContent: {
    position: 'absolute',
    top: '18.5%',
    bottom: '9%',
    left: '10%',
    right: '12%',
    zIndex: 5,
    justifyContent: 'center',
  },
  cardContentWide: {
    top: '18%',
    bottom: '9%',
  },
  invitationHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  invitationBrandTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 25,
    fontWeight: '600',
    color: '#6E532F',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 1,
  },
  welcomeTitle: {
    fontFamily: FONT_TITLE,
    fontSize: 14,
    color: '#655A4C',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  inputGroup: {
    marginBottom: 8,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5EEE2',
    borderWidth: 1,
    borderColor: '#D4C6AE',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  inputIconText: {
    fontSize: 14,
    color: '#4C6963',
    marginRight: 8,
  },
  inputTextColumn: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 9,
    color: '#827464',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: '#342D23',
    padding: 0,
    margin: 0,
  },
  primaryButton: {
    backgroundColor: '#1E584F',
    borderRadius: 22,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#10382B',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonInnerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  buttonArrow: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  dividerHairline: {
    flex: 1,
    height: 1,
    backgroundColor: '#D4C6AE',
    opacity: 0.6,
  },
  dividerText: {
    color: '#8C7F6E',
    fontSize: 11,
    marginHorizontal: 10,
  },
  socialButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  socialButton: {
    flex: 1,
    backgroundColor: '#F7F3E9',
    borderWidth: 1,
    borderColor: '#D4C6AE',
    borderRadius: 18,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonText: {
    color: '#4C4438',
    fontSize: 12,
    fontWeight: '500',
  },

  // DEV Controls Panel (Stationary at bottom)
  devPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 100,
  },
  devPanelCard: {
    backgroundColor: '#FAF7EE',
    borderWidth: 1,
    borderColor: '#C8CEBC',
    borderRadius: 14,
    padding: 10,
    maxWidth: 620,
    width: '100%',
    shadowColor: '#1E332A',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    gap: 8,
  },
  devHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  devTitleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#245D55',
  },
  devBadge: {
    backgroundColor: '#E6EFEA',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  devBadgeText: {
    fontSize: 11,
    color: '#245D55',
    fontWeight: '500',
  },
  devButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  devActionBtn: {
    flex: 1,
    backgroundColor: '#EFECE2',
    borderWidth: 1,
    borderColor: '#D4CDBE',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  devActionBtnActive: {
    backgroundColor: '#286358',
    borderColor: '#245D55',
  },
  devActionBtnSpecial: {
    backgroundColor: '#357E6B',
    borderColor: '#2A6858',
  },
  devActionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#342D23',
  },
  devControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  devCtrlBtn: {
    backgroundColor: '#F2EFE6',
    borderWidth: 1,
    borderColor: '#CDC8B8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  devCtrlBtnActive: {
    backgroundColor: '#D8E8DF',
    borderColor: '#82BCA1',
  },
  devCtrlBtnText: {
    fontSize: 10.5,
    color: '#443D34',
    fontWeight: '500',
  },
});
