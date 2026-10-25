import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import type { ClosenessSource, ClosenessSummary } from '../../services/fairyCloseness';
import { usePanelTheme, type PanelTheme } from '../features/PanelTheme';
import { pickTapLine, RECENT_TAP_LINES } from '../garden/fairy/tapLines';
import { BOND_COPY, BOND_TIERS, type BondLocale } from './bondCopy';
import { KeepsakeBook } from './KeepsakeBook';
import { keepsakeArt } from './keepsakeArt';

// The owner's PPL illustration, cut out with soft contact shadows baked in, lying on a
// watercolor stone deck painted once for each panel theme (same composition, day and night).
const PPL = require('@/assets/bond/ppl-lying.webp');
const DECK = { light: require('@/assets/bond/garden-deck-light.webp'), dark: require('@/assets/bond/garden-deck-dark.webp') };
const REWARD = require('@/assets/keepsakes/star-candy-jar.webp');
// Each check-in day of the round is a painted crocus: open once checked in, a bud until then.
const BLOOM = require('@/assets/bond/checkin-bloom.webp');
const BUD = require('@/assets/bond/checkin-bud.webp');
// One painted medallion per Today's progress row; the 7th-day bonus reuses its reward keepsake.
const TASK_ART: Record<ClosenessSource, ImageSourcePropType> = {
  CHECK_IN: require('@/assets/bond/task-check-in.webp'),
  STREAK_7: REWARD,
  EVENT: require('@/assets/bond/task-write-mood.webp'),
  MOMENT_LIKE: require('@/assets/bond/task-like-moments.webp'),
  FAIRY_TAP: require('@/assets/bond/task-garden-time.webp'),
  WEEKLY_READ: require('@/assets/bond/task-weekly-report.webp'),
};
const BOOK_THUMBS = ['crocus-brooch', 'acorn-teacup', 'dewdrop'];
// Medallions keep a light ground in both themes, like the Friends panel's avatar circles.
const MEDALLION = '#EAE8D7';

// Our Bond (亲密度): PPL resting on the garden ledge, then level and progress, today's progress,
// check-in rewards, levels and unlocks, and the keepsake book, quiet serif type on the panel theme.
// The check-in itself lives in the Garden calendar.
export function OurBondPanel({ visible, locale, summary, loading, onClose }: {
  visible: boolean; locale: BondLocale; summary: ClosenessSummary | null; loading: boolean; onClose: () => void;
}) {
  const copy = BOND_COPY[locale];
  const { theme, light } = usePanelTheme();
  const styles = useMemo(() => makeStyles(theme, light), [theme, light]);
  const reducedMotion = useReducedMotion();
  const [bookOpen, setBookOpen] = useState(false);
  const [said, setSaid] = useState<{ key: number; text: string } | null>(null);
  const [heroWidth, setHeroWidth] = useState(0);
  const recentLines = useRef<string[]>([]);
  const zh = locale === 'zh-Hans';
  const tier = summary ? [...BOND_TIERS].reverse().find(item => summary.level >= item.level) ?? BOND_TIERS[0] : BOND_TIERS[0];
  const progress = summary?.pointsForNextLevel ? Math.min(1, summary.pointsIntoLevel / summary.pointsForNextLevel) : 1;

  // She answers with the same on-device lines as in the Garden, skipping the last few shown.
  const tapPpl = () => {
    const line = pickTapLine('idle', locale, recentLines.current);
    if (!line) return;
    recentLines.current = [line.id, ...recentLines.current].slice(0, RECENT_TAP_LINES);
    setSaid(previous => ({ key: (previous?.key ?? 0) + 1, text: line.text }));
  };
  const quote = said?.text ?? summary?.greeting;

  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal accessibilityLabel={copy.title} style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero} onLayout={event => setHeroWidth(event.nativeEvent.layout.width)}>
            {heroWidth ? <>
              <Image source={light ? DECK.light : DECK.dark} style={heroBox(heroWidth, DECK_BOX)} accessible={false} />
              <Pressable accessibilityRole="button" accessibilityLabel={copy.tapPpl} accessibilityHint={copy.tapHint}
                disabled={!summary} onPress={tapPpl} style={[heroBox(heroWidth, PPL_BOX), styles.focus]}>
                <Image source={PPL} style={styles.fill} resizeMode="contain" accessible={false} />
              </Pressable>
            </> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={[styles.close, styles.focus]}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            <Text style={styles.eyebrow}>{copy.withPpl}</Text>
            <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
            {!summary ? <View style={styles.status}>
              {loading ? <ActivityIndicator color={theme.gold} accessibilityLabel={copy.loading} /> : <Text style={styles.muted}>{copy.error}</Text>}
            </View> : <>
              {quote ? <Animated.Text key={said?.key ?? 0} entering={said && !reducedMotion ? FadeIn.duration(320) : undefined}
                accessibilityLiveRegion="polite" style={styles.quote}>“{quote}”</Animated.Text> : null}
              <Text style={styles.hint}>{copy.tapHint}</Text>

              <View style={styles.levelRow}>
                <Text style={styles.level}>Lv {summary.level} · <Text style={styles.tier}>{tier.en}</Text></Text>
                {!summary.maxed ? <Text style={styles.small}>{summary.pointsIntoLevel} / {summary.pointsForNextLevel}</Text> : null}
              </View>
              {zh ? <Text style={styles.small}>{tier.zh}</Text> : null}
              <View style={styles.track}><View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
              <Text style={styles.next}>{summary.maxed ? copy.maxed : copy.toNext(summary.pointsForNextLevel! - summary.pointsIntoLevel, summary.level + 1)}</Text>

              <View style={styles.stats}>
                <Stat styles={styles} label={copy.daysTogether} value={summary.daysTogether ?? '—'} />
                <View style={styles.statRule} />
                <Stat styles={styles} label={copy.keepsakes} value={summary.collection.received} />
              </View>
              <Text style={[styles.checkInLine, summary.checkIn.checkedInToday && styles.checkInDone]}>
                {summary.checkIn.checkedInToday ? copy.checkedIn : copy.checkInWaiting}
              </Text>

              <Section styles={styles} title={copy.today}>
                {summary.today.filter(row => row.source !== 'STREAK_7' || row.count > 0).map((row, index) => <View key={row.source} style={[styles.row, index > 0 && styles.rowRule]}>
                  <Image source={TASK_ART[row.source]} style={styles.medallion} resizeMode="cover" accessible={false} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{copy.sources[row.source]}</Text>
                    <Text style={styles.small}>{copy.points(row.pointsEach)}</Text>
                  </View>
                  {row.count >= row.dailyCap ? <Text style={styles.done}>{copy.done}</Text>
                    : <Text style={styles.count}>{row.count} / {row.dailyCap}</Text>}
                </View>)}
              </Section>

              <Section styles={styles} title={copy.rewards}>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowTitle}>{copy.thisRound}</Text>
                  <Text style={styles.small}>{copy.days(summary.checkIn.cycleDay, 7)}</Text>
                </View>
                <View style={styles.week}>
                  {Array.from({ length: 7 }, (_, i) => i + 1).map(day => <View key={day} style={styles.weekDay}>
                    {day === 7 ? <Image source={REWARD} style={[styles.dayCircle, styles.dayReward, day > summary.checkIn.cycleDay && styles.dim]} resizeMode="cover" />
                      : <Image source={day <= summary.checkIn.cycleDay ? BLOOM : BUD} resizeMode="contain" accessible={false}
                        style={[styles.dayFlower, day > summary.checkIn.cycleDay && styles.dayBud]} />}
                    <Text style={[styles.tiny, day === summary.checkIn.cycleDay && styles.dayToday]}>{copy.day(day)}</Text>
                  </View>)}
                </View>
                <Text style={styles.caption}>{copy.seventh}</Text>
                {summary.monthly ? <>
                  <View style={[styles.rowBetween, styles.gapTop]}>
                    <Text style={styles.rowTitle}>{copy.thisMonth}</Text>
                    <Text style={styles.small}>{copy.days(summary.monthly.checkIns, summary.monthly.needed)}</Text>
                  </View>
                  <View style={styles.track}><View style={[styles.trackFill, { width: `${Math.min(100, Math.round(summary.monthly.checkIns / summary.monthly.needed * 100))}%` }]} /></View>
                  <View style={styles.limited}>
                    {keepsakeArt(summary.monthly.keepsake.id) ? <Image source={keepsakeArt(summary.monthly.keepsake.id)!} style={styles.limitedArt} resizeMode="cover" /> : null}
                    <Text style={[styles.small, styles.flex]}>{summary.monthly.earned ? `${copy.earnedThisMonth} · ${summary.monthly.keepsake.name}`
                      : copy.limited(summary.monthly.keepsake.name, summary.monthly.needed)}</Text>
                  </View>
                </> : <Text style={[styles.caption, styles.gapTop]}>{copy.noLimited}</Text>}
              </Section>

              <Section styles={styles} title={copy.levels}>
                {BOND_TIERS.map((item, index) => {
                  const unlock = summary.unlocks.find(entry => entry.level === item.level);
                  const reached = summary.level >= item.level;
                  return <View key={item.level} style={[styles.levelItem, index > 0 && styles.rowRule]}>
                    <Text style={[styles.levelNumber, reached && styles.goldText]}>Lv {item.level}</Text>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{item.en}</Text>
                      {zh ? <Text style={styles.small}>{item.zh}</Text> : null}
                      {unlock ? <Text style={styles.tiny}>{copy.unlocks[unlock.key] ?? unlock.key}{unlock.status === 'coming_soon' ? ` · ${copy.comingSoon}` : ''}</Text> : null}
                    </View>
                    <Text style={[styles.levelState, reached && styles.goldText]}>{reached ? copy.reached : copy.levelLocked}</Text>
                  </View>;
                })}
              </Section>

              <Pressable accessibilityRole="button" onPress={() => setBookOpen(true)} style={({ pressed }) => [styles.bookButton, styles.focus, pressed && styles.pressed]}>
                <View style={styles.thumbs}>
                  {BOOK_THUMBS.map((id, index) => <Image key={id} source={keepsakeArt(id)!} style={[styles.thumb, index > 0 && styles.thumbOverlap]} resizeMode="cover" accessible={false} />)}
                </View>
                <Text style={styles.bookText}>{copy.openBook}</Text>
                <Text style={styles.small}>{copy.collected(summary.collection.owned, summary.collection.total)} ›</Text>
              </Pressable>
            </>}
          </View>
        </ScrollView>
      </View>
    </View>
    <KeepsakeBook visible={bookOpen} locale={locale} onClose={() => setBookOpen(false)} />
  </Modal>;
}

// Hero geometry in units of the 1024² deck painting, scaled to the hero's width: the painting
// shows from 23% down, PPL's elbows rest on the front slabs and her knees on the back ones.
const DECK_BOX = { left: 0, top: -236, width: 1024, height: 1024 };
const PPL_BOX = { left: 62, top: 276, width: 900, height: 900 * 572 / 1000 };
const heroBox = (width: number, box: typeof DECK_BOX) => {
  const k = width / 1024;
  return { position: 'absolute' as const, left: box.left * k, top: box.top * k, width: box.width * k, height: box.height * k };
};

type Styles = ReturnType<typeof makeStyles>;

function Stat({ styles, label, value }: { styles: Styles; label: string; value: number | string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

// A serif heading between two gold hairlines.
function Section({ styles, title, children }: { styles: Styles; title: string; children: ReactNode }) {
  return <View style={styles.section}>
    <View style={styles.sectionHead}><View style={styles.hairline} /><Text style={styles.sectionTitle}>{title}</Text><View style={styles.hairline} /></View>
    {children}
  </View>;
}

function makeStyles(theme: PanelTheme, light: boolean) {
  const hair = `${theme.gold}73`;
  const softHair = `${theme.gold}3A`;
  // Gold text needs a deeper shade on cream to keep 4.5:1 contrast.
  const goldText = light ? '#7E5F25' : theme.gold;
  return StyleSheet.create({
    backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#0B1F1B99' },
    sheet: { width: '100%', maxWidth: 440, maxHeight: '94%', borderRadius: 26, overflow: 'hidden', backgroundColor: theme.background, borderWidth: 1, borderColor: hair },
    content: { paddingBottom: 22 },
    hero: { width: '100%', aspectRatio: 370 / 296, overflow: 'hidden', backgroundColor: theme.background },
    fill: { width: '100%', height: '100%' },
    close: { position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.gold },
    closeText: { fontSize: 22, lineHeight: 26, color: theme.text },
    body: { paddingHorizontal: 22, paddingTop: 12 },
    status: { padding: 24, alignItems: 'center' },
    eyebrow: { textAlign: 'center', fontSize: 10, fontWeight: '600', letterSpacing: 2.4, textTransform: 'uppercase', color: theme.muted },
    title: { textAlign: 'center', fontFamily: 'serif', fontSize: 34, color: theme.text, marginTop: 2 },
    quote: { textAlign: 'center', fontFamily: 'serif', fontStyle: 'italic', fontSize: 16, lineHeight: 22, color: theme.muted, marginTop: 8, paddingHorizontal: 6 },
    hint: { textAlign: 'center', fontSize: 9.5, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', color: goldText, marginTop: 7 },
    levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20 },
    level: { fontFamily: 'serif', fontSize: 20, color: theme.text },
    tier: { fontStyle: 'italic', color: theme.text },
    track: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 8, backgroundColor: light ? theme.input : theme.frame },
    trackFill: { height: '100%', borderRadius: 2, backgroundColor: theme.gold },
    next: { textAlign: 'right', fontFamily: 'serif', fontStyle: 'italic', fontSize: 14, color: theme.muted, marginTop: 5 },
    stats: { flexDirection: 'row', marginTop: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: hair },
    stat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    statRule: { width: 1, backgroundColor: hair },
    statValue: { fontFamily: 'serif', fontSize: 28, color: theme.text },
    statLabel: { fontSize: 9.5, fontWeight: '600', letterSpacing: 1.9, textTransform: 'uppercase', color: theme.muted, marginTop: 2 },
    checkInLine: { textAlign: 'center', fontFamily: 'serif', fontStyle: 'italic', fontSize: 14, color: theme.muted, marginTop: 8 },
    checkInDone: { color: light ? '#4F7A5E' : '#9CC5A7' },
    section: { marginTop: 22 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    hairline: { flex: 1, height: 1, backgroundColor: hair },
    sectionTitle: { fontFamily: 'serif', fontSize: 19, color: theme.text },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
    rowRule: { borderTopWidth: 1, borderTopColor: softHair },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowText: { flex: 1 },
    rowTitle: { fontFamily: 'serif', fontSize: 16, color: theme.text },
    medallion: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: theme.gold, backgroundColor: MEDALLION },
    small: { fontSize: 12, color: theme.muted },
    tiny: { fontSize: 10, color: theme.muted },
    caption: { textAlign: 'center', fontFamily: 'serif', fontStyle: 'italic', fontSize: 14, color: theme.muted },
    muted: { fontSize: 13, color: theme.muted, textAlign: 'center' },
    count: { fontFamily: 'serif', fontSize: 16, color: theme.muted },
    done: { fontFamily: 'serif', fontStyle: 'italic', fontSize: 16, color: goldText },
    week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 },
    weekDay: { alignItems: 'center', gap: 4, width: '13.5%' },
    dayCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: hair, alignItems: 'center', justifyContent: 'center' },
    dayGot: { borderColor: theme.gold, backgroundColor: '#D6C3EC' },
    dayReward: { width: 38, height: 38, borderRadius: 19, borderColor: theme.gold, backgroundColor: MEDALLION },
    dayNumber: { fontFamily: 'serif', fontSize: 15, color: theme.muted },
    dayNumberGot: { color: '#4B3B69' },
    dayFlower: { width: 46, height: 46 },
    // Buds stay in colour (never grey or wilted), just quieter until the day is checked in.
    dayBud: { opacity: light ? 0.62 : 0.82 },
    dayToday: { color: theme.text, fontWeight: '600' },
    dim: { opacity: 0.78 },
    gapTop: { marginTop: 12 },
    limited: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    limitedArt: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: theme.gold, backgroundColor: MEDALLION },
    flex: { flex: 1 },
    levelItem: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingVertical: 8 },
    levelNumber: { width: 40, fontFamily: 'serif', fontSize: 14, color: theme.muted },
    levelState: { fontSize: 9.5, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase', color: theme.muted, opacity: 0.8 },
    goldText: { color: goldText, opacity: 1 },
    bookButton: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.surface },
    thumbs: { flexDirection: 'row' },
    thumb: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: theme.gold, backgroundColor: MEDALLION },
    thumbOverlap: { marginLeft: -9 },
    bookText: { flex: 1, fontFamily: 'serif', fontSize: 17, color: theme.text },
    pressed: { opacity: 0.8 },
    // Keyboard focus keeps a ring, in the panel's colours rather than the browser's blue (as in the calendar).
    focus: Platform.OS === 'web' ? { outlineColor: light ? '#416651' : '#D6C58B' } : {},
  });
}
