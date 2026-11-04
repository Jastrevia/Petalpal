import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { getApprovedMonthCentroid } from '../garden/planting/approvedPlantingMasks';
import type { GardenCameraApi } from './gardenCamera';
import { GOLD, serif } from './OnboardingGuide';

const SIZE = 38;
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
/** Label anchors come from the approved planting masks, the same mapping planting uses. */
export const monthLabelAnchors = () => MONTHS.map(month => ({ month, ...getApprovedMonthCentroid(month) }));

// Temporary numerals over the twelve monthly beds. They follow the live camera, never touch
// the Garden itself, and fade away before the tour moves on.
export function MonthLabels({ camera, visible, onHidden }: { camera: GardenCameraApi; visible: boolean; onHidden?: () => void }) {
  const anchors = monthLabelAnchors();
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {anchors.map((anchor, index) => <MonthLabel key={anchor.month} camera={camera} anchor={anchor} index={index} visible={visible}
      onHidden={index === 0 ? onHidden : undefined} />)}
  </View>;
}

function MonthLabel({ camera, anchor, index, visible, onHidden }: { camera: GardenCameraApi; anchor: { month: number; x: number; y: number };
  index: number; visible: boolean; onHidden?: () => void }) {
  const wasShown = useRef(false);
  const reduced = useReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      wasShown.current = true;
      shown.value = withDelay(reduced ? 0 : index * 90, withTiming(1, { duration: reduced ? 0 : 520, easing: Easing.out(Easing.cubic) }));
    } else if (wasShown.current) {
      // Removed before the tour continues: the next step starts only once the numbers are gone.
      shown.value = withTiming(0, { duration: reduced ? 0 : 360, easing: Easing.in(Easing.cubic) },
        finished => { if (finished && onHidden) runOnJS(onHidden)(); });
    }
  }, [visible, reduced, index, shown]);
  const { fit, baseX, baseY } = camera;
  const style = useAnimatedStyle(() => ({
    left: baseX + camera.x.value + anchor.x * fit * camera.zoom.value - SIZE / 2,
    top: baseY + camera.y.value + anchor.y * fit * camera.zoom.value - SIZE / 2,
    opacity: shown.value,
    transform: [{ scale: .82 + shown.value * .18 }],
  }));
  return <Animated.View testID={`month-label-${anchor.month}`} style={[styles.label, style]}>
    <Text style={styles.numeral}>{anchor.month}</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  label: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(251, 246, 233, 0.92)', borderWidth: 1.5, borderColor: GOLD,
    boxShadow: 'inset 0 0 0 2px #FFFDF6, 0 2px 10px rgba(255, 236, 182, 0.65)' },
  numeral: { fontFamily: serif, fontSize: 18, lineHeight: 22, color: '#2E5A4A' },
});
