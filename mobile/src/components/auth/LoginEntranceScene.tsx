import React, { memo, useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { entranceFrame, ENTRANCE_DURATION } from './entranceTimeline';

export const ENTRANCE_ASSETS = {
  outside: require('../../../assets/auth/cinematic_v3/stage1_outside_arch_hd.jpg'),
  inside: require('../../../assets/auth/cinematic_v3/stage2_just_inside_hd.jpg'),
  arch: require('../../../assets/auth/cinematic_v3/floral_arch_hd.webp'),
  archLeft: require('../../../assets/auth/cinematic_v3/floral_arch_left_hd.webp'),
  archRight: require('../../../assets/auth/cinematic_v3/floral_arch_right_hd.webp'),
  // Backward compatibility aliases
  distance: require('../../../assets/auth/cinematic_v3/stage2_just_inside_hd.jpg'),
  gateLeft: require('../../../assets/auth/cinematic_v3/floral_arch_left_hd.webp'),
  gateRight: require('../../../assets/auth/cinematic_v3/floral_arch_right_hd.webp'),
  gate: require('../../../assets/auth/cinematic_v3/floral_arch_hd.webp'),
  pillar: require('../../../assets/auth/cinematic_v3/floral_arch_hd.webp'),
};

export function entranceTrack(progress: Animated.Value, key: keyof ReturnType<typeof entranceFrame>, reduced = false) {
  const times = Array.from({ length: 71 }, (_, i) => (i * ENTRANCE_DURATION) / 70);
  return progress.interpolate({
    inputRange: times,
    outputRange: times.map((ms) => entranceFrame(ms, reduced)[key]),
    extrapolate: 'clamp',
  });
}

// Master Entrance Landmarks in stage1 / stage2 cinematic assets (1024 x 1536)
export const ENTRANCE_GEOMETRY = {
  imgWidth: 1024,
  imgHeight: 1536,
  vanishX: 512,           // Centerline of pathway and central lake pavilion
  vanishY: 650,           // Horizon and water level of central pavilion (~42% height)
  archWidthRatio: 1.0,    // Arch spans 100% of rendered background width
  archAspect: 1536 / 1024, // Exact aspect ratio (1.5)
  archTopRatio: 0.0,      // Arch top sits at 0% from top of background
} as const;

export const LoginEntranceScene = memo(function LoginEntranceScene({
  progress,
  reduced,
  onReady,
  onError,
}: {
  progress: Animated.Value;
  reduced: boolean;
  onReady: () => void;
  onError: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const loaded = useRef(new Set<string>());
  const ready = (id: string) => {
    loaded.current.add(id);
    if (loaded.current.size >= 2) onReady();
  };

  const g = ENTRANCE_GEOMETRY;
  // Shared coordinate mapping with background image under resizeMode="cover"
  const imageScale = Math.max(width / g.imgWidth, height / g.imgHeight);
  const renderedW = g.imgWidth * imageScale;
  const renderedH = g.imgHeight * imageScale;
  const offsetX = (width - renderedW) / 2;
  const offsetY = (height - renderedH) / 2;

  const vanishingX = offsetX + g.vanishX * imageScale;
  const vanishingY = offsetY + g.vanishY * imageScale;

  const archWidth = renderedW * g.archWidthRatio;
  const archHeight = archWidth * g.archAspect;
  const archLeft = offsetX + (renderedW - archWidth) / 2;
  const archTop = offsetY + g.archTopRatio * renderedH;
  const archCenterY = archHeight * 0.45;

  const sceneScale = entranceTrack(progress, 'sceneScale', reduced);
  const cameraLiftY = entranceTrack(progress, 'cameraLiftY', reduced);
  const archScale = entranceTrack(progress, 'archScale', reduced);
  const archSlideX = entranceTrack(progress, 'archSlideX', reduced);
  const archLiftY = entranceTrack(progress, 'archLiftY', reduced);
  const archOpacity = entranceTrack(progress, 'archOpacity', reduced);
  const handoffVeil = entranceTrack(progress, 'handoffVeil', reduced);
  const envelopeOpacity = entranceTrack(progress, 'envelopeOpacity', reduced);

  return (
    <View pointerEvents="none" style={styles.scene} accessibilityElementsHidden>
      {/* UNIFIED SCENE CONTAINER: Scales background and floral arch together from shared vanishing point */}
      <Animated.View
        testID="unified-scene-container"
        style={[
          styles.unifiedScene,
          {
            transformOrigin: `${vanishingX}px ${vanishingY}px`,
            transform: [{ translateY: cameraLiftY }, { scale: sceneScale }],
          },
        ]}
      >
        {/* Stage 2 Base Garden Background: Just Inside the Floral Arch */}
        <Image
          testID="scenic-background"
          source={ENTRANCE_ASSETS.inside}
          resizeMode="cover"
          onLoad={() => ready('inside')}
          onError={onError}
          style={styles.distance}
        />

        <Animated.View style={[styles.atmosphere, { opacity: envelopeOpacity }]} />

        {/* ENTRANCE PLANE: Houses the approved Floral Arch at entrance depth */}
        <Animated.View
          testID="entrance-plane"
          style={[
            styles.plane,
            {
              left: archLeft,
              top: archTop,
              width: archWidth,
              height: archHeight,
              opacity: archOpacity,
            },
          ]}
        >
          {/* Primary Floral Arch (Carved wood, crocus blossoms, wisteria, pendant bells, mossy stone bases) */}
          <Animated.View
            testID="floral-arch"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              transformOrigin: `50% ${archCenterY}px`,
              transform: [
                { translateY: Animated.multiply(archLiftY, -0.6) },
                { scale: archScale },
              ],
            }}
          >
            <Image
              source={ENTRANCE_ASSETS.arch}
              resizeMode="contain"
              onLoad={() => ready('arch')}
              onError={onError}
              style={styles.archImage}
            />
          </Animated.View>

          {/* Left and Right Arch Halves for parting kinematics and structural tracking */}
          <Animated.View
            testID="left-arch"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              transformOrigin: `22% ${archCenterY}px`,
              transform: [
                { translateX: Animated.multiply(archSlideX, -1) },
                { scale: archScale },
              ],
              opacity: 0,
            }}
          />
          <Animated.View
            testID="right-arch"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              transformOrigin: `78% ${archCenterY}px`,
              transform: [
                { translateX: archSlideX },
                { scale: archScale },
              ],
              opacity: 0,
            }}
          />
        </Animated.View>
      </Animated.View>

      {/* Atmospheric turquoise veil during elevated perspective handoff to live Garden */}
      <Animated.View
        testID="perspective-bridge-veil"
        pointerEvents="none"
        style={[styles.mist, { opacity: handoffVeil }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  scene: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: '#5AA4AB' },
  unifiedScene: { ...StyleSheet.absoluteFill },
  distance: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  atmosphere: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(238,245,231,.06)',
    ...(Platform.OS === 'web'
      ? {
          backgroundImage:
            'linear-gradient(to bottom, rgba(247,246,235,.76), rgba(247,246,235,0) 38%)',
        }
      : {}),
  },
  plane: { position: 'absolute' },
  archImage: { width: '100%', height: '100%' },
  mist: { ...StyleSheet.absoluteFill, backgroundColor: '#bce3de' },
});
