import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import type { ClosenessSummary } from '../../services/fairyCloseness';
import { fairyRuntimeBlock, refreshFairyRuntime } from '../../services/fairyRuntime';

const HEART = require('@/assets/fairy-entry/bond-heart.webp');
const BOOK = require('@/assets/fairy-entry/moments-book.webp');

const COPY = {
  en: { heading: 'A little world, just for the two of you.', close: 'Close', bond: 'Our Bond', checkIn: ', check in today',
    moments: 'Fairy Moments', newMoments: ', new posts',
    bondSoon: (s: ClosenessSummary | null) => s ? `Lv ${s.level} · ${s.title}. The full Our Bond page is coming soon.` : 'Our Bond is coming soon.',
    locked: 'Fairy Moments are still locked',
    onboarding: 'PPL starts sharing her little moments once she settles into your Garden. Plant your first flower to unlock them.',
    unavailable: 'Her Moments couldn’t open just now. Please try again in a moment.',
    bondLine: (s: ClosenessSummary) => `Our Bond Lv ${s.level} · ${s.title}${s.level < 3 ? '. At Lv 3 she’ll also write posts just for you (coming soon).' : '.'}`,
    retry: 'Try again', back: 'Back' },
  'zh-Hans': { heading: '这里，有属于我们的一片小小的世界。', close: '关闭', bond: '亲密度', checkIn: '，今天还没签到',
    moments: '朋友圈', newMoments: '，有新动态',
    bondSoon: (s: ClosenessSummary | null) => s ? `Lv ${s.level} · ${s.title}。完整的亲密度页面马上就来。` : '亲密度页面马上就来。',
    locked: '朋友圈还未解锁',
    onboarding: '小花仙在你的花园安顿下来后，才会开始分享她的日常。种下第一朵花，就能解锁朋友圈。',
    unavailable: '朋友圈暂时打不开，请稍后再试。',
    bondLine: (s: ClosenessSummary) => `亲密度 Lv ${s.level} · ${s.title}${s.level < 3 ? '。达到 Lv 3 后，她还会写只给你的动态（即将开放）。' : '。'}`,
    retry: '再试一次', back: '返回' },
};

// What the Fairy icon opens: her two rooms, closeness (Our Bond · 亲密度) and her Moments
// (Fairy Moments · 朋友圈). Each shows a dot when something waits: today's check-in, new posts.
// Labels are English; zh-Hans owners also see the Chinese name underneath.
export function FairyEntryCard({ visible, locale, closeness, closenessOn, momentsOn, momentsUnread, onOpenMoments, onOpenBond, onClose }: {
  visible: boolean; locale: 'en' | 'zh-Hans';
  closeness: ClosenessSummary | null; closenessOn: boolean; momentsOn: boolean; momentsUnread: boolean;
  onOpenMoments: () => void; onOpenBond?: () => void; onClose: () => void;
}) {
  const copy = COPY[locale];
  const [note, setNote] = useState('');
  // Fairy Moments always has a tile. Until the server serves them (no first flower yet, or the
  // request failed) the tile opens this locked view instead of her feed.
  const [locked, setLocked] = useState(false), [retrying, setRetrying] = useState(false);
  const bondDot = Boolean(closeness && !closeness.checkIn.checkedInToday);
  const close = () => { setNote(''); setLocked(false); onClose(); };
  async function retry() {
    setRetrying(true);
    const runtime = await refreshFairyRuntime();
    setRetrying(false);
    if (runtime?.moments) { setLocked(false); onOpenMoments(); }
  }
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
    <Pressable accessibilityLabel={copy.close} onPress={close} style={styles.backdrop}>
      <Pressable accessibilityViewIsModal onPress={() => undefined} style={styles.frame}>
        {/* English leads; Chinese is the quieter second line, only for zh-Hans owners. */}
        <Text style={styles.heading}>{COPY.en.heading}</Text>
        {locale === 'zh-Hans' ? <Text style={styles.subheading}>{COPY['zh-Hans'].heading}</Text> : null}
        {locked ? <View style={styles.locked}>
          <View style={styles.lockedArt}>
            <Image source={BOOK} style={[styles.art, styles.dim]} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={styles.lock}>🔒</Text>
          </View>
          <Text accessibilityRole="header" style={styles.lockedTitle}>{copy.locked}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.note}>{fairyRuntimeBlock() === 'onboarding' ? copy.onboarding : copy.unavailable}</Text>
          {closeness ? <Text style={styles.bondLine}>{copy.bondLine(closeness)}</Text> : null}
          <View style={styles.lockedActions}>
            {fairyRuntimeBlock() === 'onboarding' ? null : <Pressable accessibilityRole="button" disabled={retrying} onPress={() => void retry()}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>{retrying ? '…' : copy.retry}</Text></Pressable>}
            <Pressable accessibilityRole="button" onPress={() => setLocked(false)}
              style={({ pressed }) => [styles.button, styles.quiet, pressed && styles.pressed]}><Text style={styles.quietText}>{copy.back}</Text></Pressable>
          </View>
        </View> : <View style={styles.row}>
          {closenessOn ? <Tile image={HEART} en="Our Bond" zh={locale === 'zh-Hans' ? '亲密度' : undefined} dot={bondDot}
            label={copy.bond + (bondDot ? copy.checkIn : '')}
            onPress={() => { if (onOpenBond) onOpenBond(); else setNote(copy.bondSoon(closeness)); }} /> : null}
          <Tile image={BOOK} en="Fairy Moments" zh={locale === 'zh-Hans' ? '朋友圈' : undefined} dot={momentsOn && momentsUnread}
            label={copy.moments + (momentsOn && momentsUnread ? copy.newMoments : '')}
            onPress={() => { setNote(''); if (momentsOn) onOpenMoments(); else { setLocked(true); if (fairyRuntimeBlock() !== 'onboarding') void retry(); } }} />
        </View>}
        {note ? <Text accessibilityLiveRegion="polite" style={styles.note}>{note}</Text> : null}
      </Pressable>
    </Pressable>
  </Modal>;
}

function Tile({ image, en, zh, dot, label, onPress }: {
  image: ImageSourcePropType; en: string; zh?: string; dot: boolean; label: string; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
    <Image source={image} style={styles.art} resizeMode="contain" accessibilityIgnoresInvertColors />
    <View style={styles.labelRow}>
      <Text style={styles.spark}>✦</Text><Text numberOfLines={1} adjustsFontSizeToFit style={styles.en}>{en}</Text><Text style={styles.spark}>✦</Text>
    </View>
    {zh ? <Text style={styles.zh}>{zh}</Text> : null}
    {dot ? <View style={styles.dot} /> : null}
  </Pressable>;
}

const GOLD = '#C9A55C', INK = '#2E5A4A';
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#00000040' },
  frame: { width: '100%', maxWidth: 420, borderRadius: 22, padding: 14, paddingTop: 16, gap: 12,
    backgroundColor: '#123D37', borderWidth: 2, borderColor: GOLD },
  heading: { fontFamily: 'serif', fontSize: 16, lineHeight: 23, color: '#F3EBD3', textAlign: 'center' },
  subheading: { fontFamily: 'serif', fontSize: 12, color: '#D8CDA9', textAlign: 'center', marginTop: -8 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  tile: { flex: 1, maxWidth: 190, aspectRatio: 0.92, borderRadius: 18, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 10,
    alignItems: 'center', justifyContent: 'flex-end', backgroundColor: '#F7F0E3', borderWidth: 2, borderColor: '#D8C38A' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  art: { flex: 1, width: '100%' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  spark: { fontSize: 10, color: GOLD },
  en: { fontFamily: 'serif', fontSize: 19, lineHeight: 25, color: INK, flexShrink: 1 },
  zh: { fontFamily: 'serif', fontSize: 13, color: INK },
  dot: { position: 'absolute', top: 8, right: 8, width: 14, height: 14, borderRadius: 7, backgroundColor: '#E2554B', borderWidth: 2, borderColor: '#FBE3D6' },
  note: { fontFamily: 'serif', fontSize: 13, lineHeight: 19, color: '#F3EBD3', textAlign: 'center' },
  locked: { alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  lockedArt: { width: 132, height: 120, borderRadius: 18, padding: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F7F0E3', borderWidth: 2, borderColor: '#D8C38A' },
  dim: { opacity: 0.45 },
  lock: { position: 'absolute', fontSize: 30 },
  lockedTitle: { fontFamily: 'serif', fontSize: 18, color: '#F3EBD3', textAlign: 'center' },
  bondLine: { fontFamily: 'serif', fontSize: 12, lineHeight: 18, color: '#D8CDA9', textAlign: 'center' },
  lockedActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  button: { minWidth: 96, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, alignItems: 'center', backgroundColor: '#F3EBD3' },
  buttonText: { fontFamily: 'serif', fontSize: 14, color: INK },
  quiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: GOLD },
  quietText: { fontFamily: 'serif', fontSize: 14, color: '#F3EBD3' },
});
