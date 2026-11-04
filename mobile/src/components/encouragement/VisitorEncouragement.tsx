import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, AppState, Easing, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../services/api';
import { giveGardenSupport, leaveGardenNote, loadVisitorEncouragement } from '../../services/gardenEncouragement';
import { CommunityGuidelines } from '../features/CommunityGuidelines';
import {
  DEFAULT_NOTE_MAX_LENGTH, msUntilReset, noteLength, noteProblem, type VisitorEncouragementState,
} from './encouragementFormat';

// While visiting a friend's Garden: give one Support and leave one short note per day.
// Every state shown here comes from the server; taps only start the request and the
// gentle animation, and a repeat the server refuses simply shows today's done state.

const INK = '#3E3355';
const GREEN = '#254E46';
const GOLD = '#C9A44C';
const PAPER = '#FBF7EE';
const nativeDriver = Platform.OS !== 'web';
const serif = Platform.OS === 'web' ? '"Cormorant Garamond", Georgia, serif' : Platform.OS === 'ios' ? 'Georgia' : 'serif';

type Busy = '' | 'support' | 'message';

function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'This garden is no longer here.';
    if (error.status === 403) return 'This garden is private right now.';
    if (error.status === 413 || error.code === 'NOTE_TOO_LONG') return 'That note is a little long. Please shorten it.';
    if (error.status === 400) return error.message || 'That note could not be sent.';
    if (error.status === 422) return error.message;
    if (error.status === 401) return error.message;
  }
  return 'The garden could not be reached. Please try again.';
}

// A few warm motes drift up from the Support button and fade, with a soft glow across the beds.
function SupportBloom({ run }: { run: number }) {
  const glow = useRef(new Animated.Value(0)).current;
  const motes = useRef(Array.from({ length: 9 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (!run) return;
    glow.setValue(0);
    motes.forEach(mote => mote.setValue(0));
    Animated.parallel([
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }),
        Animated.timing(glow, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: nativeDriver }),
      ]),
      Animated.stagger(70, motes.map(mote =>
        Animated.timing(mote, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }))),
    ]).start();
  }, [run, glow, motes]);
  if (!run) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Animated.View style={[styles.gardenGlow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, .32] }) }]} />
    <View style={styles.moteOrigin}>
      {motes.map((mote, index) => {
        const drift = (index - 4) * 13 + (index % 2 ? 6 : -6);
        return <Animated.View key={index} style={[styles.mote, index % 3 === 0 && styles.moteLarge, {
          opacity: mote.interpolate({ inputRange: [0, .15, .7, 1], outputRange: [0, 1, .8, 0] }),
          transform: [
            { translateX: mote.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
            { translateY: mote.interpolate({ inputRange: [0, 1], outputRange: [0, -110 - (index % 4) * 22] }) },
            { scale: mote.interpolate({ inputRange: [0, .3, 1], outputRange: [.4, 1, .7] }) },
          ],
        }]} />;
      })}
    </View>
  </View>;
}

function Action({ label, doneLabel, glyph, done, busy, disabled, onPress, testID }: {
  label: string; doneLabel: string; glyph: string; done: boolean; busy: boolean; disabled: boolean;
  onPress: () => void; testID: string;
}) {
  return <Pressable accessibilityRole="button" testID={testID}
    accessibilityLabel={done ? doneLabel : label} accessibilityState={{ disabled: done || disabled, busy }}
    disabled={done || disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.action, done && styles.actionDone, pressed && styles.actionPressed]}>
    {busy ? <ActivityIndicator size="small" color={GOLD} /> : <Text style={[styles.glyph, done && styles.glyphDone]}>{glyph}</Text>}
    <Text numberOfLines={1} style={[styles.actionText, done && styles.actionTextDone]}>{done ? doneLabel : label}</Text>
  </Pressable>;
}

export function VisitorEncouragement({ ownerId }: { ownerId: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 600;
  const [state, setState] = useState<VisitorEncouragementState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<Busy>('');
  const [bloom, setBloom] = useState(0);
  const [notice, setNotice] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const busyRef = useRef<Busy>('');
  const mounted = useRef(true);
  const noticeOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await loadVisitorEncouragement(ownerId);
      if (mounted.current) { setState(next); setLoadError(''); }
    } catch (error) {
      if (mounted.current) setLoadError(errorText(error));
    }
  }, [ownerId]);

  useEffect(() => { void refresh(); }, [refresh]);
  // A new day can start while the Garden stays open: re-read after local midnight
  // and whenever the app returns to the foreground.
  useEffect(() => {
    const wait = state ? msUntilReset(state.resetsAt) : null;
    const timer = wait === null ? undefined : setTimeout(() => void refresh(), wait);
    return () => { if (timer) clearTimeout(timer); };
  }, [state, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => { if (status === 'active') void refresh(); });
    return () => subscription.remove();
  }, [refresh]);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    noticeOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(noticeOpacity, { toValue: 1, duration: 260, useNativeDriver: nativeDriver }),
      Animated.delay(2600),
      Animated.timing(noticeOpacity, { toValue: 0, duration: 520, useNativeDriver: nativeDriver }),
    ]).start(({ finished }) => { if (finished && mounted.current) setNotice(''); });
  }, [noticeOpacity]);

  const support = useCallback(async () => {
    if (busyRef.current || !state || state.hasSupportedToday) return;
    busyRef.current = 'support'; setBusy('support');
    setBloom(count => count + 1); // the warmth starts on the tap itself
    try {
      const next = await giveGardenSupport(ownerId);
      if (mounted.current) { setState(next); showNotice(`Your warmth reached ${next.owner.name}'s garden.`); }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_SUPPORTED_TODAY') {
        if (mounted.current) setState(current => current && { ...current, hasSupportedToday: true });
        void refresh();
      } else if (mounted.current) {
        showNotice(error instanceof ApiError && error.code === 'COMMUNITY_ACCEPTANCE_REQUIRED'
          ? 'Accept the Community Guidelines in Settings to send support.' : errorText(error));
      }
    } finally {
      busyRef.current = ''; if (mounted.current) setBusy('');
    }
  }, [ownerId, state, refresh, showNotice]);

  const sendNote = useCallback(async (text: string) => {
    if (busyRef.current) return;
    busyRef.current = 'message'; setBusy('message');
    try {
      const next = await leaveGardenNote(ownerId, text);
      if (!mounted.current) return;
      setState(next);
      showNotice(`Your note is tucked into ${next.owner.name}'s garden.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_MESSAGED_TODAY') {
        if (mounted.current) setState(current => current && { ...current, hasMessagedToday: true });
        void refresh();
        showNotice('You already left a note here today.');
        return;
      }
      throw error;
    } finally {
      busyRef.current = ''; if (mounted.current) setBusy('');
    }
  }, [ownerId, refresh, showNotice]);

  const friendName = state?.owner.name || 'your friend';
  return <>
    <SupportBloom run={bloom} />
    <View pointerEvents="box-none" style={[styles.dock, { bottom: insets.bottom + 18, right: insets.right + 14,
      maxWidth: Math.max(200, width - insets.left - insets.right - 104) }]}>
      {notice ? <Animated.View accessibilityLiveRegion="polite" style={[styles.notice, { opacity: noticeOpacity }]}>
        <Text style={styles.noticeText}>{notice}</Text>
      </Animated.View> : null}
      <View testID="visitor-encouragement" style={styles.card}>
        <Text style={styles.caption} numberOfLines={1}>{state ? `A little kindness for ${friendName}` : 'Kindness for this garden'}</Text>
        {state ? <View style={[styles.actions, wide && styles.actionsRow]}>
          <Action testID="visitor-give-support" label="Give Support" doneLabel="Supported Today ✓" glyph="✧"
            done={state.hasSupportedToday} busy={busy === 'support'} disabled={busy === 'message'} onPress={() => void support()} />
          <Action testID="visitor-leave-message" label="Leave Message" doneLabel="Message Left Today ✓" glyph="✉"
            done={state.hasMessagedToday} busy={busy === 'message' && !composerOpen} disabled={busy === 'support'}
            onPress={() => setComposerOpen(true)} />
        </View> : loadError ? <Pressable accessibilityRole="button" onPress={() => void refresh()}>
          <Text accessibilityRole="alert" style={styles.error}>{loadError} <Text style={styles.retry}>Try again</Text></Text>
        </Pressable> : <ActivityIndicator accessibilityLabel="Loading today's kindness" size="small" color={GOLD} style={styles.loading} />}
      </View>
    </View>
    {state ? <GardenNoteComposer visible={composerOpen} friendName={friendName}
      maxLength={state.messageMaxLength || DEFAULT_NOTE_MAX_LENGTH} sending={busy === 'message'}
      onClose={() => setComposerOpen(false)} onSend={sendNote} /> : null}
  </>;
}

// A small folded note, not a chat: one short message, Send or put it away.
function GardenNoteComposer({ visible, friendName, maxLength, sending, onClose, onSend }: {
  visible: boolean; friendName: string; maxLength: number; sending: boolean;
  onClose: () => void; onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [needsGuidelines, setNeedsGuidelines] = useState(false);
  const unfold = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    setError(''); setNeedsGuidelines(false);
    unfold.setValue(0);
    Animated.timing(unfold, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(1.1)), useNativeDriver: nativeDriver }).start();
  }, [visible, unfold]);
  const problem = noteProblem(text, maxLength);
  const length = noteLength(text);
  const close = () => { if (!sending) onClose(); };
  const send = async () => {
    if (sending || problem) return;
    setError('');
    try {
      await onSend(text);
      // The note folds and settles into the garden.
      Animated.timing(unfold, { toValue: 2, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: nativeDriver })
        .start(() => { setText(''); onClose(); });
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'COMMUNITY_ACCEPTANCE_REQUIRED') {
        setNeedsGuidelines(true);
        setError('Please accept the Community Guidelines, then send your note.');
      } else setError(errorText(failure));
    }
  };
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
    <Pressable accessibilityLabel="Put the note away" onPress={close} style={styles.backdrop}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.composerWrap}>
        <Animated.View accessibilityViewIsModal style={[styles.noteCard, {
          opacity: unfold.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          transform: [
            { translateY: unfold.interpolate({ inputRange: [0, 1, 2], outputRange: [18, 0, 60] }) },
            { scale: unfold.interpolate({ inputRange: [0, 1, 2], outputRange: [.94, 1, .5] }) },
            { rotate: unfold.interpolate({ inputRange: [0, 1, 2], outputRange: ['-1.5deg', '0deg', '4deg'] }) },
          ],
        }]}>
          <Pressable onPress={() => undefined}>
            <Text style={styles.noteFlourish}>❦</Text>
            <Text accessibilityRole="header" style={styles.noteTitle}>A note for {friendName}</Text>
            <Text style={styles.noteHint}>Left beside their flowers. Only {friendName} will read it.</Text>
            <TextInput testID="garden-note-input" value={text} onChangeText={value => { setText(value); if (error && !needsGuidelines) setError(''); }}
              placeholder="Your flowers look especially peaceful today…" placeholderTextColor="#9C8FA8"
              multiline autoFocus editable={!sending} accessibilityLabel={`Note for ${friendName}`}
              style={styles.noteInput} textAlignVertical="top" />
            <View style={styles.noteFooter}>
              <Text accessibilityLabel={`${length} of ${maxLength} characters`}
                style={[styles.counter, problem === 'long' && styles.counterOver]}>{length} / {maxLength}</Text>
            </View>
            {needsGuidelines ? <View style={styles.guidelines}><CommunityGuidelines /></View> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <View style={styles.noteButtons}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={close} disabled={sending}
                style={({ pressed }) => [styles.noteButton, styles.cancel, pressed && styles.actionPressed]}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable testID="garden-note-send" accessibilityRole="button" accessibilityLabel="Send note"
                accessibilityState={{ disabled: Boolean(problem) || sending, busy: sending }}
                disabled={Boolean(problem) || sending} onPress={() => void send()}
                style={({ pressed }) => [styles.noteButton, styles.sendButton, (problem || sending) && styles.sendDisabled, pressed && styles.actionPressed]}>
                {sending ? <ActivityIndicator size="small" color={PAPER} /> : <Text style={styles.sendText}>Send ✉</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', alignItems: 'flex-end', gap: 8 },
  card: { alignSelf: 'flex-end', borderRadius: 22, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9, gap: 6,
    backgroundColor: '#FBF7EEE8', borderWidth: 1, borderColor: '#D4BD85', boxShadow: '0 4px 16px #163D4026' },
  caption: { fontFamily: serif, fontStyle: 'italic', fontSize: 13, color: GREEN, textAlign: 'center', paddingHorizontal: 4 },
  actions: { gap: 6 },
  actionsRow: { flexDirection: 'row' },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: '#FFFDF7', borderWidth: 1, borderColor: '#E3D3A8' },
  actionDone: { backgroundColor: '#F3E9CC', borderColor: GOLD, boxShadow: '0 0 10px #E9C46A55' },
  actionPressed: { opacity: .8, transform: [{ scale: .97 }] },
  glyph: { fontSize: 15, color: GOLD },
  glyphDone: { color: '#A9832F' },
  actionText: { flexShrink: 1, fontFamily: serif, fontSize: 14, fontWeight: '600', color: INK },
  actionTextDone: { color: '#6B5A2E' },
  loading: { marginVertical: 8 },
  error: { fontSize: 12, lineHeight: 17, color: '#8A4B57', textAlign: 'center', marginTop: 4 },
  retry: { textDecorationLine: 'underline', fontWeight: '600' },
  notice: { alignSelf: 'flex-end', maxWidth: 300, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: '#FFFDF5F2', borderWidth: 1, borderColor: '#E3D3A8' },
  noticeText: { fontFamily: serif, fontStyle: 'italic', fontSize: 13, color: GREEN },
  gardenGlow: { position: 'absolute', left: '5%', right: '5%', bottom: '8%', height: '45%', borderRadius: 9999,
    backgroundColor: '#FFE29A', ...Platform.select({ web: { filter: 'blur(70px)' }, default: {} }) },
  moteOrigin: { position: 'absolute', right: 96, bottom: 120, width: 1, height: 1 },
  mote: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFE9A8',
    boxShadow: '0 0 10px 2px #F6C95C' },
  moteLarge: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#FFF3C9' },
  backdrop: { flex: 1, backgroundColor: '#1A142859', justifyContent: 'center', padding: 16 },
  composerWrap: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  noteCard: { borderRadius: 18, padding: 18, backgroundColor: PAPER, borderWidth: 1, borderColor: '#E3D3A8',
    boxShadow: '0 10px 30px #1A142840' },
  noteFlourish: { textAlign: 'center', fontSize: 16, color: GOLD },
  noteTitle: { fontFamily: serif, fontSize: 21, fontWeight: '600', color: INK, textAlign: 'center', marginTop: 2 },
  noteHint: { fontSize: 12, lineHeight: 17, color: '#6F6680', textAlign: 'center', marginTop: 4, marginBottom: 12 },
  noteInput: { minHeight: 110, maxHeight: 180, borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 22, color: INK,
    fontFamily: serif, backgroundColor: '#FFFDF8', borderWidth: 1, borderColor: '#EADFC4',
    ...Platform.select({ web: { outlineColor: GOLD, outlineWidth: 1 }, default: {} }) },
  noteFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  counter: { fontSize: 11, color: '#8D8399' },
  counterOver: { color: '#A23B4A', fontWeight: '700' },
  guidelines: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: '#FFFFFF' },
  noteButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  noteButton: { minHeight: 42, minWidth: 92, borderRadius: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: '#EEE7F6' },
  cancelText: { fontSize: 14, fontWeight: '600', color: INK },
  sendButton: { backgroundColor: GREEN },
  sendDisabled: { opacity: .45 },
  sendText: { fontSize: 14, fontWeight: '700', color: PAPER },
});
