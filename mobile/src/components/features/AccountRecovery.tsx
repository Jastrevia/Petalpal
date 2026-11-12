import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, type AccountRecovery, type EmailToConnect } from '../../services/auth';
import { connectEmailError, MIN_PASSWORD_LENGTH } from '../../services/auth/registrationValidation';
import { useAppLocale } from '../../services/locale';
import { usePlanting } from '../garden/planting/PlantingContext';
import { FeatureActionButton, FeatureSection, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
import { Dialog } from './PrivacyAndSupport';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';

const COPY = {
  en: { connectTitle: 'Connect to your email', connectBody: 'Get your Weekly and Monthly reflections by email later, and sign in on any phone. We’ll send a link to check it’s yours.',
    email: 'Email', password: 'Password', passwordHint: `At least ${MIN_PASSWORD_LENGTH} characters. If you already set a password, enter that one.`, save: 'Connect email', keep: 'Save and go back', cancel: 'Not now', saving: 'Please wait…',
    signIn: 'This email already has an account? Sign in', waitTitle: 'Check your inbox', wait: (email: string) => `We sent a link to ${email}. Open it, then come back here. Check your spam folder too.`,
    checked: 'I’ve verified my email', notYet: 'Not verified yet. Open the link in your inbox, then try again.', resend: 'Send the link again', resent: 'Sent again.',
    done: (email: string) => `Connected: ${email}`, close: 'Close', account: 'Account & getting back in', yourName: 'Name', pp: 'PP number',
    setPassword: 'Set a password', changePassword: 'Change password', current: 'Current password', newPassword: 'New password', saved: 'Password saved. You can now sign in with your name or PP number.', connect: 'Connect to your email',
    passwordBody: 'With this you can sign in on any phone using your name or PP number. Without a connected email, a forgotten password can’t be reset.', tooShort: `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`, failed: 'That didn’t save. Please try again.',
    noWayBack: 'Without a password or email, you can’t get back into this Garden after signing out. Set a password first.', promptTitle: 'Keep your Garden safe', prompt: 'If you lose or change this phone, a password brings your Garden back.', later: 'Not now', signOutAnyway: 'Sign out and lose this Garden', notice: 'OK' },
  'zh-Hans': { connectTitle: '连接你的邮箱', connectBody: '之后可以在邮箱里收到周报和月报，换手机也能登录。我们会发一个链接，确认这是你的邮箱。',
    email: '邮箱', password: '密码', passwordHint: `至少 ${MIN_PASSWORD_LENGTH} 位。如果已经设过密码，请填那个密码。`, save: '连接邮箱', keep: '保存并返回', cancel: '先不连接', saving: '请稍候…',
    signIn: '这个邮箱已有账号？去登录', waitTitle: '去邮箱看看', wait: (email: string) => `我们把链接发到了 ${email}。打开链接后再回到这里。也看看垃圾邮件。`,
    checked: '我已经验证了', notYet: '还没有验证。请打开邮箱里的链接，再试一次。', resend: '重新发送链接', resent: '已重新发送。',
    done: (email: string) => `已连接：${email}`, close: '关闭', account: '账号与找回', yourName: '名字', pp: 'PP 号',
    setPassword: '设置密码', changePassword: '修改密码', current: '当前密码', newPassword: '新密码', saved: '密码已保存。现在可以用名字或 PP 号登录了。', connect: '连接你的邮箱',
    passwordBody: '有了密码，换手机也能用名字或 PP 号登录。没连邮箱的话，忘记密码就无法重置。', tooShort: `密码至少 ${MIN_PASSWORD_LENGTH} 位。`, failed: '没有保存成功，请再试一次。',
    noWayBack: '没有密码也没连邮箱，退出后就回不到这个花园了。请先设一个密码。', promptTitle: '保护好你的花园', prompt: '如果手机丢了或换了手机，有密码就能把花园找回来。', later: '先不设', signOutAnyway: '退出并失去这个花园', notice: '好的' },
};

// The dedicated page behind "Connect to your email?". Before an account exists it only holds the details until the
// account is made (`onSave`). Once signed in, it connects at once and waits for the verification link.
// `knownPassword`: the password the account is being made with (the sign-up page): the email takes it,
// so it is not asked again (a second, different one would be refused as not the account's).
export function ConnectEmailScreen({ chinese, initial, knownPassword, onSave, onSignIn, onClose }: {
  chinese: boolean; initial?: EmailToConnect | null; knownPassword?: string; onSave?: (details: EmailToConnect) => void; onSignIn?: () => void; onClose: () => void;
}) {
  const auth = useAuth();
  const copy = COPY[chinese ? 'zh-Hans' : 'en'];
  const insets = useSafeAreaInsets();
  const already = onSave ? null : auth.connectedEmail();
  const [email, setEmail] = useState(initial?.email || ''), [typedPassword, setPassword] = useState(initial?.password || '');
  const password = knownPassword ?? typedPassword;
  const [waitingOn, setWaitingOn] = useState(already && !already.verified ? already.email : '');
  const [verified, setVerified] = useState(already?.verified ? already.email : '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const check = async (quiet: boolean) => {
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try {
      if (await auth.checkEmailVerified()) { setVerified(waitingOn); setWaitingOn(''); }
      else if (!quiet) setNote(copy.notYet);
    } catch (problem) { if (!quiet) setError((problem as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!waitingOn) return;
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(true); });
    return () => subscription.remove();
  }, [waitingOn]);
  const submit = async () => {
    const problem = connectEmailError(email, password);
    if (problem) { setError(problem); return; }
    if (onSave) { onSave({ email: email.trim(), password }); return; }
    setBusy(true); setError('');
    try { await auth.connectEmail(email, password); setPassword(''); setWaitingOn(email.trim()); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  const action = (title: string, onPress: () => void, secondary = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onPress}
    style={[connectStyles.button, secondary && connectStyles.secondary, busy && connectStyles.disabled]}><Text style={[connectStyles.buttonText, secondary && connectStyles.secondaryText]}>{title}</Text></Pressable>;
  return <Modal supportedOrientations={MODAL_ORIENTATIONS} visible animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={connectStyles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[connectStyles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View testID="connect-email" style={connectStyles.card}>
          <Text accessibilityRole="header" style={connectStyles.title}>{verified ? copy.connectTitle : waitingOn ? copy.waitTitle : copy.connectTitle}</Text>
          {verified ? <>
            <Text style={connectStyles.body}>{copy.done(verified)}</Text>
            {action(copy.close, onClose)}
          </> : waitingOn ? <>
            <Text style={connectStyles.body}>{copy.wait(waitingOn)}</Text>
            {action(busy ? copy.saving : copy.checked, () => void check(false))}
            {action(copy.resend, async () => {
              setBusy(true); setError(''); setNote('');
              try { await auth.resendEmailVerification(); setNote(copy.resent); }
              catch (failure) { setError((failure as Error).message); }
              finally { setBusy(false); }
            }, true)}
            {action(copy.close, onClose, true)}
          </> : <>
            <Text style={connectStyles.body}>{copy.connectBody}</Text>
            <Text style={connectStyles.label}>{copy.email}</Text>
            <TextInput accessibilityLabel={copy.email} value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address"
              autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholderTextColor="#7a887b" style={connectStyles.input} />
            {knownPassword === undefined ? <>
              <Text style={connectStyles.label}>{copy.password}</Text>
              <TextInput accessibilityLabel={copy.password} value={password} onChangeText={setPassword} editable={!busy} secureTextEntry
                autoComplete="new-password" placeholderTextColor="#7a887b" style={connectStyles.input} />
              <Text style={connectStyles.hint}>{copy.passwordHint}</Text>
            </> : null}
            {action(busy ? copy.saving : onSave ? copy.keep : copy.save, () => void submit())}
            {action(copy.cancel, onClose, true)}
            {onSignIn ? <Pressable accessibilityRole="button" disabled={busy} onPress={onSignIn} style={connectStyles.link}><Text style={connectStyles.linkText}>{copy.signIn}</Text></Pressable> : null}
          </>}
          {note ? <Text accessibilityLiveRegion="polite" style={connectStyles.body}>{note}</Text> : null}
          {error ? <Text accessibilityRole="alert" style={connectStyles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

function PasswordForm({ hasPassword, onSaved }: { hasPassword: boolean; onSaved: () => void }) {
  const { setPassword: save } = useAuth();
  const copy = COPY[useAppLocale()];
  const { theme } = usePanelTheme();
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const input = { placeholderTextColor: theme.muted, secureTextEntry: true, editable: !busy, style: [formStyles.input, { color: theme.text, borderColor: theme.border }] };
  return <View style={{ gap: 10 }}>
    <Text style={[ui.text, { color: theme.text }]}>{copy.passwordBody}</Text>
    {hasPassword ? <TextInput accessibilityLabel={copy.current} placeholder={copy.current} value={current} onChangeText={setCurrent} autoComplete="current-password" {...input} /> : null}
    <TextInput accessibilityLabel={copy.newPassword} placeholder={copy.newPassword} value={next} onChangeText={setNext} autoComplete="new-password" {...input} />
    <FeatureActionButton title={busy ? copy.saving : copy.setPassword} disabled={busy} onPress={async () => {
      if (next.length < MIN_PASSWORD_LENGTH) { setError(copy.tooShort); return; }
      setBusy(true); setError('');
      try { await save(next, hasPassword ? current : undefined); onSaved(); }
      catch (failure) { setError((failure as { status?: number }).status === 403 ? (failure as Error).message : copy.failed); }
      finally { setBusy(false); }
    }} />
    {error ? <Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{error}</Text> : null}
  </View>;
}

// In Me: the sign-up page is only seen once, so connecting an email later happens here.
export function AccountRecoverySettings() {
  const { loadRecovery } = useAuth();
  const locale = useAppLocale();
  const copy = COPY[locale];
  const { theme } = usePanelTheme();
  const [recovery, setRecovery] = useState<AccountRecovery | null>(null);
  const [open, setOpen] = useState<'password' | 'email' | null>(null), [note, setNote] = useState('');
  const refresh = () => loadRecovery().then(setRecovery).catch(() => undefined);
  useEffect(() => { void refresh(); }, []);
  if (!recovery) return null;
  return <FeatureSection title={copy.account}>
    <View style={{ gap: 10 }}>
      <Text style={[ui.text, { color: theme.text }]}>{copy.yourName}: {recovery.name}</Text>
      <Text style={[ui.text, { color: theme.text }]}>{copy.pp}: {recovery.accountId}</Text>
      {recovery.email ? <Text style={[ui.text, { color: theme.text }]}>{copy.done(recovery.email)}</Text> : null}
      <FeatureActionButton secondary title={recovery.hasPassword ? copy.changePassword : copy.setPassword} onPress={() => { setNote(''); setOpen('password'); }} />
      {recovery.email ? null : <FeatureActionButton secondary title={copy.connect} onPress={() => setOpen('email')} />}
      {note ? <Text accessibilityLiveRegion="polite" style={[ui.caption, { color: theme.text }]}>{note}</Text> : null}
    </View>
    {open === 'password' ? <Dialog title={recovery.hasPassword ? copy.changePassword : copy.setPassword} closeLabel={copy.close} onClose={() => setOpen(null)}>
      <PasswordForm hasPassword={recovery.hasPassword} onSaved={() => { setOpen(null); setNote(copy.saved); void refresh(); }} />
    </Dialog> : null}
    {open === 'email' ? <ConnectEmailScreen chinese={locale === 'zh-Hans'} onClose={() => { setOpen(null); void refresh(); }} /> : null}
  </FeatureSection>;
}

// Signing out is final for an account with no way back in, so it says so first.
export function SignOutButton({ title, disabled, onSignOut }: { title: string; disabled: boolean; onSignOut: () => void }) {
  const { loadRecovery } = useAuth();
  const copy = COPY[useAppLocale()];
  const { theme } = usePanelTheme();
  const [warn, setWarn] = useState(false);
  return <>
    <FeatureActionButton title={title} disabled={disabled} onPress={async () => {
      const recovery = await loadRecovery().catch(() => null);
      if (recovery && !recovery.hasPassword && !recovery.email) setWarn(true); else onSignOut();
    }} />
    {warn ? <Dialog title={title} closeLabel={copy.close} onClose={() => setWarn(false)}>
      <View style={{ gap: 10 }}>
        <Text style={[ui.text, { color: theme.text, fontWeight: '700' }]}>{copy.noWayBack}</Text>
        <PasswordForm hasPassword={false} onSaved={() => { setWarn(false); onSignOut(); }} />
        <FeatureActionButton danger secondary title={copy.signOutAnyway} onPress={() => { setWarn(false); onSignOut(); }} />
      </View>
    </Dialog> : null}
  </>;
}

// Asked once, after the first flower is planted: only then is there a Garden to lose. Also shows how connecting
// an email filled in on the sign-up page went, since that page has closed by then.
export function RecoveryPrompt() {
  const auth = useAuth();
  const copy = COPY[useAppLocale()];
  const { theme } = usePanelTheme();
  const owner = auth.session?.user.id;
  const planted = usePlanting().placements.length > 0;
  const [asking, setAsking] = useState(false), [form, setForm] = useState(false);
  const key = `petalpal.recovery-asked.${owner}`;
  useEffect(() => {
    if (!owner || !planted) return;
    let active = true;
    // Any failure: no prompt now, it asks again next time.
    AsyncStorage.getItem(key).then(asked => asked ? null : auth.loadRecovery()).then(recovery => {
      if (active && recovery && !recovery.hasPassword && !recovery.email) setAsking(true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [owner, planted]);
  const close = () => { setAsking(false); setForm(false); void AsyncStorage.setItem(key, '1').catch(() => undefined); };
  if (auth.message) return <View testID="account-notice" style={promptStyles.layer}>
    <View accessibilityViewIsModal style={[promptStyles.sheet, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
      <Text accessibilityLiveRegion="polite" style={[promptStyles.body, { color: theme.text }]}>{auth.message}</Text>
      <FeatureActionButton title={copy.notice} onPress={auth.clearMessage} />
    </View>
  </View>;
  if (!asking) return null;
  return <View testID="recovery-prompt" style={promptStyles.layer}>
    <View accessibilityViewIsModal style={[promptStyles.sheet, { backgroundColor: theme.surface, borderColor: theme.gold }]}>
      <Text accessibilityRole="header" style={[promptStyles.title, { color: theme.text }]}>{copy.promptTitle}</Text>
      {form ? <PasswordForm hasPassword={false} onSaved={close} /> : <>
        <Text style={[promptStyles.body, { color: theme.text }]}>{copy.prompt}</Text>
        <FeatureActionButton title={copy.setPassword} onPress={() => setForm(true)} />
      </>}
      <FeatureActionButton secondary title={copy.later} onPress={close} />
    </View>
  </View>;
}

const connectStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eff4e9' },
  page: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 440, backgroundColor: '#fbfcf6', borderRadius: 24, padding: 24, gap: 12, borderWidth: 1, borderColor: '#c8d6c1' },
  title: { color: '#294732', fontFamily: 'serif', fontSize: 26, fontWeight: '700', lineHeight: 32 },
  body: { color: '#536653', fontSize: 15, lineHeight: 23 },
  label: { color: '#294732', fontSize: 14, fontWeight: '600' },
  hint: { color: '#536653', fontSize: 12, lineHeight: 18 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#c8d6c1', borderRadius: 12, backgroundColor: '#fff', color: '#294732', fontSize: 16, padding: 12 },
  button: { minHeight: 48, backgroundColor: '#365b42', borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 12 },
  secondary: { backgroundColor: '#e3edda' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryText: { color: '#365b42' },
  link: { paddingVertical: 8, alignItems: 'center' },
  linkText: { color: '#365b42', fontSize: 14, textAlign: 'center' },
  error: { color: '#983e3e', fontSize: 14, lineHeight: 21 },
});
const formStyles = StyleSheet.create({ input: { minHeight: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 } });
const promptStyles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 69, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(8, 24, 22, 0.55)' },
  sheet: { width: '100%', maxWidth: 380, gap: 10, padding: 18, borderRadius: 18, borderWidth: 1 },
  title: { fontFamily: 'serif', fontSize: 19, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21 },
});
