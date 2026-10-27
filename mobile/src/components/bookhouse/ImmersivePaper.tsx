import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const serif = Platform.select({ ios: 'Georgia', default: 'serif' });

// The journal lifted off the desk: the page rises and grows until it fills the screen, so a
// journal is read and written on one tall sheet instead of many tiny book pages.
export function ImmersivePaper({ title, subtitle, onClose, closeLabel = 'Close', night, children, footer }: {
  title: string; subtitle?: string; onClose: () => void; closeLabel?: string; night?: boolean;
  children: ReactNode; footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!active) return;
      Animated.timing(rise, { toValue: 1, duration: reduced ? 0 : 520, easing: Easing.out(Easing.back(1.2)), useNativeDriver: Platform.OS !== 'web' }).start();
    }).catch(() => rise.setValue(1));
    return () => { active = false; rise.stopAnimation(); };
  }, [rise]);
  return <Modal transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <Animated.View style={[styles.scrim, { opacity: rise.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
      paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Animated.View testID="immersive-journal" style={[styles.paper, night && styles.paperNight, {
        transform: [
          { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [140, 0] }) },
          { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [.55, 1] }) },
        ] }]}>
        <View pointerEvents="none" style={styles.edge} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} hitSlop={8} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.body}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View>
    </Animated.View>
  </Modal>;
}

export const immersiveText = { fontFamily: serif, fontSize: 18, lineHeight: 30, color: '#4B3A27' } as const;

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#1E150FD9', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  paper: { flex: 1, width: '100%', maxWidth: 680, maxHeight: 980, borderRadius: 14, backgroundColor: '#F4E5C3', overflow: 'hidden',
    borderWidth: 1, borderColor: '#C9A86F', shadowColor: '#120904', shadowOpacity: .55, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 18 },
  paperNight: { backgroundColor: '#E8CF9F' },
  edge: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, margin: 8, borderRadius: 10, borderWidth: 1, borderColor: '#D8BF8E' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 12,
    borderBottomWidth: 1, borderColor: '#D2B88A', marginHorizontal: 8 },
  title: { fontFamily: serif, fontSize: 24, fontStyle: 'italic', color: '#4A5947' },
  subtitle: { fontFamily: serif, fontSize: 13, color: '#7A6448', marginTop: 2 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9D4AA' },
  closeText: { fontSize: 18, color: '#5B3F26' },
  body: { flex: 1, minHeight: 0, paddingHorizontal: 26, paddingTop: 14 },
  footer: { paddingHorizontal: 26, paddingTop: 10, paddingBottom: 22, gap: 10, borderTopWidth: 1, borderColor: '#D2B88A', marginHorizontal: 8 },
});
