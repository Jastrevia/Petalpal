import { BlurMask, Circle, Group, Line, Oval, Path, Skia } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { FlowerPlacementRecord } from '../planting/plantingPersistence';
import { getBlossomAnchors } from './blossomAnchors';
import { getLocalCalendarDate, getNextLocalMidnight } from './dateHelpers';
import { generateRainParticles, generateRaindropPlacements, generateSparkleParticles } from './effectEngine';
import { gardenMoodLevel, moodEffectActiveToday } from './gardenMoodLevel';
import { resolveMoodPreset } from './moodPresets';
import type { FlowerEffectConfig, MoodCategory, RainParticle, RaindropPlacement, SparkleParticle } from './types';

// Garden adapter for the partner's mood effects (FlowerEffectsRenderer is the preview
// reference). Same particle generators, presets and visual parameters; only the clock
// changes: one Reanimated shared value advanced by a frame callback, read through
// useDerivedValue, so animation frames never pass through React state
// (INTEGRATION_OPTIMIZATION.md §6). The clock stops when nothing is shown, in the
// background and under reduced motion.

// Presentation palette for backend accents (same values as CanonicalFlowerArt).
const ACCENT_COLORS: Readonly<Record<string, string>> = { PEARL_GOLD: '#e6c886', BRIGHT_CORAL: '#ff806b', EMBER_RED: '#d64b3f',
  SHARP_ORANGE: '#f38b38', WARM_CREAM: '#f4d7a2', MIXED_VIOLET: '#ab83cf', IRIDESCENT_BLUE: '#70b9e4',
  MUTED_BLUE: '#7796bc', COOL_GREEN: '#7fae8e', VIVID_GOLD: '#f7c443', COOL_DARK_EDGE: '#768cab',
  WARM_GOLD: '#eab84e', SUNLIT_YELLOW: '#f8d45a', SOFT_PINK: '#eba2bd', DAWN_GOLD: '#e7b566',
  SILVER_BLUE: '#a2bdd4', COOL_BLUE: '#75a7d6', CONTRAST_POP: '#cc78d6' };

export interface GardenMoodEffect {
  id: string; x: number; y: number; level: MoodCategory;
  effects: FlowerEffectConfig[];
}

function seedFor(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

/** Today's non-neutral effects for the owner's Event flowers (pure; tested). */
export function gardenMoodEffectsFor(flowers: readonly FlowerPlacementRecord[], timeZone: string | undefined, now: Date = new Date()): GardenMoodEffect[] {
  return flowers.flatMap(flower => {
    if (!(flower.sourceType || flower.sourceEventId) || !moodEffectActiveToday(flower.plantedDate, timeZone, now)) return [];
    const level = gardenMoodLevel(flower.mood, flower.secondaryEmotions);
    if (level === 'neutral') return [];
    const { primaryEffect, secondaryEffect } = resolveMoodPreset(level, { seed: seedFor(flower.id) });
    // The secondary-emotion accent keeps its colour; the partner's effect supplies the shape.
    const color = flower.colorAccent ? ACCENT_COLORS[flower.colorAccent] : undefined;
    const effects = [primaryEffect, secondaryEffect].filter(effect => effect.effectType !== 'none' && effect.opacity > 0)
      .map(effect => color ? { ...effect, color } : effect);
    return effects.length ? [{ id: flower.id, x: flower.worldX, y: flower.worldY, level, effects }] : [];
  });
}

function useEffectClock(running: boolean) {
  const seconds = useSharedValue(1);
  const frame = useFrameCallback(info => {
    seconds.value += Math.min(0.05, Math.max(0, (info.timeSincePreviousFrame ?? 16.667) / 1000));
  }, false);
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  }, [frame, running]);
  return seconds;
}

function unitStar() {
  const path = Skia.Path.Make(), inner = 0.22;
  const points = [[0, -1], [inner, -inner], [1, 0], [inner, inner], [0, 1], [-inner, inner], [-1, 0], [-inner, -inner]];
  points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y));
  path.close();
  return path;
}

const SparkleView = memo(function SparkleView({ p, opacity, star, seconds }: {
  p: SparkleParticle; opacity: number; star: ReturnType<typeof unitStar>; seconds: SharedValue<number>;
}) {
  const wave = useDerivedValue(() => Math.sin(seconds.value * p.speed * 2.8 + p.phase));
  const alpha = useDerivedValue(() => {
    if (wave.value <= 0) return 0;
    const value = Math.min(1, Math.pow(wave.value, 1.6) * opacity);
    return value < 0.05 ? 0 : value;
  });
  const size = useDerivedValue(() => p.size * (0.8 + 0.3 * Math.max(0, wave.value)));
  const halo = useDerivedValue(() => alpha.value * 0.4);
  const haloRadius = useDerivedValue(() => size.value * 0.75);
  const transform = useDerivedValue(() => [{ translateX: p.x }, { translateY: p.y }, { rotate: p.rotation }, { scale: size.value }]);
  return <Group>
    <Circle cx={p.x} cy={p.y} r={haloRadius} color={p.color} opacity={halo}><BlurMask blur={0.9} style="normal" /></Circle>
    <Group transform={transform}><Path path={star} color={p.color} opacity={alpha} /></Group>
  </Group>;
});

const SparkleEffect = memo(function SparkleEffect({ config, x, y, seconds }: {
  config: FlowerEffectConfig; x: number; y: number; seconds: SharedValue<number>;
}) {
  const particles = useMemo(() => generateSparkleParticles(config, x, y, config.seed), [config, x, y]);
  const star = useMemo(() => unitStar(), []);
  return <Group>{particles.map(p => <SparkleView key={p.id} p={p} opacity={config.opacity} star={star} seconds={seconds} />)}</Group>;
});

const GlowEffect = memo(function GlowEffect({ config, x, y, seconds }: {
  config: FlowerEffectConfig; x: number; y: number; seconds: SharedValue<number>;
}) {
  // calculateGlowParameters, evaluated per frame on the shared clock.
  const breath = useDerivedValue(() => 0.5 + 0.5 * Math.sin((seconds.value * (config.animationSpeed || 0.8) * 2 * Math.PI) / 3.6));
  const opacity = useDerivedValue(() => {
    const value = Math.max(0, Math.min(1, config.opacity * (0.5 + 0.6 * breath.value)));
    return value <= 0.01 ? 0 : value;
  });
  const radius = useDerivedValue(() => config.effectRadius * (0.92 + 0.08 * breath.value) * config.scale);
  const innerRadius = useDerivedValue(() => radius.value * 0.85), outerRadius = useDerivedValue(() => radius.value * 1.15);
  const innerOpacity = useDerivedValue(() => opacity.value * 0.45), outerOpacity = useDerivedValue(() => opacity.value * 0.22);
  const color = config.color || '#FFF5D6', centerY = y - 33;
  return <Group>
    <Circle cx={x} cy={centerY} r={innerRadius} color={color} opacity={innerOpacity}><BlurMask blur={14} style="normal" /></Circle>
    <Circle cx={x} cy={centerY - 3} r={outerRadius} color={config.secondaryColor || color} opacity={outerOpacity}><BlurMask blur={22} style="normal" /></Circle>
  </Group>;
});

const RainStreak = memo(function RainStreak({ d, top, span, seconds }: {
  d: RainParticle; top: number; span: number; seconds: SharedValue<number>;
}) {
  const travel = useDerivedValue(() => (seconds.value * d.speed + d.phaseOffset) % span);
  const p1 = useDerivedValue(() => ({ x: d.x + d.slant * travel.value, y: top + travel.value }));
  const p2 = useDerivedValue(() => ({ x: d.x + d.slant * (travel.value + d.length), y: top + travel.value + d.length }));
  const opacity = useDerivedValue(() => {
    const progress = travel.value / span;
    const fade = progress < 0.18 ? progress / 0.18 : progress > 0.78 ? (1 - progress) / 0.22 : 1;
    const value = d.opacity * fade;
    return value < 0.03 ? 0 : value;
  });
  return <Line p1={p1} p2={p2} color={d.color} strokeWidth={d.strokeWidth} opacity={opacity} />;
});

const RainEffect = memo(function RainEffect({ config, x, y, seconds, layer }: {
  config: FlowerEffectConfig; x: number; y: number; seconds: SharedValue<number>; layer: RainParticle['layer'];
}) {
  const drops = useMemo(() => generateRainParticles(config, x, y, config.seed).filter(d => d.layer === layer), [config, x, y, layer]);
  const top = y - config.effectHeight - 10, span = config.effectHeight + 30;
  return <Group>{drops.map(d => <RainStreak key={d.id} d={d} top={top} span={span} seconds={seconds} />)}</Group>;
});

const Droplet = memo(function Droplet({ d, config, seconds }: { d: RaindropPlacement; config: FlowerEffectConfig; seconds: SharedValue<number> }) {
  const glint = useDerivedValue(() => Math.min(1, d.opacity * 1.2 * (0.85 + 0.15 * Math.sin(seconds.value * d.shimmerSpeed * 2.5 + d.shimmerPhase))) * 0.68);
  const w = d.width, h = d.height;
  return <Group transform={[{ translateX: d.x }, { translateY: d.y }, { rotate: d.tiltAngle }]}>
    <Oval x={-w * 0.5} y={-h * 0.25} width={w * 1.05} height={h * 0.75} color="#22363D" opacity={0.16 * d.opacity} />
    <Oval x={-w * 0.5} y={-h * 0.5} width={w} height={h} color={config.color || '#C8DFE7'} opacity={d.opacity * 0.58} />
    <Circle cx={-w * 0.22} cy={-h * 0.22} r={Math.min(w, h) * 0.28} color={config.secondaryColor || '#FFFFFF'} opacity={glint} />
  </Group>;
});

const DropletEffect = memo(function DropletEffect({ config, x, y, seconds }: {
  config: FlowerEffectConfig; x: number; y: number; seconds: SharedValue<number>;
}) {
  const droplets = useMemo(() => generateRaindropPlacements(config, getBlossomAnchors(x, y, 1), config.seed), [config, x, y]);
  return <Group>{droplets.map(d => <Droplet key={d.id} d={d} config={config} seconds={seconds} />)}</Group>;
});

/**
 * Draws today's mood effects for the given (owner's, depth-pass) flowers. `behind` holds
 * the glow and background rain (drawn before the flowers), `front` the droplets,
 * foreground rain and sparkles, matching the partner's layer order.
 */
export const GardenMoodEffectsLayer = memo(function GardenMoodEffectsLayer({ flowers, timeZone, part }: {
  flowers: readonly FlowerPlacementRecord[]; timeZone?: string; part: 'behind' | 'front';
}) {
  const [now, setNow] = useState(() => new Date());
  const effects = useMemo(() => gardenMoodEffectsFor(flowers, timeZone, now), [flowers, timeZone, now]);
  // Re-check at the next local midnight, when today's effects end.
  useEffect(() => {
    if (!effects.length || !timeZone) return;
    const next = Date.parse(getNextLocalMidnight(getLocalCalendarDate(now, timeZone), timeZone));
    const timer = setTimeout(() => setNow(new Date()), Math.max(1000, next - Date.now() + 500));
    return () => clearTimeout(timer);
  }, [effects.length, timeZone, now]);
  const reducedMotion = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const seconds = useEffectClock(effects.length > 0 && foreground && !reducedMotion);
  if (!effects.length) return null;
  return <Group>{effects.map(({ id, x, y, effects: configs }) => <Group key={id}>
    {configs.map(config => {
      const key = `${id}-${config.effectType}`;
      if (part === 'behind') {
        if (config.effectType === 'glow') return <GlowEffect key={key} config={config} x={x} y={y} seconds={seconds} />;
        if (config.effectType === 'light_rain') return <RainEffect key={key} config={config} x={x} y={y} seconds={seconds} layer="background" />;
        return null;
      }
      if (config.effectType === 'raindrop') return <DropletEffect key={key} config={config} x={x} y={y} seconds={seconds} />;
      if (config.effectType === 'light_rain') return <RainEffect key={key} config={config} x={x} y={y} seconds={seconds} layer="foreground" />;
      if (config.effectType === 'sparkle') return <SparkleEffect key={key} config={config} x={x} y={y} seconds={seconds} />;
      return null;
    })}
  </Group>)}</Group>;
});
