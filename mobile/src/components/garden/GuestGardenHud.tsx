import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GARDEN_FEATURES } from '../../services/featureCatalog';
import { usePanelTheme } from '../features/PanelTheme';
import { FEATURE_LABELS } from '../features/FeatureOverlay';
import { momentLocale } from '../moments/momentFormat';
import { SidebarIllustration } from './SidebarIllustration';
import { usePlanting } from './planting/PlantingContext';

// Guest mode's navigation (services/guest.tsx): the same bottom bar as GardenHud, without any server reads. The
// Fairy item finds her; every other item asks for an account. A quiet "create account" link sits at the top.
export function GuestGardenHud({ onFocusFairy, onAccount }: { onFocusFairy: () => void; onAccount: () => void }) {
  const insets = useSafeAreaInsets();
  const { theme, light } = usePanelTheme();
  const { width, height } = useWindowDimensions();
  const { activeMode, selectedFlower } = usePlanting();
  const [highlighted, setHighlighted] = useState<string>();
  // No account yet, so the device language decides (English or Simplified Chinese).
  const locale = momentLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  const chinese = locale === 'zh-Hans';
  const phone = width < 600 || (width < 900 && height < 500);
  const iconSize = phone ? Math.max(28, Math.min(height < 500 ? 30 : 38, (width - insets.left - insets.right) / 10)) : 42;
  if (activeMode !== 'normal' || selectedFlower) return null;
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onAccount}
      style={({ pressed }) => [styles.account, { top: insets.top + 10, right: insets.right + 12, backgroundColor: theme.background, borderColor: theme.gold }, pressed && styles.pressed]}>
      <Text style={[styles.accountText, { color: theme.text }]}>{chinese ? '创建账号 / 登录' : 'Create account / Sign in'}</Text>
    </Pressable>
    <View testID="guest-navigation" style={[styles.bottomBar, {
      width: Math.min(phone ? 460 : Math.max(380, Math.min(460, width * .36)), width - insets.left - insets.right - 40),
      bottom: insets.bottom + (phone ? 8 : 24), padding: phone ? 3 : 4, gap: phone ? 3 : 5,
      borderRadius: phone ? 24 : 26, backgroundColor: theme.background, borderColor: theme.gold,
    }]}>
      {GARDEN_FEATURES.filter(feature => ['events', 'friends', 'fairy', 'profile'].includes(feature.id)).map(feature => {
        const label = FEATURE_LABELS[locale][feature.id] ?? feature.label, on = highlighted === feature.id;
        return <Pressable key={feature.id} accessibilityRole="button" accessibilityLabel={label}
          onHoverIn={() => setHighlighted(feature.id)} onHoverOut={() => setHighlighted(undefined)}
          onPress={() => feature.id === 'fairy' ? onFocusFairy() : onAccount()}
          style={({ pressed }) => [styles.bottomItem, on && { backgroundColor: light ? '#D6E5DCD9' : theme.input, borderColor: theme.gold }, pressed && styles.pressed]}>
          <SidebarIllustration id={feature.id} size={iconSize} active={on} />
          <Text numberOfLines={1} style={[styles.bottomLabel, { fontSize: phone ? 13 : 15, color: theme.text }]}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { zIndex: 40 },
  account: { position: 'absolute', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, borderWidth: 1 },
  accountText: { fontFamily: 'serif', fontSize: 14 },
  bottomBar: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', borderWidth: 1, boxShadow: '0 3px 12px #163D4020' },
  bottomItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 21, padding: 2, minHeight: 52, borderWidth: 1, borderColor: 'transparent' },
  bottomLabel: { fontFamily: 'serif', lineHeight: 17 },
  pressed: { opacity: .7, transform: [{ scale: .96 }] },
});
