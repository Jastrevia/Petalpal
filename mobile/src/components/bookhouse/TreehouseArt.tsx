import { Image as ExpoImage } from 'expo-image';
import type { ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

// Reusable windows into the original Treehouse painting (1024 × 1536). Every crop keeps the
// source aspect ratio ("cover"), so pieces can be rearranged without stretching the artwork.
const interior = require('../../../assets/bookhouse/interior.png');
const SOURCE = { width: 1024, height: 1536 };
export type Rect = readonly [x: number, y: number, width: number, height: number];

// Regions measured on interior.png.
export const ART = {
  arch: [0, 0, 1024, 250] as Rect,
  beam: [300, 196, 420, 48] as Rect,
  shelfBack: [330, 245, 360, 875] as Rect,
  desk: [0, 1250, 1024, 175] as Rect,
  // Each shelf compartment from its top to the bottom of its plank; ends carry the painted décor.
  shelves: [
    { top: 245, bottom: 410 },
    { top: 410, bottom: 596 },
    { top: 596, bottom: 790 },
    { top: 790, bottom: 976 },
  ],
  shelfLeft: [118, 214] as const,
  shelfCenter: [330, 690] as const,
  shelfRight: [812, 912] as const,
  // The carved pillar: one botanical carving per segment, stacked in painting order.
  pillar: [16, 118] as const,
  carvings: [
    { top: 245, bottom: 440 }, { top: 440, bottom: 596 }, { top: 596, bottom: 790 },
    { top: 790, bottom: 960 }, { top: 960, bottom: 1120 },
  ],
} as const;

export function ArtCrop({ rect, width, height, alignX = .5, alignY = .5, style }: {
  rect: Rect; width: number; height: number; alignX?: number; alignY?: number; style?: StyleProp<ViewStyle>;
}) {
  const [x, y, w, h] = rect;
  const scale = Math.max(width / w, height / h);
  const left = x * scale + (w * scale - width) * alignX;
  const top = y * scale + (h * scale - height) * alignY;
  return <View pointerEvents="none" accessible={false} style={[{ width, height, overflow: 'hidden' }, style]}>
    <Image source={interior} resizeMode="stretch" fadeDuration={0}
      style={{ position: 'absolute', left: -left, top: -top, width: SOURCE.width * scale, height: SOURCE.height * scale }} />
  </View>;
}

// The whole painting behind every Treehouse view: arch, lanterns and wisteria stay at the top.
export function TreehouseBackdrop({ width, height, night, dim = 0 }: { width: number; height: number; night: boolean; dim?: number }) {
  const scale = Math.max(width / SOURCE.width, height / SOURCE.height);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#3B2717', overflow: 'hidden' }]}>
    <Image source={interior} resizeMode="stretch" fadeDuration={0} blurRadius={dim > 0 ? 2 : 0}
      style={{ position: 'absolute', top: 0, left: (width - SOURCE.width * scale) / 2, width: SOURCE.width * scale, height: SOURCE.height * scale }} />
    {dim > 0 && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2A1A0E', opacity: dim }]} />}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: night ? '#091528' : '#CBDCE4', opacity: night ? .38 : .04 }]} />
  </View>;
}

export const serif = Platform.select({ ios: 'Georgia', web: 'Georgia, "Times New Roman", serif', default: 'serif' });
export const palette = {
  parchment: '#F6EAD0', parchmentDeep: '#EAD7B0', ink: '#4A3A27', inkSoft: '#7A6447', gold: '#C9A264', goldDeep: '#9C7A44',
  teal: '#24504B', cream: '#FFF3DA', wood: '#5A3A22',
};

const svg = (body: string, viewBox = '0 0 24 24') => ({ uri: `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="#5C4630" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`)}` });
export const ICONS = {
  back: svg('<path d="M19 12H5.5"/><path d="M11 6l-6 6 6 6"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.3" fill="#5C4630"/><circle cx="12" cy="12" r="1.3" fill="#5C4630"/><circle cx="18.5" cy="12" r="1.3" fill="#5C4630"/>'),
  pencil: svg('<path d="M15.5 4.5l4 4L9 19l-5 1 1-5z"/><path d="M13.5 6.5l4 4"/><path d="M5 15l4 4"/>'),
  trash: svg('<path d="M4.5 7h15"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/><path d="M10.2 10.5v6M13.8 10.5v6"/>'),
  chevron: svg('<path d="M9.5 6l6 6-6 6"/>'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
};
// An antique brass padlock with filigree and a small leaf on its shackle, for months and years not yet arrived.
export const LOCK_ICON = { uri: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0D9A2"/><stop offset=".45" stop-color="#C39A55"/><stop offset="1" stop-color="#7C5A2B"/></linearGradient></defs>
<path d="M8 11.2V8.4a4 4 0 0 1 8 0v2.8" fill="none" stroke="#5E431F" stroke-width="2.1" stroke-linecap="round"/>
<path d="M8 11.2V8.4a4 4 0 0 1 8 0v2.8" fill="none" stroke="#E5C886" stroke-width=".8" stroke-linecap="round"/>
<path d="M15.6 6.6c1.5-1.7 3.5-1.6 4.3-.8-1 1.5-2.8 2-4.3.8z" fill="#8C9C63" stroke="#55663A" stroke-width=".45"/>
<rect x="5" y="10.6" width="14" height="10.4" rx="2.4" fill="url(#b)" stroke="#5A3F1C" stroke-width=".9"/>
<path d="M6.7 12.6c1.4-.3 1.9.5 1.7 1.4M17.3 12.6c-1.4-.3-1.9.5-1.7 1.4M6.7 19.1c1.4.3 1.9-.5 1.7-1.4M17.3 19.1c-1.4.3-1.9-.5-1.7-1.4" fill="none" stroke="#F6E4B8" stroke-width=".55" stroke-linecap="round" opacity=".9"/>
<circle cx="12" cy="14.7" r="1.35" fill="#3B2810"/><path d="M11.35 15.4h1.3l.45 2.6h-2.2z" fill="#3B2810"/>
</svg>`)}` };

// A window into the painting at an explicit scale, starting at source point (sx, sy). Neighbouring windows
// that share a scale line up exactly, which lets the shelf be recomposed with a single blended join.
export function ArtWindow({ scale, sx, sy, width, height, style }: { scale: number; sx: number; sy: number; width: number; height: number; style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" accessible={false} style={[{ width, height, overflow: 'hidden' }, style]}>
    <Image source={interior} resizeMode="stretch" fadeDuration={0}
      style={{ position: 'absolute', left: -sx * scale, top: -sy * scale, width: SOURCE.width * scale, height: SOURCE.height * scale }} />
  </View>;
}

export function Icon({ source, size = 20, opacity = 1 }: { source: { uri: string }; size?: number; opacity?: number }) {
  return <ExpoImage accessible={false} pointerEvents="none" source={source} style={{ width: size, height: size, opacity }} contentFit="contain" />;
}

// A round parchment button used for back and menu controls (44 pt touch target).
export function RoundButton({ label, icon, onPress, disabled, testID, targetProps }: {
  label: string; icon: { uri: string }; onPress: () => void; disabled?: boolean; testID?: string; targetProps?: object;
}) {
  return <Pressable {...targetProps} testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={4}
    style={({ pressed }) => [chrome.round, pressed && { transform: [{ scale: .95 }], backgroundColor: '#FFF8E6' }, disabled && { opacity: .5 }]}>
    <Icon source={icon} size={22} />
  </Pressable>;
}

// A carved title sign: the painted top beam framed in gold, with a parchment-light inscription.
export function TitlePlaque({ title, subtitle, width, onLongPress }: { title: string; subtitle?: string; width: number; onLongPress?: () => void }) {
  const height = subtitle ? 64 : 50;
  return <Pressable accessible accessibilityRole="header" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} onLongPress={onLongPress}
    style={[chrome.plaque, { width, height }]}>
    <ArtCrop rect={ART.beam} width={width} height={height} style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#2C1A0C', opacity: .42 }]} />
    <View pointerEvents="none" style={chrome.plaqueInset} />
    {!!subtitle && <Text numberOfLines={1} style={chrome.plaqueSubtitle}>{subtitle}</Text>}
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={chrome.plaqueTitle}>{title}</Text>
  </Pressable>;
}

// Primary parchment pill ("New Journal") and its quieter secondary variant.
export function ParchmentButton({ label, onPress, art, secondary, accessibilityLabel, accessibilityHint, style, disabled }: {
  label: string; onPress: () => void; art?: ReactNode; secondary?: boolean; accessibilityLabel?: string; accessibilityHint?: string; style?: StyleProp<ViewStyle>; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityHint={accessibilityHint} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [chrome.pill, secondary && chrome.pillSecondary, pressed && { transform: [{ scale: .97 }] }, disabled && { opacity: .55 }, style]}>
    {art}
    <Text numberOfLines={1} style={[chrome.pillText, secondary && { fontSize: 14.5, flexShrink: 1 }]}>{label}</Text>
  </Pressable>;
}

export const chrome = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7EBD2F2',
    borderWidth: 1.5, borderColor: palette.gold, shadowColor: '#1B0E06', shadowOpacity: .35, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  plaque: { alignSelf: 'center', borderRadius: 16, overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: palette.gold, shadowColor: '#1B0E06', shadowOpacity: .45, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  plaqueInset: { position: 'absolute', left: 4, right: 4, top: 4, bottom: 4, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E9CF97' },
  plaqueTitle: { fontFamily: serif, fontStyle: 'italic', fontSize: 25, color: '#FBEBC6', paddingHorizontal: 18,
    textShadowColor: '#1A0D05', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  plaqueSubtitle: { fontFamily: serif, fontSize: 13, letterSpacing: .4, color: '#EBD3A2', marginBottom: -1,
    textShadowColor: '#1A0D05', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  pill: { minHeight: 50, borderRadius: 25, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F8EDD5', borderWidth: 1.5, borderColor: palette.gold,
    shadowColor: '#1B0E06', shadowOpacity: .4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  pillSecondary: { minHeight: 46, paddingHorizontal: 10, gap: 6, backgroundColor: '#F3E3C3' },
  pillText: { fontFamily: serif, fontSize: 17, color: '#3F5B4F' },
});
