import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reloadApp } from '../../services/appReload';
import { GARDEN_ZOOM_ROW_HEIGHT, gardenZoomBottom } from './zoomPlacement';

// GardenScene's zoom row sits at left 12, 40 high, above the dock (zoomPlacement). Refresh sits above it in the
// same column: a 36-point face inside a 44-point target, with a clear 12-point gap so a zoom tap can't land on it.
const GAP = 12, TARGET = 44, FACE = 36, INSET = (TARGET - FACE) / 2;
// If the page doesn't go (a browser "Leave site?" answered Stay), the button works again after this.
const RETRY_MS = 4000;

// A plain view outside the Garden's canvas, so a sluggish Garden renderer doesn't take it down too. It shows only
// while the Garden is the screen in front: under Letters, the Pavilion or the Treehouse it is gone, not just covered.
export function GardenRefreshButton({ chinese }: { chinese: boolean }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const zoomTop = gardenZoomBottom(width, height, insets.bottom) + GARDEN_ZOOM_ROW_HEIGHT;
  const busy = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const refresh = () => {
    if (busy.current) return;
    busy.current = true; setRefreshing(true);
    timer.current = setTimeout(() => { busy.current = false; setRefreshing(false); }, RETRY_MS);
    reloadApp();
  };
  if (!focused) return null;
  return <Pressable testID="garden-refresh" accessibilityRole="button"
    accessibilityLabel={chinese ? '刷新花园' : 'Refresh Garden'} accessibilityState={{ disabled: refreshing, busy: refreshing }}
    disabled={refreshing} onPress={refresh}
    style={[styles.target, { left: insets.left + 12 - INSET, bottom: zoomTop + GAP - INSET }]}>
    {({ pressed }) => <View style={[styles.face, (pressed || refreshing) && styles.pressed]}>
      <View style={styles.icon}>
        <View style={styles.ring} />
        <View style={styles.head} />
      </View>
    </View>}
  </Pressable>;
}

const INK = '#F6EBCB';
const styles = StyleSheet.create({
  target: { position: 'absolute', width: TARGET, height: TARGET, alignItems: 'center', justifyContent: 'center', zIndex: 30 },
  face: { width: FACE, height: FACE, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2F5139F2', borderWidth: 1, borderColor: '#C6A164', boxShadow: '0 2px 6px #0B241F40' },
  pressed: { opacity: .72, transform: [{ scale: .94 }] },
  // A clockwise circular arrow drawn with views (no icon font): an open ring and its arrowhead at twelve o'clock.
  icon: { width: 16, height: 16 },
  ring: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: INK, borderTopColor: 'transparent', transform: [{ rotate: '45deg' }] },
  head: { position: 'absolute', left: 7, top: -3, width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 5,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: INK },
});
