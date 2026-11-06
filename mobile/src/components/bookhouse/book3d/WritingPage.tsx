import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EmotionalSafetyNote } from '../../features/EmotionalSafetyNote';
import { useSafetyWatch } from '../../features/SafetySupport';
import { useEventVoiceInput } from '../../../hooks/useEventVoiceInput';
import { formatLocalDate, journalLocked, savePrivateJournal, updatePrivateJournal, weekdayOf, type JournalDay } from '../../../services/bookhouse';
import { JournalCover } from '../JournalCover';
import { Icon, LOCK_ICON } from '../TreehouseArt';
import { treehouseZh, tt } from '../../../services/treehouseCopy';
import { useLayoutWindow, useWebVisibleBottom } from './layoutWindow';
import { rightPageOf } from './usePageFaces';
import { joinJournal, splitJournal, type Draft, type ReadingMetrics } from './readingLayout';
export type { Draft } from './readingLayout';

const INK = '#4A3B27', SOFT = '#7A6447', RULE = '#C2A06B', MAX = 2000;
export type SaveState = 'clean' | 'unsaved' | 'saving' | 'saved' | 'failed';
type Rect = { x: number; y: number; width: number; height: number };

export type WritingPageHandle = { saveButton: () => Promise<Rect | null> };

/** The right page brought close: the day's private journal, read on the paper, and written or edited in place after
 *  "Edit" (a new journal opens ready to write). A Daily Grow journal is shown as written, read-only, with a small lock. Saving reports success only once the server confirms. */
export const WritingPage = forwardRef<WritingPageHandle, {
  rect: Rect; m: ReadingMetrics; background: string; shade: number; fontRegular?: string; fontItalic?: string;
  day: JournalDay; slot: number; today: string; userId: string;
  draft: Draft | null; onDraft: (draft: Draft | null) => void; justSaved?: boolean;
  /** False while the page is mounted beside the one in view (close up on the left page): it never takes focus. */
  active?: boolean;
  onSlot: (slot: number) => void; onActions: () => void;
  onSaving: () => void; onSaved: (saved: { id: string; content: string }, created: boolean) => Promise<void> | void; onFailed: () => void;
}>(function WritingPage({ rect, m, background, shade, fontRegular, fontItalic, day, slot, today, userId, draft, onDraft, justSaved, active = true, onSlot, onActions, onSaving, onSaved, onFailed }, ref) {
  const which = rightPageOf(day, slot, today);
  const entry = which.kind === 'journal' ? day.journals[which.index] : null;
  const journal = entry?.journal || null;
  const locked = !!entry && journalLocked(entry);
  const writable = !locked && (which.kind === 'new' || !!journal);
  const saved = splitJournal(journal?.content || '');
  const [text, setTextState] = useState<Draft>(draft || saved);
  const [state, setState] = useState<SaveState>(draft ? 'unsaved' : justSaved ? 'saved' : 'clean');
  // Reading and editing are separate: a saved journal opens to read (no editing controls) and is edited only after
  // "Edit"; a new journal, or one with an unsaved draft, opens ready to write. A confirmed save returns to reading.
  const [editing, setEditing] = useState(which.kind === 'new' || !!draft);
  const editable = writable && editing;
  const [error, setError] = useState('');
  const busy = state === 'saving';
  const dirty = joinJournal(text) !== joinJournal(saved);
  const setText = (next: Draft) => {
    setTextState(next);
    const changed = joinJournal(next) !== joinJournal(saved);
    onDraft(changed ? next : null);
    setState(changed ? 'unsaved' : 'clean'); setError('');
  };
  const voice = useEventVoiceInput(text.body, body => setText({ ...text, body }), busy, MAX, 'journal');
  const saving = useRef(false);
  const saveRef = useRef<View>(null);
  useImperativeHandle(ref, () => ({
    saveButton: () => new Promise(resolve => {
      if (!saveRef.current?.measureInWindow) { resolve(null); return; }
      saveRef.current.measureInWindow((x, y, width, height) => resolve(width ? { x, y, width, height } : null));
    }),
  }), []);

  // Words of suicide, violence or danger open the caring window (with real numbers) before saving.
  const safety = useSafetyWatch(`${text.title}\n${text.body}`);
  const save = async () => {
    const content = joinJournal(text);
    if (saving.current || voice.active || !writable || !content || !dirty) return;
    saving.current = true; setState('saving'); setError(''); onSaving();
    try {
      const result = journal ? await updatePrivateJournal(userId, journal.id, content) : await savePrivateJournal(userId, content);
      onDraft(null);
      setState('saved');
      setEditing(false);
      Keyboard.dismiss();
      await onSaved(result, !journal);
    } catch (e) {
      // The draft stays on the page; nothing claims it was saved.
      setState('failed');
      setError(`${e instanceof Error ? e.message : tt('Unable to save your journal.')}${journal ? '' : tt(' If the connection was interrupted, check this page before saving again.')}`);
      onFailed();
    } finally { saving.current = false; }
  };

  // The keyboard covers the lower part of the screen: the page's writing area ends above it (the paper stays put).
  // In the apps the Keyboard events give its height; in a phone's browser the visible part of the page does.
  const { height: screenH } = useLayoutWindow();
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const webVisibleBottom = useWebVisibleBottom();
  const visibleBottom = Platform.OS === 'web' ? webVisibleBottom ?? screenH : screenH - keyboard;
  const covered = Math.max(0, rect.y + rect.height - visibleBottom + 6);
  const bottomPad = Math.max(m.padBottom, covered);

  const scroll = useRef<ScrollView>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [noteHeight, setNoteHeight] = useState(0);
  const [viewport, setViewport] = useState(0);
  const bodyTop = useRef(0);
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  // Typing at the end of a long entry keeps the newest line in view above the footer (and the keyboard).
  useEffect(() => {
    if (!caretAtEnd || !viewport) return;
    const bottom = bodyTop.current + bodyHeight;
    scroll.current?.scrollTo({ y: Math.max(0, bottom - viewport + 24), animated: false });
  }, [bodyHeight, viewport, caretAtEnd]);

  const bodyText = { fontSize: m.body.size, lineHeight: m.body.line, color: '#43361F' };
  const minBody = Math.max(m.body.line * 4, viewport - noteHeight - 28);
  const regular = { fontFamily: fontRegular }, italic = { fontFamily: fontItalic, fontStyle: fontItalic ? undefined : 'italic' as const };
  const status = tt(state === 'saving' ? 'Saving…' : state === 'failed' ? 'Save failed' : state === 'unsaved' ? 'Unsaved changes'
    : state === 'saved' ? 'Saved' : '');
  const tabs = day.journals.length + (day.localDate === today ? 1 : 0);
  const canSave = writable && dirty && !!joinJournal(text) && !voice.active && !busy;

  return <View testID="writing-page" style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
    {safety.sheet}
    <Image accessible={false} source={{ uri: background }} fadeDuration={0} resizeMode="stretch" style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 1 - shade }]} />
    <View style={{ position: 'absolute', left: m.padLeft, right: m.padRight, top: m.padTop, bottom: bottomPad }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', minHeight: m.actions.size }}>
        <View style={{ flex: 1, paddingRight: 6 }}>
          <Text style={[regular, { fontSize: m.weekday.size, lineHeight: m.weekday.line, letterSpacing: m.weekday.spacing, color: SOFT }]}>{weekdayOf(day.localDate).toUpperCase()}</Text>
          <Text accessibilityRole="header" style={[italic, { fontSize: m.date.size, lineHeight: m.date.line, color: INK }]}>{formatLocalDate(day.localDate)}</Text>
        </View>
        {!!status && <View accessibilityLiveRegion="polite" accessibilityLabel={treehouseZh() ? `保存状态：${status}` : `Save state: ${status}`} style={[styles.chip, state === 'failed' && styles.chipFailed, state === 'unsaved' && styles.chipUnsaved]}>
          {state === 'saving' && <ActivityIndicator size="small" color="#7A5A2E" style={{ transform: [{ scale: .7 }] }} />}
          <Text style={[regular, styles.chipText, state === 'failed' && { color: '#8A3B2A' }]}>{status}</Text>
        </View>}
        {journal && writable && !editing && <Pressable accessibilityRole="button" accessibilityLabel={tt('Edit this journal')} onPress={() => setEditing(true)} hitSlop={6}
          style={({ pressed }) => [styles.edit, { height: m.actions.size }, pressed && { opacity: .7 }]}><Text style={[italic, styles.editText]}>{tt('Edit')}</Text></Pressable>}
        {journal && !locked && <Pressable accessibilityRole="button" accessibilityLabel={tt('Journal actions')} onPress={onActions} hitSlop={6} style={[styles.more, { width: m.actions.size, height: m.actions.size, borderRadius: m.actions.size / 2 }]}>
          <View style={{ flexDirection: 'row', gap: 3.3 }}>{[0, 1, 2].map(i => <View key={i} style={styles.dot} />)}</View>
        </Pressable>}
      </View>
      {tabs > 1 && <View accessibilityRole="tablist" accessibilityLabel={treehouseZh() ? `${formatLocalDate(day.localDate)}的日记` : `Journals on ${formatLocalDate(day.localDate)}`} style={styles.tabs}>
        {day.journals.map((_, i) => <Pressable key={i} accessibilityRole="tab" accessibilityLabel={treehouseZh() ? `第 ${i + 1} 篇，共 ${day.journals.length} 篇` : `Journal ${i + 1} of ${day.journals.length}`} accessibilityState={{ selected: slot === i }}
          disabled={busy} onPress={() => onSlot(i)} hitSlop={4} style={[styles.tab, slot === i && styles.tabOn]}><Text style={[regular, styles.tabText, slot === i && styles.tabTextOn]}>{i + 1}</Text></Pressable>)}
        {day.localDate === today && <Pressable accessibilityRole="tab" accessibilityLabel={tt('Write another journal for today')} accessibilityState={{ selected: which.kind === 'new' }}
          disabled={busy} onPress={() => onSlot(day.journals.length)} hitSlop={4} style={[styles.tab, which.kind === 'new' && styles.tabOn]}>
          <Text style={[regular, styles.tabText, which.kind === 'new' && styles.tabTextOn]}>+</Text></Pressable>}
      </View>}
      {locked && <View style={styles.lockRow}>
        <Icon source={LOCK_ICON} size={18} />
        <Text style={[italic, { flex: 1, fontSize: m.grown.size, lineHeight: m.grown.line, color: '#6E5A32' }]}>{tt('From Daily Grow · read-only. It grew a flower, so it stays as written to keep your Flower History whole.')}</Text>
      </View>}
      {which.kind === 'none' ? <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
        <Text style={[italic, { fontSize: m.title.size, lineHeight: m.title.line, color: INK }]}>{tt('No private journal on this day.')}</Text>
        <Text style={[regular, { fontSize: m.body.size * .9, lineHeight: m.body.line * .9, color: SOFT }]}>{tt('New journals are written on today’s page — tap the Today bookmark.')}</Text>
      </View> : <>
        {editable ? <TextInput accessibilityLabel={tt('Journal title (optional)')} placeholder={tt('Title (optional)')} placeholderTextColor="#A8916C" value={text.title}
          onChangeText={title => setText({ ...text, title: title.replace(/\n/g, ' ') })} maxLength={60} editable={!busy} returnKeyType="next" blurOnSubmit
          style={[italic, styles.input, { marginTop: m.title.gap, fontSize: m.title.size, lineHeight: m.title.line, minHeight: m.title.line + 6, color: INK }]} />
          : !!text.title && <Text style={[italic, { marginTop: m.title.gap, fontSize: m.title.size, lineHeight: m.title.line, color: INK }]}>{text.title}</Text>}
        <View style={{ height: 1, backgroundColor: RULE, marginVertical: m.rule.gap * .8 }} />
        <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator
          onLayout={e => setViewport(e.nativeEvent.layout.height)} contentContainerStyle={{ paddingBottom: 12 }}>
          <View onLayout={e => { bodyTop.current = e.nativeEvent.layout.y; }}>
            {editable ? (() => {
              const input = <TextInput testID="journal-body" accessibilityLabel={tt('Private journal')} accessibilityHint={tt('Only for you. Not sent to AI or saved as an Event memory.')}
                placeholder={tt('Write your thoughts here…')} placeholderTextColor="#A8916C" value={text.body} multiline scrollEnabled={false} maxLength={MAX - text.title.length}
                editable={!busy && !voice.active} textAlignVertical="top" autoFocus={active && which.kind === 'new' && !text.body}
                onChangeText={body => setText({ ...text, body })}
                onSelectionChange={e => setCaretAtEnd(e.nativeEvent.selection.end >= text.body.length - 1)}
                onContentSizeChange={Platform.OS === 'web' ? undefined : e => setBodyHeight(e.nativeEvent.contentSize.height)}
                style={[regular, styles.input, bodyText, Platform.OS === 'web' ? StyleSheet.absoluteFill : { minHeight: minBody }]} />;
              if (Platform.OS !== 'web') return input;
              // Web: a text area does not grow with its words (and its scroll height never shrinks back), so the same
              // words, set invisibly in the same type and width, give it its height; it fills that. Their height is
              // where the newest line ends (kept in view while typing at the end).
              return <View style={{ minHeight: minBody }}>
                <Text aria-hidden onLayout={e => setBodyHeight(e.nativeEvent.layout.height)} style={[regular, bodyText, { color: 'transparent' }]}>{text.body}{'\u200b'}</Text>
                {input}
              </View>;
            })()
              : <Text selectable style={[regular, bodyText]}>{text.body}</Text>}
          </View>
          {editable && <View style={{ marginTop: 10 }} onLayout={e => setNoteHeight(e.nativeEvent.layout.height)}><EmotionalSafetyNote text={`${text.title}\n${text.body}`}
            style={{ fontFamily: fontRegular, fontSize: 12, lineHeight: 17, color: SOFT }} /></View>}
          {journal && <View style={{ marginTop: 14 }}><JournalCover key={journal.id} userId={userId} journalId={journal.id} size={112} readOnly={writable && !editing} /></View>}
          {!journal && editable && <Text style={[italic, { marginTop: 12, fontSize: 13, color: SOFT }]}>{tt('Photos can be added once the journal is saved.')}</Text>}
        </ScrollView>
        {!!error && <Text accessibilityRole="alert" style={[regular, styles.error]}>{error}</Text>}
        {voice.active && <View style={styles.voiceRow}>
          <Text accessibilityLiveRegion="polite" style={[regular, styles.small]}>{voice.phase === 'recording' ? `${tt('Recording')} ${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, '0')} / 3:00` : tt(voice.phase === 'transcribing' ? 'Transcribing…' : 'Preparing microphone…')}</Text>
          {voice.phase === 'recording' && <Pressable accessibilityRole="button" accessibilityLabel={tt('Done recording')} onPress={() => void voice.done()} style={styles.textButton}><Text style={[regular, styles.small]}>{tt('Done')}</Text></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={tt('Cancel voice input')} onPress={() => void voice.cancel()} style={styles.textButton}><Text style={[regular, styles.small]}>{tt('Cancel')}</Text></Pressable>
        </View>}
        {!!voice.error && <Text accessibilityRole="alert" style={[regular, styles.error]}>{voice.error}</Text>}
        {!!voice.overflow && <Text selectable style={[regular, styles.small]}>{voice.overflow}</Text>}
        {editable && <View style={styles.footer}>
          <Pressable accessibilityRole="button" accessibilityLabel={tt('Dictate private journal')} accessibilityHint={tt('Record up to three minutes, then review before saving')}
            disabled={busy || voice.active} onPress={() => void voice.start()} style={{ width: 44, height: 44, opacity: busy || voice.active ? .45 : 1 }}>
            <Image accessible={false} source={require('../../../../assets/events/microphone.webp')} style={{ width: 44, height: 44 }} resizeMode="contain" />
          </Pressable>
          <Text style={[regular, styles.small, { flex: 1 }]}>{joinJournal(text).length} / {MAX}</Text>
          {/* Editing a saved journal with nothing changed: "Done" goes back to reading; any change makes it "Save". */}
          {journal && !dirty && state !== 'failed' && !busy ? <Pressable accessibilityRole="button" accessibilityLabel={tt('Done editing')} onPress={() => { Keyboard.dismiss(); setEditing(false); setState('clean'); }}
            style={({ pressed }) => [styles.save, styles.done, pressed && { transform: [{ scale: .97 }] }]}><Text style={[italic, styles.saveText]}>{tt('Done')}</Text></Pressable>
          : <View ref={saveRef} collapsable={false}>
            <Pressable accessibilityRole="button" accessibilityLabel={tt(state === 'failed' ? 'Retry saving journal' : journal ? 'Save changes' : 'Save private journal')}
              accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={() => safety.guard(() => void save())}
              style={({ pressed }) => [styles.save, !canSave && { opacity: .5 }, pressed && { transform: [{ scale: .97 }] }]}>
              <Text style={[italic, styles.saveText]}>{tt(busy ? 'Saving…' : state === 'failed' ? 'Retry' : 'Save')}</Text>
            </Pressable>
          </View>}
        </View>}
      </>}
    </View>
  </View>;
});

const styles = StyleSheet.create({
  input: { padding: 0, margin: 0, borderWidth: 0, backgroundColor: 'transparent', textAlignVertical: 'top',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 26, paddingHorizontal: 9, marginTop: 4, marginRight: 6, borderRadius: 13,
    backgroundColor: '#EFE0BFCC', borderWidth: StyleSheet.hairlineWidth, borderColor: '#C2A06B' },
  chipUnsaved: { backgroundColor: '#F6E6BFEE', borderColor: '#B98E45' },
  chipFailed: { backgroundColor: '#F4D9CCEE', borderColor: '#B0644A' },
  chipText: { fontSize: 12.5, color: '#6E5632' },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7EBD2E6', borderWidth: 1, borderColor: '#C9A264' },
  dot: { width: 3.2, height: 3.2, borderRadius: 1.6, backgroundColor: '#5C4630' },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  tab: { minWidth: 32, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C7AA77', backgroundColor: '#F4E7CBB0' },
  tabOn: { backgroundColor: '#A8443A', borderColor: '#D9B56A' },
  tabText: { fontSize: 14, color: '#5A4630' },
  tabTextOn: { color: '#FFF4DE', fontWeight: '600' },
  lockRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#EADAB866' },
  error: { fontSize: 13.5, lineHeight: 18, color: '#8A3B2A', marginTop: 4 },
  small: { fontSize: 13, color: SOFT },
  voiceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  textButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  save: { minHeight: 44, minWidth: 92, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E7C69B', borderWidth: 1.5, borderColor: '#B98E45', shadowColor: '#3A2410', shadowOpacity: .25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  saveText: { fontSize: 18, color: '#573A22' },
  done: { backgroundColor: '#F1E2C2' },
  edit: { minWidth: 58, paddingHorizontal: 14, marginTop: 4, marginRight: 6, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E7C69B', borderWidth: 1, borderColor: '#B98E45' },
  editText: { fontSize: 16, color: '#573A22' },
});
