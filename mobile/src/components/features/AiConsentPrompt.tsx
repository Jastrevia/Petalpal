import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../services/auth';
import { useAppLocale } from '../../services/locale';
import { FeatureActionButton } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';

// Asked once, when the Garden first opens for an account that has never chosen. One tap turns all of
// AI on and saves it; from then on it stays on until the owner turns it off in Me. It always says what
// is sent and to whom first: AI sends private writing to outside services, so it never turns on unseen,
// and the server still accepts a grant only with the disclosure version it was shown.
const COPY = {
  en: { title: 'Turn on PetalPal’s AI?', body: 'To suggest feelings, write your Weekly and Monthly reflections and remember your Events, the text of your Events and the moods you choose are sent to Cloudflare Workers AI and to Anthropic (through Cloudflare AI Gateway). Journals and photos are never sent.',
    note: 'You can turn it off any time in Me → AI & privacy.', on: 'Turn on AI', off: 'Not now', failed: 'That didn’t save. Please try again.' },
  'zh-Hans': { title: '开启 PetalPal 的 AI 吗？', body: '为了给出情绪建议、写周报月报和记住你的事件，你写的事件文字和选的心情会发送给 Cloudflare Workers AI 和 Anthropic（经 Cloudflare AI Gateway）。日记和照片永远不会发送。',
    note: '之后随时可以在「我 → AI 与隐私」里关闭。', on: '开启 AI', off: '先不开启', failed: '没有保存成功，请再试一次。' },
};
type Consent = { aiProcessing: boolean; createdAt?: string; updatedAt?: string };

export function AiConsentPrompt() {
  const owner = useAuth().session?.user.id;
  const copy = COPY[useAppLocale()];
  const { theme } = usePanelTheme();
  const [version, setVersion] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!owner) return;
    let active = true;
    // Any failure: no prompt now, it asks again next time. AI simply stays off.
    Promise.all([apiRequest<Consent>(`/users/${owner}/ai-consent`), apiRequest<{ version: string }>('/ai/disclosure')]).then(([consent, disclosure]) => {
      if (active && consent.createdAt && consent.createdAt === consent.updatedAt && !consent.aiProcessing) setVersion(disclosure.version);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [owner]);
  if (!version || !owner) return null;
  const save = async (on: boolean) => {
    setBusy(true); setError('');
    try {
      await apiRequest(`/users/${owner}/ai-consent`, 'PUT', { aiProcessing: on, personalization: on, memoryEnabled: on, disclosureVersion: version });
      setVersion(null);
    } catch { setError(copy.failed); } finally { setBusy(false); }
  };
  return <View testID="ai-consent-prompt" style={styles.layer}>
    <Pressable accessible={false} style={StyleSheet.absoluteFill} />
    <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
      <Text style={[styles.body, { color: theme.text }]}>{copy.body}</Text>
      <Text style={[styles.note, { color: theme.muted }]}>{copy.note}</Text>
      {error ? <Text accessibilityRole="alert" style={[styles.note, { color: theme.text }]}>{error}</Text> : null}
      <FeatureActionButton title={copy.on} disabled={busy} onPress={() => void save(true)} />
      <FeatureActionButton secondary title={copy.off} disabled={busy} onPress={() => void save(false)} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 70, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(8, 24, 22, 0.55)' },
  sheet: { width: '100%', maxWidth: 380, gap: 10, padding: 18, borderRadius: 18, borderWidth: 1 },
  title: { fontFamily: 'serif', fontSize: 19, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21 },
  note: { fontSize: 12, lineHeight: 18 },
});
