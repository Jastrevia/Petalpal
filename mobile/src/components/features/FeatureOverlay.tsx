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

type Feature = typeof GARDEN_FEATURES[number];
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
  useEffect(() => { setAddingFriend(false); }, [feature?.id]);
  if (!feature) return null;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View accessibilityViewIsModal accessibilityLabel={`${feature.label} panel`}
        style={[styles.panel, feature.id === 'friends' && styles.friendsPanel, feature.id === 'events' && styles.eventsPanel, feature.id === 'friends' && light && styles.friendsLightPanel, { width: Math.min(feature.id === 'events' ? 680 : 440, width - 24), maxHeight: Math.max(180, height - insets.top - insets.bottom - 24) }]}>
        {feature.id !== 'friends' ? <><View style={styles.accent}><View style={[styles.tealAccent, feature.id === 'events' && styles.eventsAccent]} /><View style={[styles.purpleAccent, feature.id === 'events' && styles.eventsGold]} /></View>
        <View style={[styles.header, feature.id === 'events' && styles.eventsHeader]}>
          {feature.id === 'events' ? <EventIllustration index={0} size={width > 600 ? 82 : 52} /> : <View style={styles.icon}><SymbolView name={feature.icon} size={25} tintColor={colors.ink} /></View>}
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={[ui.title, { color: theme.text }, feature.id === 'events' && styles.eventsTitle]}>{feature.label}</Text>
            <StatusChip status={feature.status} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Close ${feature.label}`} onPress={onClose}
            style={({ pressed }) => [styles.close, feature.id === 'events' && styles.eventsClose, pressed && ui.pressed]}>
            <Text style={[styles.closeText, feature.id === 'events' && { color: '#FFF6DF' }]}>×</Text>
          </Pressable>
        </View>
        </> : null}
        <ScrollView style={[styles.scroll, feature.id === 'events' && styles.eventsScroll]} contentContainerStyle={[styles.content, feature.id === 'events' && styles.eventsContent]} keyboardShouldPersistTaps="handled">
          <FeatureContent key={feature.id} feature={feature} onClose={onClose} onGardenChanged={onGardenChanged} onOpenSettings={onOpenSettings}
            addingFriend={addingFriend} onAddFriend={() => setAddingFriend(true)} onCloseAddFriend={() => setAddingFriend(false)} />
        </ScrollView>
        <View style={[styles.footer, feature.id === 'friends' && styles.friendsFooter, feature.id === 'events' && styles.eventsFooter, feature.id === 'friends' && light && styles.eventsFooter]}>
          <View style={styles.footerIcon}><SymbolView name={{ ios: 'leaf.fill', android: 'local_florist', web: 'local_florist' }} size={23} tintColor={colors.ink} /></View>
          <View style={{ flex: 1 }}>{(feature.id === 'friends' || feature.id === 'events')
            ? <Pressable accessibilityRole="button" accessibilityLabel="Return to Garden" onPress={onClose}
                style={({ pressed }) => [styles.friendsReturn, pressed && ui.pressed]}>
                <Text style={styles.friendsReturnText}>Return to Garden  ›</Text>
              </Pressable>
            : <FeatureActionButton title="Return to Garden" onPress={onClose} />}</View>
        </View>
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
  if (feature.id === 'events') return <EventsPanel onClose={onClose} onGardenChanged={onGardenChanged} />;
  if (feature.id === 'friends') return <FriendsPanel key={session?.user.id} addingFriend={addingFriend}
    onAddFriend={onAddFriend} onCloseAddFriend={onCloseAddFriend} onClose={onClose} />;
  if (feature.id === 'profile' || feature.id === 'settings') return <View style={ui.body}>
    <ProfileHero theme={theme} />
    {feature.id === 'profile' ? <FeatureSection title="Your Garden profile">
      <Text style={[ui.text, { color: theme.text }]}>Tap your avatar to choose a new one from the avatar library. Name editing will be connected later.</Text>
      <Text style={[ui.caption, { color: theme.muted }]}>Synced from your account</Text>
      {onOpenSettings ? <FeatureActionButton title="Settings" onPress={onOpenSettings} /> : null}
    </FeatureSection> : <>
      <FeatureSection title="Your account">
        <Text style={[ui.text, { color: theme.text }]}>Your Events and flowers are saved to your account.</Text>
        <Text style={[ui.caption, { color: theme.muted }]}>Signing out keeps your saved Garden safe.</Text>
      </FeatureSection>
      <FeatureSection title="AI & privacy">
        <AiPrivacySettings key={session?.user.id} />
      </FeatureSection>
      <FeatureSection title="Report language">
        <ReportLanguageSettings key={session?.user.id} />
      </FeatureSection>
      <FeatureSection title="Background">
        <View style={ui.row}>
          <Text style={[ui.text, { color: theme.text, flex: 1 }]}>Light background</Text>
          <Switch accessibilityLabel="Light background" value={light} disabled={loading}
            onValueChange={value => void setLight(value)} trackColor={{ false: '#64776E', true: '#5AA4AB' }} />
        </View>
        {themeError ? <Text accessibilityRole="alert" style={[ui.caption, { color: theme.text }]}>{themeError}</Text> : null}
      </FeatureSection>
      <PrivacyAndSupport />
      <CommunityGuidelines />
      <GardenPrivacySettings key={session?.user.id} />
      <DeleteAccountSettings key={`delete-${session?.user.id}`} />
      {error ? <Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{error}</Text> : null}
      <FeatureActionButton title={busy ? 'Signing out…' : 'Sign out'} disabled={busy} onPress={async () => {
        setBusy(true); setError('');
        try { await logout(); onClose(); }
        catch { setError('Unable to sign out. Please try again.'); }
        finally { setBusy(false); }
      }} />
    </>}
  </View>;
  const message = messages[feature.id] || ['A new corner of your Garden', 'This feature is not available yet.'];
  return <View style={styles.empty}>
    <View style={styles.orbit}>
      <View style={styles.orbitDot} />
      <SymbolView name={feature.icon} size={42} tintColor={colors.ink} />
    </View>
    <Text style={[ui.title, { color: theme.text }, styles.center]}>{message[0]}</Text>
    <Text style={[ui.text, { color: theme.text }, styles.center]}>{message[1]}</Text>
    <Text style={[ui.caption, { color: theme.text }, styles.center]}>No actions are available here yet.</Text>
  </View>;
}

const PROFILE_COPY = {
  en: { change: 'Change avatar', title: 'Choose your avatar', option: (n: number) => `Avatar ${n}`, close: 'Close',
    failed: 'Your avatar was not saved. Please try again.', beta: 'Beta tester', betaHint: 'One of the first to grow a PetalPal garden' },
  'zh-Hans': { change: '更换头像', title: '选择你的头像', option: (n: number) => `头像 ${n}`, close: '关闭',
    failed: '头像没有保存成功，请再试一次。', beta: '内测用户', betaHint: '最早种下 PetalPal 花园的人之一' },
};

// Your avatar (tap to choose from the avatar library), name and time zone.
function ProfileHero({ theme }: { theme: PanelTheme }) {
  const styles = createStyles(theme);
  const { session, experience, updateAvatar } = useAuth();
  const profile = experience?.user || session?.user;
  const locale = momentLocale(experience?.user.preferredLocale);
  const copy = PROFILE_COPY[locale];
  const [choosing, setChoosing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
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
    </Pressable>
    <Text style={[ui.title, { color: theme.text }]}>{profile?.name || 'PetalPal account'}</Text>
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
  eventsFooter: { margin: 0, borderRadius: 24, backgroundColor: '#F6F3E5', borderWidth: 2, borderColor: '#D0B781', boxShadow: 'inset 0 0 0 3px #FFFFF5', padding: 6 },
  friendsLightPanel: { borderRadius: 32, borderColor: theme.gold, boxShadow: `inset 0 0 0 2px ${theme.inset}, 0 12px 30px #163D4050` },
  friendsPanel: { backgroundColor: theme.background, borderColor: '#C6A164', borderWidth: 2, borderRadius: 24, boxShadow: 'inset 0 0 0 4px #244E45, 0 14px 48px #001F2860' },
  friendsReturn: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  friendsReturnText: { fontFamily: 'serif', fontSize: 20, color: '#193F39' },
  friendsFooter: { backgroundColor: '#E9E4D0', borderWidth: 1, borderColor: '#CCA76B' },
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
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, marginTop: 0,
    padding: 10, borderRadius: 20, backgroundColor: colors.purpleWash },
  footerIcon: { width: 40, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealWash },
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
});
