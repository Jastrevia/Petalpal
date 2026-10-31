import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ImageBackground,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { FloatingLetterStack } from './FloatingLetterStack';
import { FloatingPetalsOverlay } from './FloatingPetalsOverlay';
import { HelpFeedbackPanel, HelpFeedbackTrigger } from './HelpFeedbackPanel';
import { MagicLevitationAura } from './MagicLevitationAura';
import { isLetterRead, MAILBOX_LETTERS as LETTERS, markLetterRead } from './mailboxReadState';
import type { Letter, MailboxPhase, MailboxVisualState } from './types';
import { localizedLetter } from './mockLetters';
import { useAppLocale } from '../../services/locale';

const BACKGROUND_IMAGE = require('../../../assets/mailbox/mailbox_bg_clean.jpg');

export const MailboxPage = memo(function MailboxPage() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // 1. Core Mailbox State Machine: 3 Distinct Visual States with 4-Stage Physical Choreography
  // Stage A ('lifting'): 260ms — Envelope rises up & forward with elevated shadow
  // Stage B ('opening'): 320ms — Flap visibly hinges backward around fold line (-180deg)
  // Stage C ('extracting'): 380ms — Folded paper sheet visibly slides upward out of pocket
  // Stage D ('unfolding'): 460ms — Paper expands along creases into reading letter & settles
  const locale = useAppLocale();
  const [letters, setLetters] = useState<Letter[]>(() =>
    LETTERS.map((letter) => ({
      ...localizedLetter(letter, locale),
      read: isLetterRead(letter.id),
    }))
  );
  const [selectedLetterId, setSelectedLetterId] = useState<string>(LETTERS[Math.min(1, LETTERS.length - 1)].id);
  const [visualState, setVisualState] = useState<MailboxVisualState>('reading');
  const [phase, setPhase] = useState<MailboxPhase>('reading');
  const [pendingLetterId, setPendingLetterId] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [transitionStage, setTransitionStage] = useState<
    'idle' | 'folding' | 'sliding' | 'unfolding'
  >('idle');

  // Help & Feedback panel state
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const toggleHelp = useCallback(() => setIsHelpOpen((prev) => !prev), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);

  // Mark letter as read deterministically upon successful physical opening
  const markLetterAsRead = useCallback((id: string) => {
    markLetterRead(id);
    setLetters((prev) =>
      prev.map((letter) => (letter.id === id ? { ...letter, read: true } : letter))
    );
  }, []);

  // Timer ref management for reliable cancellation without state race conditions
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timerRefs.current.forEach((t) => clearTimeout(t));
    timerRefs.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timerRefs.current.push(t);
    return t;
  }, []);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const isReading = visualState === 'reading' || phase === 'reading';

  // Currently active letter
  const activeLetter = useMemo(
    () => letters.find((l) => l.id === selectedLetterId) || letters[0],
    [letters, selectedLetterId]
  );

  const activeIndex = useMemo(
    () => letters.findIndex((l) => l.id === selectedLetterId),
    [letters, selectedLetterId]
  );

  // 2. Physical Switch Interaction Model:
  // Continuous, visibly physical choreography:
  // Envelope rises -> Flap opens -> Paper slides out -> Paper unfolds
  const handleSelectLetter = useCallback(
    (nextLetterId: string) => {
      if (isTransitioning) return;
      if (nextLetterId === selectedLetterId && isReading) return;

      clearTimers();

      if (!isReading && phase === 'stack') {
        // STATE 1 -> STATE 3: Opening from resting stack
        setSelectedLetterId(nextLetterId);
        setIsTransitioning(true);
        setVisualState('opening');
        setTransitionStage('sliding');

        // Stage A: Envelope lifts up & forward (260ms)
        setPhase('lifting');

        addTimer(() => {
          // Stage B: Flap hinges backward -180deg (320ms)
          setPhase('opening');

          addTimer(() => {
            // Stage C: Folded paper visibly slides upward out of pocket (380ms)
            // Deterministically mark as read upon confirmed physical extraction!
            markLetterAsRead(nextLetterId);
            setPhase('extracting');
            setTransitionStage('unfolding');

            addTimer(() => {
              // Stage D: Paper unfolds along fold creases into full reading letter (460ms)
              setPhase('unfolding');

              addTimer(() => {
                setPhase('reading');
                setVisualState('reading');
                setTransitionStage('idle');
                setIsTransitioning(false);
              }, 460);
            }, 380);
          }, 320);
        }, 260);
        return;
      }

      // STATE 3 -> STATE 3: Switching while in reading mode
      // Letter A closes -> Letter B opens (Zero hard swaps!)
      setIsTransitioning(true);
      setPendingLetterId(nextLetterId);
      setVisualState('opening');
      setTransitionStage('folding');

      // Step 1: Letter A collapses in height (320ms)
      setPhase('closing_fold');

      addTimer(() => {
        // Step 2: Paper A slides down into pocket (280ms)
        setPhase('closing_insert');

        addTimer(() => {
          // Step 3: Flap A hinges shut (240ms)
          setPhase('closing_flap');

          addTimer(() => {
            // Step 4: Switch identity to Letter B and lift envelope B!
            setSelectedLetterId(nextLetterId);
            setPendingLetterId(null);
            setPhase('lifting');
            setTransitionStage('sliding');

            addTimer(() => {
              // Flap B hinges backward (320ms)
              setPhase('opening');

              addTimer(() => {
                // Paper B visibly slides out of pocket (380ms)
                // Deterministically mark as read upon confirmed physical extraction!
                markLetterAsRead(nextLetterId);
                setPhase('extracting');
                setTransitionStage('unfolding');

                addTimer(() => {
                  // Paper B unfolds into full reading letter (460ms)
                  setPhase('unfolding');

                  addTimer(() => {
                    setPhase('reading');
                    setVisualState('reading');
                    setTransitionStage('idle');
                    setIsTransitioning(false);
                  }, 460);
                }, 380);
              }, 320);
            }, 260);
          }, 240);
        }, 280);
      }, 320);
    },
    [selectedLetterId, isReading, isTransitioning, phase, clearTimers, addTimer]
  );

  // Flip Next / Previous
  const handleNext = useCallback(() => {
    const nextIdx = (activeIndex + 1) % letters.length;
    handleSelectLetter(letters[nextIdx].id);
  }, [activeIndex, letters, handleSelectLetter]);

  const handlePrev = useCallback(() => {
    const prevIdx = (activeIndex - 1 + letters.length) % letters.length;
    handleSelectLetter(letters[prevIdx].id);
  }, [activeIndex, letters, handleSelectLetter]);

  // Toggle between State 1 (holding stack) and State 3 (reading letter)
  const handleToggleState = useCallback(() => {
    if (isTransitioning) return;
    clearTimers();

    if (isReading) {
      // Reverse process: Paper folds -> Paper slides in -> Flap closes -> Envelope settles
      setIsTransitioning(true);
      setVisualState('opening');
      setTransitionStage('folding');

      // Step 1: Paper folds into trifold dimensions (340ms)
      setPhase('closing_fold');

      addTimer(() => {
        // Step 2: Paper slides down into envelope pocket (300ms)
        setPhase('closing_insert');

        addTimer(() => {
          // Step 3: Flap hinges forward to closed position (280ms)
          setPhase('closing_flap');

          addTimer(() => {
            // Step 4: Envelope descends and settles into stack (240ms)
            setPhase('closing');

            addTimer(() => {
              setPhase('stack');
              setVisualState('holding');
              setTransitionStage('idle');
              setIsTransitioning(false);
            }, 240);
          }, 280);
        }, 300);
      }, 340);
    } else {
      // Forward process: Envelope lifts -> Flap opens -> Paper slides out -> Paper unfolds
      setIsTransitioning(true);
      setVisualState('opening');
      setTransitionStage('sliding');

      // Stage A: Envelope lifts up (260ms)
      setPhase('lifting');

      addTimer(() => {
        // Stage B: Flap hinges backward -180deg (320ms)
        setPhase('opening');

        addTimer(() => {
          // Stage C: Paper slides upward out of pocket (380ms)
          // Deterministically mark as read upon confirmed physical extraction!
          markLetterAsRead(selectedLetterId);
          setPhase('extracting');
          setTransitionStage('unfolding');

          addTimer(() => {
            // Stage D: Paper unfolds along creases into reading letter (460ms)
            setPhase('unfolding');

            addTimer(() => {
              setPhase('reading');
              setVisualState('reading');
              setTransitionStage('idle');
              setIsTransitioning(false);
            }, 460);
          }, 380);
        }, 320);
      }, 260);
    }
  }, [isReading, isTransitioning, clearTimers, addTimer]);

  const handleBackToGarden = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(__DEV__ ? '/garden-test' : '/');
    }
  }, []);

  const contentWidth = Math.min(windowWidth, 560);

  return (
    <ImageBackground
      source={BACKGROUND_IMAGE}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      {/* ── Soft Atmospheric Background Focus Wash ── */}
      {/* Softens background clutter in reading mode so the letter takes center stage */}
      <View
        style={[
          styles.backgroundAtmosphereWash,
          isReading && styles.backgroundReadingFocusWash,
        ]}
        pointerEvents="none"
      />

      {/* ── Delicate Ambient Drifting Petals ── */}
      <FloatingPetalsOverlay />

      {/* NOTE: Single coherent pair of fairy hands is rendered directly from
          the cohesive painted background scene (BACKGROUND_IMAGE), eliminating
          any duplicated/overlapping hand layers. */}

      <SafeAreaView style={styles.safeArea}>
        {/* ── SIMPLIFIED TOP HEADER: Light, Airy, Minimal Presence ── */}
        <View style={styles.topHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Mailbox"
            onPress={handleBackToGarden}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.backButtonText}>✕</Text>
          </Pressable>

          <View style={styles.brandTitleContainer}>
            <Text style={styles.brandLogo}>✿ PetalPal</Text>
          </View>

          <View style={styles.topRightActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isReading ? 'Fold mail into envelopes stack' : 'Open selected letter'
              }
              onPress={handleToggleState}
              style={({ pressed }) => [
                styles.modeToggleButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.modeToggleText}>
                {locale === 'zh-Hans' ? (isReading ? '收起 ✉️' : '阅读 📜') : (isReading ? 'Stack ✉️' : 'Read 📜')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Note: HelpFeedbackTrigger and HelpFeedbackPanel are now globally mounted in the root application shell */}

        {/* ── MAIN FLOATING MAILBOX CANVAS (Center Above Palms) ── */}
        <View style={[styles.mainArea, { width: contentWidth }]}>
          <View style={styles.floatingCenterCluster}>
            {/* Gentle fairy magic radiance beneath the envelopes */}
            <MagicLevitationAura />

            {/* Dominant Unfolded Letter (State 3) or Floating Envelopes Stack (State 1) */}
            <FloatingLetterStack
              letters={letters}
              selectedLetterId={selectedLetterId}
              visualState={visualState}
              phase={phase}
              transitionStage={transitionStage}
              onSelectLetter={handleSelectLetter}
              onToggleUnfold={handleToggleState}
              maxContentWidth={contentWidth}
              maxContentHeight={Math.min(540, windowHeight * 0.68)}
            />
          </View>
        </View>

        {/* ── BOTTOM HUD: Botanical Pagination & Flipping ── */}
        <View style={styles.bottomHud}>
          <View style={styles.paginationPill}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous letter"
              onPress={handlePrev}
              style={({ pressed }) => [
                styles.arrowBtn,
                pressed && styles.arrowBtnPressed,
              ]}
            >
              <Text style={styles.arrowBtnText}>‹</Text>
            </Pressable>

            <Text style={styles.paginationText}>
              — ❧ {activeIndex + 1} / {letters.length} ☙ —
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next letter"
              onPress={handleNext}
              style={({ pressed }) => [
                styles.arrowBtn,
                pressed && styles.arrowBtnPressed,
              ]}
            >
              <Text style={styles.arrowBtnText}>›</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
});

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#2D3D32',
  },
  backgroundAtmosphereWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 24, 18, 0.16)',
    zIndex: 0,
    ...Platform.select({
      web: {
        transition: 'background-color 0.45s ease',
      },
    }),
  },
  backgroundReadingFocusWash: {
    backgroundColor: 'rgba(12, 18, 14, 0.40)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(3px)',
      },
    }),
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 3,
  },
  topHeader: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        transition: 'background-color 0.2s ease',
      },
    }),
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  brandTitleContainer: {
    alignItems: 'center',
  },
  brandLogo: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.8,
    fontFamily:
      Platform.OS === 'web'
        ? '"Playfair Display", "Cormorant Garamond", Georgia, serif'
        : Platform.OS === 'ios'
          ? 'Georgia'
          : 'serif',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: Platform.OS === 'web' ? 140 : 68,
  },
  modeToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
        transition: 'background-color 0.2s ease',
      },
    }),
  },
  buttonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.30)',
  },
  modeToggleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  mainArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  floatingCenterCluster: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomHud: {
    paddingBottom: 16,
    alignItems: 'center',
    zIndex: 20,
  },
  paginationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(20, 28, 22, 0.80)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
      },
    }),
  },
  arrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        transition: 'background-color 0.18s ease',
      },
    }),
  },
  arrowBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  arrowBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  paginationText: {
    color: '#E8F2EC',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.1,
    fontFamily:
      Platform.OS === 'web'
        ? '"Cormorant Garamond", Georgia, serif'
        : Platform.OS === 'ios'
          ? 'Georgia'
          : 'serif',
  },
});

export default MailboxPage;
