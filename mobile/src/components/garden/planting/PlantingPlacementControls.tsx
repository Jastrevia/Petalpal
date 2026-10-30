import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { usePlanting } from './PlantingContext';
import { MONTH_REGION_METAS } from './plantingRegionData';
import { clusterFootprintRadius } from './flowerClusters';
import { useAppLocale } from '../../../services/locale';

/** The Garden camera, to keep the ✓ under the ghost while the view moves. */
export interface PlantingCamera {
  x: SharedValue<number>; y: SharedValue<number>; zoom: SharedValue<number>;
  baseX: number; baseY: number; fit: number;
}
const CHECK_SIZE = 48;

const ZH_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
// The validator's English messages, in Chinese (placementValidator.ts).
function zhFeedback(text: string) {
  const known: Record<string, string> = {
    'This flower is not ready for planting yet.': '这朵花还不能种。', 'Stay inside the garden.': '请种在花园里面。',
    'Choose a grassy spot.': '请选一块草地。', 'Choose a little more space around the flower.': '请给花留出一点空间。',
    'Another flower is already planted here.': '这里已经种了一朵花。', 'Ready to plant!': '可以种在这里！',
    // Server answers when planting is saved (lib/flower-placement.js).
    'Another flower is already planted here': '这里已经种了一朵花。', 'Choose a spot inside the Garden': '请种在花园里面。',
    'This flower belongs in another month’s land': '这朵花属于另一个月的土地。',
    'This flower is already planted. Its spot can’t change.': '这朵花已经种下了，位置不能再改。',
    'Unable to plant here. Try again.': '没能种在这里，请再试一次。',
  };
  const month = text.match(/^This flower belongs in the (\w+) garden\.$/);
  if (month) {
    const index = Object.values(MONTH_REGION_METAS).findIndex(meta => meta?.monthName === month[1]);
    return `这朵花属于${index >= 0 ? ZH_MONTHS[index] : month[1]}花园。`;
  }
  return known[text] ?? text;
}

// The ✓ sits just below the ghost's planting point and follows it through camera moves.
function PlantCheck({ camera, worldX, worldY, month, enabled, saving, label, onPress }: {
  camera: PlantingCamera; worldX: number; worldY: number; month: number;
  enabled: boolean; saving: boolean; label: string; onPress: () => void;
}) {
  const { x, y, zoom, baseX, baseY, fit } = camera;
  const radius = clusterFootprintRadius(month);
  const position = useAnimatedStyle(() => {
    const scale = fit * zoom.value;
    return { transform: [
      { translateX: baseX + x.value + worldX * scale - CHECK_SIZE / 2 },
      { translateY: baseY + y.value + (worldY + radius) * scale + 8 },
    ] };
  }, [worldX, worldY, radius, baseX, baseY, fit]);
  return (
    <Animated.View pointerEvents="box-none" style={[styles.checkAnchor, position]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !enabled || saving, busy: saving }}
        onPress={onPress}
        disabled={!enabled || saving}
        hitSlop={8}
        style={({ pressed }) => [styles.checkButton, !enabled && styles.checkDisabled, pressed && enabled && styles.buttonPressed]}
      >
        {saving ? <ActivityIndicator size="small" color="#234A3F" /> : <Text style={styles.checkMark}>✓</Text>}
      </Pressable>
    </Animated.View>
  );
}

export default function PlantingPlacementControls({ camera }: { camera?: PlantingCamera }) {
  const {
    activeMode,
    targetFlower,
    previewCoords,
    validationResult,
    isSaving,
    confirmPlacement,
    cancelPlacement,
    showPlacementDebug,
  } = usePlanting();
  const zh = useAppLocale() === 'zh-Hans';

  if (activeMode === 'normal' || !targetFlower) {
    return null;
  }

  const meta = MONTH_REGION_METAS[targetFlower.month];
  const monthName = zh ? ZH_MONTHS[targetFlower.month - 1] ?? `${targetFlower.month} 月` : meta?.monthName || `Month ${targetFlower.month}`;

  const isValid = validationResult?.isValid ?? false;
  // Nothing is planted until ✓: first a tap on the lawn shows the ghost there.
  const feedback = !previewCoords || !validationResult?.userFeedback
    ? (zh ? `点一下${monthName}花园里你想种的地方。` : `Tap the spot in the ${monthName} garden where it should grow.`)
    : isValid ? (zh ? '点 ✓ 就种在这里。' : 'Tap ✓ to plant it here.')
    : zh ? zhFeedback(validationResult.userFeedback) : validationResult.userFeedback;

  return (
    <View pointerEvents="box-none" style={styles.overlayContainer}>
      {/* Top Guidance Banner */}
      <View style={styles.topBanner}>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>
            {zh ? '🌱 正在种花' : '🌱 PLANTING FLOWER'}
          </Text>
        </View>
        <Text style={styles.titleText}>
          {targetFlower.flowerName ? `${targetFlower.flowerName.toUpperCase()} — ` : ''}
          {zh ? `${monthName}花园` : `${monthName} Garden`}
        </Text>
        <View
          style={[
            styles.feedbackPill,
            previewCoords && !isValid && styles.feedbackInvalid,
          ]}
        >
          <Text
            style={[
              styles.feedbackText,
              previewCoords && !isValid && styles.feedbackTextInvalid,
            ]}
          >
            {feedback}
          </Text>
        </View>
        <Text style={styles.foreverText}>
          {zh ? '种下以后，位置就不能再改了。' : 'Once planted, it stays in this spot for good.'}
        </Text>

        {showPlacementDebug && previewCoords && (
          <Text style={styles.debugText}>
            World: ({Math.round(previewCoords.worldX)}, {Math.round(previewCoords.worldY)}) |{' '}
            Region: {validationResult?.detectedMonth ?? 'None'} | Reason: {validationResult?.reason || 'OK'}
          </Text>
        )}
      </View>

      {camera && previewCoords && camera.fit > 0 && (
        <PlantCheck
          camera={camera}
          worldX={previewCoords.worldX}
          worldY={previewCoords.worldY}
          month={targetFlower.month}
          enabled={isValid}
          saving={isSaving}
          label={zh ? '种在这里' : 'Plant here'}
          onPress={() => { void confirmPlacement(); }}
        />
      )}

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <Pressable
          accessibilityRole="button"
          onPress={cancelPlacement}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.cancelButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.cancelButtonText}>{zh ? '取消' : 'Cancel'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    zIndex: 1000,
  },
  topBanner: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  feedbackPill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F2ECDD',
    borderWidth: 1,
    borderColor: '#C9A96E66',
  },
  feedbackInvalid: {
    borderColor: '#D9A0B0',
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#234A3F',
  },
  feedbackTextInvalid: {
    color: '#7A4A58',
  },
  foreverText: {
    marginTop: 6,
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  debugText: {
    marginTop: 4,
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#64748B',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginHorizontal: 20,
    marginBottom: 28,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  checkAnchor: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  checkButton: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2ECDD',
    borderWidth: 2,
    borderColor: '#C9A96E',
    shadowColor: '#183530',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 4,
  },
  checkDisabled: {
    opacity: 0.45,
  },
  checkMark: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#234A3F',
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
});
