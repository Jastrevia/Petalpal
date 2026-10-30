import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../services/auth';
import { deviceResetSteps, finishDeviceReset, runDeviceReset, useDeviceResetResult } from '../../services/deviceReset';
import { momentLocale } from '../moments/momentFormat';

const COPY = {
  en: { reset: 'Reset this device (test build)', confirm: 'Sign out and erase everything PetalPal keeps on this phone? Entries on the server stay with the test account.',
    erase: 'Erase', cancel: 'Cancel', working: 'Erasing…', done: 'This phone is clear', close: 'Swipe PetalPal Dev away in the app switcher, then open it again for the next tester.',
    failed: 'Some data could not be erased. Delete the app from this phone before the next tester.' },
  'zh-Hans': { reset: '重置这台手机（测试版）', confirm: '退出登录并清除 PetalPal 在这台手机上的所有数据？服务器上的记录仍留在测试账号里。',
    erase: '清除', cancel: '取消', working: '正在清除…', done: '这台手机已清除', close: '请在后台划掉 PetalPal Dev，再重新打开，交给下一位测试者。',
    failed: '有些数据没有清除成功。请把 App 从手机上删除后，再交给下一位测试者。' },
} as const;
// Shown signed out too, so the device language decides when there is no account.
function useCopy() {
  const preferred = useAuth().experience?.user.preferredLocale;
  return COPY[momentLocale(preferred ?? Intl.DateTimeFormat().resolvedOptions().locale)];
}

// Only rendered in the dev variant. Asks once before erasing.
export function DeviceResetButton() {
  const { logout, session } = useAuth();
  const t = useCopy();
  const [asking, setAsking] = useState(false), [working, setWorking] = useState(false);
  async function erase() {
    setWorking(true);
    finishDeviceReset(await runDeviceReset(deviceResetSteps(logout, Boolean(session))));
  }
  if (!asking) return <Pressable accessibilityRole="button" onPress={() => setAsking(true)} style={styles.button}><Text style={styles.link}>{t.reset}</Text></Pressable>;
  return <View style={styles.ask}>
    <Text accessibilityRole="alert" style={styles.text}>{t.confirm}</Text>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" disabled={working} onPress={() => setAsking(false)} style={styles.button}><Text style={styles.link}>{t.cancel}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: working }} disabled={working} onPress={() => void erase()} style={styles.button}>
        <Text style={styles.erase}>{working ? t.working : t.erase}</Text></Pressable>
    </View>
  </View>;
}

// Covers the app once a reset has run: see services/deviceReset.ts.
export function DeviceResetDone() {
  const result = useDeviceResetResult();
  const t = useCopy();
  if (!result) return null;
  return <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
    <View style={styles.done}>
      <Text accessibilityRole="header" style={styles.title}>{result.ok ? t.done : t.failed}</Text>
      {result.ok ? <Text style={styles.body}>{t.close}</Text> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: 8 },
  ask: { gap: 6, paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  text: { fontFamily: 'serif', fontSize: 14, lineHeight: 20, color: '#254E46', textAlign: 'center' },
  link: { fontFamily: 'serif', fontSize: 14, color: '#6B543A', textDecorationLine: 'underline' },
  erase: { fontFamily: 'serif', fontSize: 14, color: '#9A3B2E', textDecorationLine: 'underline' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: '#103431' },
  title: { fontFamily: 'serif', fontSize: 22, lineHeight: 30, color: '#FFF4DC', textAlign: 'center' },
  body: { fontFamily: 'serif', fontSize: 16, lineHeight: 24, color: '#BED2CA', textAlign: 'center' },
});
