import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import {
  ACTION_DURATION_MS,
  CYCLE_DURATION_MS,
  FairyActionId,
  FairyLoadingFrame,
  getActionHoldTime,
  getFairyLoadingFrame,
  getCanonicalHeadHeight,
  getPoseScale,
  POSE_METADATA,
  ANCHOR_PEEKING,
  ANCHOR_SITTING,
  ANCHOR_TAPPING,
  TAP_CONTACT_POINT,
} from './fairyLoadingTimeline';

const POSE01_LAYER_CACHE_VERSION = 'pose01_clean_v9';

function withWebAssetVersion(asset: any, version: string) {
  if (Platform.OS !== 'web' || !asset) return asset;
  if (typeof asset === 'string') {
    const sep = asset.includes('?') ? '&' : '?';
    return `${asset}${sep}v=${version}`;
  }
  if (typeof asset === 'object' && typeof asset.uri === 'string') {
    const sep = asset.uri.includes('?') ? '&' : '?';
    return { ...asset, uri: `${asset.uri}${sep}v=${version}` };
  }
  return asset;
}

const FAIRY_SPRITE_01 = require('../../../assets/auth/fairy-loading/fairy_pose01_peeking.png');
const FAIRY_SPRITE_01_BODY = withWebAssetVersion(
  require('../../../assets/auth/fairy-loading/fairy_pose01_body.png'),
  POSE01_LAYER_CACHE_VERSION
);
const FAIRY_SPRITE_01_HEAD = withWebAssetVersion(
  require('../../../assets/auth/fairy-loading/fairy_pose01_head.png'),
  POSE01_LAYER_CACHE_VERSION
);
const FAIRY_SPRITE_01_HEAD_BLINK = withWebAssetVersion(
  require('../../../assets/auth/fairy-loading/fairy_pose01_head_blink.png'),
  POSE01_LAYER_CACHE_VERSION
);
const FAIRY_SPRITE_02 = require('../../../assets/auth/fairy-loading/fairy_pose02_sitting.png');
const FAIRY_SPRITE_03 = require('../../../assets/auth/fairy-loading/fairy_pose03_tapping.png');

export interface FairyLoadingProps {
  isLoading?: boolean;
  onComplete?: () => void;
  // Dev / Preview lab controls
  isPaused?: boolean;
  manualTimeMs?: number | null;
  forceAction?: 0 | 1 | 2 | null;
  loop?: boolean;
  isReducedMotion?: boolean;
  onFrameUpdate?: (frame: FairyLoadingFrame) => void;
  cardWidth?: number;
  cardHeight?: number;
  /** Room on screen beside the card, left and right (px). Phones have almost none. */
  spaceLeft?: number;
  spaceRight?: number;
  debugMode?: boolean;
}

/**
 * 4-Point Golden Star Sparkle Component
 * Emitted at the exact fingertip contact point during Action 03 (Flying & Tapping)
 */
function ContactSparkle({
  scale,
  opacity,
  x,
  y,
}: {
  scale: number;
  opacity: number;
  x: number;
  y: number;
}) {
  if (opacity <= 0.01 || scale <= 0.01) return null;

  const size = 32 * scale;

  if (Platform.OS === 'web') {
    return (
      <div
        style={
          {
            position: 'absolute',
            left: x,
            top: y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 40,
            opacity,
            transition: 'opacity 0.06s ease-out',
          } as any
        }
      >
        <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
          <defs>
            <radialGradient id="goldGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF7D6" stopOpacity="1" />
              <stop offset="40%" stopColor="#FFDE6A" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#E2A63B" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Outer soft radiant aura */}
          <circle cx="18" cy="18" r="16" fill="url(#goldGlow)" opacity="0.75" />
          {/* Central 4-point brilliant star */}
          <path
            d="M18 2 C18 11 11 18 2 18 C11 18 18 25 18 34 C18 25 25 18 34 18 C25 18 18 11 18 2 Z"
            fill="#FFFBE8"
          />
          {/* Inner bright core */}
          <circle cx="18" cy="18" r="2.8" fill="#FFFFFF" />
          {/* Subtle diagonal micro-sparks */}
          <path d="M10 10 L26 26 M26 10 L10 26" stroke="#FFE79A" strokeWidth="1.2" opacity="0.7" />
        </svg>
      </div>
    );
  }

  // Native fallback
  return (
    <View
      pointerEvents="none"
      style={[
        styles.sparkleNative,
        {
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      <View style={[styles.sparkleCore, { width: size * 0.4, height: size * 0.4 }]} />
    </View>
  );
}

export const FairyLoadingExperience = memo(function FairyLoadingExperience({
  isLoading = true,
  onComplete,
  isPaused = false,
  manualTimeMs = null,
  forceAction = null,
  loop = true,
  isReducedMotion = false,
  onFrameUpdate,
  cardWidth = 420,
  cardHeight = 546,
  spaceLeft = Infinity,
  spaceRight = Infinity,
  debugMode = false,
}: FairyLoadingProps) {
  // Clock state
  const [elapsedMs, setElapsedMs] = useState(manualTimeMs ?? 0);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const exitingRef = useRef(false);
  const exitAnim = useRef(new Animated.Value(isLoading ? 1 : 0)).current;

  // Sync manualTimeMs when provided by test controls
  useEffect(() => {
    if (manualTimeMs !== null && manualTimeMs !== undefined) {
      setElapsedMs(manualTimeMs);
    }
  }, [manualTimeMs]);

  // Sync forceAction
  useEffect(() => {
    if (forceAction !== null && forceAction !== undefined) {
      // Jump to hold position of that action
      const targetTime = getActionHoldTime(forceAction);
      setElapsedMs(targetTime);
    }
  }, [forceAction]);

  // Animation clock loop (runs continuously while idle; pauses immediately on exit)
  useEffect(() => {
    if (manualTimeMs !== null && manualTimeMs !== undefined) return;
    if (isPaused || !isLoading) {
      lastTimeRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
      }
      const dt = Math.min(64, now - lastTimeRef.current);
      lastTimeRef.current = now;

      setElapsedMs((prev) => {
        let next = prev + dt;
        if (!loop && next >= CYCLE_DURATION_MS) {
          next = CYCLE_DURATION_MS - 1;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      lastTimeRef.current = null;
    };
  }, [isPaused, manualTimeMs, loop, isLoading]);

  // Graceful loading completion exit & reset handling
  useEffect(() => {
    if (!isLoading) {
      if (!exitingRef.current) {
        exitingRef.current = true;
        Animated.timing(exitAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }).start(({ finished }) => {
          if (finished) {
            onComplete?.();
          }
        });
      }
    } else {
      exitingRef.current = false;
      exitAnim.setValue(1);
      if (manualTimeMs === null || manualTimeMs === undefined) {
        setElapsedMs(0);
      }
      lastTimeRef.current = null;
    }
  }, [isLoading, onComplete, exitAnim, manualTimeMs]);

  // Compute current frame
  const frame = getFairyLoadingFrame(elapsedMs, isReducedMotion);

  // Forward frame update to parent observer if requested
  useEffect(() => {
    onFrameUpdate?.(frame);
  }, [frame, onFrameUpdate]);

  // Canonical Head Height: calculated directly from invitation card height
  // A canonical standing fairy (4.73 heads tall) is ~21.8% of card height (guideline: 18-25%).
  const canonicalHeadHeight = getCanonicalHeadHeight(cardHeight);

  // Scale factors derived strictly from anatomical head height (One Fairy, One Body Size)
  const scaleP1 = canonicalHeadHeight / POSE_METADATA.peeking.headHeightPx;
  const scaleP2 = canonicalHeadHeight / POSE_METADATA.sitting.headHeightPx;
  const scaleP3 = canonicalHeadHeight / POSE_METADATA.tapping.headHeightPx;

  // Rendered dimensions and local contact anchors
  const p1W = Math.round(POSE_METADATA.peeking.spriteWidth * scaleP1);
  const p1H = Math.round(POSE_METADATA.peeking.spriteHeight * scaleP1);
  const p1ClipH = Math.round((POSE_METADATA.peeking.clipBottomY ?? POSE_METADATA.peeking.spriteHeight) * scaleP1);
  const p1Ax = Math.round(POSE_METADATA.peeking.anchorX * scaleP1);
  const p1Ay = Math.round(POSE_METADATA.peeking.anchorY * scaleP1);

  const p2W = Math.round(POSE_METADATA.sitting.spriteWidth * scaleP2);
  const p2H = Math.round(POSE_METADATA.sitting.spriteHeight * scaleP2);
  const p2Ax = Math.round(POSE_METADATA.sitting.anchorX * scaleP2);
  const p2Ay = Math.round(POSE_METADATA.sitting.anchorY * scaleP2);

  const p3W = Math.round(POSE_METADATA.tapping.spriteWidth * scaleP3);
  const p3H = Math.round(POSE_METADATA.tapping.spriteHeight * scaleP3);
  const p3Ax = Math.round(POSE_METADATA.tapping.anchorX * scaleP3);
  const p3Ay = Math.round(POSE_METADATA.tapping.anchorY * scaleP3);

  // Current fairy center coordinates in card pixels
  const fairyCenterX = frame.x * cardWidth;
  const fairyCenterY = frame.y * cardHeight;

  // Contact sparkle absolute position
  const sparkleAbsoluteX = frame.sparkleX * cardWidth;
  const sparkleAbsoluteY = frame.sparkleY * cardHeight;

  // Anatomical Body / Head Centers for zero-jump spatial continuity during transitions
  const p1Bx = Math.round(778 * scaleP1);
  const p1By = Math.round(510 * scaleP1);
  const p2Bx = Math.round(280 * scaleP2);
  const p2By = Math.round(208 * scaleP2);
  const p3Bx = Math.round(376 * scaleP3);
  const p3By = Math.round(186 * scaleP3);

  // Relative body center offsets in container during native resting hold
  const bRelHold = [
    { x: -p1Ax + p1Bx, y: -p1Ay + p1By },
    { x: -p2Ax + p2Bx, y: -p2Ay + p2By },
    { x: -p3Ax + p3Bx, y: -p3Ay + p3By },
  ];

  // Dynamic sprite offsets and opacities
  let p1Left = -p1Ax;
  let p1Top = -p1Ay;
  let p2Left = -p2Ax;
  let p2Top = -p2Ay;
  let p3Left = -p3Ax;
  let p3Top = -p3Ay;
  let op0 = 0;
  let op1 = 0;
  let op2 = 0;

  if (!frame.isTransitioning) {
    if (frame.actionIndex === 0) op0 = 1;
    else if (frame.actionIndex === 1) op1 = 1;
    else op2 = 1;
  } else {
    // Continuous, graceful equal-power crossfade during flight transition
    const fromIdx = frame.currentPoseIndex;
    const toIdx = frame.nextPoseIndex;
    const mix = frame.poseMix;

    // Continuous relative body center in the actor container
    const bRelCurrent = {
      x: (1 - mix) * bRelHold[fromIdx].x + mix * bRelHold[toIdx].x,
      y: (1 - mix) * bRelHold[fromIdx].y + mix * bRelHold[toIdx].y,
    };

    // Dynamic offsets guaranteeing zero spatial jump between silhouettes
    p1Left = Math.round(bRelCurrent.x - p1Bx);
    p1Top = Math.round(bRelCurrent.y - p1By);
    p2Left = Math.round(bRelCurrent.x - p2Bx);
    p2Top = Math.round(bRelCurrent.y - p2By);
    p3Left = Math.round(bRelCurrent.x - p3Bx);
    p3Top = Math.round(bRelCurrent.y - p3By);

    // Smooth equal-power cosine-squared blending (sum is strictly 1.0 at all times)
    const fromOp = Math.cos(mix * (Math.PI / 2)) ** 2;
    const toOp = Math.sin(mix * (Math.PI / 2)) ** 2;

    if (fromIdx === 0) op0 = fromOp;
    else if (fromIdx === 1) op1 = fromOp;
    else op2 = fromOp;

    if (toIdx === 0) op0 = toOp;
    else if (toIdx === 1) op1 = toOp;
    else op2 = toOp;
  }

  // Tapping reach translation (in Pose 03)
  const tapOffset = frame.isTapping ? -frame.tapReach * 8 : 0;

  // Narrow screens (phones): the card fills the width, so the poses anchored at or beyond its
  // edges (sitting at the upper left, tapping at the lower right) fell off screen. Slide her
  // sideways just enough to keep every visible pose whole; her size never changes.
  const visibleBoxes = ([[p1Left, p1W, op0], [p2Left, p2W, op1], [p3Left, p3W, op2]] as const).filter(([, , op]) => op > 0.01);
  let shiftX = 0;
  if (visibleBoxes.length) {
    const baseX = fairyCenterX + tapOffset;
    const lo = -spaceLeft + 4, hi = cardWidth + spaceRight - 4;
    const left = baseX + Math.min(...visibleBoxes.map(([l]) => l));
    const right = baseX + Math.max(...visibleBoxes.map(([l, w]) => l + w));
    if (right > hi) shiftX = hi - right;
    if (left + shiftX < lo) shiftX = lo - left;
  }

  // Subtle wing flutter scale
  const wingScale = 1 + frame.wingFlutter * 0.08;

  // Subtle breathing displacement
  const breathePixels = frame.breatheY * cardHeight;

  // Physical depth layering: fairy is behind card paper (zIndex: 2) during peekaboo and early emergence,
  // and in front of card paper (zIndex: 6) when airborne and during sitting/tapping.
  const currentZIndex = frame.isBehindCard ? 2 : 6;

  return (
    <Animated.View
      testID="fairy-loading-root"
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: currentZIndex,
          opacity: exitAnim,
        },
      ]}
    >
      {/* Tap Contact Sparkle */}
      <ContactSparkle
        scale={frame.sparkleScale}
        opacity={frame.sparkleOpacity}
        x={sparkleAbsoluteX + shiftX}
        y={sparkleAbsoluteY}
      />

      {/* Fairy Actor Transform Node */}
      <View
        testID="fairy-actor-container"
        style={[
          styles.fairyActorContainer,
          {
            left: fairyCenterX + tapOffset + shiftX,
            top: fairyCenterY + breathePixels,
            transform: [
              { rotate: `${frame.rotationDeg}deg` },
              { scaleX: wingScale },
            ],
          },
        ]}
      >
        {/* Pose 01: Cute Fairy Resting on Invitation (Upper-Right) */}
        <View
          testID="fairy-pose-01-container"
          pointerEvents="none"
          style={[
            styles.spriteWrapper,
            {
              width: p1W,
              height: p1H,
              left: p1Left,
              top: p1Top,
              opacity: op0,
              visibility: op0 > 0.001 ? 'visible' : 'hidden',
            } as any,
          ]}
        >
          {/* Subtle soft contact shadow under resting elbows on invitation paper edge */}
          <View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: p1W * 0.63,
                bottom: -1,
                width: p1W * 0.24,
                height: 5,
                backgroundColor: 'rgba(60, 40, 30, 0.20)',
                borderRadius: 6,
                opacity:
                  (frame.isTransitioning && frame.actionIndex === 0
                    ? Math.max(0, 1 - frame.transitionProgress / 0.22) * op0
                    : op0) * 0.8,
              },
              Platform.OS === 'web'
                ? ({ filter: 'blur(2.5px)', boxShadow: '0 2px 4px rgba(60, 40, 30, 0.25)' } as any)
                : {},
            ]}
          />
          {/* Layer 1 (Base): Stationary body with complete wings, dress, legs, resting forearms/elbows on paper, and chest */}
          <Image
            testID="fairy-pose-01-image"
            source={FAIRY_SPRITE_01_BODY}
            style={{ width: p1W, height: p1H }}
            resizeMode="stretch"
          />
          {/* Layer 2 (Middle): Rotating Head & Cupped Hands Unit with open/closed eyes */}
          <View
            testID="fairy-pose-01-head-container"
            style={[
              StyleSheet.absoluteFill,
              {
                transformOrigin: `${(778 / 1040) * 100}% ${(510 / 783) * 100}%`,
                transform: [{ rotate: `${frame.headTiltDeg}deg` }],
              } as any,
            ]}
          >
            {/* Head layer: hair bun, crocus flower, ear, face with open eyes, and synchronized cupped hands */}
            <Image
              testID="fairy-pose-01-head-image"
              source={FAIRY_SPRITE_01_HEAD}
              style={[
                StyleSheet.absoluteFill,
                { width: p1W, height: p1H, opacity: 1 },
              ]}
              resizeMode="stretch"
            />
            {/* Sweet smiling closed-eye blink overlay (⌒ ⌒) — permanently mounted with GPU-composited opacity */}
            <Image
              testID="fairy-pose-01-head-blink-image"
              source={FAIRY_SPRITE_01_HEAD_BLINK}
              style={[
                StyleSheet.absoluteFill,
                { width: p1W, height: p1H, opacity: frame.blink },
              ]}
              resizeMode="stretch"
            />
          </View>
        </View>

        {/* Pose 02: Sitting & Looking Down (Upper-Left) */}
        <View
          testID="fairy-pose-02-container"
          pointerEvents="none"
          style={[
            styles.spriteWrapper,
            {
              width: p2W,
              height: p2H,
              left: p2Left,
              top: p2Top,
              opacity: op1,
              visibility: op1 > 0.001 ? 'visible' : 'hidden',
            } as any,
          ]}
        >
          <Image
            testID="fairy-pose-02-image"
            source={FAIRY_SPRITE_02}
            style={{ width: p2W, height: p2H }}
            resizeMode="stretch"
          />
        </View>

        {/* Pose 03: Flying & Tapping (Lower-Right) */}
        <View
          testID="fairy-pose-03-container"
          pointerEvents="none"
          style={[
            styles.spriteWrapper,
            {
              width: p3W,
              height: p3H,
              left: p3Left,
              top: p3Top,
              opacity: op2,
              visibility: op2 > 0.001 ? 'visible' : 'hidden',
            } as any,
          ]}
        >
          <Image
            testID="fairy-pose-03-image"
            source={FAIRY_SPRITE_03}
            style={{ width: p3W, height: p3H }}
            resizeMode="stretch"
          />
        </View>
      </View>

      {/* Debug Anchor Markers (only visible when debugMode=true) */}
      {debugMode && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.debugDot,
              {
                left: ANCHOR_PEEKING.x * cardWidth - 4,
                top: ANCHOR_PEEKING.y * cardHeight - 4,
                backgroundColor: '#FF2DAA',
              },
            ]}
          />
          <View
            style={[
              styles.debugDot,
              {
                left: ANCHOR_SITTING.x * cardWidth - 4,
                top: ANCHOR_SITTING.y * cardHeight - 4,
                backgroundColor: '#3AA5FF',
              },
            ]}
          />
          <View
            style={[
              styles.debugDot,
              {
                left: ANCHOR_TAPPING.x * cardWidth - 4,
                top: ANCHOR_TAPPING.y * cardHeight - 4,
                backgroundColor: '#30E57B',
              },
            ]}
          />
          <View
            style={[
              styles.debugDot,
              {
                left: TAP_CONTACT_POINT.x * cardWidth - 4,
                top: TAP_CONTACT_POINT.y * cardHeight - 4,
                backgroundColor: '#FFD700',
              },
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  fairyActorContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spriteWrapper: {
    position: 'absolute',
  },
  spriteImage: {
    width: '100%',
    height: '100%',
  },
  blinkOverlay: {
    position: 'absolute',
    backgroundColor: '#7A6284',
    borderRadius: 3,
  },
  sparkleNative: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  sparkleCore: {
    backgroundColor: '#FFE682',
    borderRadius: 8,
    shadowColor: '#FFD700',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 8,
  },
  debugDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    zIndex: 100,
  },
});
