// The botanical journal look of the pavilion's books (owner, 2026-11-12): the pages share the art language of the
// shelf and the book spines. Painted gilding and pressed flowers, small blossom headings, the owner's own words on
// slips of paper, dates as small stamps. Everything here is decoration or layout: every word stays a Text, and nothing
// is told by colour alone.
// Paintings: FLUX.2 klein after assets/reflection/botanical.webp and the book covers' gilding, the paper lifted out.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

export const JOURNAL_ART = {
  corner: require('@/assets/reflection/journal/corner.webp'),
  divider: require('@/assets/reflection/journal/divider.webp'),
  spray: require('@/assets/reflection/journal/pressed-spray.webp'),
  blossom: require('@/assets/reflection/journal/blossom.webp'),
  paper: require('@/assets/reflection/journal/paper.webp'),
} as const;

// Each book keeps the colour of its own spine as the page's accent (dark enough to read as text on the paper).
export type JournalTone = 'weekly' | 'monthly' | 'collection';
const TONES: Record<JournalTone, { accent: string; tape: string; wash: string; edge: string }> = {
  weekly: { accent: '#3E5742', tape: '#8FA98AAA', wash: '#8FA06E22', edge: '#8FA06E3D' },
  monthly: { accent: '#2B4F78', tape: '#9DB4CFAA', wash: '#8FA9C722', edge: '#8FA9C740' },
  collection: { accent: '#6C4772', tape: '#C7AFCBAA', wash: '#B79CBD1F', edge: '#B79CBD3D' },
};
export const JOURNAL_INK = '#33241A', JOURNAL_GOLD = '#A8823F';

export function journalKit(tone: JournalTone) {
  const { accent, tape, wash, edge } = TONES[tone];
  return {
    accent,
    // A small heading: a painted blossom, the label in the book's colour, a gold hairline.
    heading(text: string, base?: TextStyle): ReactNode {
      return <View style={j.heading}>
        <Image source={JOURNAL_ART.blossom} contentFit="contain" accessible={false} style={j.blossom} />
        <Text accessibilityRole="header" style={[j.label, base, { color: accent }]}>{text}</Text>
        <View accessible={false} style={j.line} />
      </View>;
    },
    // Between two parts of a page: the painted golden sprig.
    rule: <Image source={JOURNAL_ART.divider} contentFit="contain" accessible={false} style={j.rule} />,
    // The owner's own words: a slip of paper tucked into the page under a strip of tape, a little askew.
    slip(node: ReactNode, key?: string, tilt = -0.8): ReactNode {
      return <View key={key} style={[j.slip, { transform: [{ rotate: `${tilt}deg` }] }]}>
        <Image source={JOURNAL_ART.paper} contentFit="cover" accessible={false} style={[StyleSheet.absoluteFill, { opacity: .55 }]} />
        <View accessible={false} style={[j.tape, { backgroundColor: tape }]} />
        {node}
      </View>;
    },
    slipText: j.slipText as TextStyle,
    // A date, as a small hand-pressed stamp in the book's colour.
    stamp(text: string, on = false): ReactNode {
      return <View style={[j.stamp, { borderColor: accent }, on && { backgroundColor: `${accent}1F` }]}><Text style={[j.stampText, { color: accent }]}>{text}</Text></View>;
    },
    // A bed for flowers: the bouquet, the month's calendar.
    bed(node: ReactNode): ReactNode {
      return <View style={[j.bed, { backgroundColor: wash, borderColor: edge }]}>{node}</View>;
    },
    // A small card of cream stock with a gold edge.
    card: j.card as ViewStyle,
  };
}

// What is painted on the page itself: a gilded corner at its foot and, on a right page with room to spare, the pressed
// spray. `free` is the empty height under the page's blocks, so the paintings never sit under text.
export function PageDecor({ side, free }: { side: 'left' | 'right'; free: number }) {
  const spray = side === 'right' && free >= 150 ? Math.min(210, free - 6) : 0;
  const corner = Math.max(52, Math.min(100, free + 30));
  return <View accessible={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
    {spray ? <Image source={JOURNAL_ART.spray} contentFit="contain" style={{ position: 'absolute', right: -4, bottom: 30, width: spray * 428 / 600, height: spray, opacity: .92 }} />
      : <Image source={JOURNAL_ART.corner} contentFit="contain" style={[{ position: 'absolute', bottom: -4, width: corner, height: corner, opacity: free > 36 ? .95 : .5 },
        side === 'left' ? { left: -8, transform: [{ scaleY: -1 }] } : { right: -8, transform: [{ scaleX: -1 }, { scaleY: -1 }] }]} />}
  </View>;
}

const j = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  blossom: { width: 18, height: 18 },
  label: { fontFamily: 'Georgia', fontSize: 12, letterSpacing: 2 },
  line: { flex: 1, height: 1, backgroundColor: '#B8934A66' },
  rule: { alignSelf: 'center', width: 190, height: 38, marginVertical: 4 },
  slip: { backgroundColor: '#FAEFD6', borderWidth: 1, borderColor: '#E3CFA2', paddingTop: 12, paddingBottom: 9, paddingHorizontal: 12, marginTop: 8, marginBottom: 6,
    marginHorizontal: 3, boxShadow: '0 2px 5px #5A46302E', overflow: 'visible' },
  tape: { position: 'absolute', top: -6, left: 16, width: 46, height: 13, transform: [{ rotate: '-4deg' }] },
  slipText: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 14, lineHeight: 22, color: '#3A2A1C' },
  stamp: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 8, minHeight: 22, justifyContent: 'center', transform: [{ rotate: '-3deg' }] },
  stampText: { fontFamily: 'Georgia', fontSize: 12, letterSpacing: 1 },
  bed: { borderRadius: 16, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 4 },
  card: { backgroundColor: '#F4E6C6', borderWidth: 1, borderColor: '#B8934A', borderRadius: 8, boxShadow: '0 2px 5px #5A463026' },
});
