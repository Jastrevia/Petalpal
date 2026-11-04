import { EmotionalSafetyNote } from './EmotionalSafetyNote';
import { AiOutputReport } from './AiPrivacySettings';
import { usePanelTheme, type PanelTheme } from './PanelTheme';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEventVoiceInput } from '../../hooks/useEventVoiceInput';
import { useEventJournal } from '../../hooks/useEventJournal';
import { emotionMessage, memoryMessage, PRIMARY_MOODS } from '../../services/events';
import { FlowerThumb } from '../garden/planting/FlowerThumb';
import { ui } from './FeatureUI';
import { EventIllustration } from './EventIllustration';
import { dispatchOnboarding, onboardingActive } from '../onboarding/onboardingSignals';
import { onboardingTarget } from '../onboarding/onboardingTargets';

export function EventsPanel({ onClose, onGardenChanged }: { onClose: () => void; onGardenChanged?: () => void }) {
  const { theme } = usePanelTheme();
  const styles = createStyles(theme);
  const journal = useEventJournal(onGardenChanged);
  const voice = useEventVoiceInput(journal.content, journal.setContent, journal.busy);
  const hasText = Boolean(journal.content.trim());
  useEffect(() => { dispatchOnboarding({ type: 'draftChanged', hasText }); }, [hasText]);
  return <View style={styles.body}>
    <Text style={styles.text}>A little moment, a new flower. Your Primary Mood is always your choice.</Text>
    <EmotionalSafetyNote text={journal.content} />
    <EventSection title="What happened?">
      <View {...onboardingTarget('events.input')} style={styles.inputWrap}><View pointerEvents="none" style={styles.inputLeaf}><Image accessible={false} source={require('../../../assets/garden/flowers/species/olive/components/batch/branch/leafy.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" /></View>
      <TextInput accessibilityLabel="Event" placeholder="A small moment from today…" placeholderTextColor="#84998E"
        multiline maxLength={4000} value={journal.content} editable={!journal.busy}
        onChangeText={journal.setContent} style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="Voice input"
        accessibilityHint="Record up to three minutes, then review the transcript before saving"
        accessibilityState={{ disabled: journal.busy || voice.active }} disabled={journal.busy || voice.active}
        onPress={() => void voice.start()}
        style={({ pressed }) => [styles.microphone, pressed && ui.pressed, (journal.busy || voice.active) && ui.disabled]}>
        <Image accessible={false} source={require('../../../assets/events/microphone.png')}
          style={styles.microphoneIcon} resizeMode="contain" />
      </Pressable></View>
      <Text style={styles.counter}>{journal.content.length} / 4000</Text>
      {voice.active ? <View style={styles.voiceControls}>
        <Text accessibilityLiveRegion="polite" style={styles.caption}>{voice.phase === 'recording'
          ? `Recording ${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, '0')} / 3:00`
          : voice.phase === 'transcribing' ? 'Transcribing…' : 'Preparing microphone…'}</Text>
        {voice.phase === 'recording' ? <Pressable accessibilityRole="button" accessibilityLabel="Done recording"
          onPress={() => void voice.done()} style={styles.voiceControl}><Text style={styles.text}>Done</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel voice input"
          onPress={() => void voice.cancel()} style={styles.voiceControl}><Text style={styles.text}>Cancel</Text></Pressable>
      </View> : null}
      {voice.error ? <Text accessibilityRole="alert" style={styles.caption}>{voice.error}</Text> : null}
      {voice.overflow ? <Text selectable style={styles.text}>{voice.overflow}</Text> : null}
    </EventSection>
      <View style={styles.moodHeading}><Text style={styles.sectionTitle}>Choose your Primary Mood</Text><View style={styles.rule} /></View>
      <View {...onboardingTarget('events.moods')} accessibilityRole="radiogroup" accessibilityLabel="Primary Mood" style={styles.moods}>
        {PRIMARY_MOODS.map((mood, index) => {
          const selected = journal.mood === mood;
          const label = mood.replace('_BLOOM', '').toLowerCase();
          return <Pressable key={mood} accessibilityRole="radio" accessibilityLabel={label}
            accessibilityState={{ checked: selected, selected, disabled: journal.busy }} disabled={journal.busy}
            onPress={() => { journal.setMood(mood); dispatchOnboarding({ type: 'moodSelected' }); }} style={({ pressed }) => [styles.mood, selected && styles.selected, pressed && ui.pressed, journal.busy && ui.disabled]}>
            <EventIllustration index={index + 1} size={32} /><Text style={[styles.moodText, selected && styles.selectedText]}>{label}</Text>{selected ? <Text style={styles.selectedMark}>✓</Text> : null}
          </Pressable>;
        })}
      </View>
      <View {...onboardingTarget('events.save')}><EventAction title={journal.busy ? 'Saving Event…' : 'Save Event'} onPress={() => void journal.saveEvent()}
        disabled={journal.busy || voice.active || !journal.content.trim() || !journal.mood} /></View>
      {journal.flowersToday?.limit != null ? <Text style={styles.caption}>{journal.flowersLeft
        ? `${journal.flowersLeft} of ${journal.flowersToday.limit} flowers left to grow today.`
        : `You've grown today's ${journal.flowersToday.limit} flowers. Events still save; new flowers tomorrow.`}</Text> : null}
      <Text style={styles.caption}>Emotion and memory processing follow your existing account consent.</Text>
    {journal.result ? <EventSection title="Your Event is saved">
      <Text style={styles.text}>{emotionMessage(journal.result.event.emotionStatus)}</Text>
      <Text style={styles.caption}>AI emotion suggestions (not a diagnosis): {journal.result.event.secondaryEmotions.join(', ') || 'None'}</Text>
      <Text style={styles.caption}>{memoryMessage(journal.result.memoryJob)}</Text>
      {journal.pollError ? <Text accessibilityRole="alert" style={styles.text}>{journal.pollError}</Text> : null}
      {journal.result.dailyFlowers?.limitReached ? <Text style={styles.text}>
        {`Today's ${journal.result.dailyFlowers.limit} flowers are already growing, so this Event didn't add one. Come back tomorrow for new flowers.`}</Text> : null}
      <EventAction secondary title="Refresh Event status" onPress={() => void journal.refreshEventStatus()} />
    </EventSection> : null}
    {journal.error ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.text}>{journal.error}</Text></View> : null}
    <View style={ui.row}>
      <Text style={[styles.sectionTitle, { flex: 1 }]}>Your flower</Text>
      {journal.loading ? <ActivityIndicator accessibilityLabel="Loading Event flowers" color="#477D70" /> : null}
    </View>
    {!journal.loading && !journal.flowers.length ? <View style={styles.notice}>
      <Text style={styles.sectionTitle}>Your next bloom starts here</Text>
      <Text style={styles.text}>Save an Event to grow a flower in your Garden.</Text>
    </View> : null}
    {journal.flowers.map((flower, index) => {
      const placed = journal.placements.some(item => item.flowerId === flower.id);
      return <EventSection key={flower.id}>
        <View style={ui.row}>
          <FlowerThumb speciesCode={flower.speciesCode} name={flower.name} image={flower.img} size={64} style={styles.flowerImage} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.sectionTitle}>{flower.name}</Text>
            <Text style={styles.caption}>{flower.mood.replace('_BLOOM', '').toLowerCase()} · Primary Mood</Text>
          </View>
        </View>
        {flower.event ? <Text style={styles.text}>{flower.event}</Text> : null}
        <Text style={styles.caption}>AI emotion suggestions (not a diagnosis): {flower.sourceEvent?.secondaryEmotions.join(', ') || 'None'}</Text>
        {flower.sourceEventId ? <AiOutputReport kind="event" outputId={flower.sourceEventId} /> : null}
        <View {...(index === 0 ? onboardingTarget('events.plant') : {})}><EventAction secondary title={placed ? 'Adjust position' : 'Plant flower'} onPress={() => {
          // In the first-time tour the Garden itself starts planting, framed on this month's bed.
          if (onboardingActive() && !placed) { dispatchOnboarding({ type: 'plantRequested', flowerId: flower.id }); onClose(); return; }
          onClose(); journal.placeFlower(flower);
        }} /></View>
      </EventSection>;
    })}
    <EventAction secondary title="Refresh flowers" onPress={() => void journal.refresh()} disabled={journal.loading} />
    <Text style={styles.caption}>Events stay with your account. Garden positions stay on this device.</Text>
  </View>;
}
function EventSection({ title, children }: { title?: string; children: ReactNode }) {
  const { theme } = usePanelTheme();
  const styles = createStyles(theme);
  return <View style={styles.section}>{title ? <Text style={styles.sectionTitle}>{title}</Text> : null}{children}</View>;
}
function EventAction({ title, onPress, disabled = false, secondary = false }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  const { theme } = usePanelTheme();
  const styles = createStyles(theme);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, secondary && styles.secondaryAction, disabled && ui.disabled, pressed && ui.pressed]}>
    {!secondary ? <View pointerEvents="none" style={{ position: 'absolute', left: 8, bottom: 0, width: 80, height: 48, opacity: .35 }}><Image accessible={false} source={require('../../../assets/garden/flowers/species/olive/components/batch/branch/leafy.png')}
      style={{ width: '100%', height: '100%' }} resizeMode="contain" /></View> : null}
    <Text style={[styles.actionText, secondary && styles.secondaryActionText]}>{title}</Text>
  </Pressable>;
}
const createStyles = (theme: PanelTheme) => StyleSheet.create({
  body: { gap: 16 },
  text: { fontFamily: 'serif', fontSize: 16, lineHeight: 23, color: theme.text },
  caption: { fontSize: 12, lineHeight: 18, color: theme.muted },
  counter: { fontSize: 11, color: theme.muted, textAlign: 'right', marginTop: -6 },
  sectionTitle: { fontFamily: 'serif', fontWeight: '600', fontSize: 20, color: theme.text },
  section: { borderRadius: 20, padding: 16, gap: 13, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.surface, boxShadow: `inset 0 0 0 2px ${theme.inset}, 0 2px 4px #69552318` },
  notice: { padding: 15, gap: 8, borderRadius: 16, backgroundColor: theme.surface },
  inputWrap: { position: 'relative', overflow: 'hidden', borderRadius: 14, backgroundColor: theme.input },
  microphone: { position: 'absolute', right: 8, bottom: 8, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.gold,
    backgroundColor: theme.surface, boxShadow: `inset 0 0 0 2px ${theme.inset}, 0 2px 4px #69552328` },
  voiceControls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  voiceControl: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.input },
  microphoneIcon: { width: 40, height: 40 },
  inputLeaf: { position: 'absolute', right: -8, bottom: -24, width: 125, height: 125, opacity: .1 },
  moodHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1, backgroundColor: '#C5B17D' },
  input: { minHeight: 108, padding: 14, paddingRight: 62, borderRadius: 14, backgroundColor: 'transparent', borderWidth: 1,
    borderColor: theme.border, fontFamily: 'serif', fontSize: 17, lineHeight: 23, color: theme.text, textAlignVertical: 'top' },
  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mood: { flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 7, minHeight: 50,
    borderRadius: 22, borderWidth: 1, borderColor: '#B6AC7E', backgroundColor: '#EEF0E3', boxShadow: 'inset 0 0 0 2px #FFFDF0, 0 2px 3px #6A563323' },
  selected: { backgroundColor: '#C9E0D5', borderColor: '#326F69', boxShadow: 'inset 0 0 0 2px #85B4A3' },
  moodText: { fontFamily: 'serif', fontSize: 15, fontWeight: '400', textTransform: 'capitalize', color: '#385F52', flexShrink: 1 },
  selectedText: { color: '#143F42' }, selectedMark: { color: '#285F58', marginLeft: 'auto', fontSize: 13 },
  action: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    borderRadius: 28, borderWidth: 2, borderColor: '#C4A868', backgroundColor: '#246E70', boxShadow: 'inset 0 0 0 2px #99BBA3, 0 2px 5px #4E472626' },
  actionText: { fontFamily: 'serif', fontSize: 23, color: '#FFF9E9' },
  secondaryAction: { backgroundColor: '#ECF0E3', borderColor: '#CBD4BF' },
  secondaryActionText: { color: '#385F52', fontSize: 16 },
  flowerImage: { width: 64, height: 64, borderRadius: 18, backgroundColor: theme.input },
});
