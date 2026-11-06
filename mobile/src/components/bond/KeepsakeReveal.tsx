import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CheckInResult } from '../../services/fairyCloseness';
import { holdBondCelebration } from '../../services/avatars';
import { BOND, bondCopy, type BondLocale } from './bondCopy';
import { useFairyName } from '../../services/fairyName';
import { keepsakeArt } from './keepsakeArt';

// After a check-in: PPL's keepsakes one by one (design screen 4), her note on paper, the
// closeness gained and any level-up.
export function KeepsakeReveal({ result, locale, onDone }: {
  result: CheckInResult | null; locale: BondLocale; onDone: () => void;
}) {
  const fairyName = useFairyName();
  const copy = bondCopy(locale, fairyName);
  const [index, setIndex] = useState(0);
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => { setIndex(0); }, [result]);
  // A Fairy Bond level-up celebration waits until the keepsakes have been looked at.
  const showing = Boolean(result?.keepsakes.length);
  useEffect(() => (showing ? holdBondCelebration() : undefined), [showing]);
  useEffect(() => {
    grow.setValue(0);
    Animated.spring(grow, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
  }, [grow, index, result]);
  if (!result || !result.keepsakes.length) return null;
  const keepsake = result.keepsakes[Math.min(index, result.keepsakes.length - 1)];
  const last = index >= result.keepsakes.length - 1;
  const art = keepsakeArt(keepsake.id);
  return <Modal transparent visible animationType="fade" onRequestClose={onDone} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.title}>{copy.reveal}</Text>
        <Animated.View style={[styles.halo, { opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
          {art ? <Image source={art} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
        </Animated.View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{keepsake.name}</Text>
          {keepsake.firstTime ? <Text style={styles.badge}>{copy.isNew}</Text> : null}
        </View>
        <Text style={styles.rarity}>{copy.rarity[keepsake.rarity]}</Text>
        {keepsake.note ? <View style={styles.paper}>
          <Text style={styles.note}>{keepsake.note}</Text>
          <Text style={styles.sign}>— {fairyName} ♡</Text>
        </View> : null}
        {last && result.awarded ? <Text style={styles.points}>{copy.points(result.awarded)}</Text> : null}
        {last && result.levelUp ? <Text style={styles.levelUp}>{copy.levelUp(result.levelUp.level, result.levelUp.title)}</Text> : null}
        {last && result.checkIn.graceUsed ? <Text style={styles.grace}>{copy.grace}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => (last ? onDone() : setIndex(index + 1))}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{last ? copy.keep : copy.next}</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#0B1F1BAA' },
  sheet: { width: '100%', maxWidth: 380, alignItems: 'center', gap: 8, padding: 20, borderRadius: 22,
    backgroundColor: BOND.paper, borderWidth: 1.5, borderColor: BOND.edge },
  title: { fontFamily: 'serif', fontSize: 18, color: BOND.ink },
  halo: { width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1E8D2' },
  art: { width: 150, height: 150 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: 'serif', fontSize: 20, color: BOND.ink },
  badge: { fontSize: 11, color: '#fff', backgroundColor: BOND.purple, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 2 },
  rarity: { fontSize: 12, color: BOND.muted },
  paper: { alignSelf: 'stretch', marginTop: 4, padding: 14, borderRadius: 10, backgroundColor: BOND.card, borderWidth: 1, borderColor: BOND.rule, transform: [{ rotate: '-1deg' }] },
  note: { fontFamily: 'serif', fontSize: 15, lineHeight: 24, color: BOND.ink },
  sign: { fontFamily: 'serif', fontSize: 13, color: BOND.purple, textAlign: 'right', marginTop: 4 },
  points: { fontSize: 13, color: BOND.bar, fontWeight: '600' },
  levelUp: { fontFamily: 'serif', fontSize: 15, color: BOND.gold },
  grace: { fontSize: 12, color: BOND.muted },
  button: { alignSelf: 'stretch', marginTop: 6, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: BOND.green },
  buttonText: { fontFamily: 'serif', fontSize: 16, color: '#F3EBD3' },
  pressed: { opacity: 0.8 },
});
