import { PrivacyAndSupport } from './PrivacyAndSupport';
import { DeleteAccountSettings } from './DeleteAccountSettings';
import { AiPrivacySettings } from './AiPrivacySettings';
import { ReportLanguageSettings } from './ReportLanguageSettings';
import { CommunityGuidelines } from './CommunityGuidelines';
import { usePanelTheme, type PanelTheme } from './PanelTheme';
import { useEffect, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/auth';
import type { GARDEN_FEATURES } from '../../services/featureCatalog';
import { EventsPanel } from './EventsPanel';
import { EventIllustration } from './EventIllustration';
import { FriendsPanel } from './FriendsPanel';
import { GardenPrivacySettings } from './GardenPrivacySettings';
import { FEATURE_COLORS as colors, FeatureActionButton, FeatureSection, StatusChip, ui } from './FeatureUI';
import { AvatarPicker } from '../avatars/AvatarPicker';
import { UserAvatar } from '../avatars/UserAvatar';
import { momentLocale } from '../moments/momentFormat';
import { timezoneLabel } from '../../services/timezoneLabel';
import { subscribeUserRealtime, userRealtimeConnected } from '../../services/userRealtime';
import { useAppLocale, type AppLocale } from '../../services/locale';

type Feature = typeof GARDEN_FEATURES[number];
// Panel names in the app language (the catalog keeps the English ids).
export const FEATURE_LABELS: Record<AppLocale, Record<string, string>> = {
  en: { garden: 'Garden', events: 'Events', friends: 'Friends', fairy: 'Fairy', profile: 'Me', settings: 'Me', daily: 'Daily', visit: 'Visit', weekly: 'Weekly', monthly: 'Monthly' },
  'zh-Hans': { garden: '花园', events: '事件', friends: '朋友', fairy: '小花仙', profile: '我', settings: '我', daily: '每日', visit: '拜访', weekly: '周报', monthly: '月报' },
};
const OVERLAY_COPY = {
  en: { close: 'Close', account: 'Your account', accountText: 'Your Events and flowers are saved to your account.', accountNote: 'Signing out keeps your saved Garden safe.',
    ai: 'AI & privacy', language: 'Language', background: 'Background', light: 'Light background', signOut: 'Sign out', signingOut: 'Signing out…',
    signOutFailed: 'Unable to sign out. Please try again.', none: 'No actions are available here yet.', account404: 'PetalPal account' },
  'zh-Hans': { close: '关闭', account: '你的账号', accountText: '你的事件和花都保存在账号里。', accountNote: '退出登录后，你的花园会安全保存。',
    ai: 'AI 与隐私', language: '语言', background: '背景', light: '浅色背景', signOut: '退出登录', signingOut: '正在退出…',
    signOutFailed: '退出失败，请再试一次。', none: '这里暂时还没有可以操作的内容。', account404: 'PetalPal 账号' },
};
const messagesZh: Record<string, [string, string]> = {
  daily: ['每天开一朵花', '每日签到正在接入中。你已经种下的花会一直留在花园里。'],
  visit: ['一起去走走', '花园拜访正在接入中。你可以先照顾自己的花园。'],
  fairy: ['花园里的小伙伴', '小花仙的功能正在接入中。她会一直待在你的花园里。'],
  weekly: ['温柔回看这一周', '周报正在接入中。先继续记录生活里的小事吧。'],
  monthly: ['一个月的小花', '月报暂时还不能用。你保存的事件都还在花园里。'],
};
const messages: Record<string, [string, string]> = {
  daily: ['A moment for your daily bloom', 'Daily check-ins are being connected. Your existing flowers stay in your Garden.'],
  visit: ['A little journey, together', 'Garden visits are being connected. You can keep tending your own Garden for now.'],
  fairy: ['A companion for your Garden', 'Fairy features are being connected. Your Garden companion stays just where it belongs.'],
  weekly: ['Your week, gently reflected', 'Weekly reflections are being connected. Keep collecting your everyday moments.'],
  monthly: ['A month of little blooms', 'Monthly reflections are not available yet. Your saved Events remain in your Garden.'],
};

// Only the temporary shell owns the modal. Garden stays mounted underneath it.
export function FeatureOverlay({ feature, onClose, onGardenChanged, onOpenSettings }: {
  feature: Feature | undefined; onClose: () => void; onGardenChanged?: () => void; onOpenSettings?: () => void;
}) {
  const { theme, light } = usePanelTheme();
  const styles = createStyles(theme);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [addingFriend, setAddingFriend] = useState(false);
  const locale = useAppLocale();
  const closeLabel = OVERLAY_COPY[locale].close;
  useEffect(() => { setAddingFriend(false); }, [feature?.id]);
  if (!feature) return null;
  const title = FEATURE_LABELS[locale][feature.id] ?? feature.label;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      {/* A tap anywhere around the panel closes it, like the × does. */}
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View accessibilityViewIsModal accessibilityLabel={title}
        style={[styles.panel, feature.id === 'friends' && styles.friendsPanel, feature.id === 'events' && styles.eventsPanel, feature.id === 'friends' && light && styles.friendsLightPanel, { width: Math.min(feature.id === 'events' ? 680 : 440, width - 24), maxHeight: Math.max(180, height - insets.top - insets.bottom - 24) }]}>
        {feature.id !== 'friends' ? <><View style={styles.accent}><View style={[styles.tealAccent, feature.id === 'events' && styles.eventsAccent]} /><View style={[styles.purpleAccent, feature.id === 'events' && styles.eventsGold]} /></View>
        <View style={[styles.header, feature.id === 'events' && styles.eventsHeader]}>
          {feature.id === 'events' ? <EventIllustration index={0} size={width > 600 ? 82 : 52} /> : <View style={styles.icon}><SymbolView name={feature.icon} size={25} tintColor={colors.ink} /></View>}
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={[ui.title, { color: theme.text }, feature.id === 'events' && styles.eventsTitle]}>{title}</Text>
            {feature.id === 'events' || feature.id === 'profile' || feature.id === 'settings' ? null : <StatusChip status={feature.status} />}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose}
            style={({ pressed }) => [styles.close, feature.id === 'events' && styles.eventsClose, pressed && ui.pressed]}>
            <Text style={[styles.closeText, feature.id === 'events' && { color: '#FFF6DF' }]}>×</Text>
          </Pressable>
        </View>
        </> : null}
        <ScrollView style={[styles.scroll, feature.id === 'events' && styles.eventsScroll]} contentContainerStyle={[styles.content, feature.id === 'events' && styles.eventsContent]} keyboardShouldPersistTaps="handled">
          <FeatureContent key={feature.id} feature={feature} onClose={onClose} onGardenChanged={onGardenChanged} onOpenSettings={onOpenSettings}
            addingFriend={addingFriend} onAddFriend={() => setAddingFriend(true)} onCloseAddFriend={() => setAddingFriend(false)} />
        </ScrollView>
        {feature.id === 'friends' ? <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose}
          style={({ pressed }) => [styles.close, styles.floatingClose, pressed && ui.pressed]}>
          <Text style={styles.closeText}>×</Text>
        </Pressable> : null}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function FeatureContent({ feature, onClose, onGardenChanged, onOpenSettings, addingFriend, onAddFriend, onCloseAddFriend }: {
  feature: Feature; onClose: () => void; onGardenChanged?: () => void; onOpenSettings?: () => void;
  addingFriend?: boolean; onAddFriend?: () => void; onCloseAddFriend?: () => void;
}) {
  const { theme, light, loading, error: themeError, setLight } = usePanelTheme();
  const styles = createStyles(theme);
  const { session, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locale = useAppLocale();
  const copy = OVERLAY_COPY[locale];
  if (feature.id === 'events') return <EventsPanel onClose={onClose} onGardenChanged={onGardenChanged} />;
  if (feature.id === 'friends') return <FriendsPanel key={session?.user.id} addingFriend={addingFriend}
    onAddFriend={onAddFriend} onCloseAddFriend={onCloseAddFriend} onClose={onClose} />;
  // Me: the profile and every setting on one page (no separate Settings step).
  if (feature.id === 'profile' || feature.id === 'settings') return <View style={ui.body}>
    <ProfileHero theme={theme} />
    <FeatureSection title={copy.language}>
      <ReportLanguageSettings key={session?.user.id} />
    </FeatureSection>
    <FeatureSection title={copy.ai}>
      <AiPrivacySettings key={session?.user.id} />
    </FeatureSection>
    <FeatureSection title={copy.background}>
      <View style={ui.row}>
        <Text style={[ui.text, { color: theme.text, flex: 1 }]}>{copy.light}</Text>
        <Switch accessibilityLabel={copy.light} value={light} disabled={loading}
          onValueChange={value => void setLight(value)} trackColor={{ false: '#64776E', true: '#5AA4AB' }} />
      </View>
      {themeError ? <Text accessibilityRole="alert" style={[ui.caption, { color: theme.text }]}>{themeError}</Text> : null}
    </FeatureSection>
    <GardenPrivacySettings key={session?.user.id} />
    <FeatureSection title={copy.account}>
      <Text style={[ui.text, { color: theme.text }]}>{copy.accountText}</Text>
      <Text style={[ui.caption, { color: theme.muted }]}>{copy.accountNote}</Text>
    </FeatureSection>
    <PrivacyAndSupport />
    <CommunityGuidelines />
    <DeleteAccountSettings key={`delete-${session?.user.id}`} />
    {error ? <Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{error}</Text> : null}
    <FeatureActionButton title={busy ? copy.signingOut : copy.signOut} disabled={busy} onPress={async () => {
      setBusy(true); setError('');
      try { await logout(); onClose(); }
      catch { setError(copy.signOutFailed); }
      finally { setBusy(false); }
    }} />
  </View>;
  const message = (locale === 'zh-Hans' ? messagesZh : messages)[feature.id]
    || (locale === 'zh-Hans' ? ['花园里的新角落', '这个功能暂时还不能用。'] : ['A new corner of your Garden', 'This feature is not available yet.']);
  return <View style={styles.empty}>
    <View style={styles.orbit}>
      <View style={styles.orbitDot} />
      <SymbolView name={feature.icon} size={42} tintColor={colors.ink} />
    </View>
    <Text style={[ui.title, { color: theme.text }, styles.center]}>{message[0]}</Text>
    <Text style={[ui.text, { color: theme.text }, styles.center]}>{message[1]}</Text>
    <Text style={[ui.caption, { color: theme.text }, styles.center]}>{copy.none}</Text>
  </View>;
}

const PROFILE_COPY = {
  en: { change: 'Change avatar', title: 'Choose your avatar', option: (n: number) => `Avatar ${n}`, close: 'Close',
    failed: 'Your avatar was not saved. Please try again.', beta: 'Beta tester', betaHint: 'One of the first to grow a PetalPal garden',
    online: 'Online', offline: 'Offline' },
  'zh-Hans': { change: '更换头像', title: '选择你的头像', option: (n: number) => `头像 ${n}`, close: '关闭',
    failed: '头像没有保存成功，请再试一次。', beta: '内测用户', betaHint: '最早种下 PetalPal 花园的人之一',
    online: '在线', offline: '离线' },
};

// Your avatar (tap to choose from the avatar library), name and time zone.
function ProfileHero({ theme }: { theme: PanelTheme }) {
  const styles = createStyles(theme);
  const { session, experience, updateAvatar } = useAuth();
  const profile = experience?.user || session?.user;
  const locale = momentLocale(experience?.user.preferredLocale);
  const copy = PROFILE_COPY[locale];
  const [choosing, setChoosing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  // Online is what friends see: this device's live connection to the owner's user room.
  const [online, setOnline] = useState(userRealtimeConnected());
  useEffect(() => subscribeUserRealtime({ connection: setOnline }), []);
  async function choose(avatar: string | null) {
    if (!avatar || saving) return;
    if (avatar === profile?.avatar) { setChoosing(false); return; }
    setSaving(true); setError('');
    try { await updateAvatar(avatar); setChoosing(false); }
    catch { setError(copy.failed); }
    finally { setSaving(false); }
  }
  return <View style={styles.profileHero}>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.change} disabled={!profile}
      onPress={() => { setError(''); setChoosing(true); }} style={({ pressed }) => [pressed && ui.pressed]}>
      <UserAvatar avatar={profile?.avatar} size={76} style={styles.avatar} fallback="○" />
      <View style={styles.avatarEdit}><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={13} tintColor={colors.ink} /></View>
      <View testID="profile-presence-dot" style={[styles.presenceDot, { backgroundColor: online ? '#7FB77E' : '#9AA79F' }]} />
    </Pressable>
    <Text style={[ui.title, { color: theme.text }]}>{profile?.name || OVERLAY_COPY[locale].account404}</Text>
    <Text testID="profile-presence" style={[ui.caption, { color: online ? '#4F8A4E' : theme.muted }]}>{online ? '● ' : '○ '}{online ? copy.online : copy.offline}</Text>
    {experience?.user.betaTester ? <View accessibilityLabel={`${copy.beta}. ${copy.betaHint}`} style={styles.betaBadge}>
      <Text style={styles.betaText}>✿ {copy.beta}</Text></View> : null}
    <Text style={[ui.caption, { color: theme.muted }]}>{timezoneLabel(profile?.timezone, locale)}</Text>
    <AvatarPicker visible={choosing} title={copy.title} selected={profile?.avatar} busy={saving} error={error}
      closeLabel={copy.close} optionLabel={copy.option} onSelect={avatar => void choose(avatar)} onClose={() => setChoosing(false)} />
  </View>;
}

const createStyles = (theme: PanelTheme) => StyleSheet.create({
  eventsPanel: { padding: 9, backgroundColor: '#528F83', borderColor: '#D4BD85', borderWidth: 2, borderRadius: 32, boxShadow: 'inset 0 0 0 2px #A5C6AC, 0 12px 30px #163D4050' },
  eventsHeader: { backgroundColor: theme.background, borderBottomWidth: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 14, paddingVertical: 12 },
  eventsTitle: { fontFamily: 'serif', fontSize: 27, fontWeight: '600', color: theme.text },
  eventsClose: { backgroundColor: '#286F70', borderRadius: 24, borderWidth: 2, borderColor: '#CBB27C', boxShadow: 'inset 0 0 0 2px #9DBFAB' },
  eventsAccent: { backgroundColor: '#528F83' }, eventsGold: { backgroundColor: '#528F83' },
  eventsScroll: { backgroundColor: theme.background },
  eventsContent: { padding: 16, paddingTop: 4 },
  friendsLightPanel: { borderRadius: 32, borderColor: theme.gold, boxShadow: `inset 0 0 0 2px ${theme.inset}, 0 12px 30px #163D4050` },
  friendsPanel: { backgroundColor: theme.background, borderColor: '#C6A164', borderWidth: 2, borderRadius: 24, boxShadow: 'inset 0 0 0 4px #244E45, 0 14px 48px #001F2860' },
  floatingClose: { position: 'absolute', top: 12, right: 12, zIndex: 2, borderWidth: 1, borderColor: theme.gold },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  backdrop: { backgroundColor: '#00000045' },
  panel: { flexShrink: 1, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: '#5AA4AB70',
    backgroundColor: theme.background, boxShadow: '0 14px 48px rgba(37,60,64,0.2)', elevation: 12 },
  accent: { height: 4, flexDirection: 'row' },
  tealAccent: { flex: 2, backgroundColor: colors.primary }, purpleAccent: { flex: 1, backgroundColor: colors.secondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderBottomWidth: 1, borderColor: colors.line },
  icon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealWash },
  heading: { flex: 1, gap: 8 },
  close: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleWash },
  closeText: { fontSize: 28, lineHeight: 32, color: theme.text },
  scroll: { flexShrink: 1 }, content: { padding: 20 },
  empty: { alignItems: 'center', paddingVertical: 22, gap: 18 },
  center: { textAlign: 'center' },
  orbit: { width: 96, height: 96, borderRadius: 36, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.tealWash, borderWidth: 1, borderColor: colors.line },
  orbitDot: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.secondary },
  profileHero: { alignItems: 'center', gap: 10 },
  betaBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: '#C9A95C', backgroundColor: '#F6EBCB' },
  betaText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, color: '#7A5A1E' },
  avatar: { backgroundColor: colors.purpleWash, borderWidth: 2, borderColor: colors.secondary },
  avatarEdit: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.tealWash, borderWidth: 1, borderColor: colors.line },
  presenceDot: { position: 'absolute', right: 2, top: 2, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: theme.background },
});
