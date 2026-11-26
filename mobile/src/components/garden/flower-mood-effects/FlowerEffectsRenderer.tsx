import { BlurMask, Circle, Group, Image, Line, Oval, Path, Rect, Skia, useImage } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { FLOWER_GROUND_ANCHOR, FLOWER_VISUAL_HEIGHT, FLOWER_VISUAL_WIDTH, getBlossomAnchors } from './blossomAnchors';
import { calculateGlowParameters, generateRainParticles, generateRaindropPlacements, generateSparkleParticles } from './effectEngine';
import type { BlossomAnchorPoint, FlowerEffectConfig } from './types';

// Approved PetalPal tulip artwork
const TULIP_NORMAL_ASSET = require('../../../../assets/garden/flowers/species/tulip/base/tulip_garden_normal.png');

export interface FlowerEffectsRendererProps {
  worldX: number;
  worldY: number;
  primaryEffect: FlowerEffectConfig;
  secondaryEffect?: FlowerEffectConfig;
  timeSeconds: number;
  isActive?: boolean;
  renderFlower?: boolean;
  showBoundaryDebug?: boolean;
  showAnchorsDebug?: boolean;
  customScale?: number;
}

/**
 * Creates a Skia 4-point star path for a sparkle particle.
 */
function createSparkleStarPath(x: number, y: number, r: number, rotation: number): any {
  const path = Skia.Path.Make();
  const inner = r * 0.22;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const rotate = (px: number, py: number) => ({
    x: x + (px * cos - py * sin),
    y: y + (px * sin + py * cos),
  });

  const p0 = rotate(0, -r);
  const p1 = rotate(inner, -inner);
  const p2 = rotate(r, 0);
  const p3 = rotate(inner, inner);
  const p4 = rotate(0, r);
  const p5 = rotate(-inner, inner);
  const p6 = rotate(-r, 0);
  const p7 = rotate(-inner, -inner);

  path.moveTo(p0.x, p0.y);
  path.lineTo(p1.x, p1.y);
  path.lineTo(p2.x, p2.y);
  path.lineTo(p3.x, p3.y);
  path.lineTo(p4.x, p4.y);
  path.lineTo(p5.x, p5.y);
  path.lineTo(p6.x, p6.y);
  path.lineTo(p7.x, p7.y);
  path.close();

  return path;
}

/** Sparkle Layer */
const SparkleLayer = memo(function SparkleLayer({
  config,
  worldX,
  worldY,
  time,
}: {
  config: FlowerEffectConfig;
  worldX: number;
  worldY: number;
  time: number;
}) {
  const particles = useMemo(
    () => generateSparkleParticles(config, worldX, worldY, config.seed),
    [config, worldX, worldY]
  );

  if (particles.length === 0) return null;

  return (
    <Group>
      {particles.map((p) => {
        // Individual twinkle phase cycle
        const wave = Math.sin(time * p.speed * 2.8 + p.phase);
        if (wave <= 0) return null;
        const opacity = Math.min(1, Math.pow(wave, 1.6) * config.opacity);
        if (opacity < 0.05) return null;

        const currentSize = p.size * (0.8 + 0.3 * wave);
        const starPath = createSparkleStarPath(p.x, p.y, currentSize, p.rotation);

        return (
          <Group key={p.id}>
            <Circle cx={p.x} cy={p.y} r={currentSize * 0.75} color={p.color} opacity={opacity * 0.4}>
              <BlurMask blur={0.9} style="normal" />
            </Circle>
            <Path path={starPath} color={p.color} opacity={opacity} />
          </Group>
        );
      })}
    </Group>
  );
});

/** Glow Layer */
const GlowLayer = memo(function GlowLayer({
  config,
  worldX,
  worldY,
  time,
}: {
  config: FlowerEffectConfig;
  worldX: number;
  worldY: number;
  time: number;
}) {
  const glow = useMemo(() => calculateGlowParameters(config, time), [config, time]);
  if (glow.opacity <= 0.01) return null;

  const blossomCenterY = worldY - 33; // Centered on actual blossom petals

  return (
    <Group>
      {/* Central warm breathing blossom glow */}
      <Circle
        cx={worldX}
        cy={blossomCenterY}
        r={glow.radius * 0.85}
        color={glow.color}
        opacity={glow.opacity * 0.45}
      >
        <BlurMask blur={14} style="normal" />
      </Circle>
      {/* Subtle outer soft gradient ring */}
      <Circle
        cx={worldX}
        cy={blossomCenterY - 3}
        r={glow.radius * 1.15}
        color={config.secondaryColor || glow.color}
        opacity={glow.opacity * 0.22}
      >
        <BlurMask blur={22} style="normal" />
      </Circle>
    </Group>
  );
});

/**
 * Light Rain Layer with support for depth layering (background vs foreground).
 * Smooth continuous downward movement with natural streak length and soft boundary falloff.
 */
const LightRainLayer = memo(function LightRainLayer({
  config,
  worldX,
  worldY,
  time,
  layerFilter,
}: {
  config: FlowerEffectConfig;
  worldX: number;
  worldY: number;
  time: number;
  layerFilter?: 'background' | 'foreground';
}) {
  const rainDrops = useMemo(
    () => generateRainParticles(config, worldX, worldY, config.seed),
    [config, worldX, worldY]
  );

  if (rainDrops.length === 0) return null;

  const filteredDrops = layerFilter
    ? rainDrops.filter((d) => d.layer === layerFilter)
    : rainDrops;

  if (filteredDrops.length === 0) return null;

  const height = config.effectHeight;
  const travelSpan = height + 30; // Total vertical distance traversed before wrapping
  const topBound = worldY - height - 10;

  return (
    <Group>
      {filteredDrops.map((d) => {
        // Continuous, smooth downward trajectory without stationary appearance
        const travel = (time * d.speed + d.phaseOffset) % travelSpan;
        const currentY = topBound + travel;
        const currentX = d.x + d.slant * travel;

        // Soft, organic fade at top spawn and bottom landing
        const progress = travel / travelSpan;
        let fade = 1.0;
        if (progress < 0.18) fade = progress / 0.18;
        else if (progress > 0.78) fade = (1 - progress) / 0.22;

        const opacity = d.opacity * fade;
        if (opacity < 0.03) return null;

        const endX = currentX + d.slant * d.length;
        const endY = currentY + d.length;

        return (
          <Line
            key={d.id}
            p1={{ x: currentX, y: currentY }}
            p2={{ x: endX, y: endY }}
            color={d.color}
            strokeWidth={d.strokeWidth}
            opacity={opacity}
          />
        );
      })}
    </Group>
  );
});

/**
 * Raindrop Layer — tiny translucent moisture beads resting directly on flower petals.
 * Uses small irregular elliptical shapes, subtle water body, and microscopic glints.
 */
const RaindropLayer = memo(function RaindropLayer({
  config,
  anchors,
  time,
}: {
  config: FlowerEffectConfig;
  anchors: BlossomAnchorPoint[];
  time: number;
}) {
  const droplets = useMemo(
    () => generateRaindropPlacements(config, anchors, config.seed),
    [config, anchors]
  );

  if (droplets.length === 0) return null;

  return (
    <Group>
      {droplets.map((d) => {
        const w = d.width;
        const h = d.height;

        // Subtle shimmer wave for occasional delicate glint
        const shimmer = 0.85 + 0.15 * Math.sin(time * d.shimmerSpeed * 2.5 + d.shimmerPhase);
        const beadOpacity = d.opacity;
        const glintOpacity = Math.min(1, beadOpacity * 1.2 * shimmer);

        return (
          <Group
            key={d.id}
            transform={[
              { translateX: d.x },
              { translateY: d.y },
              { rotate: d.tiltAngle },
            ]}
          >
            {/* 1. Subtle petal contact shading (grounding under the moisture bead) */}
            <Oval
              x={-w * 0.5}
              y={-h * 0.25}
              width={w * 1.05}
              height={h * 0.75}
              color="#22363D"
              opacity={0.16 * beadOpacity}
            />

            {/* 2. Soft translucent water droplet body (allows petal color to shine through) */}
            <Oval
              x={-w * 0.5}
              y={-h * 0.5}
              width={w}
              height={h}
              color={config.color || '#C8DFE7'}
              opacity={beadOpacity * 0.58}
            />

            {/* 3. Microscopic specular highlight dot on upper-left edge */}
            <Circle
              cx={-w * 0.22}
              cy={-h * 0.22}
              r={Math.min(w, h) * 0.28}
              color={config.secondaryColor || '#FFFFFF'}
              opacity={glintOpacity * 0.68}
            />
          </Group>
        );
      })}
    </Group>
  );
});

/**
 * Main Skia Flower Effects Renderer component.
 * Renders layered background effects, base flower illustration, petal droplets,
 * and foreground rain streaks with proper depth and isolation.
 */
export function FlowerEffectsRenderer({
  worldX,
  worldY,
  primaryEffect,
  secondaryEffect,
  timeSeconds,
  isActive = true,
  renderFlower = true,
  showBoundaryDebug = false,
  showAnchorsDebug = false,
  customScale = 1.0,
}: FlowerEffectsRendererProps) {
  const flowerImage = useImage(TULIP_NORMAL_ASSET);

  // Compute anchor positions transformed to world coords
  const anchors = useMemo(
    () => getBlossomAnchors(worldX, worldY, customScale),
    [worldX, worldY, customScale]
  );

  // Flower image dimensions and placement
  const flowerW = FLOWER_VISUAL_WIDTH * customScale;
  const flowerH = FLOWER_VISUAL_HEIGHT * customScale;
  const flowerX = worldX - FLOWER_GROUND_ANCHOR.x * flowerW;
  const flowerY = worldY - FLOWER_GROUND_ANCHOR.y * flowerH;

  // Active effect checkers
  const hasGlow = (primaryEffect.effectType === 'glow' && primaryEffect.opacity > 0) ||
    (secondaryEffect?.effectType === 'glow' && (secondaryEffect.opacity ?? 0) > 0);
  const glowConfig = primaryEffect.effectType === 'glow' ? primaryEffect : secondaryEffect;

  const hasRain = primaryEffect.effectType === 'light_rain' || secondaryEffect?.effectType === 'light_rain';
  const rainConfig = primaryEffect.effectType === 'light_rain' ? primaryEffect : secondaryEffect;

  const hasDroplets = primaryEffect.effectType === 'raindrop' || secondaryEffect?.effectType === 'raindrop';
  const dropConfig = primaryEffect.effectType === 'raindrop' ? primaryEffect : secondaryEffect;

  const hasSparkle = primaryEffect.effectType === 'sparkle' || secondaryEffect?.effectType === 'sparkle';
  const sparkleConfig = primaryEffect.effectType === 'sparkle' ? primaryEffect : secondaryEffect;

  return (
    <Group>
      {/* ── 1. BEHIND FLOWER: Soft Breathing Glow ── */}
      {isActive && hasGlow && glowConfig && (
        <GlowLayer
          config={glowConfig}
          worldX={worldX}
          worldY={worldY}
          time={timeSeconds}
        />
      )}

      {/* ── 2. BEHIND FLOWER: Background Rain Streaks (~60% of rain) ── */}
      {isActive && hasRain && rainConfig && (
        <LightRainLayer
          config={rainConfig}
          worldX={worldX}
          worldY={worldY}
          time={timeSeconds}
          layerFilter="background"
        />
      )}

      {/* ── 3. BASE FLOWER CLUSTER ARTWORK ── */}
      {renderFlower && flowerImage && (
        <Image
          image={flowerImage}
          x={flowerX}
          y={flowerY}
          width={flowerW}
          height={flowerH}
          fit="contain"
        />
      )}

      {/* Fallback graceful flower silhouette if asset is still decoding */}
      {renderFlower && !flowerImage && (
        <Group>
          <Circle cx={worldX} cy={worldY - 34 * customScale} r={16 * customScale} color="#E87A90" opacity={0.85} />
          <Circle cx={worldX - 10 * customScale} cy={worldY - 30 * customScale} r={11 * customScale} color="#D06880" opacity={0.8} />
          <Circle cx={worldX + 10 * customScale} cy={worldY - 30 * customScale} r={11 * customScale} color="#D06880" opacity={0.8} />
          <Line
            p1={{ x: worldX, y: worldY - 18 * customScale }}
            p2={{ x: worldX, y: worldY }}
            color="#4A7C59"
            strokeWidth={3}
          />
        </Group>
      )}

      {/* ── 4. ON PETALS: Resting Translucent Droplets ── */}
      {isActive && hasDroplets && dropConfig && (
        <RaindropLayer
          config={dropConfig}
          anchors={anchors}
          time={timeSeconds}
        />
      )}

      {/* ── 5. IN FRONT OF FLOWER: Foreground Rain Streaks (~40% of rain) ── */}
      {isActive && hasRain && rainConfig && (
        <LightRainLayer
          config={rainConfig}
          worldX={worldX}
          worldY={worldY}
          time={timeSeconds}
          layerFilter="foreground"
        />
      )}

      {/* ── 6. SPARKLE HIGHLIGHTS ── */}
      {isActive && hasSparkle && sparkleConfig && (
        <SparkleLayer
          config={sparkleConfig}
          worldX={worldX}
          worldY={worldY}
          time={timeSeconds}
        />
      )}

      {/* ── 7. DEBUG OVERLAYS ── */}
      {showBoundaryDebug && (
        <Group>
          <Circle
            cx={worldX}
            cy={worldY - primaryEffect.effectHeight * 0.5}
            r={primaryEffect.effectRadius}
            color="#FF9800"
            style="stroke"
            strokeWidth={1}
            opacity={0.7}
          />
          <Rect
            x={worldX - primaryEffect.effectRadius}
            y={worldY - primaryEffect.effectHeight}
            width={primaryEffect.effectRadius * 2}
            height={primaryEffect.effectHeight}
            color="#FF9800"
            style="stroke"
            strokeWidth={0.8}
            opacity={0.4}
          />
          <Circle cx={worldX} cy={worldY} r={3} color="#FF5722" />
        </Group>
      )}

      {showAnchorsDebug && (
        <Group>
          {anchors.map((a) => (
            <Circle key={a.id} cx={a.x} cy={a.y} r={2.0} color="#00BCD4" opacity={0.85} />
          ))}
        </Group>
      )}
    </Group>
  );
}

export default memo(FlowerEffectsRenderer);
