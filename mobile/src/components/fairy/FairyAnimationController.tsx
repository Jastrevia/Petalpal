import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type FairyAnimationState = 'idle' | 'greet' | 'celebrate' | 'fly';

// Canonical asset mapping for both WebP and WebM formats
export const FAIRY_ANIMATION_ASSETS = {
  idle: {
    webp: require('@/assets/garden/fairy/onboarding-suite/fairy-idle.webp'),
    webm: require('@/assets/garden/fairy/onboarding-suite/fairy-idle.webm'),
    durationMs: 2500, // 2.50s seamless living hover loop
    loops: true,
  },
  greet: {
    webp: require('@/assets/garden/fairy/onboarding-suite/fairy-greet.webp'),
    webm: require('@/assets/garden/fairy/onboarding-suite/fairy-greet.webm'),
    durationMs: 5040, // 121 frames @ 24fps = 5.04s
    loops: false,
  },
  celebrate: {
    webp: require('@/assets/garden/fairy/onboarding-suite/fairy-celebrate.webp'),
    webm: require('@/assets/garden/fairy/onboarding-suite/fairy-celebrate.webm'),
    durationMs: 5040, // 121 frames @ 24fps = 5.04s
    loops: false,
  },
  fly: {
    webp: require('@/assets/garden/fairy/onboarding-suite/fairy-fly.webp'),
    webm: require('@/assets/garden/fairy/onboarding-suite/fairy-fly.webm'),
    durationMs: 5040, // 121 frames @ 24fps = 5.04s
    loops: false,
  },
} as const;

// Visual dimensions & normalization constants from 1112x834 master canvas
export const FAIRY_CANVAS_ASPECT = 1112 / 834; // 1.3333 (4:3)
export const FAIRY_CHARACTER_CANVAS_RATIO = 636 / 834; // 0.7626 (character Y: 96..732 = 636px)

export interface FairyAnimationControllerProps {
  /** Desired animation state. Actions (greet, celebrate, fly) play once then return to idle unless loop is true. */
  state?: FairyAnimationState;
  /** Visual height of the fairy character in pixels (e.g. 340). */
  characterHeight: number;
  /** Optional callback fired when a one-shot action animation completes its cycle. */
  onAnimationComplete?: (completedState: FairyAnimationState) => void;
  /** Outer container style. */
  style?: StyleProp<ViewStyle>;
  /** Force looping behavior for the current state. */
  loop?: boolean;
}

/**
 * Reusable Fairy Animation Controller
 * 
 * Manages four animation states ('idle', 'greet', 'celebrate', 'fly') with:
 * - 1:1 normalized visual centering and scale across all assets
 * - True alpha transparency without background fringe or opaque boxes
 * - Seamless zero-flash state transitions with pre-warmed assets
 * - Automatic transition from one-shot actions back to idle
 * - Guaranteed non-cropping with overflow: visible and exact coordinate bounding
 */
export function FairyAnimationController({
  state = 'idle',
  characterHeight,
  onAnimationComplete,
  style,
  loop,
}: FairyAnimationControllerProps) {
  const [activeState, setActiveState] = useState<FairyAnimationState>(state);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync internal state when parent requests a new state
  useEffect(() => {
    setActiveState(state);
  }, [state]);

  // Handle one-shot action timeouts (greet, celebrate, fly)
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const config = FAIRY_ANIMATION_ASSETS[activeState];
    const shouldLoop = loop ?? config.loops;

    if (!shouldLoop) {
      timerRef.current = setTimeout(() => {
        if (onAnimationComplete) {
          onAnimationComplete(activeState);
        }
        // Return to idle automatically
        setActiveState('idle');
      }, config.durationMs);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeState, loop, onAnimationComplete]);

  // Sizing: Canvas preserves exact 1112:834 aspect ratio so character is never stretched
  const canvasHeight = characterHeight / FAIRY_CHARACTER_CANVAS_RATIO;
  const canvasWidth = canvasHeight * FAIRY_CANVAS_ASPECT;

  const states: FairyAnimationState[] = ['idle', 'greet', 'celebrate', 'fly'];

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        { width: canvasWidth, height: canvasHeight },
        style,
      ]}
    >
      {states.map((st) => {
        const isCurrent = st === activeState;

        return (
          <View
            key={st}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.layer,
              { opacity: isCurrent ? 1 : 0 },
            ]}
          >
            {Platform.OS === 'web' ? (
              <WebAnimationLayer
                state={st}
                active={isCurrent}
                loop={loop ?? FAIRY_ANIMATION_ASSETS[st].loops}
              />
            ) : (
              <Image
                source={FAIRY_ANIMATION_ASSETS[st].webp}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
                accessible={false}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Web-optimized layer: native <img> with gentle hover for Idle, hardware <video> with fallback for actions */
function WebAnimationLayer({
  state,
  active,
  loop,
}: {
  state: FairyAnimationState;
  active: boolean;
  loop: boolean;
}) {
  const asset = FAIRY_ANIMATION_ASSETS[state];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  // Inject gentle floating hover keyframes once on web
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('petalpal-fairy-hover-style')) {
      const style = document.createElement('style');
      style.id = 'petalpal-fairy-hover-style';
      style.textContent = `
        @keyframes petalpal-fairy-float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
          100% { transform: translateY(0px); }
        }
        .petalpal-fairy-hover-anim {
          animation: petalpal-fairy-float 2.6s ease-in-out infinite;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const webpUri = typeof asset.webp === 'string' ? asset.webp : asset.webp?.uri || asset.webp;
  const webmUri = typeof asset.webm === 'string' ? asset.webm : asset.webm?.uri || asset.webm;

  useEffect(() => {
    if (state === 'idle') return; // Idle uses <img> tag, no video play required

    if (active && videoRef.current && !useFallback) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.currentTime = 0;
      const playPromise = videoRef.current.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          setUseFallback(true);
        });
      }
    } else if (!active && videoRef.current) {
      videoRef.current.pause();
    }
  }, [active, useFallback, state]);

  // For idle state, native <img> provides 100% reliable continuous playback
  // without browser hardware video decoder limits or autoplay policy interference
  if (state === 'idle' || useFallback) {
    return (
      // @ts-ignore - native img element on web
      <img
        src={webpUri}
        alt=""
        className={state === 'idle' ? 'petalpal-fairy-hover-anim' : undefined}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          backgroundColor: 'transparent',
          display: 'block',
          pointerEvents: 'none',
          opacity: active ? 1 : 0,
          visibility: active ? 'visible' : 'hidden',
          transition: 'opacity 140ms ease-out',
        }}
      />
    );
  }

  return (
    // @ts-ignore - native video element on web
    <video
      ref={videoRef}
      src={webmUri}
      preload="auto"
      playsInline
      loop={loop}
      muted
      onError={() => setUseFallback(true)}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: 'transparent',
        display: 'block',
        pointerEvents: 'none',
        opacity: active ? 1 : 0,
        visibility: active ? 'visible' : 'hidden',
        transition: 'opacity 140ms ease-out',
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  layer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});
