import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FIND_A_HELPLINE_URL, safetyConcern, supportLines, type SafetyConcern } from '../../services/emotionalSafety';
import { useAppLocale, type AppLocale } from '../../services/locale';

// What PPL's Garden says when someone writes words of danger. It speaks first as someone who cares,
// then says exactly what can be done right now, the way Claude and ChatGPT answer such moments: no
// judgement, no lecture, real numbers one tap away, and the writing stays theirs to save.
const COPY: Record<AppLocale, Record<SafetyConcern, { title: string; body: string[] }> & {
  emergency: (n: string) => string; localEmergency: string; hospital: string; find: string; notify: string; keep: string; back: string; close: string;
}> = {
  en: {
    self_harm: { title: 'I’m really glad you wrote this down',
      body: [
        'It sounds like you’re carrying something very heavy right now. You don’t have to carry it alone, and you don’t have to have the right words.',
        'Your life matters, and it is worth holding on to, even if you can’t feel that today. Moments like this do pass, and there are people whose whole job is to stay with you through them.',
        'If you’re thinking about ending your life or hurting yourself, please reach out now. Call a helpline, tell someone you trust and ask them to stay with you, and move away from anything you could hurt yourself with. If you need help or might not be safe, go to the nearest hospital emergency department.',
      ] },
    harm_others: { title: 'Please pause here for a moment',
      body: [
        'What you wrote sounds serious, and getting help now matters more than anything else on this page.',
        'If someone has been hurt or is in danger, please call the police or an ambulance right now. Every minute counts, and getting help is the right thing to do.',
        'If you’re afraid you might hurt someone, step away from them and from anything that could cause harm, and call emergency services or a crisis line. You can talk to someone before anything happens.',
      ] },
    being_harmed: { title: 'Your safety comes first',
      body: [
        'I’m sorry this is happening. It is not your fault, and you deserve to be safe.',
        'If you’re in danger now, please call the police. If you can, go somewhere safer and tell someone you trust. If you’re hurt, a hospital can treat you and can also help you find support.',
      ] },
    emergency: n => `Emergency: call ${n}`, localEmergency: 'Call your local emergency number',
    hospital: 'You can also go to the nearest hospital emergency department.', find: 'Find a helpline near you',
    notify: 'PetalPal can’t call for help or tell anyone on your behalf. What you wrote stays private.',
    keep: 'Keep writing', back: 'I understand', close: 'Close',
  },
  'zh-Hans': {
    self_harm: { title: '谢谢你把这些写下来',
      body: [
        '听起来你现在真的很难受，一个人扛了很多。你不用一个人扛，也不用想好该怎么说。',
        '你的生命很珍贵，世界上还有很多美好的东西在等你，哪怕今天你感觉不到。这样难熬的时刻是会过去的，也有人专门在这里陪你度过。',
        '如果你有结束生命或伤害自己的想法，请现在就找人帮忙：打一个热线电话，告诉一个你信任的人并请他陪着你，先远离可能伤到自己的东西。如果需要帮助，或者觉得自己可能不安全，请马上去最近的医院急诊。',
      ] },
    harm_others: { title: '请先停一下',
      body: [
        '你写的内容听起来很严重，现在最重要的是赶快找人帮忙。',
        '如果有人受伤或正处于危险中，请立刻报警或拨打急救电话。每一分钟都很重要，求助是正确的决定。',
        '如果你担心自己会伤害别人，请先离开对方，也离开可能造成伤害的东西，然后拨打紧急电话或心理援助热线。在事情发生之前，你可以先找人谈一谈。',
      ] },
    being_harmed: { title: '你的安全最重要',
      body: [
        '很抱歉你正在经历这些。这不是你的错，你值得被好好保护。',
        '如果现在有危险，请立刻报警。如果可以，先去一个更安全的地方，并告诉一个你信任的人。如果受了伤，医院可以治疗你，也能帮你找到后续的支持。',
      ] },
    emergency: n => `紧急情况：拨打 ${n}`, localEmergency: '拨打当地紧急电话',
    hospital: '也可以直接去最近的医院急诊。', find: '查找你附近的求助热线',
    notify: 'PetalPal 无法替你求助，也不会告诉任何人。你写的内容仍然是私密的。',
    keep: '继续写', back: '我知道了', close: '关闭',
  },
};

async function open(url: string) {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && /^https?:/.test(url)) { window.open(url, '_blank', 'noopener'); return; }
    await Linking.openURL(url);
  } catch { /* the numbers stay readable on screen */ }
}

function SupportActions({ locale }: { locale: AppLocale }) {
  const copy = COPY[locale], lines = supportLines();
  return <View style={styles.actions}>
    {lines.crisis ? <Pressable testID="safety-crisis-line" accessibilityRole="link" onPress={() => void open(`tel:${lines.crisis!.number}`)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
      <Text style={styles.primaryText}>{lines.crisis.label[locale]} · {lines.crisis.number}</Text>
    </Pressable> : null}
    {lines.emergency ? <Pressable testID="safety-emergency-line" accessibilityRole="link" onPress={() => void open(`tel:${lines.emergency}`)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
      <Text style={styles.secondaryText}>{copy.emergency(lines.emergency)}</Text>
    </Pressable> : <Text style={styles.note}>{copy.localEmergency}</Text>}
    <Pressable accessibilityRole="link" onPress={() => void open(FIND_A_HELPLINE_URL)} hitSlop={6} style={styles.linkWrap}>
      <Text style={styles.link}>{copy.find}</Text>
    </Pressable>
  </View>;
}

// Its own window over whatever is open. A tap outside or × only closes it: nothing is lost.
export function SafetySupportSheet({ concern, onClose, keepLabel }: { concern: SafetyConcern | null; onClose: () => void; keepLabel?: string }) {
  const locale = useAppLocale(), copy = COPY[locale];
  if (!concern) return null;
  const text = copy[concern];
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.scrim}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={StyleSheet.absoluteFill} />
      <View testID="safety-support-sheet" accessibilityViewIsModal style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} hitSlop={8} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>{text.title}</Text>
          {text.body.map((paragraph, index) => <Text key={index} accessibilityRole={index === 0 ? 'alert' : undefined} style={styles.body}>{paragraph}</Text>)}
          <SupportActions locale={locale} />
          <Text style={styles.note}>{copy.hospital}</Text>
          <Text style={styles.note}>{copy.notify}</Text>
          <Pressable testID="safety-support-continue" accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}>
            <Text style={styles.quietText}>{keepLabel ?? copy.back}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

// Stays beside the writing for as long as those words are there, in case the window was closed fast.
export function SafetySupportInline({ concern }: { concern: SafetyConcern }) {
  const locale = useAppLocale(), copy = COPY[locale], text = copy[concern];
  return <View testID="safety-support-inline" accessibilityRole="alert" style={styles.inline}>
    <Text style={styles.inlineTitle}>{text.title}</Text>
    <Text style={styles.inlineBody}>{text.body[text.body.length - 1]}</Text>
    <SupportActions locale={locale} />
  </View>;
}

const PAUSE_MS = 900;
// For a writing box: a short pause after words of danger opens the window (once per kind of worry,
// and again if they are written anew), and saving passes through it first if it has not been seen.
// It never stops the save; `guard` only runs the action once the window is closed.
export function useSafetyWatch(text: string) {
  const concern = safetyConcern(text);
  const [shown, setShown] = useState<SafetyConcern | null>(null);
  const seen = useRef<SafetyConcern | null>(null);
  const after = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!concern) { seen.current = null; return; }
    if (seen.current === concern) return;
    const timer = setTimeout(() => { seen.current = concern; setShown(concern); }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [concern]);
  const guard = useCallback((action: () => void) => {
    if (concern && seen.current !== concern) { seen.current = concern; after.current = action; setShown(concern); return; }
    action();
  }, [concern]);
  const close = useCallback(() => { setShown(null); const action = after.current; after.current = null; action?.(); }, []);
  return { concern, guard, sheet: <SafetySupportSheet concern={shown} onClose={close} /> };
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#0A1A17B3' },
  card: { width: '100%', maxWidth: 420, maxHeight: '92%', borderRadius: 24, borderWidth: 2, borderColor: '#C9A95C', backgroundColor: '#FBF4E2', boxShadow: '0 14px 40px #00000066', overflow: 'hidden' },
  close: { position: 'absolute', top: 8, right: 8, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 26, lineHeight: 30, color: '#254E43' },
  content: { padding: 22, paddingTop: 26, gap: 12 },
  title: { fontFamily: 'serif', fontSize: 22, lineHeight: 29, color: '#254E43', paddingRight: 28 },
  body: { fontFamily: 'serif', fontSize: 16, lineHeight: 25, color: '#3A4A40' },
  actions: { gap: 8, marginTop: 2 },
  primary: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#246E70' },
  primaryText: { fontSize: 15, fontWeight: '700', color: '#FFF9E9', textAlign: 'center' },
  secondary: { minHeight: 46, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 23, borderWidth: 1.5, borderColor: '#B5564A', backgroundColor: '#FFF4EF' },
  secondaryText: { fontSize: 15, fontWeight: '700', color: '#8E3A2F', textAlign: 'center' },
  linkWrap: { alignSelf: 'center', minHeight: 32, justifyContent: 'center' },
  link: { fontSize: 13, color: '#246E70', textDecorationLine: 'underline' },
  note: { fontSize: 13, lineHeight: 19, color: '#556459' },
  quiet: { minHeight: 44, marginTop: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#C4AF79' },
  quietText: { fontFamily: 'serif', fontSize: 15, color: '#385F52' },
  pressed: { opacity: .8 },
  inline: { gap: 8, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#C9A95C', backgroundColor: '#FBF4E2' },
  inlineTitle: { fontFamily: 'serif', fontWeight: '700', fontSize: 16, lineHeight: 22, color: '#254E43' },
  inlineBody: { fontFamily: 'serif', fontSize: 14, lineHeight: 21, color: '#3A4A40' },
});
