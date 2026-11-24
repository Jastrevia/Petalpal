import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { DOG_HOUSE_HEIGHT, DOG_HOUSE_WIDTH } from './StaticLandmarkEntities';
import type { StaticLandmarkMapPlacement } from './staticLandmarkMapPlacements';

// Dev only (web: add ?place=doghouse). Drag the dog house, change its size, then press 确认位置:
// the placement is kept in this browser and printed, so it can be written into
// staticLandmarkMapPlacements.ts. Nothing here ships: GardenScene mounts it only under __DEV__.
export const DOG_HOUSE_PLACEMENT_KEY = 'petalpal.dev.dogHousePlacement';

export function placingDogHouse() {
  if (!__DEV__ || typeof window === 'undefined' || !window.location?.search) return false;
  return new URLSearchParams(window.location.search).get('place') === 'doghouse';
}

export function savedDogHousePlacement(): StaticLandmarkMapPlacement | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(DOG_HOUSE_PLACEMENT_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && [value.x, value.y, value.scale].every(Number.isFinite) ? { rotation: 0, ...value } : null;
  } catch { return null; }
}

type Props = {
  placement: StaticLandmarkMapPlacement;
  initial: StaticLandmarkMapPlacement;
  onChange: (next: StaticLandmarkMapPlacement) => void;
  baseX: number; baseY: number; fit: number;
  cameraX: SharedValue<number>; cameraY: SharedValue<number>; cameraZoom: SharedValue<number>;
};

const round = (p: StaticLandmarkMapPlacement) => ({
  x: Math.round(p.x), y: Math.round(p.y), scale: Number(p.scale.toFixed(3)), rotation: p.rotation,
});

export default function DogHousePlacer({ placement, initial, onChange, baseX, baseY, fit, cameraX, cameraY, cameraZoom }: Props) {
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const start = useRef(placement);
  const latest = useRef(placement);
  latest.current = placement;

  const box = useAnimatedStyle(() => ({
    left: baseX + cameraX.value + placement.x * fit * cameraZoom.value,
    top: baseY + cameraY.value + placement.y * fit * cameraZoom.value,
    width: DOG_HOUSE_WIDTH * placement.scale * fit * cameraZoom.value,
    height: DOG_HOUSE_HEIGHT * placement.scale * fit * cameraZoom.value,
  }));

  const drag = useMemo(() => Gesture.Pan().runOnJS(true)
    .onStart(() => { start.current = latest.current; setConfirmed(null); })
    .onUpdate(event => {
      const k = fit * cameraZoom.value;
      onChange({ ...start.current, x: start.current.x + event.translationX / k, y: start.current.y + event.translationY / k });
    }), [fit, cameraZoom, onChange]);

  const resize = (factor: number) => {
    // Grow or shrink about the floor's centre, so the house stays standing where it is.
    const w = DOG_HOUSE_WIDTH * placement.scale, h = DOG_HOUSE_HEIGHT * placement.scale;
    const scale = Math.min(0.5, Math.max(0.08, placement.scale * factor));
    const cx = placement.x + w / 2, bottom = placement.y + h;
    onChange({ ...placement, scale, x: cx - DOG_HOUSE_WIDTH * scale / 2, y: bottom - DOG_HOUSE_HEIGHT * scale });
    setConfirmed(null);
  };
  const confirm = () => {
    const value = round(placement);
    const text = JSON.stringify(value);
    try { localStorage.setItem(DOG_HOUSE_PLACEMENT_KEY, text); } catch { /* still shown below */ }
    console.info('[DogHousePlacer] confirmed', text);
    setConfirmed(text);
  };

  return <>
    <GestureDetector gesture={drag}>
      <Animated.View accessibilityLabel="Drag the dog house" style={[styles.box, box]} />
    </GestureDetector>
    <View style={styles.panel}>
      <Text style={styles.title}>拖动狗窝到想要的位置</Text>
      <Text style={styles.value}>x {Math.round(placement.x)} · y {Math.round(placement.y)} · 大小 {placement.scale.toFixed(3)}</Text>
      <View style={styles.row}>
        <Button label="缩小" onPress={() => resize(1 / 1.08)} />
        <Button label="放大" onPress={() => resize(1.08)} />
        <Button label="复位" onPress={() => { onChange(initial); setConfirmed(null); }} />
        <Button label="确认位置" primary onPress={confirm} />
      </View>
      {confirmed && <Text style={styles.done}>已确认：{confirmed}</Text>}
    </View>
  </>;
}

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, primary && styles.primary]}>
    <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  box: { position: 'absolute', zIndex: 45, borderWidth: 2, borderStyle: 'dashed', borderColor: '#F4E7C4',
    borderRadius: 6, backgroundColor: 'rgba(244,231,196,0.08)', cursor: 'grab' } as never,
  panel: { position: 'absolute', zIndex: 46, top: 64, left: 12, right: 12, padding: 12, borderRadius: 10,
    backgroundColor: 'rgba(16,52,49,0.92)', gap: 6 },
  title: { color: '#FFF4DC', fontSize: 15, fontWeight: '700' },
  value: { color: '#BED2CA', fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, minWidth: 64, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, backgroundColor: '#173C39', borderWidth: 1, borderColor: '#C6A164' },
  primary: { backgroundColor: '#C6A164' },
  buttonText: { color: '#FFF4DC', fontSize: 14, fontWeight: '600' },
  primaryText: { color: '#103431' },
  done: { color: '#F4E7C4', fontSize: 13 },
});
