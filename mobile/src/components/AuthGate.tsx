import { PrivacyLinks } from './features/PrivacyAndSupport';
import { COMMUNITY_VERSION, COMMUNITY_TEXT } from './features/CommunityGuidelines';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Fonts, Spacing } from '../constants/theme';
import { useAuth } from '../services/auth';
import { LoginPreviewPage } from './auth/LoginPreviewPage';
import { AVATAR_IDS, DEFAULT_AVATAR } from './avatars/avatarArt';
import { UserAvatar } from './avatars/UserAvatar';
import { rememberDisplayLocale, WakingFlowerFacts } from './loading/WakingFlowerFacts';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuestContext, type Guest } from '../services/guest';

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [name, setName] = useState('');
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
  const checkVerification = useRef(auth.checkVerification);
  checkVerification.current = auth.checkVerification;

  useEffect(() => {
    setEmail(''); setPassword(''); setConfirmation(''); setName('');
    setAvatar(DEFAULT_AVATAR); setCommunityAccepted(false); setMode('signIn');
  }, [auth.identity?.uid]);
  useEffect(() => {
    if (!auth.loading) void SplashScreen.hideAsync().catch(() => {});
  }, [auth.loading]);
  const signedInLocale = auth.experience?.user.preferredLocale;
  useEffect(() => { if (signedInLocale) rememberDisplayLocale(signedInLocale); }, [signedInLocale]);
  useEffect(() => {
    if (auth.phase !== 'verificationPending') return;
    // Resume after visiting the verification link, without polling or forcing
    // another registration. The provider guards against identity changes.
    const recheck = () => { if (!busy.current) void checkVerification.current(); };
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') recheck(); });
    if (typeof window !== 'undefined') window.addEventListener('focus', recheck);
    return () => {
      subscription.remove();
      if (typeof window !== 'undefined') window.removeEventListener('focus', recheck);
    };
  }, [auth.phase]);

  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setWorking(true);
    try { await action(); }
    finally { busy.current = false; setWorking(false); setPassword(''); setConfirmation(''); }
  }
  const button = (label: string, action: () => Promise<void>, disabled = false, secondary = false) =>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: working || disabled }}
      disabled={working || disabled} onPress={() => void run(action)}
      style={[styles.button, secondary && styles.secondaryButton, (working || disabled) && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>;
  const field = (label: string, props: TextInputProps) => <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor="#7a887b" editable={!working}
      style={styles.input} {...props} />
  </View>;

  if (auth.phase === 'signedIn' && auth.session) return <>{children}</>;
  const guestMode = auth.phase === 'signedOut' && !auth.loading && !(auth.identity && auth.error);
  // From guest mode the account pages lie over the Garden, which stays loaded underneath for the way back (the tree
  // around `children` is the same with or without the page, so React keeps the Garden mounted).
  const overGarden = (page: ReactNode) => guestMode ? <GuestContext.Provider value={guest}><View style={{ flex: 1 }}>
    {children}{page ? <View style={StyleSheet.absoluteFill}>{page}</View> : null}</View></GuestContext.Provider> : page;
  if (guestMode && !accountScreen) return overGarden(null);
  // Only while signing in or creating an account from guest mode; verification and profile steps keep the card.
  const backToGarden = mode === 'signIn' || mode === 'register' ? (auth.phase === 'signedOut' && !working ? <Pressable accessibilityRole="button"
    accessibilityLabel="Back to the Garden" hitSlop={12} onPress={() => { setAccountScreen(false); setMode('signIn'); if (pathname !== '/') router.replace('/'); }}
    style={[styles.backToGarden, { top: insets.top + 10, left: insets.left + 12 }]}>
    <Text style={styles.backToGardenText}>‹ {/^zh/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? '回到花园' : 'Back to the Garden'}</Text>
  </Pressable> : null) : null;
  // Signed out: the partner's invitation card is the sign-in screen (real Firebase sign-in).
  // Registration, verification, profile and session-retry keep the card below.
  if (mode === 'signIn' && (auth.phase === 'signedOut' || (invitationSignIn && auth.loading)) && !(auth.identity && auth.error)) {
    return overGarden(<View style={{ flex: 1 }}><LoginPreviewPage onCreateAccount={() => { setMode('register'); setPassword(''); setConfirmation(''); }}
      onSignIn={async (address, secret) => {
        setInvitationSignIn(true);
        try { await auth.login(address, secret); } finally { setInvitationSignIn(false); }
      }}
      onForgotPassword={auth.resetPassword}
      authError={auth.error} authMessage={auth.message} footer={<PrivacyLinks />} />{backToGarden}</View>);
  }
  if (auth.loading) return <View style={styles.loading}>
    <ActivityIndicator color="#365b42" accessibilityLabel="Loading session" />
    <Text style={styles.body}>{auth.phase === 'registering' ? 'Creating your account…' : 'Opening PetalPal…'}</Text>
    {auth.phase === 'registering' ? null : <WakingFlowerFacts />}
  </View>;
  const verification = auth.phase === 'verificationPending';
  const profile = auth.phase === 'profileRequired';
  const registering = mode === 'register';
  return overGarden(<KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <View style={styles.card} testID="auth-card">
        <Text style={styles.brand}>PetalPal</Text>
        <Text style={styles.title}>{verification ? 'Verify your email' : profile ? 'Welcome to your garden'
          : registering ? 'Create your PetalPal account' : 'Sign in to PetalPal'}</Text>
        <Text style={styles.body}>{verification ? `Check your inbox at ${auth.identity?.email || 'your email address'}.`
          : profile ? 'Choose how you’ll appear in PetalPal.' : 'Your feelings, your flowers, your little place to grow.'}</Text>
        {verification ? <>
          {button(working ? 'Checking…' : 'I’ve verified my email', auth.checkVerification)}
          {button('Resend verification email', auth.resendVerification, false, true)}
          {button('Use another account', auth.logout, false, true)}
        </> : profile ? <>
          {field('Display name', { value: name, onChangeText: setName, maxLength: 80, autoComplete: 'name' })}
          <Text style={styles.label}>Garden avatar</Text>
          <View style={styles.avatars}>{AVATAR_IDS.map((choice, index) => <Pressable key={choice}
            accessibilityRole="radio" accessibilityLabel={`Avatar ${index + 1}`}
            accessibilityState={{ selected: avatar === choice }} disabled={working} onPress={() => setAvatar(choice)}
            style={[styles.avatar, avatar === choice && styles.selected]}><UserAvatar avatar={choice} size={52} /></Pressable>)}</View>
          <Text style={styles.body}>{COMMUNITY_TEXT}</Text>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Accept Community Guidelines" accessibilityState={{checked:communityAccepted}} disabled={working} onPress={()=>setCommunityAccepted(!communityAccepted)} style={styles.consent}>
            <Text style={styles.label}>{communityAccepted ? '☑' : '☐'} I accept the Community Guidelines</Text>
          </Pressable>
          <Text style={styles.hint}>AI is off by default. Read the processor disclosure and choose optional AI features in Settings. You can journal without AI.</Text>
          {button(working ? 'Saving…' : 'Continue to PetalPal', () => auth.completeProfile({ name, avatar, aiConsent: false, communityTermsVersion: communityAccepted ? COMMUNITY_VERSION : undefined }), !name.trim() || !communityAccepted)}
          {button('Use another account', auth.logout, false, true)}
        </> : <>
          {field('Email', { value: email, onChangeText: setEmail, keyboardType: 'email-address', autoCapitalize: 'none',
            autoCorrect: false, autoComplete: 'email' })}
          {field('Password', { value: password, onChangeText: setPassword, secureTextEntry: true,
            autoComplete: registering ? 'new-password' : 'current-password' })}
          {registering && field('Confirm password', { value: confirmation, onChangeText: setConfirmation,
            secureTextEntry: true, autoComplete: 'new-password' })}
          {button(working ? 'Please wait…' : registering ? 'Create account' : 'Sign in',
            () => registering ? auth.register(email, password, confirmation) : auth.login(email, password), !email.trim() || !password)}
          <Pressable accessibilityRole="button" disabled={working} onPress={() => {
            setMode(registering ? 'signIn' : 'register'); setPassword(''); setConfirmation('');
          }} style={styles.switchMode}>
            <Text style={styles.link}>{registering ? 'Already have an account? Sign in' : 'New to PetalPal? Create account'}</Text>
          </Pressable>
          {auth.identity && auth.error ? button('Retry session', auth.retry, false, true) : null}
        </>}
        {auth.message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{auth.message}</Text> : null}
        {auth.error ? <Text accessibilityRole="alert" style={styles.error}>{auth.error}</Text> : null}
        <PrivacyLinks />
      </View>
    </ScrollView>
    {backToGarden}
  </KeyboardAvoidingView>);
}

const styles = StyleSheet.create({
  backToGarden: { position: 'absolute', zIndex: 50, minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#FAF5E8E6', borderWidth: 1, borderColor: '#C6A164' },
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
