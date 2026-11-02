import { PrivacyLinks } from './features/PrivacyAndSupport';
import { COMMUNITY_VERSION, COMMUNITY_TEXT } from './features/CommunityGuidelines';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Fonts, Spacing } from '../constants/theme';
import { useAuth, type EmailToConnect } from '../services/auth';
import { ConnectEmailScreen } from './features/AccountRecovery';
import { LoginPreviewPage } from './auth/LoginPreviewPage';
import { AVATAR_IDS, DEFAULT_AVATAR } from './avatars/avatarArt';
import { UserAvatar } from './avatars/UserAvatar';
import { rememberDisplayLocale, WakingFlowerFacts } from './loading/WakingFlowerFacts';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuestContext, type Guest } from '../services/guest';
import { devVariant } from '../services/deviceReset';
import { DeviceResetButton } from './features/DeviceReset';

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'signIn' | 'register'>('register');
  const [name, setName] = useState('');
  const [connect, setConnect] = useState<EmailToConnect | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [communityAccepted,setCommunityAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  // Sign-in from the invitation page keeps that page on screen while the account opens.
  const [invitationSignIn, setInvitationSignIn] = useState(false);
  const busy = useRef(false);
  // Guest mode: signed out, the Garden opens first; the sign-in / create-account pages show only once the guest
  // reaches something that needs an account (or taps a nav item), with a way back to the Garden.
  const [accountScreen, setAccountScreen] = useState(false);
  const guest = useRef<Guest>({ requestAccount: () => setAccountScreen(true) }).current;
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  useEffect(() => {
    setName(''); setConnect(null); setConnecting(false);
    setAvatar(DEFAULT_AVATAR); setCommunityAccepted(false); setMode('register');
  }, [auth.identity?.uid]);
  useEffect(() => {
    if (!auth.loading) void SplashScreen.hideAsync().catch(() => {});
  }, [auth.loading]);
  const signedInLocale = auth.experience?.user.preferredLocale;
  useEffect(() => { if (signedInLocale) rememberDisplayLocale(signedInLocale); }, [signedInLocale]);
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setWorking(true);
    try { await action(); }
    finally { busy.current = false; setWorking(false); }
  }
  const button = (label: string, action: () => Promise<void>, disabled = false, secondary = false) =>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: working || disabled }}
      disabled={working || disabled} onPress={() => void run(action)}
      style={[styles.button, secondary && styles.secondaryButton, (working || disabled) && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>;

  if (auth.phase === 'signedIn' && auth.session) return <>{children}</>;
  const guestMode = auth.phase === 'signedOut' && !auth.loading && !(auth.identity && auth.error);
  // From guest mode the account pages lie over the Garden, which stays loaded underneath for the way back (the tree
  // around `children` is the same with or without the page, so React keeps the Garden mounted).
  const overGarden = (page: ReactNode) => guestMode ? <GuestContext.Provider value={guest}><View style={{ flex: 1 }}>
    {children}{page ? <View style={StyleSheet.absoluteFill}>{page}</View> : null}</View></GuestContext.Provider> : page;
  if (guestMode && !accountScreen) return overGarden(null);
  // Only while signing in or creating an account from guest mode; the profile step of an existing identity keeps the card.
  const backToGarden = mode === 'signIn' || mode === 'register' ? (auth.phase === 'signedOut' && !working ? <Pressable accessibilityRole="button"
    accessibilityLabel="Back to the Garden" hitSlop={12} onPress={() => { setAccountScreen(false); setMode('register'); if (pathname !== '/') router.replace('/'); }}
    style={[styles.backToGarden, { top: insets.top + 10, left: insets.left + 12 }]}>
    <Text style={styles.backToGardenText}>‹ {/^zh/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? '回到花园' : 'Back to the Garden'}</Text>
  </Pressable> : null) : null;
  // Signed out, the name and avatar card below comes first; the invitation card is for coming back to an account.
  if (mode === 'signIn' && (auth.phase === 'signedOut' || (invitationSignIn && auth.loading)) && !(auth.identity && auth.error)) {
    return overGarden(<View style={{ flex: 1 }}><LoginPreviewPage onCreateAccount={() => setMode('register')}
      onSignIn={async (login, secret) => {
        setInvitationSignIn(true);
        try { await auth.login(login, secret); } finally { setInvitationSignIn(false); }
      }}
      onForgotPassword={auth.resetPassword}
      authError={auth.error} authMessage={auth.message} footer={<><PrivacyLinks />{devVariant ? <DeviceResetButton /> : null}</>} />{backToGarden}</View>);
  }
  if (auth.loading) return <View style={styles.loading}>
    <ActivityIndicator color="#365b42" accessibilityLabel="Loading session" />
    <Text style={styles.body}>{auth.phase === 'registering' ? 'Creating your account…' : 'Opening PetalPal…'}</Text>
    {auth.phase === 'registering' ? null : <WakingFlowerFacts />}
  </View>;
  const profile = auth.phase === 'profileRequired';
  // An identity that never finished signing in still has this page to finish on; only without one can a session be retried.
  const retry = auth.identity && auth.error && !profile;
  const zh = /^zh/i.test(Intl.DateTimeFormat().resolvedOptions().locale);
  const copy = zh ? COPY.zh : COPY.en;
  const details = { name, avatar, aiConsent: false, communityTermsVersion: communityAccepted ? COMMUNITY_VERSION : undefined };
  if (connecting) return overGarden(<ConnectEmailScreen chinese={zh} initial={connect} onClose={() => setConnecting(false)}
    onSave={(details) => { setConnect(details); setConnecting(false); }}
    onSignIn={auth.phase === 'signedOut' ? () => { setConnecting(false); setMode('signIn'); } : undefined} />);
  return overGarden(<KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {/* The corner buttons float above: the card starts below them, however tall it is. */}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, { paddingTop: insets.top + 64 }]}>
      <View style={styles.card} testID="auth-card">
        <Text style={styles.brand}>PetalPal</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        {retry ? button(zh ? '重试' : 'Retry session', auth.retry, false, true) : <>
          <View style={styles.field}>
            <Text style={styles.label}>{copy.name}</Text>
            <TextInput accessibilityLabel={copy.name} placeholderTextColor="#7a887b" editable={!working} style={styles.input}
              value={name} onChangeText={setName} maxLength={80} autoComplete="username-new" autoCapitalize="words" autoCorrect={false} />
            <Text style={styles.hint}>{copy.nameHint}</Text>
          </View>
          <Text style={styles.label}>{copy.avatar}</Text>
          <View style={styles.avatars}>{AVATAR_IDS.map((choice, index) => <Pressable key={choice}
            accessibilityRole="radio" accessibilityLabel={`Avatar ${index + 1}`}
            accessibilityState={{ selected: avatar === choice }} disabled={working} onPress={() => setAvatar(choice)}
            style={[styles.avatar, avatar === choice && styles.selected]}><UserAvatar avatar={choice} size={52} /></Pressable>)}</View>
          <Text style={styles.body}>{COMMUNITY_TEXT}</Text>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Accept Community Guidelines" accessibilityState={{checked:communityAccepted}} disabled={working} onPress={()=>setCommunityAccepted(!communityAccepted)} style={styles.consent}>
            <Text style={styles.label}>{communityAccepted ? '☑' : '☐'} {copy.accept}</Text>
          </Pressable>
          <Text style={styles.hint}>{copy.keepsake}</Text>
          <Text style={styles.hint}>{copy.ai}</Text>
          {button(working ? copy.saving : copy.go, () => profile ? auth.completeProfile(details, connect) : auth.register(details, connect), !name.trim() || !communityAccepted)}
          {profile ? button(copy.other, auth.logout, false, true) : <Pressable accessibilityRole="button" disabled={working} onPress={() => setMode('signIn')} style={styles.switchMode}>
            <Text style={styles.link}>{copy.signIn}</Text>
          </Pressable>}
        </>}
        {auth.message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{auth.message}</Text> : null}
        {auth.error ? <Text accessibilityRole="alert" style={styles.error}>{auth.error}</Text> : null}
        <PrivacyLinks />
      </View>
    </ScrollView>
    {backToGarden}
    {retry || auth.identity?.email ? null : <Pressable accessibilityRole="button" accessibilityLabel={connect ? connect.email : copy.connect} hitSlop={8}
      disabled={working} onPress={() => setConnecting(true)} style={[styles.connect, { top: insets.top + 10, right: insets.right + 12 }]}>
      <Text numberOfLines={1} style={styles.backToGardenText}>{connect ? `✓ ${connect.email}` : copy.connect}</Text>
    </Pressable>}
  </KeyboardAvoidingView>);
}

const COPY = {
  en: { title: 'Welcome to your garden', body: 'Choose a name and an avatar. That’s all it takes.', name: 'Your name',
    nameHint: 'Nobody else can have this name. You’ll use it to sign in.', avatar: 'Garden avatar', accept: 'I accept the Community Guidelines',
    keepsake: 'Your Garden lives on this phone’s sign-in. After you plant your first flower, set a password so you can come back on another phone.',
    ai: 'AI stays off until you agree: we ask once when your Garden opens, and you can turn it off in Settings. You can journal without AI.',
    saving: 'Saving…', go: 'Continue to PetalPal', other: 'Use another account', signIn: 'Already have an account? Sign in', connect: 'Connect to your email?' },
  zh: { title: '欢迎来到你的花园', body: '起个名字，选个头像，就可以开始了。', name: '你的名字',
    nameHint: '这个名字只属于你，之后也可以用它登录。', avatar: '花园头像', accept: '我接受社区准则',
    keepsake: '花园现在跟着这台手机的登录走。种下第一朵花后，记得设一个密码，换手机也能回来。',
    ai: '在你同意之前 AI 都是关闭的：花园打开时会问你一次，之后也可以在设置里关闭。不用 AI 也能写日记。',
    saving: '正在保存…', go: '进入 PetalPal', other: '换一个账号', signIn: '已有账号？去登录', connect: '连接你的邮箱？' },
};

const styles = StyleSheet.create({
  backToGarden: { position: 'absolute', zIndex: 50, minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#FAF5E8E6', borderWidth: 1, borderColor: '#C6A164' },
  connect: { position: 'absolute', zIndex: 50, minHeight: 44, maxWidth: '62%', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#FAF5E8E6', borderWidth: 1, borderColor: '#C6A164' },
  backToGardenText: { fontFamily: 'serif', fontSize: 15, color: '#254E46' },
  root: { flex: 1, backgroundColor: '#eff4e9' },
  loading: { flex: 1, backgroundColor: '#eff4e9', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingHorizontal: 16 },
  page: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  card: { width: '100%', maxWidth: 440, backgroundColor: '#fbfcf6', borderRadius: 24,
    padding: Spacing.four, gap: Spacing.three, borderWidth: 1, borderColor: '#c8d6c1' },
  brand: { color: '#365b42', fontFamily: Fonts.rounded, fontSize: 22, fontWeight: '700' },
  title: { color: '#294732', fontFamily: Fonts.rounded, fontSize: 28, fontWeight: '700', lineHeight: 34 },
  body: { color: '#536653', fontFamily: Fonts.sans, fontSize: 15, lineHeight: 23 },
  field: { gap: Spacing.two },
  label: { color: '#294732', fontFamily: Fonts.sans, fontSize: 14, fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#c8d6c1', borderRadius: 12,
    backgroundColor: '#fff', color: '#294732', fontFamily: Fonts.sans, fontSize: 16, padding: Spacing.three },
  button: { minHeight: 48, backgroundColor: '#365b42', borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  buttonText: { color: '#fff', fontFamily: Fonts.sans, fontSize: 15, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#e3edda' },
  secondaryButtonText: { color: '#365b42' },
  disabled: { opacity: 0.5 },
  switchMode: { paddingVertical: Spacing.two, alignItems: 'center' },
  link: { color: '#365b42', fontFamily: Fonts.sans, fontSize: 14, textAlign: 'center' },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  avatar: { padding: 3, borderRadius: 32, borderWidth: 2, borderColor: 'transparent' },
  selected: { backgroundColor: '#e3edda', borderColor: '#365b42' },
  consent: { paddingVertical: Spacing.two },
  hint: { color: '#536653', fontSize: 12, lineHeight: 18 },
  error: { color: '#983e3e', fontFamily: Fonts.sans, fontSize: 14, lineHeight: 21 },
});
