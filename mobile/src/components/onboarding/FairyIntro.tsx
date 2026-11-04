import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FairyPortrait, Hover, portraitWidth } from './FairyArt';
import { GOLD, INK, PAPER, serif } from './OnboardingGuide';
import { stepLine, UI_COPY, type OnboardingLocale } from './onboardingCopy';
import { dispatchOnboarding, saveFairyName } from './onboardingStore';
import { FAIRY_NAME_MAX_LENGTH, fairyNameProblem } from './onboardingSteps';

const EASE = Easing.inOut(Easing.cubic);

// Phase one, cinematic: she flies in large, asks for her name, saves it to the account, then
// hops for joy, turns one small somersault in the air and settles into a hover before she
// shrinks into the small guide that leads the rest of the tour.
export function FairyIntro({ step, locale, fairyName }: { step: 'intro.name' | 'intro.celebrate'; locale: OnboardingLocale; fairyName: string | null }) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const copy = UI_COPY[locale];
  const compact = screen.height < 640;
  const heroHeight = Math.min(screen.height * (compact ? .3 : .38), 360);
  const heroWidth = portraitWidth(heroHeight);

  const veil = useSharedValue(0);
  const flight = useSharedValue(step === 'intro.name' ? 0 : 1);
  const hop = useSharedValue(0);
  const spin = useSharedValue(0);
  const joy = useSharedValue(0);
  const leave = useSharedValue(0);
  const [celebrated, setCelebrated] = useState(false);
  const [arrived, setArrived] = useState(step !== 'intro.name');

  useEffect(() => {
    veil.value = withTiming(1, { duration: reduced ? 0 : 700, easing: EASE });
    if (step === 'intro.name') {
      flight.value = withTiming(1, { duration: reduced ? 0 : 1900, easing: Easing.out(Easing.cubic) },
        finished => { if (finished) runOnJS(setArrived)(true); });
    }
  }, []);

  useEffect(() => {
    if (step !== 'intro.celebrate') return;
    if (reduced) { setCelebrated(true); return; }
    // Excited: two quick hops and a little glow …
    joy.value = withSequence(withTiming(1, { duration: 260 }), withDelay(1500, withTiming(0, { duration: 600 })));
    hop.value = withSequence(
      withTiming(-16, { duration: 170, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 170, easing: Easing.in(Easing.quad) }),
      withTiming(-12, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) }),
      // … then one somersault: up along an arc while turning a full circle, and down again.
      withTiming(-heroHeight * .22, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 560, easing: Easing.inOut(Easing.cubic) }));
    spin.value = withDelay(640, withTiming(360, { duration: 1080, easing: Easing.inOut(Easing.cubic) },
      finished => { if (finished) runOnJS(setCelebrated)(true); }));
  }, [step]);

  const flyStyle = useAnimatedStyle(() => {
    const t = flight.value;
    // From high on the right, a soft curve that ends facing the visitor.
    const x = (1 - t) * screen.width * .55;
    const y = (1 - t) * -screen.height * .32 - Math.sin(t * Math.PI) * 24;
    const scale = .45 + .55 * t - leave.value * .72;
    return {
      opacity: Math.min(1, t * 3) * (1 - leave.value),
      transform: [{ translateX: x - leave.value * screen.width * .28 }, { translateY: y + hop.value + leave.value * screen.height * .34 },
        { rotate: `${(1 - t) * -9 + spin.value}deg` }, { scale }],
    };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: joy.value * .9, transform: [{ scale: .8 + joy.value * .35 }] }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value * (1 - leave.value) }));

  const finishIntro = () => {
    leave.value = withTiming(1, { duration: reduced ? 0 : 760, easing: EASE },
      finished => { if (finished) runOnJS(dispatchOnboarding)({ type: 'celebrated' }); });
  };

  return <View style={StyleSheet.absoluteFill}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil, veilStyle]} />
    {/* Absorb every Garden tap while she introduces herself. */}
    <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => undefined} />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.stage, { paddingTop: insets.top + (compact ? 8 : 28), paddingBottom: insets.bottom + 24 }]}>
        <Animated.View testID="onboarding-hero" style={[{ width: heroWidth, height: heroHeight, alignItems: 'center' }, flyStyle]}>
          <Animated.View pointerEvents="none" style={[styles.glow, { width: heroWidth * 1.6, height: heroHeight * .9, top: heroHeight * .05 }, glowStyle]} />
          <Hover amplitude={6} period={2800}><FairyPortrait height={heroHeight} /></Hover>
        </Animated.View>
        {step === 'intro.name' && arrived ? <NamingCard locale={locale} /> : null}
        {step === 'intro.celebrate' && celebrated ? <Animated.View entering={reduced ? undefined : FadeIn.duration(420)} exiting={FadeOut.duration(200)}
          style={styles.card} accessibilityLiveRegion="polite">
          {fairyName ? <Text style={styles.speaker}>✦ {fairyName}</Text> : null}
          <Text style={styles.line}>{stepLine('intro.celebrate', locale)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.next} onPress={finishIntro} hitSlop={10}
            style={({ pressed }) => [styles.next, pressed && styles.pressed]}><Text style={styles.nextArrow}>›</Text></Pressable>
        </Animated.View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

function NamingCard({ locale }: { locale: OnboardingLocale }) {
  const copy = UI_COPY[locale];
  const reduced = useReducedMotion();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const problem = fairyNameProblem(name);
  async function submit() {
    if (busy.current) return;
    if (problem) {
      setError(problem === 'empty' ? copy.nameEmpty : problem === 'long' ? copy.nameLong(FAIRY_NAME_MAX_LENGTH) : copy.nameCharacters);
      return;
    }
    busy.current = true; setSaving(true); setError('');
    try { await saveFairyName(name.normalize('NFC').replace(/\s+/gu, ' ').trim()); }
    catch (err) { setError((err as Error).message || copy.retry); }
    finally { busy.current = false; setSaving(false); }
  }
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(520)} style={styles.card}>
    <Text accessibilityRole="header" style={styles.line}>{stepLine('intro.name', locale)}</Text>
    <View style={styles.inputRow}>
      <TextInput accessibilityLabel={copy.namePlaceholder} placeholder={copy.namePlaceholder} placeholderTextColor="#9AA89C"
        value={name} onChangeText={value => { setName(value); if (error) setError(''); }} editable={!saving}
        maxLength={FAIRY_NAME_MAX_LENGTH * 2} autoFocus={Platform.OS === 'web'} autoCorrect={false} autoCapitalize="words"
        returnKeyType="done" onSubmitEditing={() => void submit()} style={styles.input} />
    </View>
    <Text style={styles.hint}>{copy.nameHint(FAIRY_NAME_MAX_LENGTH)}</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={copy.nameAction} accessibilityState={{ disabled: saving || Boolean(problem) }}
      disabled={saving} onPress={() => void submit()}
      style={({ pressed }) => [styles.action, (saving || problem) && styles.actionMuted, pressed && styles.pressed]}>
      {saving ? <ActivityIndicator color="#FFF8E6" accessibilityLabel={copy.saving} /> : <Text style={styles.actionText}>{copy.nameAction}</Text>}
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  veil: { backgroundColor: 'rgba(12, 40, 37, 0.42)' },
  stage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 16 },
  glow: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255, 236, 182, 0.38)',
    boxShadow: '0 0 60px 30px rgba(255, 232, 170, 0.35)' },
  card: { width: '100%', maxWidth: 400, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18, gap: 12,
    backgroundColor: PAPER, borderWidth: 1, borderColor: GOLD,
    boxShadow: 'inset 0 0 0 3px #FFFDF6, 0 10px 34px rgba(12, 40, 37, 0.32)' },
  speaker: { fontFamily: serif, fontSize: 12, letterSpacing: .6, color: '#9B7B3C' },
  line: { fontFamily: serif, fontSize: 18, lineHeight: 27, color: INK, textAlign: 'center' },
  inputRow: { borderRadius: 16, borderWidth: 1, borderColor: '#D8C690', backgroundColor: '#FFFDF7',
    boxShadow: 'inset 0 1px 3px rgba(80, 64, 30, 0.12)' },
  input: { minHeight: 50, paddingHorizontal: 16, fontFamily: serif, fontSize: 20, color: INK, textAlign: 'center' },
  hint: { fontSize: 12, color: '#7D8B7E', textAlign: 'center', marginTop: -4 },
  error: { fontSize: 13, color: '#9A3F3A', textAlign: 'center' },
  action: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18,
    backgroundColor: '#2F6F67', borderWidth: 1.5, borderColor: '#D3BC80', boxShadow: 'inset 0 0 0 2px #8FB9A6' },
  actionMuted: { opacity: .6 },
  actionText: { fontFamily: serif, fontSize: 19, color: '#FFF8E6' },
  next: { alignSelf: 'flex-end', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2F6F67', borderWidth: 1.5, borderColor: '#D9C48D', boxShadow: 'inset 0 0 0 2px #8FB9A6' },
  nextArrow: { color: '#FFF8E6', fontSize: 22, lineHeight: 24, marginTop: -2, fontFamily: serif },
  pressed: { opacity: .78, transform: [{ scale: .97 }] },
});
