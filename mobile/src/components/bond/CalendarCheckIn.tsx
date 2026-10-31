import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { checkInWithFairy, type CheckInResult, type ClosenessSummary } from '../../services/fairyCloseness';
import { BOND, BOND_COPY, type BondLocale } from './bondCopy';
import { KeepsakeReveal } from './KeepsakeReveal';
import { PetalRing } from '../petalCards/PetalRing';
import { usePetalToday } from '../../services/petalCardDraw';

const REWARD = require('@/assets/keepsakes/star-candy-jar.webp');

// The daily check-in card at the top of the Garden calendar (design screens 3–5): this
// round's seven petals, the button, and PPL's keepsakes once it goes through.
export function CalendarCheckIn({ summary, locale, ink, muted, light = true }: {
  summary: ClosenessSummary; locale: BondLocale; ink: string; muted: string; light?: boolean;
}) {
  const copy = BOND_COPY[locale];
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<CheckInResult | null>(null);
  // After the keepsake, today's petal card from the ring (once a day; off with the petal card switch).
  const petal = usePetalToday(result), [ringOpen, setRingOpen] = useState(false);
  const { checkedInToday, streak, cycleDay, checkInsToStreakReward } = summary.checkIn;
  async function checkIn() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const outcome = await checkInWithFairy();
      if (outcome?.keepsakes.length) setResult(outcome);
    } catch { setError(copy.checkInFailed); }
    finally { setBusy(false); }
  }
  return <View style={[styles.card, !light && styles.cardDark]}>
    <View style={styles.top}>
      <Text style={[styles.title, { color: ink }]}>{copy.checkIn}</Text>
      <Text style={[styles.small, { color: muted }]}>{copy.streak(streak)}</Text>
    </View>
    <View style={styles.week}>
      {Array.from({ length: 7 }, (_, i) => i + 1).map(day => day === 7
        ? <Image key={day} source={REWARD} style={[styles.reward, day > cycleDay && styles.dim]} accessibilityIgnoresInvertColors />
        : <Text key={day} style={[styles.petal, day > cycleDay && styles.petalOff]}>✿</Text>)}
    </View>
    {!checkedInToday ? <Text style={[styles.small, styles.center, { color: muted }]}>{copy.rareSoon(checkInsToStreakReward)}</Text> : null}
    <Pressable accessibilityRole="button" disabled={checkedInToday || busy} onPress={() => void checkIn()}
      accessibilityState={{ disabled: checkedInToday || busy }}
      style={({ pressed }) => [styles.button, checkedInToday && styles.buttonDone, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color="#F3EBD3" accessibilityLabel={copy.checkingIn} />
        : <Text style={[styles.buttonText, checkedInToday && styles.buttonTextDone]}>{checkedInToday ? `✓ ${copy.checkedIn}` : copy.checkInButton}</Text>}
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={[styles.small, styles.center, styles.error]}>{error}</Text> : null}
    {checkedInToday && petal ? <Pressable accessibilityRole="button" onPress={() => setRingOpen(true)}
      style={({ pressed }) => [styles.petalButton, pressed && styles.pressed]}>
      <Text style={styles.petalText}>{petal.drawn?.card ? copy.petalSee(petal.drawn.card.name) : `✦ ${copy.petalDraw}`}</Text>
    </Pressable> : null}
    <KeepsakeReveal result={result} locale={locale} onDone={() => { setResult(null); if (petal && !petal.drawn) setRingOpen(true); }} />
    <PetalRing visible={ringOpen} today={petal} onClose={() => setRingOpen(false)} />
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12, marginBottom: 12, borderRadius: 14, backgroundColor: '#F5ECF8', borderWidth: 1, borderColor: '#D9C2EA' },
  cardDark: { backgroundColor: '#1B4440', borderColor: '#52716A' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontFamily: 'Georgia', fontSize: 16 },
  small: { fontSize: 12 },
  center: { textAlign: 'center' },
  week: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  petal: { fontSize: 22, color: '#B486D8' },
  petalOff: { color: '#DED5C2' },
  reward: { width: 30, height: 30 },
  dim: { opacity: 0.45 },
  button: { paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: BOND.purple },
  buttonDone: { backgroundColor: '#E6DDF0' },
  buttonText: { fontFamily: 'Georgia', fontSize: 15, color: '#FFF9F0' },
  buttonTextDone: { color: BOND.purple },
  pressed: { opacity: 0.8 },
  error: { color: '#A23B4A' },
  petalButton: { paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: '#2B2457' },
  petalText: { fontFamily: 'Georgia', fontSize: 14, color: '#E9CF8A' },
});
