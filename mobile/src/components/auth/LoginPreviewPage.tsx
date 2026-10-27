import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_BODY, FONT_DISPLAY, FONT_TITLE } from '../mailbox/ExpandedLetter';
import { FloatingPetalsOverlay } from '../mailbox/FloatingPetalsOverlay';

import { LoginEntranceScene, entranceTrack } from './LoginEntranceScene';
import { useLoginEntrance } from './useLoginEntrance';
import { ENTRANCE_STILLS } from './entranceTimeline';
import { FairyLoadingExperience } from './FairyLoadingExperience';
import { Link } from 'expo-router';
const INVITATION_MATERIALS = require('../../../assets/auth/invitation_materials_repaired.png');

// Top Botanical Sprout Fleuron above PetalPal brand title
function TopBotanicalFleuron({ size = 22, color = '#9E804D' }: { size?: number; color?: string }) {
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

// Rosette Filigree Divider with flanked hairlines
function RosetteDivider({ color = '#B89F70' }: { color?: string }) {
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeDividerRow}>
        <View style={[styles.nativeDividerLine, { backgroundColor: color }]} />
        <Text style={{ color, fontSize: 13, marginHorizontal: 8 }}>✿</Text>
        <View style={[styles.nativeDividerLine, { backgroundColor: color }]} />
      </View>
    );
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

// Subtle Leaf Accent beneath headline
function SubtleLeafAccent({ color = '#B89F70' }: { color?: string }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ color, fontSize: 12, textAlign: 'center' }}>❦</Text>;
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 } as any}>
      <svg width="14" height="12" viewBox="0 0 16 14" fill="none">
        <path d="M8 13 C7.2 9 7.2 5 8 1 C8.8 5 8.8 9 8 13 Z" fill={color} opacity="0.85" />
        <path d="M7.5 7 C5 5.5 2.5 6 1 8.5 C3.8 9.5 6.2 8.5 7.5 7 Z" fill={color} opacity="0.7" />
        <path d="M8.5 7 C11 5.5 13.5 6 15 8.5 C12.2 9.5 9.8 8.5 8.5 7 Z" fill={color} opacity="0.7" />
      </svg>
    </div>
  );
}

// 4-Point Sparkle Icon for Primary CTA
function SparkleIcon({ size = 15, color = '#FAF7F0' }: { size?: number; color?: string }) {
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

// Mail SVG Icon
function MailIcon({ size = 19, color = '#3A635B' }: { size?: number; color?: string }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ fontSize: size * 0.8, color }}>✉</Text>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="19" height="15" rx="3.5" />
      <path d="M4 6.5l8 6.5 8-6.5" />
    </svg>
  );
}

// Padlock SVG Icon
function LockIcon({ size = 19, color = '#3A635B' }: { size?: number; color?: string }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ fontSize: size * 0.8, color }}>🔒</Text>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="11" rx="3" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
      <circle cx="12" cy="15.5" r="1.3" fill={color} />
    </svg>
  );
}

// Eye / Eye-off toggle SVG Icon
function EyeIcon({ isVisible, size = 19, color = '#3A635B' }: { isVisible: boolean; size?: number; color?: string }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ fontSize: size * 0.8, color }}>{isVisible ? '👁' : '🙈'}</Text>;
  }
  if (isVisible) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// 3-Leaf Sprout Icon for Primary CTA (with distinct leaf separation)
function ButtonSproutIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ fontSize: size * 0.8, color }}>🌱</Text>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2.5C10.5 6 10.5 10.5 12 14C13.5 10.5 13.5 6 12 2.5Z" fill={color} />
      <path d="M11 11.5C8 9 4.2 9.8 2.5 13C5.8 14.5 9.5 13.2 11 11.5Z" fill={color} />
      <path d="M13 11.5C16 9 19.8 9.8 21.5 13C18.2 14.5 14.5 13.2 13 11.5Z" fill={color} />
      <path d="M12 14V21" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Apple Icon
function AppleIcon({ size = 17 }: { size?: number }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ fontSize: size * 0.8, color: '#000000' }}></Text>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#000000">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.84c.62-.75 1.04-1.8 0.93-2.84-.9.04-1.99.6-2.63 1.35-.57.65-1.07 1.72-.94 2.73 1 .08 2.02-.49 2.64-1.24z" />
    </svg>
  );
}

// Google 4-Color 'G' Icon
function GoogleIcon({ size = 17 }: { size?: number }) {
  if (Platform.OS !== 'web') {
    return <Text style={{ fontSize: size * 0.8, color: '#4285F4' }}>G</Text>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

export interface LoginPreviewPageProps {
  isHandoffTransitioning?: boolean;
  onEntranceReady?: () => void;
  onEntranceStart?: () => void;
  onEntranceComplete?: () => void;
  onEntranceReset?: () => void;
  /** Real email/password sign-in from AuthGate. Without it the page stays the DEV-only simulation. */
  onSignIn?: (email: string, password: string) => Promise<void>;
  onCreateAccount?: () => void;
  /** Real Firebase password-reset email for the address in the field. */
  onForgotPassword?: (email: string) => Promise<void>;
  authError?: string;
  authMessage?: string;
  /** Shown at the end of the invitation card (Terms, Privacy and support links). */
  footer?: React.ReactNode;
}

export const LoginPreviewPage = memo(function LoginPreviewPage({
  isHandoffTransitioning = false,
  onEntranceReady,
  onEntranceStart,
  onEntranceComplete,
  onEntranceReset,
  onSignIn,
  onCreateAccount,
  onForgotPassword,
  authError,
  authMessage,
  footer,
}: LoginPreviewPageProps = {}) {
  const live = !!onSignIn;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // Form interactive state (Layer C)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const entrance = useLoginEntrance({
    onReady: onEntranceReady,
    onStart: onEntranceStart,
    onComplete: onEntranceComplete,
    onReset: onEntranceReset,
  });
  const [signingIn, setSigningIn] = useState(false);
  const isSubmitting = entrance.phase !== 'idle' || signingIn;
  const [showDevControls, setShowDevControls] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Invitation card layout measurements for anchored fairy coordinates
  const [cardLayout, setCardLayout] = useState({ width: 420, height: 546 });
  const [manualFairyTime, setManualFairyTime] = useState<number | null>(null);
  const [isFairyPaused, setIsFairyPaused] = useState(false);

  // Expose test automation hooks in __DEV__ on Web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && __DEV__ && !live) {
      (window as any).__SEEK_FAIRY = (ms: number | null) => {
        if (ms === null || ms === undefined) {
          setManualFairyTime(null);
          setIsFairyPaused(false);
        } else {
          setIsFairyPaused(true);
          setManualFairyTime(ms);
        }
      };
      (window as any).__DEV_PLAY_ENTRANCE = () => {
        setBannerNotice(null);
        setShowDevControls(false);
        entrance.play();
      };
      (window as any).__DEV_RESET_ENTRANCE = () => {
        entrance.reset();
        setBannerNotice(null);
        setEmailError(null);
        setPasswordError(null);
        setManualFairyTime(null);
        setIsFairyPaused(false);
        setShowDevControls(false);
      };
    }
    return () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        delete (window as any).__SEEK_FAIRY;
        delete (window as any).__DEV_PLAY_ENTRANCE;
        delete (window as any).__DEV_RESET_ENTRANCE;
      }
    };
  }, [entrance, live]);

  // In-world feedback notification banner
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'info' | 'success' | 'warning';
    title: string;
    message: string;
  } | null>(null);

  // Layer B gentle breathing motion animation
  const breathingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (entrance.phase !== 'idle' || entrance.reduced) { breathingAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathingAnim, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathingAnim, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathingAnim, entrance.phase, entrance.reduced]);

  const cardTranslateY = breathingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  });

  // Validation
  const validateForm = useCallback(() => {
    let valid = true;
    setEmailError(null);
    setPasswordError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Please enter your garden email address');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email (e.g. fairy@petalpal.me)');
      valid = false;
    }

    if (!password) {
      setPasswordError('Please enter your password');
      valid = false;
    } else if (password.length < 4) {
      setPasswordError('Password should be at least 4 characters');
      valid = false;
    }

    return valid;
  }, [email, password]);

  // Primary Login Submit handler: real sign-in when AuthGate provides it, otherwise the DEV simulation.
  const handleLoginSubmit = useCallback(async () => {
    if (signingIn) return;
    if (!validateForm()) {
      setBannerNotice({
        type: 'warning',
        title: 'Gentle Notice',
        message: 'Please complete the requested fields to enter the garden.',
      });
      return;
    }
    if (onSignIn) {
      setBannerNotice(null);
      setDismissedAuth(null);
      setSigningIn(true);
      try { await onSignIn(email.trim(), password); }
      finally { setSigningIn(false); setPassword(''); }
      return;
    }

    setBannerNotice({type:'info',title:'Preview only',message:'Authentication is not connected. No credentials were sent. Use the explicitly labeled DEV control to preview the entrance.'});
  }, [validateForm, onSignIn, signingIn, email, password]);

  // Forgot password: a real reset email when AuthGate provides it, otherwise the preview notice.
  const [sendingReset, setSendingReset] = useState(false);
  const handleForgotPassword = useCallback(async () => {
    if (onForgotPassword) {
      if (sendingReset) return;
      if (!email.trim()) { setEmailError('Enter your email above, then tap Forgot password'); return; }
      setEmailError(null); setBannerNotice(null); setDismissedAuth(null); setSendingReset(true);
      try { await onForgotPassword(email.trim()); } finally { setSendingReset(false); }
      return;
    }
    setBannerNotice({
      type: 'info',
      title: 'Password Whispers',
      message:
        'Password recovery instructions will be softly delivered to your garden email once connected to the mail service.',
    });
  }, [onForgotPassword, sendingReset, email]);

  // Social login handlers
  const handleAppleSignIn = useCallback(() => {
    setBannerNotice({
      type: 'info',
      title: 'Apple Sign-In',
      message: 'Apple Sign-In is not connected in this preview.',
    });
  }, []);

  const handleGoogleSignIn = useCallback(() => {
    setBannerNotice({
      type: 'info',
      title: 'Google Sign-In',
      message: 'Google Sign-In is not connected in this preview.',
    });
  }, []);

  // Create account handler
  const handleCreateAccount = useCallback(() => {
    if (onCreateAccount) { onCreateAccount(); return; }
    setBannerNotice({
      type: 'info',
      title: 'New Garden Invitation',
      message: 'Garden account registration will open together with player onboarding in the upcoming milestone.',
    });
  }, [onCreateAccount]);
  // The account's own sign-in feedback (wrong password, expired session, …).
  const [dismissedAuth, setDismissedAuth] = useState<string | null>(null);
  const authText = authError || authMessage || '';
  const notice = bannerNotice ?? (signingIn || !authText || authText === dismissedAuth ? null
    : { type: authError ? 'warning' as const : 'info' as const, title: authError ? 'Couldn’t open the garden' : 'PetalPal', message: authText });

  const isWide = windowWidth > 740;
  const handoffOpacity = entranceTrack(entrance.progress, 'handoffOpacity', entrance.reduced);

  return (
    <View style={[styles.outerContainer, isHandoffTransitioning && styles.outerContainerTransitioning]}>
      <Animated.View
        aria-hidden={entrance.phase !== 'idle'}
        pointerEvents={entrance.phase === 'idle' ? 'auto' : 'none'}
        accessibilityElementsHidden={entrance.phase !== 'idle'}
        importantForAccessibility={entrance.phase === 'idle' ? 'auto' : 'no-hide-descendants'}
        style={[
          StyleSheet.absoluteFill,
          isHandoffTransitioning && { opacity: handoffOpacity },
        ]}
      >
      {/* LAYER A: Scenic Botanical Garden Entrance Background */}
      <View style={styles.backgroundImage}>
        <LoginEntranceScene progress={entrance.progress} reduced={entrance.reduced} onReady={entrance.assetsReady} onError={entrance.assetError} />
        {/* Ambient atmospheric vignette for depth and focus */}


        {/* Delicate floating petals drift */}
        {entrance.phase === 'idle' && !entrance.reduced && <FloatingPetalsOverlay />}

        {/* Scrollable Container for Mobile Keyboard Handling */}
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: Math.max(insets.top + 56, 56),
                paddingHorizontal: Math.max(insets.left, insets.right),
                justifyContent: 'center',
                paddingBottom: insets.bottom + (__DEV__ && !live && !keyboardOpen ? 116 : 36),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >

            {/* In-World Notice Banner (Floating above card when active) */}
            {notice && (
              <View testID="login-notice" accessibilityLiveRegion="polite"
                style={[
                  styles.noticeBanner,
                  notice.type === 'success' && styles.noticeSuccess,
                  notice.type === 'warning' && styles.noticeWarning,
                  notice.type === 'info' && styles.noticeInfo,
                ]}
              >
                <View style={styles.noticeHeaderRow}>
                  <Text style={styles.noticeIcon}>
                    {notice.type === 'success' ? '🌱' : notice.type === 'warning' ? '🍃' : '💌'}
                  </Text>
                  <Text style={styles.noticeTitle}>{notice.title}</Text>
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss notice"
                    onPress={() => { setBannerNotice(null); setDismissedAuth(authText); }}
                    style={styles.noticeCloseBtn}
                  >
                    <Text style={styles.noticeCloseTxt}>✕</Text>
                  </Pressable>
                </View>
                <Text style={styles.noticeMessage}>{notice.message}</Text>
              </View>
            )}

            {/* LAYER B: Formal Botanical Invitation Card */}
            <Animated.View
              testID="login-envelope"
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                if (width > 0 && height > 0) {
                  setCardLayout({ width, height });
                }
              }}
              pointerEvents={entrance.active ? "none" : "auto"}
              style={[
                styles.envelopeCard,
                {
                  opacity: entranceTrack(entrance.progress, "envelopeOpacity"),
                  transform: [
                    { translateY: Animated.add(cardTranslateY, entranceTrack(entrance.progress, "envelopeY", entrance.reduced)) },
                    { scale: entranceTrack(entrance.progress, "envelopeScale", entrance.reduced) },
                    { perspective: 1100 },
                    { rotateX: "1.5deg" },
                  ],
                },
              ]}
            >
              {/* Clean material artwork replaces the contaminated cutout stack. */}
              <View style={[StyleSheet.absoluteFill, { zIndex: 4 }]} pointerEvents="none">
                <Image
                  testID="invitation-materials"
                  source={INVITATION_MATERIALS}
                  style={styles.invitationLayerImage}
                  resizeMode="contain"
                />
              </View>

              {/* APPROVED REAL FAIRY LOADING ANIMATION SYSTEM */}
              <FairyLoadingExperience
                isLoading={entrance.phase === 'idle'}
                isPaused={isFairyPaused}
                manualTimeMs={manualFairyTime}
                isReducedMotion={entrance.reduced}
                cardWidth={cardLayout.width}
                cardHeight={cardLayout.height}
                spaceLeft={Math.max(0, (windowWidth - cardLayout.width) / 2)}
                spaceRight={Math.max(0, (windowWidth - cardLayout.width) / 2)}
              />

              {/* LAYER C: Real Interactive Form UI */}
              <ScrollView
                testID="login-form-scroll"
                style={[styles.cardContent, isWide && styles.cardContentWide]}
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                indicatorStyle="black"
              >
                {/* Formal Invitation Header: Sprout Fleuron, PetalPal Title, Rosette Divider, Headline */}
                <View style={styles.invitationHeader}>
                  <TopBotanicalFleuron size={17} color="#9E804D" />
                  <Text style={styles.invitationBrandTitle}>PetalPal</Text>
                  <RosetteDivider color="#B89F70" />
                  <Text style={styles.welcomeTitle}>You’re always welcome here.</Text>
                  <SubtleLeafAccent color="#B89F70" />
                </View>

                {/* Email Address Field */}
                <View style={styles.inputGroup}>
                  <View
                    style={[
                      styles.inputPill,
                      !!emailError && styles.inputPillError,
                      focusedField === 'email' && styles.inputPillFocused,
                      isSubmitting && styles.inputPillDisabled,
                    ]}
                  >
                    <View style={styles.inputIconWrapper}>
                      <MailIcon
                        size={17}
                        color={focusedField === 'email' ? '#246B5F' : '#4C6963'}
                      />
                    </View>
                    <View style={styles.inputTextColumn}>
                    <Text nativeID="login-email-label" pointerEvents="none" style={styles.inputLabel}>Email address</Text>
                    <TextInput
                      accessibilityLabel="Email address"
                      aria-invalid={!!emailError}
                      aria-describedby={emailError ? 'login-email-error' : undefined}
                      style={styles.textInput}
                      value={email}
                      onChangeText={(txt) => {
                        setEmail(txt);
                        if (emailError) setEmailError(null);
                      }}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => {
                        setFocusedField(null);
                        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                          setEmailError('Please enter a valid email address');
                        }
                      }}
                      placeholder="you@example.com"
                      placeholderTextColor="#71685B"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="username"
                      autoComplete="username"
                      importantForAutofill="yes"
                      selectionColor="#246B5F"
                      returnKeyType="next"
                      submitBehavior="submit"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      editable={!isSubmitting}
                      tabIndex={isSubmitting ? -1 : 0}
                    />
                    </View>
                  </View>
                  {emailError && (
                    <Text testID="email-error" nativeID="login-email-error" accessibilityLiveRegion="polite" style={styles.fieldErrorText}>✦ {emailError}</Text>
                  )}
                </View>

                {/* Password Field */}
                <View style={styles.inputGroup}>
                  <View
                    style={[
                      styles.inputPill,
                      !!passwordError && styles.inputPillError,
                      focusedField === 'password' && styles.inputPillFocused,
                      isSubmitting && styles.inputPillDisabled,
                    ]}
                  >
                    <View style={styles.inputIconWrapper}>
                      <LockIcon
                        size={17}
                        color={focusedField === 'password' ? '#246B5F' : '#4C6963'}
                      />
                    </View>
                    <View style={styles.inputTextColumn}>
                    <Text nativeID="login-password-label" pointerEvents="none" style={styles.inputLabel}>Password</Text>
                    <TextInput
                      ref={passwordRef}
                      accessibilityLabel="Password"
                      aria-invalid={!!passwordError}
                      aria-describedby={passwordError ? 'login-password-error' : undefined}
                      style={[styles.textInput, styles.passwordInput]}
                      value={password}
                      onChangeText={(txt) => {
                        setPassword(txt);
                        if (passwordError) setPasswordError(null);
                      }}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Enter your password"
                      placeholderTextColor="#71685B"
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                      autoComplete="current-password"
                      importantForAutofill="yes"
                      selectionColor="#246B5F"
                      returnKeyType="done"
                      editable={!isSubmitting}
                      tabIndex={isSubmitting ? -1 : 0}
                      onSubmitEditing={() => void handleLoginSubmit()}
                    />
                    </View>
                    <Pressable
                      style={styles.eyeToggleBtn}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      testID="toggle-password-visibility"
                      disabled={isSubmitting}
                      accessibilityState={{ disabled: isSubmitting }}
                      onPress={() => setShowPassword((prev) => !prev)}
                    >
                      <EyeIcon
                        isVisible={showPassword}
                        size={17}
                        color={showPassword ? '#246B5F' : '#6A7D77'}
                      />
                    </Pressable>
                  </View>
                  {passwordError && (
                    <Text testID="password-error" nativeID="login-password-error" accessibilityLiveRegion="polite" style={styles.fieldErrorText}>✦ {passwordError}</Text>
                  )}
                </View>

                {/* Primary Action Button: Teal "Log In →" */}
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={() => void handleLoginSubmit()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    isSubmitting && styles.primaryButtonDisabled,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <View style={styles.buttonGradientLayer} pointerEvents="none" />
                  <View style={styles.buttonInnerContent}>
                    <View style={styles.buttonSparkleIconWrapper}>
                      <SparkleIcon size={13} color="#FAF7F0" />
                    </View>
                    <Text style={styles.buttonText}>{signingIn ? 'Opening…' : 'Log In'}</Text>
                    <Text style={styles.buttonArrow}>→</Text>
                  </View>
                </Pressable>

                {/* Social sign-in is not connected yet: DEV simulation only. */}
                {!live && <>
                {/* Divider Line with "or" */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerHairline} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerHairline} />
                </View>

                {/* Social Sign-In Buttons */}
                <View style={styles.socialButtonsRow}>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.socialButton,
                      pressed && styles.socialButtonPressed,
                    ]}
                    disabled={isSubmitting}
                    accessibilityLabel="Continue with Apple"
                    onPress={handleAppleSignIn}
                  >
                    <AppleIcon size={14} />
                    <Text style={styles.socialButtonText} numberOfLines={1}>
                      Apple
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.socialButton,
                      pressed && styles.socialButtonPressed,
                    ]}
                    disabled={isSubmitting}
                    accessibilityLabel="Continue with Google"
                    onPress={handleGoogleSignIn}
                  >
                    <GoogleIcon size={14} />
                    <Text style={styles.socialButtonText} numberOfLines={1}>
                      Google
                    </Text>
                  </Pressable>
                </View>
                </>}

                {/* Secondary Action: Create Account Footer */}
                <View style={styles.footerRow}>
                  {(!live || onForgotPassword) && <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    disabled={isSubmitting || sendingReset}
                    onPress={() => void handleForgotPassword()}
                    style={({ pressed }) => [
                      styles.linkPressable,
                      pressed && styles.linkPressed,
                    ]}
                  >
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </Pressable>}
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    disabled={isSubmitting}
                    onPress={handleCreateAccount}
                    style={({ pressed }) => [
                      styles.linkPressable,
                      pressed && styles.linkPressed,
                    ]}
                  >
                    <Text style={styles.createAccountText}>Create account</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Animated.View>
            {/* Terms, Privacy and support sit on their own paper strip below the card, clear of its artwork. */}
            {footer ? <View testID="login-footer" style={styles.footerLinks}>{footer}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
      </Animated.View>
      {__DEV__ && !live && !keyboardOpen && <View testID="entrance-dev-controls" style={{position:'absolute',bottom:Math.max(insets.bottom,8),left:10,right:10,zIndex:1000,alignItems:'center'}}>
        <View style={{backgroundColor:'#f8f4e9',borderRadius:12,padding:8,borderWidth:1,borderColor:'#c8cebc',maxWidth:640,width:'100%',gap:6}}>
          <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:12}}>
            <Pressable accessibilityRole="button" disabled={!entrance.ready || entrance.phase !== 'idle'} onPress={()=>{setBannerNotice(null);setShowDevControls(false);entrance.play();}} style={{opacity:entrance.ready && entrance.phase === 'idle' ? 1 : .5,paddingVertical:3}}><Text style={{color:'#245d55',fontSize:12}}>DEV · Preview Successful Login</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={()=>{entrance.reset();setBannerNotice(null);setEmailError(null);setPasswordError(null);setManualFairyTime(null);setIsFairyPaused(false);setShowDevControls(false);}} style={{paddingVertical:3}}><Text style={{color:'#245d55',fontSize:12}}>DEV · Reset Entrance</Text></Pressable>
          </View>
          <Text testID="entrance-phase" accessibilityLiveRegion="polite" style={{fontSize:11,color:'#6b665b',textAlign:'center'}}>{entrance.failedAsset ? 'Scenery failed to load. Reload to retry.' : !entrance.ready ? 'Preparing scenery…' : entrance.entered ? 'Entrance complete · preview only; no account or player state changed' : entrance.phase === 'idle' ? 'Simulation only · no authentication · ready to replay' : entrance.phase.replace(/_/g,' ')}</Text>
          {entrance.entered && <Link href="/player-preview" accessibilityRole="link" style={{fontSize:12,color:'#245d55',textAlign:'center',paddingVertical:4}}>DEV · Open Player Preview</Link>}
          {!entrance.active && <Pressable accessibilityRole="button" onPress={()=>setShowDevControls(v=>!v)}><Text style={{color:'#57756e',fontSize:10,textAlign:'center'}}>DEV · Inspect frames {showDevControls ? '−' : '+'}</Text></Pressable>}
          {showDevControls && <>
            <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:12}}>{ENTRANCE_STILLS.map(frame=><Pressable key={frame.ms} accessibilityRole="button" accessibilityLabel={'Inspect '+frame.label} onPress={()=>{setBannerNotice(null);entrance.seek(frame.ms);setShowDevControls(false);}}><Text style={{fontSize:11,color:'#57756e'}}>{frame.label}</Text></Pressable>)}</View>
            <Pressable accessibilityRole="button" onPress={()=>{entrance.reset();setBannerNotice({type:'warning',title:'Simulated authentication failure',message:'No account was checked. The entrance stays closed.'});setShowDevControls(false);}}><Text style={{color:'#7b5579',fontSize:11,textAlign:'center'}}>DEV · Simulate failure</Text></Pressable>
          </>}
        </View>
      </View>}
    </View>
  );
});

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#5AA4AB',
  },
  outerContainerTransitioning: {
    backgroundColor: 'transparent',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  vignetteOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(12, 22, 18, 0.12)',
    ...(Platform.OS === 'web' && {
      backgroundImage:
        'radial-gradient(ellipse 90% 85% at 50% 50%, rgba(0,0,0,0) 45%, rgba(12,24,20,0.32) 100%)',
    }),
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },

  // Widescreen Pillars Inscriptions
  pillarLabel: {
    position: 'absolute',
    top: '36%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    maxWidth: 160,
  },
  pillarLabelLeft: {
    left: '5%',
  },
  pillarLabelRight: {
    right: '5%',
  },
  pillarScriptText: {
    fontFamily: FONT_TITLE,
    fontStyle: 'italic',
    fontSize: 16,
    color: '#342D23',
    textAlign: 'center',
    lineHeight: 22,
    textShadowColor: 'rgba(255, 255, 255, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pillarOrnamentText: {
    fontSize: 14,
    color: '#655A4C',
    marginTop: 4,
    textAlign: 'center',
  },

  // Top Branding Section
  brandingHeader: {
    alignItems: 'center',
    marginBottom: 16,
    zIndex: 10,
  },
  crocusEmblem: {
    width: 68,
    height: 38,
    marginBottom: 4,
  },
  brandTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: 34,
    fontWeight: '600',
    color: '#1F4741',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  brandTagline: {
    fontFamily: FONT_TITLE,
    fontSize: 16,
    color: '#4C4454',
    letterSpacing: 0.4,
    marginTop: 3,
    marginBottom: 6,
    textShadowColor: 'rgba(255, 255, 255, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  brandDividerWrapper: {
    marginTop: 2,
  },

  // In-World Notice Banner
  noticeBanner: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: '#FAF5EA',
    borderWidth: 1,
    borderColor: '#D8CEBD',
    shadowColor: '#1A2922',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 20,
  },
  noticeSuccess: {
    backgroundColor: '#EEF7F2',
    borderColor: '#A8D2C2',
  },
  noticeWarning: {
    backgroundColor: '#FFF7EC',
    borderColor: '#F0D4AA',
  },
  noticeInfo: {
    backgroundColor: '#F3F6FA',
    borderColor: '#C3D4E8',
  },
  noticeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  noticeIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  noticeTitle: {
    flex: 1,
    fontFamily: FONT_TITLE,
    fontSize: 15,
    fontWeight: '600',
    color: '#273C34',
  },
  noticeCloseBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeCloseTxt: {
    fontSize: 13,
    color: '#7B7163',
  },
  noticeMessage: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: '#443D34',
    lineHeight: 18,
  },

  // LAYER B: Formal Botanical Invitation Card Assembly (Strictly matching Image 2)
  envelopeCard: {
    width: '100%',
    maxWidth: 440,
    aspectRatio: 608 / 792,
    position: 'relative',
  },
  invitationLayerImage: {
    // Register the complete RGBA object against the unchanged 608 x 792 card.
    // Transparent source margins stay visible; no material edge is cropped.
    position: 'absolute',
    left: '-4.8%',
    top: '-3.41%',
    width: '107.24%',
    height: '109.72%',
  },
  invitationCardBackground: {
    width: '100%',
    height: '100%',
  },

  // LAYER C: Form Content positioned safely within paper margins
  cardContent: {
    position: 'absolute',
    top: '18.5%',
    bottom: '9%',
    left: '10%',
    right: '12%',
    zIndex: 5,
    ...(Platform.OS === 'web' && {
      scrollbarWidth: 'thin',
      scrollbarColor: '#B8AC98 transparent',
    } as any),
  },
  cardContentWide: {
    top: '18%',
    bottom: '9%',
  },
  formContent: {
    paddingHorizontal: 3,
    paddingTop: 3,
    paddingBottom: 4,
  },
  invitationHeader: {
    alignItems: 'center',
    marginBottom: 5,
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
    ...(Platform.OS === 'web' && {
      textShadow: '0 1px 1px rgba(255, 255, 255, 0.75)',
    }),
  },
  welcomeSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  welcomeTitle: {
    fontFamily: FONT_TITLE,
    fontSize: 16,
    fontWeight: '500',
    color: '#342F2A',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  welcomeDivider: {
    marginTop: 3,
    width: '100%',
    alignItems: 'center',
  },

  // Input Fields
  inputGroup: {
    marginBottom: 8,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    backgroundColor: '#FFF9EF',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#B8AC98',
    paddingLeft: 11,
    paddingRight: 4,
    shadowColor: '#2B231A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    ...(Platform.OS === 'web' && {
      boxShadow: 'inset 0 1px 2px rgba(110, 95, 75, 0.08), 0 1px 0 rgba(255, 255, 255, 0.6)',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
    }),
  },
  inputPillFocused: {
    borderColor: '#367C7C',
    backgroundColor: '#FFFBEF',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 0 0 2px rgba(90, 164, 171, 0.24), inset 0 1px 2px rgba(110, 95, 75, 0.06)',
    }),
  },
  inputPillDisabled: {
    opacity: 0.65,
  },
  inputPillError: {
    borderColor: '#B85042',
    backgroundColor: '#FFF8F7',
  },
  inputIconWrapper: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  inputTextColumn: {
    flex: 1,
    minWidth: 0,
    height: 54,
  },
  inputLabel: {
    position: 'absolute',
    top: 5,
    left: 0,
    zIndex: 1,
    fontFamily: FONT_BODY,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: '#595347',
  },
  textInput: {
    flex: 1,
    fontFamily: FONT_BODY,
    fontSize: 16,
    height: 54,
    minHeight: 54,
    minWidth: 0,
    color: '#28221A',
    paddingTop: 17,
    paddingBottom: 2,
    paddingHorizontal: 0,
    outlineStyle: 'none' as any,
  },
  passwordInput: {
    paddingRight: 4,
  },
  eyeToggleBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldErrorText: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    lineHeight: 18,
    color: '#96392E',
    marginTop: 2,
    marginLeft: 12,
  },

  // Forgot Password Link
  forgotPasswordRow: {
    alignItems: 'flex-end',
    marginBottom: 2,
    marginTop: -6,
  },
  forgotPasswordText: {
    fontFamily: FONT_TITLE,
    fontStyle: 'italic',
    fontSize: 14,
    color: '#20564A',
    textDecorationLine: 'underline',
  },
  linkPressable: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  linkPressed: {
    opacity: 0.65,
  },

  // Primary Action Button: Deep Spruce Teal with Antique Gold Border
  primaryButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E5247',
    borderWidth: 1.2,
    borderColor: '#C4A86F',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#17473F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 5,
    ...(Platform.OS === 'web' && {
      boxShadow:
        '0 5px 14px -2px rgba(20, 50, 42, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
      cursor: 'pointer',
      transition: 'transform 0.15s ease, filter 0.15s ease',
    }),
  },
  buttonGradientLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#1E544A',
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(135deg, #245F54 0%, #184B40 100%)',
    }),
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  primaryButtonDisabled: {
    opacity: 0.75,
  },
  buttonInnerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  buttonSparkleIconWrapper: {
    marginRight: 2,
  },
  buttonText: {
    fontFamily: FONT_TITLE,
    fontSize: 15.5,
    fontWeight: '600',
    color: '#FAF7F0',
    letterSpacing: 0.4,
  },
  buttonArrow: {
    fontSize: 15.5,
    fontWeight: '400',
    color: '#FAF7F0',
    marginLeft: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Divider Line
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
  },
  dividerHairline: {
    flex: 1,
    height: 1,
    backgroundColor: '#DDD3C4',
    opacity: 0.85,
  },
  dividerText: {
    fontFamily: FONT_TITLE,
    fontStyle: 'italic',
    fontSize: 12,
    color: '#7C7264',
    marginHorizontal: 8,
  },

  // Social Sign-In Buttons
  socialButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    backgroundColor: '#F5F0E6',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DDD4C7',
    gap: 5,
    paddingHorizontal: 6,
    shadowColor: '#2B231A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease, border-color 0.15s ease',
    }),
  },
  socialButtonPressed: {
    backgroundColor: '#EFE8DC',
    transform: [{ scale: 0.985 }],
  },
  socialButtonText: {
    fontFamily: Platform.select({
      ios: 'System',
      android: 'Roboto',
      default: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    }),
    fontSize: 13,
    fontWeight: '500',
    color: '#342E24',
    letterSpacing: -0.1,
  },

  // Footer: Create Account
  footerLinks: {
    width: '100%',
    maxWidth: 440,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(250, 246, 236, 0.94)',
  },
  footerRow: {
    gap: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  footerPrompt: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    color: '#5A5348',
  },
  createAccountText: {
    fontFamily: FONT_TITLE,
    fontSize: 14,
    color: '#235D53',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },

  // Native Divider Fallback
  nativeDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 148,
  },
  nativeDividerLine: {
    flex: 1,
    height: 1,
    opacity: 0.45,
  },
});
