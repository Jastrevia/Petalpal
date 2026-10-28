import { usePanelTheme } from './PanelTheme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { useAuth } from '../../services/auth';
import { loadGardenPrivacy, saveGardenPrivacy } from '../../services/gardenVisits';
import { useAppLocale } from '../../services/locale';
import { FEATURE_COLORS as colors, FeatureActionButton, FeatureSection, ui } from './FeatureUI';

export function GardenPrivacySettings() {
  const { theme } = usePanelTheme();
  const { session } = useAuth();
  const ownerId = session?.user.id;
  const zh = useAppLocale() === 'zh-Hans';
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const scope = useRef({ ownerId, active: false });
  if (scope.current.ownerId !== ownerId) scope.current = { ownerId, active: false };
  const current = scope.current;
  const update = useCallback(async (value?: boolean) => {
    if (!ownerId || !current.active || scope.current !== current || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const settings = value === undefined ? await loadGardenPrivacy() : await saveGardenPrivacy(value);
      if (current.active && scope.current === current) setAllowed(settings.allowGardenVisits);
    } catch (err) {
      if (current.active && scope.current === current) setError((err as Error).message);
    } finally {
      if (current.active && scope.current === current) { lock.current = false; setBusy(false); }
    }
  }, [ownerId, current]);
  useEffect(() => {
    current.active = true; lock.current = false; setAllowed(null); setError('');
    void update();
    return () => { current.active = false; };
  }, [current, update]);

  return <FeatureSection title={zh ? '花园隐私' : 'Garden Privacy'}>
    <View style={ui.row}>
      <Text style={[ui.text, { flex: 1 }]}>{zh ? '允许朋友来逛我的花园' : 'Allow friends to visit my garden'}</Text>
      <Switch accessibilityLabel={zh ? '允许朋友来逛我的花园' : 'Allow friends to visit my garden'} value={allowed === true}
        disabled={!ownerId || allowed === null || busy} onValueChange={value => void update(value)}
        trackColor={{ true: colors.primary }} />
    </View>
    {busy ? <ActivityIndicator accessibilityLabel={zh ? '正在保存' : 'Saving Garden privacy'} color={colors.primary} /> : null}
    {error ? <><Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{error}</Text>
      <FeatureActionButton secondary title={zh ? '重新加载' : 'Reload Garden privacy'} disabled={busy} onPress={() => void update()} /></> : null}
  </FeatureSection>;
}
