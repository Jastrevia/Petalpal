import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

export type LoginAnimal = 'pigeon' | 'squirrel';

export interface LoginAnimalProps {
  animal?: LoginAnimal;
  character?: LoginAnimal | 'fairy' | 'random';
  isLoading?: boolean;
  onComplete?: () => void;
  isPaused?: boolean;
  manualTimeMs?: number | null;
  forceAction?: 0 | 1 | 2 | null;
  loop?: boolean;
  isReducedMotion?: boolean;
  cardWidth?: number;
  cardHeight?: number;
  spaceLeft?: number;
  spaceRight?: number;
  debugMode?: boolean;
}

// Assets from existing PetalPal spirit collection
const PIGEON_SHEET = require('../../../assets/garden/spirits/letterwing.webp');
const SQUIRREL_IDLE_SHEET = require('../../../assets/bookhouse/scrollkeeper-idle.webp');
const SQUIRREL_FOLD_SHEET = require('../../../assets/bookhouse/scrollkeeper-fold.webp');

// Helper to resolve asset URL across web bundlers & native
function getAssetUri(asset: any): string {
  if (!asset) return '';
  if (typeof asset === 'string') return asset;
  if (typeof asset === 'number') {
    const resolved = Image.resolveAssetSource(asset);
    if (resolved?.uri) return resolved.uri;
  }
  if (typeof asset === 'object') {
    if (asset.uri) return asset.uri;
    if (asset.default) return typeof asset.default === 'string' ? asset.default : asset.default.uri || '';
  }
  return '';
}

// Pigeon sprite layout: 2420x2100 px, 11 columns, 14 rows, cell: 220x150
const PIGEON_CELL = { w: 220, h: 150, cols: 11, rows: 14 };
const PIGEON_FLY_COUNT = 62;
const PIGEON_FOLD_START = 88;
const PIGEON_FOLD_COUNT = 62;
const PIGEON_CYCLE_MS = 15000;

// Squirrel sprite layout: cell: 164x150, ground baseline: 142
const SQUIRREL_CELL = { w: 164, h: 150, ground: 142 };
const SQUIRREL_IDLE = { cols: 10, rows: 6, count: 58 };
const SQUIRREL_FOLD = { cols: 10, rows: 7, count: 62 };
const SQUIRREL_CYCLE_MS = 15000;

/**
 * Computes Pigeon animation frame, spatial coordinates, rotation, and facing direction
 * across its 3-action sequence:
 * Action 1 (0-6000ms): Flying gracefully around upper card area with continuous wing flaps
 * Action 2 (6000-11000ms): Transforming into a delicate paper letter, floating gently in the breeze
 * Action 3 (11000-15000ms): Transforming back into the pigeon, resuming flight and looping seamlessly
 */
export function getPigeonState(timeMs: number, cardW: number, cardH: number, isReduced: boolean) {
  const t = ((timeMs % PIGEON_CYCLE_MS) + PIGEON_CYCLE_MS) % PIGEON_CYCLE_MS;

  if (isReduced) {
    return {
      action: 1 as const,
      frame: 0,
      x: cardW * 0.50,
      y: cardH * 0.07,
      rotationDeg: 0,
      facing: 1,
    };
  }

  // Action 1 — Flying (0 - 6000ms)
  if (t < 6000) {
    const u = t / 6000;
    // Graceful swooping path above the invitation header
    const x = cardW * (0.50 + 0.26 * Math.sin(u * 2 * Math.PI + 0.3));
    const y = cardH * (0.07 + 0.035 * Math.sin(u * 4 * Math.PI));
    const vx = Math.cos(u * 2 * Math.PI + 0.3);
    const facing = vx >= 0 ? 1 : -1;
    const rotationDeg = -10 * vx * facing;
    // Continuous natural wing flap at ~14 fps
    const flyProgress = (t / 1000) * 14;
    const frame = Math.floor(flyProgress) % PIGEON_FLY_COUNT;

    return { action: 1 as const, frame, x, y, rotationDeg, facing };
  }

  // Action 2 — Transform into a letter (6000 - 11000ms)
  if (t < 11000) {
    if (t < 8200) {
      // 2A: Active transformation: bird opens out and folds into sealed paper letter
      const p = (t - 6000) / 2200;
      const k = p * p * (3 - 2 * p); // smooth cubic ease
      const x = cardW * ((1 - k) * 0.58 + k * 0.50);
      const y = cardH * ((1 - k) * 0.07 + k * 0.05);
      const rotationDeg = (1 - k) * -2;
      const foldIndex = Math.min(PIGEON_FOLD_COUNT - 1, Math.floor(k * PIGEON_FOLD_COUNT));
      const frame = PIGEON_FOLD_START + foldIndex;

      return { action: 2 as const, frame, x, y, rotationDeg, facing: 1 };
    }

    // 2B: Letter floating gently in the breeze (8200 - 11000ms)
    const dt = (t - 8200) / 1000;
    const driftX = 12 * Math.sin(dt * 1.8);
    const driftY = 5 * Math.cos(dt * 2.2);
    const rotationDeg = 4 * Math.sin(dt * 2.0);
    const x = cardW * 0.50 + driftX;
    const y = cardH * 0.05 + driftY;
    const frame = PIGEON_FOLD_START + PIGEON_FOLD_COUNT - 1; // 149: sealed letter

    return { action: 2 as const, frame, x, y, rotationDeg, facing: 1 };
  }

  // Action 3 — Transform back into the pigeon (11000 - 15000ms)
  if (t < 13200) {
    // 3A: Paper letter unfolds back into pigeon
    const p = (t - 11000) / 2200;
    const k = p * p * (3 - 2 * p);
    const foldIndex = Math.min(PIGEON_FOLD_COUNT - 1, Math.floor((1 - k) * PIGEON_FOLD_COUNT));
    const frame = PIGEON_FOLD_START + foldIndex;
    const x = cardW * 0.50;
    const y = cardH * (0.05 + 0.01 * k);
    const rotationDeg = 2 * Math.sin(k * Math.PI);

    return { action: 3 as const, frame, x, y, rotationDeg, facing: 1 };
  }

  // 3B: Resumes flying and glides seamlessly back to Action 1 initial state (13200 - 15000ms)
  const p = (t - 13200) / 1800;
  const k = p * p * (3 - 2 * p);
  const flyProgress = (p * 1.8) * 14;
  const frame = Math.floor(flyProgress) % PIGEON_FLY_COUNT;
  const targetX = cardW * (0.50 + 0.26 * Math.sin(0.3));
  const targetY = cardH * 0.07;
  const x = (1 - k) * (cardW * 0.50) + k * targetX;
  const y = (1 - k) * (cardH * 0.06) + k * targetY;
  const rotationDeg = (1 - k) * 0 + k * (-10 * Math.cos(0.3));

  return { action: 3 as const, frame, x, y, rotationDeg, facing: 1 };
}

/**
 * Computes Squirrel animation frame, spatial coordinates, rotation, and facing direction
 * across its 3-action sequence:
 * Action 1 (0-5500ms): Resting playfully on top edge of invitation card with idle breathing & blinking
 * Action 2 (5500-10000ms): Transforming into a Journal book that briefly tips sideways with cute clumsy wobble
 * Action 3 (10000-15000ms): Transforming back into squirrel, crawling small steps, pausing blankly, and returning to rest
 */
export function getSquirrelState(timeMs: number, cardW: number, cardH: number, isReduced: boolean) {
  const t = ((timeMs % SQUIRREL_CYCLE_MS) + SQUIRREL_CYCLE_MS) % SQUIRREL_CYCLE_MS;
  const anchorX = cardW * 0.74;
  const anchorY = cardH * 0.11;

  if (isReduced) {
    return {
      action: 1 as const,
      sheet: 'idle' as const,
      frame: 0,
      x: anchorX,
      y: anchorY,
      rotationDeg: 0,
      facing: 1,
    };
  }

  // Action 1 — Resting (0 - 5500ms)
  if (t < 5500) {
    const frame = Math.floor((t / 1000) * 12) % SQUIRREL_IDLE.count;
    const breatheY = 1.2 * Math.sin((t / 1000) * 3);

    return {
      action: 1 as const,
      sheet: 'idle' as const,
      frame,
      x: anchorX,
      y: anchorY + breatheY,
      rotationDeg: 0,
      facing: 1,
    };
  }

  // Action 2 — Transform into a Journal (5500 - 10000ms)
  if (t < 10000) {
    if (t < 7500) {
      // 2A: Squirrel curls and folds into closed Journal book
      const p = (t - 5500) / 2000;
      const k = p * p * (3 - 2 * p);
      const frame = Math.min(SQUIRREL_FOLD.count - 1, Math.floor(k * SQUIRREL_FOLD.count));

      return {
        action: 2 as const,
        sheet: 'fold' as const,
        frame,
        x: anchorX,
        y: anchorY,
        rotationDeg: 0,
        facing: 1,
      };
    }

    // 2B: Journal loses balance and tips sideways with cute clumsy wobble (7500 - 10000ms)
    const u = (t - 7500) / 2500;
    let tipDeg = 0;
    let slipX = 0;

    if (u >= 0.12 && u < 0.42) {
      // Tips sideways to ~9 degrees
      const sub = (u - 0.12) / 0.30;
      tipDeg = Math.sin(sub * (Math.PI / 2)) * 9;
      slipX = tipDeg * 0.35;
    } else if (u >= 0.42 && u < 0.72) {
      // Wobbles back upright with soft damped rebound
      const sub = (u - 0.42) / 0.30;
      tipDeg = 9 * Math.cos(sub * (Math.PI / 2)) - 2.8 * Math.sin(sub * Math.PI);
      slipX = tipDeg * 0.35;
    }

    return {
      action: 2 as const,
      sheet: 'fold' as const,
      frame: SQUIRREL_FOLD.count - 1, // 61: closed Journal
      x: anchorX + slipX,
      y: anchorY,
      rotationDeg: tipDeg,
      facing: 1,
    };
  }

  // Action 3 — Transform back into squirrel, crawl small steps, pause blankly (10000 - 15000ms)
  if (t < 12000) {
    // 3A: Journal unfolds back into squirrel
    const p = (t - 10000) / 2000;
    const k = p * p * (3 - 2 * p);
    const frame = Math.min(SQUIRREL_FOLD.count - 1, Math.floor((1 - k) * SQUIRREL_FOLD.count));

    return {
      action: 3 as const,
      sheet: 'fold' as const,
      frame,
      x: anchorX,
      y: anchorY,
      rotationDeg: 0,
      facing: 1,
    };
  }

  if (t < 13500) {
    // 3B: Squirrel crawls 2 small cute steps / hops along card edge
    const p = (t - 12000) / 1500;
    const hopProgress = (p * 2) % 1;
    const hopY = -4 * Math.sin(hopProgress * Math.PI);
    const crawlX = -18 * p;
    const frame = Math.floor(hopProgress * 20) % SQUIRREL_IDLE.count;

    return {
      action: 3 as const,
      sheet: 'idle' as const,
      frame,
      x: anchorX + crawlX,
      y: anchorY + hopY,
      rotationDeg: 0,
      facing: -1, // facing left while crawling
    };
  }

  if (t < 14700) {
    // 3C: Pauses and stares blankly with a cute, slightly confused expression
    return {
      action: 3 as const,
      sheet: 'idle' as const,
      frame: 4, // Still pause frame
      x: anchorX - 18,
      y: anchorY,
      rotationDeg: 0,
      facing: -1,
    };
  }

  // 3D: Smoothly eases back to resting spot to loop
  const p = (t - 14700) / 300;
  const k = p * p * (3 - 2 * p);
  const crawlX = -18 * (1 - k);
  const facing = k > 0.5 ? 1 : -1;

  return {
    action: 3 as const,
    sheet: 'idle' as const,
    frame: 0,
    x: anchorX + crawlX,
    y: anchorY,
    rotationDeg: 0,
    facing,
  };
}

export const LoginAnimalExperience = memo(function LoginAnimalExperience({
  animal,
  character,
  isLoading = true,
  onComplete,
  isPaused = false,
  manualTimeMs = null,
  forceAction = null,
  loop = true,
  isReducedMotion = false,
  cardWidth = 420,
  cardHeight = 546,
}: LoginAnimalProps) {
  // Support both animal and character prop
  const selectedAnimal: LoginAnimal = animal || (character === 'squirrel' ? 'squirrel' : 'pigeon');
  const [elapsedMs, setElapsedMs] = useState(manualTimeMs ?? 0);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const exitingRef = useRef(false);
  const exitAnim = useRef(new Animated.Value(isLoading ? 1 : 0)).current;

  // Manual time sync for dev/preview controls
  useEffect(() => {
    if (manualTimeMs !== null && manualTimeMs !== undefined) {
      setElapsedMs(manualTimeMs);
    }
  }, [manualTimeMs]);

  // Jump to specific action when requested by test controls
  useEffect(() => {
    if (forceAction !== null && forceAction !== undefined) {
      if (forceAction === 0) setElapsedMs(1500);
      else if (forceAction === 1) setElapsedMs(7500);
      else setElapsedMs(12500);
    }
  }, [forceAction]);

  // Smooth animation clock loop
  useEffect(() => {
    if (manualTimeMs !== null && manualTimeMs !== undefined) return;
    if (isPaused || !isLoading || isReducedMotion) {
      lastTimeRef.current = null;
      return;
    }

    const maxCycle = selectedAnimal === 'pigeon' ? PIGEON_CYCLE_MS : SQUIRREL_CYCLE_MS;

    const tick = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
      }
      const dt = Math.min(64, now - lastTimeRef.current);
      lastTimeRef.current = now;

      setElapsedMs((prev) => {
        let next = prev + dt;
        if (!loop && next >= maxCycle) {
          next = maxCycle - 1;
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
  }, [isPaused, manualTimeMs, loop, isLoading, isReducedMotion, selectedAnimal]);

  // Loading completion exit animation
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
    }
  }, [isLoading, exitAnim, onComplete]);

  // Render Pigeon
  if (selectedAnimal === 'pigeon') {
    const pigeon = getPigeonState(elapsedMs, cardWidth, cardHeight, isReducedMotion);
    // Draw scale: height ~ 84px, width ~ 123px
    const drawH = 84;
    const drawW = (PIGEON_CELL.w / PIGEON_CELL.h) * drawH; // ~123.2px
    const sheetW = drawW * PIGEON_CELL.cols;
    const sheetH = drawH * PIGEON_CELL.rows;
    const frameCol = pigeon.frame % PIGEON_CELL.cols;
    const frameRow = Math.floor(pigeon.frame / PIGEON_CELL.cols);
    const pigeonUri = getAssetUri(PIGEON_SHEET);

    return (
      <Animated.View
        testID="fairy-loading-root"
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            zIndex: 6,
            opacity: exitAnim,
          },
        ]}
      >
        <View
          testID="login-animal-root"
          accessibilityLabel={`Pigeon action ${pigeon.action}`}
          style={[
            styles.actorWrapper,
            {
              left: pigeon.x - drawW / 2,
              top: pigeon.y - drawH / 2,
              width: drawW,
              height: drawH,
              transform: [
                { rotate: `${pigeon.rotationDeg}deg` },
                { scaleX: pigeon.facing },
              ],
            },
          ]}
        >
          {Platform.OS === 'web' ? (
            <div
              data-testid="login-animal-pigeon"
              style={{
                width: drawW,
                height: drawH,
                overflow: 'hidden',
                position: 'relative',
                pointerEvents: 'none',
              }}
            >
              <img
                src={pigeonUri}
                alt="Pigeon spirit"
                style={{
                  position: 'absolute',
                  width: sheetW,
                  height: sheetH,
                  left: -frameCol * drawW,
                  top: -frameRow * drawH,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            </div>
          ) : (
            <View testID="login-animal-pigeon" style={{ width: drawW, height: drawH, overflow: 'hidden' }}>
              <Image
                source={PIGEON_SHEET}
                resizeMode="stretch"
                style={{
                  position: 'absolute',
                  width: sheetW,
                  height: sheetH,
                  left: -frameCol * drawW,
                  top: -frameRow * drawH,
                }}
              />
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  // Render Squirrel
  const squirrel = getSquirrelState(elapsedMs, cardWidth, cardHeight, isReducedMotion);
  const drawH = 88;
  const drawW = (SQUIRREL_CELL.w / SQUIRREL_CELL.h) * drawH; // ~96.2px
  const groundOffset = (SQUIRREL_CELL.ground / SQUIRREL_CELL.h) * drawH; // ~83.3px
  const isFold = squirrel.sheet === 'fold';
  const sheetSource = isFold ? SQUIRREL_FOLD_SHEET : SQUIRREL_IDLE_SHEET;
  const sheetConfig = isFold ? SQUIRREL_FOLD : SQUIRREL_IDLE;
  const sheetW = drawW * sheetConfig.cols;
  const sheetH = drawH * sheetConfig.rows;
  const frameCol = squirrel.frame % sheetConfig.cols;
  const frameRow = Math.floor(squirrel.frame / sheetConfig.cols);
  const squirrelUri = getAssetUri(sheetSource);

  return (
    <Animated.View
      testID="fairy-loading-root"
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 6,
          opacity: exitAnim,
        },
      ]}
    >
      <View
        testID="login-animal-root"
        accessibilityLabel={`Squirrel action ${squirrel.action}`}
        style={[
          styles.actorWrapper,
          {
            left: squirrel.x - drawW / 2,
            top: squirrel.y - groundOffset,
            width: drawW,
            height: drawH,
            transform: [
              { rotate: `${squirrel.rotationDeg}deg` },
              { scaleX: squirrel.facing },
            ],
          },
        ]}
      >
        {Platform.OS === 'web' ? (
          <div
            data-testid="login-animal-squirrel"
            style={{
              width: drawW,
              height: drawH,
              overflow: 'hidden',
              position: 'relative',
              pointerEvents: 'none',
            }}
          >
            <img
              src={squirrelUri}
              alt="Squirrel spirit"
              style={{
                position: 'absolute',
                width: sheetW,
                height: sheetH,
                left: -frameCol * drawW,
                top: -frameRow * drawH,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          </div>
        ) : (
          <View testID="login-animal-squirrel" style={{ width: drawW, height: drawH, overflow: 'hidden' }}>
            <Image
              source={sheetSource}
              resizeMode="stretch"
              style={{
                position: 'absolute',
                width: sheetW,
                height: sheetH,
                left: -frameCol * drawW,
                top: -frameRow * drawH,
              }}
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  actorWrapper: {
    position: 'absolute',
  },
});
