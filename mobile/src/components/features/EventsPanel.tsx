import { EmotionalSafetyNote } from './EmotionalSafetyNote';
import { AiOutputReport } from './AiPrivacySettings';
import { usePanelTheme, type PanelTheme } from './PanelTheme';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useEventVoiceInput } from '../../hooks/useEventVoiceInput';
import { useEventJournal } from '../../hooks/useEventJournal';
import { PRIMARY_MOODS, type PrimaryMood } from '../../services/events';
import { saveFlowerChoice } from '../../services/flowerChoices';
import { useAppLocale } from '../../services/locale';
import { clearAnswer, pendingAnswer } from '../../services/questionAnswer';
import { FlowerThumb } from '../garden/planting/FlowerThumb';
import { ui } from './FeatureUI';
import { EventIllustration } from './EventIllustration';

const MOODS_ZH: Record<PrimaryMood, string> = {
  SUNNY_BLOOM: '开心', GENTLE_BLOOM: '温柔', QUIET_BLOOM: '低落', HEALING_BLOOM: '治愈',
  FIRE_BLOOM: '愤怒', WONDER_BLOOM: '好奇', DRIFTING_BLOOM: '迷茫', PEACEFUL_BLOOM: '平静',
};
const COPY = {
  en: {
    intro: 'What is an Event?', introText: 'Write down a small moment from today and pick the mood it left you with. PetalPal saves it, AI reads the feelings in it, and a flower grows from it for your Garden.',
    what: 'What happened?', placeholder: 'A small moment from today…', choose: 'Choose your mood', required: 'Required',
    save: 'Save & Analyze', saving: 'Saving and analyzing…', saved: 'Saved ✓', another: 'Write another Event',
    left: (n: number, of: number) => `${n} of ${of} flowers left to grow today.`, none: (of: number) => `You've grown today's ${of} flowers. Events still save; new flowers tomorrow.`,
    limit: (of: number) => `Today's ${of} flowers are already growing, so this Event didn't add one. Come back tomorrow for new flowers.`,
    yourFlower: 'Your flower', mood: 'Mood you chose', analysis: 'AI emotion analysis', notDiagnosis: 'Suggestions, not a diagnosis.',
    pending: 'AI is reading your Event…', failed: 'AI analysis is unavailable right now. Your Event and flower are saved.',
    skipped: 'AI is not turned on yet, so only your chosen mood is used. To turn it on, open Me and tap "Save my AI choices".', noEmotions: 'No other feelings stood out.',
    show: 'Show this Event to friends', showHint: 'Friends who visit your Garden can read what you wrote on this flower.', hiddenHint: 'Only you can read what you wrote. Friends see just the flower.',
    satisfied: 'Happy with it? Plant your flower in the Garden.',
    plant: 'Plant', plantWithout: 'Plant without analysis', plantNote: 'with the AI analysis', withoutNote: 'keeps only your mood',
    plantHelp: 'Plants this flower with its AI emotion analysis. When you tap the flower later, you can read the feelings AI found.',
    withoutHelp: 'Plants the same flower but leaves the AI analysis out, if it did not feel right. The flower keeps only the mood you chose.',
    voice: 'Voice input', voiceHint: 'Record up to three minutes, then review the transcript before saving', recording: (t: string) => `Recording ${t} / 3:00`,
    transcribing: 'Transcribing…', preparing: 'Preparing microphone…', done: 'Done', cancel: 'Cancel', help: "What's the difference?",
    answering: (q: string) => `Answering: ${q}`, notAnswering: 'Not an answer',
  },
  'zh-Hans': {
    intro: '什么是事件？', introText: '写下今天的一件小事，选一个它带给你的心情。PetalPal 会保存它，AI 会读一读里面的情绪，然后为你的花园长出一朵花。',
    what: '发生了什么？', placeholder: '今天的一件小事…', choose: '选择你的心情', required: '必填',
    save: '保存并分析', saving: '正在保存并分析…', saved: '已保存 ✓', another: '再写一件事',
    left: (n: number, of: number) => `今天还能长 ${n} 朵花（共 ${of} 朵）。`, none: (of: number) => `今天的 ${of} 朵花都长出来了。事件照样会保存，明天再长新花。`,
    limit: (of: number) => `今天的 ${of} 朵花已经在长了，这件事没有再长出新花。明天再来吧。`,
    yourFlower: '你的花', mood: '你选的心情', analysis: 'AI 情绪分析', notDiagnosis: '只是建议，不是诊断。',
    pending: 'AI 正在读你的事件…', failed: '暂时无法进行 AI 分析。你的事件和花都已保存。',
    skipped: 'AI 还没开启，所以只用你选的心情。想开启的话，打开「我」，点「保存我的 AI 选择」。', noEmotions: '没有发现其他明显的情绪。',
    show: '把这件事展示给朋友', showHint: '来逛花园的朋友能在这朵花上读到你写的内容。', hiddenHint: '只有你能读到写的内容，朋友只能看到花。',
    satisfied: '满意的话，就把花种进花园吧。',
    plant: '种下', plantWithout: '不带分析种下', plantNote: '保留 AI 分析', withoutNote: '只保留你选的心情',
    plantHelp: '连同 AI 情绪分析一起种下这朵花。以后点这朵花，可以看到 AI 读到的情绪。',
    withoutHelp: '种下同一朵花，但不保留 AI 分析（比如你觉得分析不准）。这朵花只保留你自己选的心情。',
    voice: '语音输入', voiceHint: '最多录三分钟，保存前可以先看一遍转出来的文字', recording: (t: string) => `正在录音 ${t} / 3:00`,
    transcribing: '正在转文字…', preparing: '正在准备麦克风…', done: '完成', cancel: '取消', help: '两种有什么区别？',
    answering: (q: string) => `回答：${q}`, notAnswering: '不是回答',
  },
};

export function EventsPanel({ onClose, onGardenChanged, introOpen = false }: { onClose: () => void; onGardenChanged?: () => void; introOpen?: boolean }) {
  const { theme } = usePanelTheme();
  const styles = createStyles(theme);
  const locale = useAppLocale(), copy = COPY[locale];
  const moodLabel = (mood: PrimaryMood) => locale === 'zh-Hans' ? MOODS_ZH[mood] : mood.replace('_BLOOM', '').toLowerCase();
  const journal = useEventJournal(onGardenChanged);
  const voice = useEventVoiceInput(journal.content, journal.setContent, journal.busy);
  const [showToFriends, setShowToFriends] = useState(false);
  const [help, setHelp] = useState(false);
  const [answering, setAnswering] = useState(() => pendingAnswer());
  const saved = journal.result;
  const flower = saved ? journal.flowers[0] : undefined;
  const status = saved?.event.emotionStatus;
  const locked = journal.busy || Boolean(saved);
  const mood = saved?.event.primaryGardenMood ?? journal.mood;
  const seconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  async function plant(withoutAnalysis: boolean) {
    if (!flower) return;
    await saveFlowerChoice(flower.id, { showToFriends, withoutAnalysis }).catch(() => undefined);
    onClose(); journal.placeFlower(flower);
  }
  return <View style={styles.body}>
    {introOpen ? <View accessibilityLiveRegion="polite" style={styles.intro}>
      <Text style={styles.introTitle}>{copy.intro}</Text>
      <Text style={styles.text}>{copy.introText}</Text>
    </View> : null}
    <EmotionalSafetyNote text={journal.content} />

    {/* Re-read: saving the answer takes it, so the next Event is not shown as an answer. */}
    {answering && !saved && pendingAnswer() ? <View style={styles.answering}>
      <Text style={styles.text}>{copy.answering(answering.question)}</Text>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { clearAnswer(); setAnswering(null); }}>
        <Text style={styles.answeringDrop}>{copy.notAnswering}</Text>
      </Pressable>
    </View> : null}
    <Text style={styles.sectionTitle}>{copy.what} <Text accessibilityLabel={copy.required} style={styles.required}>*</Text></Text>
    <View style={styles.inputWrap}>
      <TextInput accessibilityLabel={copy.what} placeholder={copy.placeholder} placeholderTextColor="#84998E"
        multiline maxLength={4000} value={saved ? saved.event.content : journal.content} editable={!locked}
        onChangeText={journal.setContent} style={saved ? [styles.input, styles.inputSaved] : styles.input} />
      {!saved ? <Pressable accessibilityRole="button" accessibilityLabel={copy.voice} accessibilityHint={copy.voiceHint}
        accessibilityState={{ disabled: journal.busy || voice.active }} disabled={journal.busy || voice.active}
        onPress={() => void voice.start()}
        style={({ pressed }) => [styles.microphone, pressed && ui.pressed, (journal.busy || voice.active) && ui.disabled]}>
        <Image accessible={false} source={require('../../../assets/events/microphone.png')} style={styles.microphoneIcon} resizeMode="contain" />
      </Pressable> : null}
    </View>
    {!saved ? <Text style={styles.counter}>{journal.content.length} / 4000</Text> : null}
    {voice.active ? <View style={styles.voiceControls}>
      <Text accessibilityLiveRegion="polite" style={styles.caption}>{voice.phase === 'recording'
        ? copy.recording(seconds(voice.seconds)) : voice.phase === 'transcribing' ? copy.transcribing : copy.preparing}</Text>
      {voice.phase === 'recording' ? <Pressable accessibilityRole="button" onPress={() => void voice.done()} style={styles.voiceControl}>
        <Text style={styles.text}>{copy.done}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" onPress={() => void voice.cancel()} style={styles.voiceControl}><Text style={styles.text}>{copy.cancel}</Text></Pressable>
    </View> : null}
    {voice.error ? <Text accessibilityRole="alert" style={styles.caption}>{voice.error}</Text> : null}
    {voice.overflow ? <Text selectable style={styles.text}>{voice.overflow}</Text> : null}

    <Text style={styles.sectionTitle}>{copy.choose} <Text accessibilityLabel={copy.required} style={styles.required}>*</Text></Text>
    <View accessibilityRole="radiogroup" accessibilityLabel={copy.choose} style={styles.moods}>
      {PRIMARY_MOODS.map((item, index) => {
        const selected = mood === item;
        return <Pressable key={item} accessibilityRole="radio" accessibilityLabel={moodLabel(item)}
          accessibilityState={{ checked: selected, selected, disabled: locked }} disabled={locked}
          onPress={() => journal.setMood(item)} style={({ pressed }) => [styles.mood, pressed && ui.pressed, locked && !selected && ui.disabled]}>
          <View style={[styles.moodCircle, selected && styles.moodCircleSelected]}><EventIllustration index={index + 1} size={34} /></View>
          <Text numberOfLines={1} style={[styles.moodText, selected && styles.selectedText]}>{moodLabel(item)}</Text>
        </Pressable>;
      })}
    </View>

    {saved ? <EventAction secondary title={copy.saved} onPress={() => {}} disabled />
      : <EventAction title={journal.busy ? copy.saving : copy.save} onPress={() => void journal.saveEvent()}
        disabled={journal.busy || voice.active || !journal.content.trim() || !journal.mood} />}
    {!saved && journal.flowersToday?.limit != null ? <Text style={styles.caption}>{journal.flowersLeft
      ? copy.left(journal.flowersLeft, journal.flowersToday.limit) : copy.none(journal.flowersToday.limit)}</Text> : null}
    {journal.error ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.text}>{journal.error}</Text></View> : null}

    {/* After Save & Analyze: the flower, what AI read, who can see it, and planting. */}
    {saved ? <>
      {saved.dailyFlowers?.limitReached ? <View style={styles.notice}><Text style={styles.text}>{copy.limit(saved.dailyFlowers.limit)}</Text></View> : null}
      {flower ? <View style={styles.card}>
        <View style={ui.row}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.cardLabel}>{copy.yourFlower}</Text>
            <Text style={styles.sectionTitle}>{flower.name}</Text>
            <Text style={styles.caption}>{copy.mood}: {moodLabel(flower.mood as PrimaryMood)}</Text>
          </View>
          <FlowerThumb speciesCode={flower.speciesCode} name={flower.name} image={flower.img} size={84} style={styles.flowerImage} />
        </View>
        <View style={styles.rule} />
        <Text style={styles.cardLabel}>{copy.analysis}</Text>
        {status === 'PENDING' || status === 'RUNNING' ? <View style={ui.row}><ActivityIndicator color="#477D70" /><Text style={styles.text}>{copy.pending}</Text></View>
          : status === 'SUCCESS' ? <>
            <View style={styles.chips}>{(saved.event.secondaryEmotions.length ? saved.event.secondaryEmotions : []).map(item =>
              <Text key={item} style={styles.chip}>{item}</Text>)}</View>
            {!saved.event.secondaryEmotions.length ? <Text style={styles.text}>{copy.noEmotions}</Text> : null}
            <Text style={styles.caption}>{copy.notDiagnosis}</Text>
            <AiOutputReport kind="event" outputId={saved.event.id} />
          </> : <Text style={styles.text}>{status === 'FAILED' || (status === 'SKIPPED' && journal.aiProcessingOn) ? copy.failed : copy.skipped}</Text>}
        {journal.pollError ? <Text accessibilityRole="alert" style={styles.caption}>{journal.pollError}</Text> : null}
      </View> : journal.loading ? <ActivityIndicator color="#477D70" /> : null}

      {flower ? <>
        <View style={styles.shareRow}>
          <Eye open={showToFriends} color={theme.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.text}>{copy.show}</Text>
            <Text style={styles.caption}>{showToFriends ? copy.showHint : copy.hiddenHint}</Text>
          </View>
          <Switch accessibilityLabel={copy.show} value={showToFriends} onValueChange={setShowToFriends}
            trackColor={{ false: '#B9B39C', true: '#5AA4AB' }} />
        </View>
        <Text style={styles.satisfied}>{copy.satisfied}</Text>
        {/* Two equal choices side by side; one ? under both explains the difference. */}
        <View style={styles.plantRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.plant} onPress={() => void plant(false)}
            style={({ pressed }) => [styles.choice, styles.choicePrimary, pressed && ui.pressed]}>
            <Text style={styles.choiceTitle}>🌱 {copy.plant}</Text>
            <Text style={styles.choiceNote}>{copy.plantNote}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.plantWithout} onPress={() => void plant(true)}
            style={({ pressed }) => [styles.choice, styles.choiceSecondary, pressed && ui.pressed]}>
            <Text style={[styles.choiceTitle, { color: '#2F5D52' }]}>{copy.plantWithout}</Text>
            <Text style={[styles.choiceNote, { color: '#5E7A6E' }]}>{copy.withoutNote}</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: help }} hitSlop={8} onPress={() => setHelp(!help)} style={styles.helpLink}>
          <View style={[styles.helpDot, help && styles.helpDotActive]}><Text style={[styles.helpDotText, help && { color: '#FFF9E9' }]}>?</Text></View>
          <Text style={styles.helpLinkText}>{copy.help}</Text>
        </Pressable>
        {help ? <View accessibilityLiveRegion="polite" style={styles.helpBubble}>
          <Text style={styles.helpTitle}>🌱 {copy.plant}</Text>
          <Text style={styles.helpText}>{copy.plantHelp}</Text>
          <Text style={[styles.helpTitle, { marginTop: 6 }]}>{copy.plantWithout}</Text>
          <Text style={styles.helpText}>{copy.withoutHelp}</Text>
        </View> : null}
      </> : null}
      <EventAction secondary title={copy.another} onPress={() => { journal.reset(); setShowToFriends(false); setHelp(false); }} />
    </> : null}
  </View>;
}

// A small drawn eye: open when friends can read the Event, crossed out when they cannot.
function Eye({ open, color }: { open: boolean; color: string }) {
  return <View accessible={false} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', opacity: open ? 1 : .7 }}>
    <View style={{ width: 24, height: 14, borderRadius: 12, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
    </View>
    {!open ? <View style={{ position: 'absolute', width: 28, height: 2, borderRadius: 1, backgroundColor: color, transform: [{ rotate: '-35deg' }] }} /> : null}
  </View>;
}
function EventAction({ title, onPress, disabled = false, secondary = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}): ReactNode {
  const { theme } = usePanelTheme();
  const styles = createStyles(theme);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, secondary && styles.secondaryAction, disabled && !secondary && ui.disabled, pressed && ui.pressed]}>
    {!secondary ? <View pointerEvents="none" style={{ position: 'absolute', left: 8, bottom: 0, width: 80, height: 48, opacity: .35 }}><Image accessible={false} source={require('../../../assets/garden/flowers/species/olive/components/batch/branch/leafy.png')}
      style={{ width: '100%', height: '100%' }} resizeMode="contain" /></View> : null}
    <Text style={[styles.actionText, secondary && styles.secondaryActionText]}>{title}</Text>
  </Pressable>;
}
const createStyles = (theme: PanelTheme) => StyleSheet.create({
  body: { gap: 14 },
  text: { fontFamily: 'serif', fontSize: 16, lineHeight: 23, color: theme.text },
  answering: { gap: 4 },
  answeringDrop: { fontFamily: 'serif', fontSize: 16, lineHeight: 23, color: theme.text, textDecorationLine: 'underline', opacity: .75 },
  caption: { fontSize: 12, lineHeight: 18, color: theme.muted },
  counter: { fontSize: 11, color: theme.muted, textAlign: 'right', marginTop: -8 },
  sectionTitle: { fontFamily: 'serif', fontWeight: '600', fontSize: 19, color: theme.text },
  required: { color: '#C0634F', fontSize: 18 },
  intro: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  introTitle: { fontFamily: 'serif', fontWeight: '700', fontSize: 15, color: theme.text },
  notice: { padding: 14, gap: 8, borderRadius: 16, backgroundColor: theme.surface },
  card: { borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.surface,
    boxShadow: `inset 0 0 0 2px ${theme.inset}, 0 2px 4px #69552318` },
  cardLabel: { fontSize: 12, fontWeight: '700', letterSpacing: .6, textTransform: 'uppercase', color: theme.muted },
  rule: { height: 1, backgroundColor: '#C5B17D66' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: '#E3EEE6', color: '#2F5D52', fontSize: 14, fontFamily: 'serif' },
  inputWrap: { position: 'relative', overflow: 'hidden', borderRadius: 14, backgroundColor: theme.input },
  microphone: { position: 'absolute', right: 8, bottom: 8, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.gold,
    backgroundColor: theme.surface, boxShadow: `inset 0 0 0 2px ${theme.inset}, 0 2px 4px #69552328` },
  voiceControls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  voiceControl: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.input },
  microphoneIcon: { width: 40, height: 40 },
  input: { minHeight: 108, padding: 14, paddingRight: 62, borderRadius: 14, backgroundColor: 'transparent', borderWidth: 1,
    borderColor: theme.border, fontFamily: 'serif', fontSize: 17, lineHeight: 23, color: theme.text, textAlignVertical: 'top' },
  inputSaved: { paddingRight: 14, opacity: .85 },
  moods: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  mood: { width: '25%', alignItems: 'center', gap: 4 },
  moodCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#B6AC7E', backgroundColor: '#EEF0E3', boxShadow: 'inset 0 0 0 2px #FFFDF0, 0 2px 3px #6A563323' },
  moodCircleSelected: { backgroundColor: '#C9E0D5', borderColor: '#326F69', borderWidth: 2, boxShadow: 'inset 0 0 0 2px #85B4A3' },
  moodText: { fontFamily: 'serif', fontSize: 13, textTransform: 'capitalize', color: theme.text },
  selectedText: { fontWeight: '700' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  satisfied: { fontFamily: 'serif', fontStyle: 'italic', fontSize: 14, color: theme.muted },
  plantRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  choice: { flex: 1, minHeight: 72, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 10 },
  choicePrimary: { backgroundColor: '#246E70', borderColor: '#C4A868', boxShadow: 'inset 0 0 0 2px #99BBA3, 0 2px 5px #4E472626' },
  choiceSecondary: { backgroundColor: '#ECF0E3', borderColor: '#C4A868', boxShadow: 'inset 0 0 0 2px #FFFDF0, 0 2px 5px #4E472618' },
  choiceTitle: { fontFamily: 'serif', fontSize: 18, lineHeight: 22, color: '#FFF9E9', textAlign: 'center' },
  choiceNote: { fontSize: 12, lineHeight: 16, color: '#D7E8DC', textAlign: 'center' },
  helpLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'center', paddingVertical: 2 },
  helpLinkText: { fontFamily: 'serif', fontSize: 14, color: theme.muted, textDecorationLine: 'underline' },
  helpDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#C4A868', backgroundColor: '#FFF9E9' },
  helpDotActive: { backgroundColor: '#246E70' },
  helpDotText: { fontSize: 13, fontWeight: '700', color: '#246E70' },
  helpBubble: { gap: 4, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#C4A868', backgroundColor: '#FFF9E9' },
  helpTitle: { fontFamily: 'serif', fontWeight: '700', fontSize: 15, color: '#385F52' },
  helpText: { fontFamily: 'serif', fontSize: 15, lineHeight: 22, color: '#4B3A27' },
  action: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    borderRadius: 28, borderWidth: 2, borderColor: '#C4A868', backgroundColor: '#246E70', boxShadow: 'inset 0 0 0 2px #99BBA3, 0 2px 5px #4E472626' },
  actionText: { fontFamily: 'serif', fontSize: 22, color: '#FFF9E9' },
  secondaryAction: { backgroundColor: '#ECF0E3', borderColor: '#CBD4BF' },
  secondaryActionText: { color: '#385F52', fontSize: 16 },
  flowerImage: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.input },
});
