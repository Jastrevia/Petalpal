import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { petalCardArt } from '../petalCards/petalCardArt';

// 分享卡 (proposal "持续玩"): an image of the week's petal card made on the phone only when the owner taps Share — no
// server work. By default it holds only the pre-written card (art, name, line) and the week; the week's headline is
// added only when the owner ticks it, and no entry text or reason (which can quote entries or name people) ever is.
const COPY = {
  en: { share: 'Share', title: 'Share this card', withHeadline: 'Add this week’s headline', send: 'Share image', cancel: 'Close',
    failed: 'The image could not be made. Try again in a moment.', note: 'Only the card and the week are in the picture.' },
  'zh-Hans': { share: '分享', title: '分享这张花语卡', withHeadline: '带上这周的标题', send: '分享图片', cancel: '关闭',
    failed: '图片没有做好，稍后再试。', note: '图片里只有这张卡和周次，没有你写的原文。' },
} as const;
// Sharing needs the native share sheet; the web build keeps no share button.
export const shareCardsAvailable = Platform.OS !== 'web';

export function ShareCardButton({ card, headline, week, locale, linkStyle }: {
  card: { id: string; name: string; line: string }; headline: string | null; week: string; locale: 'en' | 'zh-Hans'; linkStyle: object;
}) {
  const t = COPY[locale];
  const [open, setOpen] = useState(false), [withHeadline, setWithHeadline] = useState(false);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const shot = useRef<View>(null);
  const art = petalCardArt(card.id);
  if (!shareCardsAvailable || !art) return null;
  async function share() {
    if (busy || !shot.current) return;
    setBusy(true); setFailed(false);
    try {
      const uri = await captureRef(shot, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t.title });
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <>
    <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setOpen(true)} style={styles.link}><Text style={linkStyle}>{t.share}</Text></Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>{t.title}</Text>
          {/* The picture itself: painted card on the book's paper colour, nothing interactive inside. */}
          <View ref={shot} collapsable={false} style={styles.picture}>
            <Image source={art} contentFit="contain" style={styles.art} accessible={false} />
            <Text style={styles.name}>{card.name}</Text>
            <Text style={styles.line}>{card.line}</Text>
            {withHeadline && headline ? <Text style={styles.headline}>{headline}</Text> : null}
            <Text style={styles.week}>{week} · PetalPal</Text>
          </View>
          {headline ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: withHeadline }} hitSlop={8}
            onPress={() => setWithHeadline(value => !value)} style={styles.link}>
            <Text style={styles.option}>{withHeadline ? '☑' : '☐'} {t.withHeadline}</Text></Pressable> : null}
          <Text style={styles.note}>{t.note}</Text>
          {failed ? <Text accessibilityRole="alert" style={styles.note}>{t.failed}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.link}><Text style={styles.secondary}>{t.cancel}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void share()}
              style={[styles.primary, busy && { opacity: .6 }]}><Text style={styles.primaryText}>{t.send}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}

const INK = '#3F2F1F', GOLD = '#A8823F', PAPER = '#F3E1BA';
const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'center' },
  scrim: { flex: 1, backgroundColor: '#1E140CB3', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 380, backgroundColor: PAPER, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: GOLD },
  title: { fontFamily: 'Georgia', fontSize: 18, color: INK, textAlign: 'center', marginBottom: 12 },
  picture: { alignItems: 'center', backgroundColor: PAPER, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 12 },
  art: { width: 168, height: 252, borderRadius: 10, marginBottom: 12 },
  name: { fontFamily: 'Georgia', fontSize: 15, letterSpacing: 1, color: '#8C6E3A', marginBottom: 4 },
  line: { fontFamily: 'Georgia', fontSize: 15, lineHeight: 22, color: INK, textAlign: 'center' },
  headline: { fontFamily: 'Georgia', fontSize: 15, lineHeight: 22, color: INK, textAlign: 'center', marginTop: 10 },
  week: { fontFamily: 'Georgia', fontSize: 11, letterSpacing: 2, color: GOLD, marginTop: 14 },
  option: { fontFamily: 'Georgia', fontSize: 14, color: INK },
  note: { fontFamily: 'Georgia', fontSize: 12, lineHeight: 18, color: '#6B543A', textAlign: 'center', marginTop: 6 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  secondary: { fontFamily: 'Georgia', fontSize: 14, color: GOLD, textDecorationLine: 'underline' },
  primary: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: '#3E5A4C', justifyContent: 'center' },
  primaryText: { fontFamily: 'Georgia', fontSize: 15, color: '#FAF5E8' },
});
