import { useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import { JournalCover } from '../JournalCover';
import type { ReadingBlocks, ReadingContent } from './pages';
import type { ReadingMetrics } from './readingLayout';

const INK = '#4A3B27', SOFT = '#7A6447', RULE = '#C2A06B';

/** The right page brought close: live, selectable, scrollable text on the same paper the 3D page shows beneath it.
 *  It is laid out from the same metrics as readingFace (pages.ts), which stands in for it whenever the leaf moves. */
export function ReadingPage({ rect, m, background, shade, content, fontRegular, fontItalic, userId, journalId, onActions, onScroll, onBlocks, panHandlers }: {
  rect: { x: number; y: number; width: number; height: number }; m: ReadingMetrics; background: string; shade: number;
  content: ReadingContent; fontRegular?: string; fontItalic?: string; userId: string; journalId: string | null;
  onActions: () => void; onScroll: (y: number) => void; onBlocks: (blocks: ReadingBlocks) => void; panHandlers?: GestureResponderHandlers;
}) {
  const blocks = useRef<ReadingBlocks>({ photo: null, end: null });
  const report = (next: Partial<ReadingBlocks>) => { blocks.current = { ...blocks.current, ...next }; onBlocks(blocks.current); };
  const regular = { fontFamily: fontRegular }, italic = { fontFamily: fontItalic, fontStyle: fontItalic ? undefined : 'italic' as const };
  return <View {...panHandlers} testID="reading-page" style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
    <Image accessible={false} source={{ uri: background }} fadeDuration={0} resizeMode="stretch" style={StyleSheet.absoluteFill} />
    {/* The 3D page's lighting and the binding's soft shadow, so the live page and its picture are indistinguishable. */}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: 1 - shade }]} />
    {[.2, .12, .05].map((w, i) => <View key={i} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: rect.width * w, backgroundColor: '#3A2410', opacity: .012 }} />)}
    <View style={{ position: 'absolute', left: m.padLeft, right: m.padRight, top: m.padTop, bottom: m.padBottom }}>
      <View style={{ flexDirection: 'row', minHeight: m.actions.size }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[regular, { fontSize: m.weekday.size, lineHeight: m.weekday.line, letterSpacing: m.weekday.spacing, color: SOFT }]}>{content.weekday.toUpperCase()}</Text>
          <Text accessibilityRole="header" style={[italic, { fontSize: m.date.size, lineHeight: m.date.line, color: INK }]}>{content.date}</Text>
          {content.grown && <Text style={[italic, { fontSize: m.grown.size, lineHeight: m.grown.line, color: '#7C6A3E' }]}>From Daily Grow · kept as written</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Journal actions" onPress={onActions} hitSlop={6}
          style={{ width: m.actions.size, height: m.actions.size, borderRadius: m.actions.size / 2, alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#F7EBD2E6', borderWidth: 1, borderColor: '#C9A264' }}>
          <View style={{ flexDirection: 'row', gap: 3.3 }}>{[0, 1, 2].map(i => <View key={i} style={{ width: 3.2, height: 3.2, borderRadius: 1.6, backgroundColor: '#5C4630' }} />)}</View>
        </Pressable>
      </View>
      {!!content.title && <Text numberOfLines={m.title.maxLines} style={[italic, { marginTop: m.title.gap, fontSize: m.title.size, lineHeight: m.title.line, color: INK }]}>{content.title}</Text>}
      <View style={{ height: 1, backgroundColor: RULE, marginVertical: m.rule.gap }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator nestedScrollEnabled scrollEventThrottle={16}
        onScroll={event => onScroll(event.nativeEvent.contentOffset.y)} contentContainerStyle={{ paddingBottom: 18 }}>
        {!!content.body && <Text selectable style={[regular, { fontSize: m.body.size, lineHeight: m.body.line, color: '#43361F' }]}>{content.body}</Text>}
        {journalId && <View style={{ marginTop: 16 }} onLayout={event => report({ photo: { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height } })}>
          <JournalCover key={journalId} userId={userId} journalId={journalId} size={120} />
        </View>}
        <View accessible={false} onLayout={event => report({ end: event.nativeEvent.layout.y })}
          style={{ marginTop: 14, height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <View style={styles.flourishLine} /><View style={styles.flourishDot} /><View style={styles.flourishLine} />
        </View>
      </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  flourishLine: { width: 34, height: 1, backgroundColor: RULE },
  flourishDot: { width: 7, height: 7, transform: [{ rotate: '45deg' }], backgroundColor: RULE },
});
