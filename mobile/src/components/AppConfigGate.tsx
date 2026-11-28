import { useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateRequired, useAppConfig } from '../services/appConfig';
import { useAppLocale } from '../services/locale';

// What the server's switches look like on screen (services/appConfig.ts): an app too old to keep using
// asks for the update, a blocking maintenance notice covers the app, and a gentle one sits at the top
// until it is closed. Plain cream paper and serif words, like the loading page.
const APP_STORE_ID = '6834196797';
const COPY = {
  en: { updateTitle: 'A new PetalPal is ready', updateBody: 'This version can no longer open your garden. Please update PetalPal to keep going; your garden and everything you wrote are safe.', update: 'Update PetalPal', close: 'Close notice', maintenanceTitle: 'PetalPal is resting for a moment' },
  'zh-Hans': { updateTitle: '新版 PetalPal 已经准备好了', updateBody: '这个版本已经打不开你的花园了。请更新 PetalPal 再继续；你的花园和写下的内容都还在。', update: '更新 PetalPal', close: '关闭提示', maintenanceTitle: 'PetalPal 正在稍作休息' },
} as const;

function openStore() {
  const url = Platform.OS === 'ios' ? `itms-apps://apps.apple.com/app/id${APP_STORE_ID}`
    : `market://details?id=${Application.applicationId ?? ''}`;
  void Linking.openURL(url).catch(() => Linking.openURL(Platform.OS === 'ios'
    ? `https://apps.apple.com/app/id${APP_STORE_ID}` : `https://play.google.com/store/apps/details?id=${Application.applicationId ?? ''}`));
}

export function AppConfigGate({ children }: { children: ReactNode }) {
  const config = useAppConfig();
  const locale = useAppLocale();
  const copy = COPY[locale];
  const insets = useSafeAreaInsets();
  const [closedNotice, setClosedNotice] = useState<string | null>(null);

  if (updateRequired(config)) {
    return <View testID="app-update-required" style={[styles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{copy.updateTitle}</Text>
        <Text style={styles.body}>{copy.updateBody}</Text>
        <Pressable accessibilityRole="button" onPress={openStore} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{copy.update}</Text>
        </Pressable>
      </View>
    </View>;
  }
  const notice = config.maintenance ? config.maintenance.message[locale] : null;
  if (config.maintenance?.blocking && notice) {
    return <View testID="app-maintenance" style={[styles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>{copy.maintenanceTitle}</Text>
        <Text style={styles.body}>{notice}</Text>
      </View>
    </View>;
  }
  return <>
    {children}
    {notice && closedNotice !== notice ? <View pointerEvents="box-none" style={[styles.bannerWrap, { top: insets.top + 6 }]}>
      <View testID="app-maintenance-banner" accessibilityRole="alert" style={styles.banner}>
        <Text style={styles.bannerText}>{notice}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} hitSlop={10} onPress={() => setClosedNotice(notice)}>
          <Text style={styles.bannerClose}>✕</Text>
        </Pressable>
      </View>
    </View> : null}
  </>;
}

const GOLD = '#C8A55E';
const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6EFDF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  card: { maxWidth: 420, width: '100%', backgroundColor: '#FBF6EA', borderColor: GOLD, borderWidth: 1, borderRadius: 18, padding: 26, gap: 14, alignItems: 'center' },
  title: { fontFamily: serif, fontSize: 22, lineHeight: 30, color: '#254E43', textAlign: 'center' },
  body: { fontFamily: serif, fontSize: 15, lineHeight: 23, color: '#4F6157', textAlign: 'center' },
  button: { marginTop: 6, minHeight: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: '#3E5742', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: serif, fontSize: 16, color: '#FBF6EA' },
  pressed: { opacity: 0.8 },
  bannerWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 5000, elevation: 5000 },
  banner: { maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FBF6EAF2', borderColor: GOLD, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  bannerText: { flexShrink: 1, fontFamily: serif, fontSize: 13.5, lineHeight: 19, color: '#254E43' },
  bannerClose: { fontSize: 14, color: '#6F7F72' },
});
