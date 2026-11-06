import { PrivacyLinks } from './features/PrivacyAndSupport';
import { COMMUNITY_VERSION, COMMUNITY_TEXT, COMMUNITY_TEXT_ZH } from './features/CommunityGuidelines';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Fonts, Spacing } from '../constants/theme';
import { useAuth, type EmailToConnect } from '../services/auth';
import { accountNameError, passwordError } from '../services/auth/registrationValidation';
import { ConnectEmailScreen } from './features/AccountRecovery';
import { LoginPreviewPage } from './auth/LoginPreviewPage';
import { AccountFrame, AvatarChoice, Check, CornerButton, Field, FooterLinks, Message, PrimaryButton, TextLink } from './auth/AccountPages';
import { LEGACY_AVATAR_IDS } from './avatars/avatarArt';
import { rememberDisplayLocale, WakingFlowerFacts } from './loading/WakingFlowerFacts';
import { router, usePathname } from 'expo-router';
import { GuestContext, type Guest } from '../services/guest';
import { devVariant } from '../services/deviceReset';
import { DeviceResetButton } from './features/DeviceReset';

// Signed out, the account pages (the owner's mock-ups, 2026-11-06; AccountPages.tsx):
// - "Create your account": the account name (unique, the sign-in name) and a password, twice. Below it,
//   "Forgot your password?" and "Forgot your username?".
// - "Welcome to your garden": that account name again, the Garden Fairy's name (any name, shared by
//   many), an avatar from the original portraits, the Community Guidelines; "Enter My Garden" makes the
//   account. No email is needed: the account name or PP number with the password signs in. An email
//   is connected only if the owner chooses to ("Connect to your email?", for the Weekly and Monthly
//   reports); once verified it is also the way back for a forgotten password or account name.
// - The two "Forgot" pages work only through a connected, verified email (auth.tsx refuses an unverified
//   one): a reset link for the password; for the name, a sign-in with that email, then the account name
//   and PP number are shown.
type Mode = 'signIn' | 'register' | 'welcome' | 'forgotPassword' | 'forgotName';

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('register');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fairyName, setFairyName] = useState('');
  const [problem, setProblem] = useState('');
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [connect, setConnect] = useState<EmailToConnect | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [avatar, setAvatar] = useState<string>(LEGACY_AVATAR_IDS[0]);
  const [communityAccepted, setCommunityAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  // Signed in from "Forgot your username?": the account name and PP number are shown before the Garden.
  const [reveal, setReveal] = useState(false);
  // Sign-in from the invitation page keeps that page on screen while the account opens.
  const [invitationSignIn, setInvitationSignIn] = useState(false);
  const busy = useRef(false);
  // Guest mode: signed out, the Garden opens first; the account pages show only once the guest reaches
  // something that needs an account (or taps a nav item), with a way back to the Garden.
  const [accountScreen, setAccountScreen] = useState(false);
  const guest = useRef<Guest>({ requestAccount: () => setAccountScreen(true) }).current;
  const pathname = usePathname();

  useEffect(() => {
    // A new identity starts clean: no password or other account's details stay in memory.
    setName(''); setPassword(''); setConfirm(''); setFairyName(''); setProblem(''); setEmailPassword('');
    setConnect(null); setConnecting(false); setAvatar(LEGACY_AVATAR_IDS[0]); setCommunityAccepted(false);
    setMode(current => (current === 'forgotName' ? current : 'register'));
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
  const go = (next: Mode) => { setProblem(''); auth.clearMessage?.(); setMode(next); };
  const zh = /^zh/i.test(Intl.DateTimeFormat().resolvedOptions().locale);
  const copy = zh ? COPY.zh : COPY.en;

  if (auth.phase === 'signedIn' && auth.session) {
    if (!reveal || mode !== 'forgotName') return <>{children}</>;
    const user = auth.experience?.user ?? auth.session.user;
    return <AccountFrame title={copy.foundTitle} subtitle={copy.foundBody}>
      <Field label={copy.accountName} icon="person" fixedValue={user.name} />
      <Field label={copy.ppNumber} fixedValue={(user as { accountId?: string }).accountId ?? ''} note={copy.ppNote} />
      <PrimaryButton label={copy.enter} onPress={() => { setReveal(false); setMode('register'); }} testID="account-found-enter" />
    </AccountFrame>;
  }
  const guestMode = auth.phase === 'signedOut' && !auth.loading && !(auth.identity && auth.error);
  // From guest mode the account pages lie over the Garden, which stays loaded underneath for the way back (the tree
  // around `children` is the same with or without the page, so React keeps the Garden mounted).
  const overGarden = (page: ReactNode) => guestMode ? <GuestContext.Provider value={guest}><View style={{ flex: 1 }}>
    {children}{page ? <View style={StyleSheet.absoluteFill}>{page}</View> : null}</View></GuestContext.Provider> : page;
  if (guestMode && !accountScreen) return overGarden(null);
  const leaveToGarden = () => { setAccountScreen(false); go('register'); if (pathname !== '/') router.replace('/'); };
  const backToGarden = auth.phase === 'signedOut' && !working
    ? <CornerButton label={copy.backToGarden} icon="back" onPress={leaveToGarden} /> : null;
  // Signed out, the create-account page comes first; the invitation card is for coming back to an account.
  if (mode === 'signIn' && (auth.phase === 'signedOut' || (invitationSignIn && auth.loading)) && !(auth.identity && auth.error)) {
    return overGarden(<View style={{ flex: 1 }}><LoginPreviewPage onCreateAccount={() => go('register')}
      onSignIn={async (login, secret) => {
        setInvitationSignIn(true);
        try { await auth.login(login, secret); } finally { setInvitationSignIn(false); }
      }}
      onForgotPassword={auth.resetPassword}
      authError={auth.error} authMessage={auth.message} footer={<><PrivacyLinks />{devVariant ? <DeviceResetButton /> : null}</>} />
      {backToGarden ? <View style={styles.signInBack}>{backToGarden}</View> : null}</View>);
  }
  if (auth.loading) return <View style={styles.loading}>
    <ActivityIndicator color="#365b42" accessibilityLabel="Loading session" />
    <Text style={styles.body}>{auth.phase === 'registering' ? copy.creating : copy.opening}</Text>
    {auth.phase === 'registering' ? null : <WakingFlowerFacts />}
  </View>;
  const profile = auth.phase === 'profileRequired';
  // An identity that never finished signing in still has its welcome page to finish on; only without one can a session be retried.
  const retry = auth.identity && auth.error && !profile;
  const feedback = <>
    {problem ? <Message text={problem} alert /> : null}
    {auth.message ? <Message text={auth.message} /> : null}
    {auth.error ? <Message text={auth.error} alert /> : null}
  </>;
  if (retry) return overGarden(<AccountFrame title={copy.welcomeTitle} subtitle={copy.retryBody}>
    {feedback}
    <PrimaryButton label={working ? copy.saving : copy.retry} disabled={working} onPress={() => void run(auth.retry)} />
    <FooterLinks><TextLink label={copy.other} onPress={() => void run(auth.logout)} /></FooterLinks>
  </AccountFrame>);
  if (connecting) return overGarden(<ConnectEmailScreen chinese={zh} initial={connect} knownPassword={profile ? undefined : password}
    onClose={() => setConnecting(false)}
    onSave={(details) => { setConnect(details); setConnecting(false); }}
    onSignIn={auth.phase === 'signedOut' ? () => { setConnecting(false); go('signIn'); } : undefined} />);

  const forgotLinks = <FooterLinks>
    <TextLink label={copy.forgotPassword} onPress={() => go('forgotPassword')} testID="forgot-password" />
    <TextLink label={copy.forgotName} onPress={() => go('forgotName')} testID="forgot-username" />
  </FooterLinks>;
  if (mode === 'forgotPassword' || mode === 'forgotName') {
    const forName = mode === 'forgotName';
    return overGarden(<AccountFrame title={forName ? copy.forgotName : copy.forgotPassword} subtitle={forName ? copy.forgotNameBody : copy.forgotPasswordBody}
      left={backToGarden} right={<CornerButton label={copy.haveAccount} icon="envelope" onPress={() => go('signIn')} />} fairyAt={0}>
      <Field label={copy.email} icon="envelope" narrow value={email} onChangeText={setEmail} editable={!working} keyboardType="email-address"
        autoComplete="email" placeholder={copy.emailPlaceholder} />
      {forName ? <Field label={copy.password} icon="lock" narrow secret value={emailPassword} onChangeText={setEmailPassword} editable={!working}
        autoComplete="current-password" placeholder={copy.passwordPlaceholder} /> : null}
      {feedback}
      <PrimaryButton label={working ? copy.saving : forName ? copy.findAccount : copy.sendLink} disabled={working || !email.trim() || (forName && !emailPassword)}
        onPress={() => void run(async () => {
          if (!forName) { await auth.resetPassword(email); return; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setProblem(copy.emailInvalid); return; }
          setProblem(''); setReveal(true);
          await auth.login(email.trim(), emailPassword);
          setEmailPassword('');
        })} testID={forName ? 'find-account' : 'send-reset-link'} />
      <FooterLinks><TextLink label={copy.backToCreate} onPress={() => go('register')} /></FooterLinks>
    </AccountFrame>);
  }

  // The account's details, for the welcome page's button (and the profile step of an existing identity, which has no password here).
  const details = { name, avatar, fairyName, aiConsent: false, communityTermsVersion: communityAccepted ? COMMUNITY_VERSION : undefined,
    ...(profile ? {} : { password }) };
  if (mode === 'welcome' || profile) {
    const corner = profile || auth.identity?.email ? null : <CornerButton label={connect ? `✓ ${connect.email}` : copy.connect} icon="envelope"
      onPress={() => setConnecting(true)} testID="connect-email" />;
    return overGarden(<AccountFrame title={copy.welcomeTitle} subtitle={copy.welcomeBody} fairyAt={8}
      left={profile ? null : <CornerButton label={copy.back} icon="back" onPress={() => go('register')} />} right={corner}>
      {profile ? <Field label={copy.accountName} icon="person" narrow value={name} onChangeText={setName} editable={!working} maxLength={20}
        autoComplete="username-new" placeholder={copy.namePlaceholder} note={copy.nameNote} />
        : <Field label={copy.accountName} icon="person" narrow fixedValue={name} note={copy.nameNote} />}
      <Field label={copy.fairyName} narrow value={fairyName} onChangeText={setFairyName} editable={!working} maxLength={20}
        autoCapitalize="words" placeholder={copy.fairyPlaceholder} />
      <AvatarChoice label={copy.avatar} value={avatar} onChange={setAvatar} disabled={working} />
      <Check checked={communityAccepted} label={copy.accept} onPress={() => setCommunityAccepted(!communityAccepted)}
        link={copy.guidelines} onLink={() => setGuidelinesOpen(true)} />
      {feedback}
      <PrimaryButton label={working ? copy.saving : copy.enter} disabled={working || !name.trim() || !communityAccepted} testID="enter-garden"
        onPress={() => void run(() => profile ? auth.completeProfile(details, connect) : auth.register(details, connect))} />
      {profile ? <FooterLinks><TextLink label={copy.other} onPress={() => void run(auth.logout)} /></FooterLinks> : null}
      <View style={styles.policy}><PrivacyLinks /></View>
      {guidelinesOpen ? <Guidelines zh={zh} title={copy.guidelines} close={copy.close} onClose={() => setGuidelinesOpen(false)} /> : null}
    </AccountFrame>);
  }

  // "Create your account": checked here before the welcome page (the server checks it all again; a taken
  // name comes back from there when the account is made).
  const next = () => {
    const trimmed = name.trim();
    const wrong = accountNameError(trimmed, zh) || passwordError(password, zh) || (password !== confirm ? copy.mismatch : '');
    setProblem(wrong);
    if (wrong) return;
    setName(trimmed); auth.clearMessage?.(); setMode('welcome');
  };
  return overGarden(<AccountFrame title={copy.createTitle} subtitle={copy.createBody} fairyAt={0}
    left={backToGarden} right={<CornerButton label={copy.haveAccount} icon="envelope" onPress={() => go('signIn')} testID="have-account" />}>
    <Field label={copy.accountName} icon="person" narrow value={name} onChangeText={setName} editable={!working} maxLength={20}
      autoComplete="username-new" placeholder={copy.namePlaceholder} note={copy.nameRule} />
    <Field label={copy.password} icon="lock" narrow secret value={password} onChangeText={setPassword} editable={!working}
      autoComplete="new-password" placeholder={copy.passwordPlaceholder} note={copy.passwordRule} />
    <Field label={copy.confirm} icon="lock" narrow secret value={confirm} onChangeText={setConfirm} editable={!working}
      autoComplete="new-password" placeholder={copy.confirmPlaceholder} onSubmitEditing={next} />
    {feedback}
    <PrimaryButton label={copy.create} disabled={working || !name.trim() || !password || !confirm} onPress={next} testID="create-account" />
    {forgotLinks}
    <View style={styles.policy}><PrivacyLinks /></View>
  </AccountFrame>);
}

function Guidelines({ zh, title, close, onClose }: { zh: boolean; title: string; close: string; onClose: () => void }) {
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.scrim}>
      <View accessibilityViewIsModal style={styles.card} testID="community-guidelines">
        <Text accessibilityRole="header" style={styles.guidelinesTitle}>{title}</Text>
        <ScrollView style={styles.guidelinesBody}><Text style={styles.body}>{zh ? COMMUNITY_TEXT_ZH : COMMUNITY_TEXT}</Text></ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>{close}</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

const COPY = {
  en: {
    createTitle: 'Create your account', createBody: 'Join PetalPal and start your magical journey with your garden fairy.',
    welcomeTitle: 'Welcome to your garden', welcomeBody: 'Meet your Garden Fairy, choose your avatar, and begin your journey.',
    retryBody: 'Your garden didn’t open. Try again.',
    accountName: 'Account Name', namePlaceholder: 'Enter your account name', nameRule: '4–20 characters. Letters, numbers, or underscores.',
    nameNote: 'This is your sign-in name. Nobody else can have it.',
    password: 'Password', passwordPlaceholder: 'Enter your password', passwordRule: '8–16 characters. Include letters and numbers.',
    confirm: 'Confirm Password', confirmPlaceholder: 'Re-enter your password', mismatch: 'The two passwords don’t match.',
    fairyName: 'Your Garden Fairy’s Name', fairyPlaceholder: 'Give your fairy a name…', avatar: 'Choose Your Avatar',
    accept: 'I accept the', guidelines: 'Community Guidelines', close: 'Close',
    create: 'Create Account', enter: 'Enter My Garden', saving: 'Saving…', creating: 'Creating your account…', opening: 'Opening PetalPal…',
    retry: 'Try again', other: 'Use another account', back: 'Back', backToGarden: 'Back to the Garden',
    haveAccount: 'Already have an account?', connect: 'Connect to your email?',
    forgotPassword: 'Forgot your password?', forgotName: 'Forgot your username?',
    forgotPasswordBody: 'If you connected and verified an email, we’ll send it a link to set a new password. Then sign in with that email and the new password.',
    forgotNameBody: 'Sign in with the email you connected and verified, and your password. We’ll show your account name and PP number.',
    email: 'Email', emailPlaceholder: 'The email you verified', emailInvalid: 'Enter a valid email address.',
    sendLink: 'Send the link', findAccount: 'Find My Account', backToCreate: 'Create a new account instead',
    foundTitle: 'Your account', foundBody: 'Sign in with your account name or PP number and your password next time.',
    ppNumber: 'PP Number', ppNote: 'Your account number. It also signs in, with your password.',
  },
  zh: {
    createTitle: '创建你的账号', createBody: '加入 PetalPal，和你的花园小仙子一起开始奇妙旅程。',
    welcomeTitle: '欢迎来到你的花园', welcomeBody: '认识你的花园小仙子，选一个头像，开始你的旅程。',
    retryBody: '花园没有打开，再试一次。',
    accountName: '账号名', namePlaceholder: '输入你的账号名', nameRule: '4–20 位，可以用字母、数字或下划线。',
    nameNote: '这是你的登录名，只属于你。',
    password: '密码', passwordPlaceholder: '输入密码', passwordRule: '8–16 位，同时包含字母和数字。',
    confirm: '确认密码', confirmPlaceholder: '再输入一次密码', mismatch: '两次输入的密码不一样。',
    fairyName: '你的花园小仙子的名字', fairyPlaceholder: '给小仙子起个名字…', avatar: '选择你的头像',
    accept: '我接受', guidelines: '社区准则', close: '关闭',
    create: '创建账号', enter: '进入我的花园', saving: '正在保存…', creating: '正在创建你的账号…', opening: '正在打开 PetalPal…',
    retry: '重试', other: '换一个账号', back: '返回', backToGarden: '返回花园',
    haveAccount: '已有账号？', connect: '连接你的邮箱？',
    forgotPassword: '忘记密码？', forgotName: '忘记账号名？',
    forgotPasswordBody: '如果你连接并验证过邮箱，我们会发一个设置新密码的链接。之后用这个邮箱和新密码登录。',
    forgotNameBody: '用你连接并验证过的邮箱和密码登录，我们会告诉你账号名和 PP 号。',
    email: '邮箱', emailPlaceholder: '你验证过的邮箱', emailInvalid: '请输入有效的邮箱地址。',
    sendLink: '发送链接', findAccount: '找回我的账号', backToCreate: '改为创建新账号',
    foundTitle: '你的账号', foundBody: '下次可以用账号名或 PP 号加密码登录。',
    ppNumber: 'PP 号', ppNote: '你的账号编号，配合密码也能登录。',
  },
};

const styles = StyleSheet.create({
  signInBack: { position: 'absolute', top: 12, left: 12, zIndex: 50 },
  policy: { marginTop: 12, alignItems: 'center' },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, backgroundColor: 'rgba(8, 24, 22, 0.55)' },
  card: { width: '100%', maxWidth: 440, backgroundColor: '#FBF4EA', borderRadius: 24, padding: Spacing.four, gap: Spacing.three,
    borderWidth: 1, borderColor: '#C9A35E' },
  guidelinesTitle: { color: '#4A3426', fontFamily: Fonts.rounded, fontSize: 22, fontWeight: '700' },
  guidelinesBody: { maxHeight: 360 },
  loading: { flex: 1, backgroundColor: '#eff4e9', alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingHorizontal: 16 },
  body: { color: '#5A4636', fontFamily: Fonts.sans, fontSize: 15, lineHeight: 23 },
  closeButton: { minHeight: 48, backgroundColor: '#EFE3F3', borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  closeText: { color: '#6B4A8A', fontFamily: Fonts.sans, fontSize: 15, fontWeight: '600' },
});
