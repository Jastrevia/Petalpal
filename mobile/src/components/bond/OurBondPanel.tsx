import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import type { ClosenessSource, ClosenessSummary } from '../../services/fairyCloseness';
import { BOND, BOND_COPY, BOND_TIERS, type BondLocale } from './bondCopy';
import { KeepsakeBook } from './KeepsakeBook';
import { keepsakeArt } from './keepsakeArt';

// PPL lying on the paper, chin in her hands (the owner's illustration), and her face from it.
const BANNER = require('@/assets/bond/ppl-banner.webp');
const PORTRAIT = require('@/assets/bond/ppl-portrait.webp');
const REWARD = require('@/assets/keepsakes/star-candy-jar.webp');
// One painted medallion per Today's progress row; the 7th-day bonus reuses its reward keepsake.
const TASK_ART: Record<ClosenessSource, ImageSourcePropType> = {
  CHECK_IN: require('@/assets/bond/task-check-in.webp'),
  STREAK_7: REWARD,
  EVENT: require('@/assets/bond/task-write-mood.webp'),
  MOMENT_LIKE: require('@/assets/bond/task-like-moments.webp'),
  FAIRY_TAP: require('@/assets/bond/task-garden-time.webp'),
  WEEKLY_READ: require('@/assets/bond/task-weekly-report.webp'),
};

// Our Bond (亲密度): the design's closeness screens in one scroll — level and progress (6),
// today's progress (7), check-in rewards (5), levels and unlocks (8), and the keepsake book (9).
// The check-in itself lives in the Garden calendar.
export function OurBondPanel({ visible, locale, summary, loading, onClose }: {
  visible: boolean; locale: BondLocale; summary: ClosenessSummary | null; loading: boolean; onClose: () => void;
}) {
  const copy = BOND_COPY[locale];
  const [bookOpen, setBookOpen] = useState(false);
  const zh = locale === 'zh-Hans';
  const tier = summary ? [...BOND_TIERS].reverse().find(item => summary.level >= item.level) ?? BOND_TIERS[0] : BOND_TIERS[0];
  const progress = summary?.pointsForNextLevel ? Math.min(1, summary.pointsIntoLevel / summary.pointsForNextLevel) : 1;
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal accessibilityLabel={copy.title} style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={styles.bannerTitle}>{copy.title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.banner}>
            <Image source={BANNER} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          </View>
          {!summary ? <View style={styles.status}>
            {loading ? <ActivityIndicator color={BOND.gold} accessibilityLabel={copy.loading} /> : <Text style={styles.muted}>{copy.error}</Text>}
          </View> : <>
            <View style={styles.levelCard}>
              <Image source={PORTRAIT} style={styles.portrait} accessibilityIgnoresInvertColors />
              <View style={styles.levelText}>
                <Text style={styles.level}>Lv {summary.level}</Text>
                <Text style={styles.tier}>{tier.en}</Text>
                {zh ? <Text style={styles.tierZh}>{tier.zh}</Text> : null}
              </View>
            </View>
            <View>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} /></View>
              <View style={styles.trackLabels}>
                <Text style={styles.small}>{summary.maxed ? copy.maxed : copy.toNext(summary.pointsForNextLevel! - summary.pointsIntoLevel, summary.level + 1)}</Text>
                {!summary.maxed ? <Text style={styles.small}>{summary.pointsIntoLevel} / {summary.pointsForNextLevel}</Text> : null}
              </View>
            </View>
            <Text style={styles.greeting}>{summary.greeting}</Text>
            <View style={styles.stats}>
              <Stat label={copy.daysTogether} value={summary.daysTogether ?? '—'} />
              <Stat label={copy.keepsakes} value={summary.collection.received} />
            </View>
            <Text style={[styles.checkInLine, summary.checkIn.checkedInToday && styles.checkInDone]}>
              {summary.checkIn.checkedInToday ? `✿ ${copy.checkedIn}` : `✿ ${copy.checkInWaiting}`}
            </Text>

            <Section title={copy.today}>
              {summary.today.filter(row => row.source !== 'STREAK_7' || row.count > 0).map(row => <View key={row.source} style={styles.row}>
                <Image source={TASK_ART[row.source]} style={styles.taskIcon} resizeMode="cover" accessibilityIgnoresInvertColors />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{copy.sources[row.source]}</Text>
                  <Text style={styles.small}>{copy.points(row.pointsEach)}</Text>
                </View>
                {row.count >= row.dailyCap ? <Text style={styles.donePill}>{copy.done}</Text>
                  : <Text style={styles.countPill}>{row.count} / {row.dailyCap}</Text>}
              </View>)}
            </Section>

            <Section title={copy.rewards}>
              <View style={styles.rowBetween}>
                <Text style={styles.rowTitle}>{copy.thisRound}</Text>
                <Text style={styles.small}>{copy.days(summary.checkIn.cycleDay, 7)}</Text>
              </View>
              <View style={styles.week}>
                {Array.from({ length: 7 }, (_, i) => i + 1).map(day => <View key={day} style={styles.weekDay}>
                  {day === 7 ? <Image source={REWARD} style={[styles.weekIcon, day > summary.checkIn.cycleDay && styles.dim]} />
                    : <Text style={[styles.petal, day > summary.checkIn.cycleDay && styles.petalOff]}>✿</Text>}
                  <Text style={styles.tiny}>{copy.day(day)}</Text>
                </View>)}
              </View>
              <Text style={styles.small}>{copy.seventh}</Text>
              {summary.monthly ? <>
                <View style={[styles.rowBetween, styles.gapTop]}>
                  <Text style={styles.rowTitle}>{copy.thisMonth}</Text>
                  <Text style={styles.small}>{copy.days(summary.monthly.checkIns, summary.monthly.needed)}</Text>
                </View>
                <View style={styles.track}><View style={[styles.fill, styles.fillPurple, { width: `${Math.min(100, Math.round(summary.monthly.checkIns / summary.monthly.needed * 100))}%` }]} /></View>
                <View style={styles.limited}>
                  {keepsakeArt(summary.monthly.keepsake.id) ? <Image source={keepsakeArt(summary.monthly.keepsake.id)!} style={styles.limitedArt} resizeMode="contain" /> : null}
                  <Text style={[styles.small, styles.flex]}>{summary.monthly.earned ? `${copy.earnedThisMonth} · ${summary.monthly.keepsake.name}`
                    : copy.limited(summary.monthly.keepsake.name, summary.monthly.needed)}</Text>
                </View>
              </> : <Text style={[styles.small, styles.gapTop]}>{copy.noLimited}</Text>}
            </Section>

            <Section title={copy.levels}>
              {BOND_TIERS.map(item => {
                const unlock = summary.unlocks.find(entry => entry.level === item.level);
                const reached = summary.level >= item.level, current = tier.level === item.level;
                return <View key={item.level} style={[styles.row, current && styles.currentTier]}>
                  <Text style={styles.levelPill}>Lv {item.level}</Text>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.en}</Text>
                    {zh ? <Text style={styles.small}>{item.zh}</Text> : null}
                    {unlock ? <Text style={styles.tiny}>{copy.unlocks[unlock.key] ?? unlock.key}{unlock.status === 'coming_soon' ? ` · ${copy.comingSoon}` : ''}</Text> : null}
                  </View>
                  <Text style={styles.mark}>{reached ? '✓' : '🔒'}</Text>
                </View>;
              })}
            </Section>

            <Pressable accessibilityRole="button" onPress={() => setBookOpen(true)} style={({ pressed }) => [styles.bookButton, pressed && styles.pressed]}>
              <Text style={styles.bookText}>{copy.openBook}</Text>
              <Text style={styles.bookCount}>{copy.collected(summary.collection.owned, summary.collection.total)} ›</Text>
            </Pressable>
          </>}
        </ScrollView>
      </View>
    </View>
    <KeepsakeBook visible={bookOpen} locale={locale} onClose={() => setBookOpen(false)} />
  </Modal>;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <View style={styles.stat}><Text style={styles.small}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#0B1F1B99' },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '94%', borderRadius: 22, overflow: 'hidden', backgroundColor: BOND.paper, borderWidth: 1.5, borderColor: BOND.edge },
  content: { paddingBottom: 18, gap: 12 },
  banner: { width: '100%', aspectRatio: 1100 / 596, backgroundColor: BOND.paper },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 14, paddingHorizontal: 56, marginBottom: -6 },
  bannerTitle: { fontFamily: 'serif', fontSize: 22, color: BOND.ink, textAlign: 'center' },
  close: { position: 'absolute', top: 8, right: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAF3DFCC', borderWidth: 1, borderColor: BOND.edge },
  closeText: { fontSize: 24, lineHeight: 28, color: BOND.ink },
  status: { padding: 24, alignItems: 'center' },
  levelCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16 },
  portrait: { width: 74, height: 74, borderRadius: 37, borderWidth: 2, borderColor: BOND.gold },
  levelText: { flex: 1 },
  level: { fontFamily: 'serif', fontSize: 26, color: BOND.ink },
  tier: { fontFamily: 'serif', fontSize: 16, color: BOND.ink },
  tierZh: { fontSize: 13, color: BOND.muted },
  track: { height: 10, marginHorizontal: 16, borderRadius: 5, overflow: 'hidden', backgroundColor: BOND.barTrack },
  fill: { height: '100%', borderRadius: 5, backgroundColor: BOND.bar },
  fillPurple: { backgroundColor: BOND.purple },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 4 },
  greeting: { marginHorizontal: 22, fontFamily: 'serif', fontSize: 15, lineHeight: 24, color: BOND.ink, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 10, marginHorizontal: 16 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: BOND.card, borderWidth: 1, borderColor: BOND.rule },
  statValue: { fontFamily: 'serif', fontSize: 26, color: BOND.ink },
  checkInLine: { marginHorizontal: 16, textAlign: 'center', fontSize: 13, color: BOND.purple },
  checkInDone: { color: BOND.bar },
  section: { marginHorizontal: 12, padding: 12, gap: 8, borderRadius: 16, backgroundColor: BOND.card, borderWidth: 1, borderColor: BOND.rule },
  sectionTitle: { fontFamily: 'serif', fontSize: 17, color: BOND.ink, textAlign: 'center', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowText: { flex: 1 },
  taskIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: BOND.gold, backgroundColor: '#F6EDD6' },
  rowTitle: { fontFamily: 'serif', fontSize: 15, color: BOND.ink },
  small: { fontSize: 12, color: BOND.muted },
  tiny: { fontSize: 10, color: BOND.muted },
  muted: { fontSize: 13, color: BOND.muted, textAlign: 'center' },
  donePill: { fontSize: 12, color: '#F3EBD3', backgroundColor: BOND.bar, borderRadius: 12, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 5 },
  countPill: { fontSize: 12, color: BOND.ink, backgroundColor: '#EEF2E6', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 5 },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: 2, width: '13.5%' },
  petal: { fontSize: 22, color: '#B486D8' },
  petalOff: { color: '#DED5C2' },
  weekIcon: { width: 28, height: 28 },
  dim: { opacity: 0.4 },
  gapTop: { marginTop: 6 },
  limited: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  limitedArt: { width: 48, height: 48 },
  flex: { flex: 1 },
  currentTier: { backgroundColor: '#F1E8D2' },
  levelPill: { width: 54, textAlign: 'center', fontFamily: 'serif', fontSize: 13, color: BOND.ink, borderWidth: 1, borderColor: BOND.rule, borderRadius: 12, paddingVertical: 4 },
  mark: { fontSize: 15, color: BOND.bar, width: 24, textAlign: 'center' },
  bookButton: { marginHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: BOND.green },
  bookText: { fontFamily: 'serif', fontSize: 16, color: '#F3EBD3' },
  bookCount: { fontSize: 13, color: '#D8CDA9' },
  pressed: { opacity: 0.8 },
});
