import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
  type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_BODY, FONT_DISPLAY, FONT_TITLE } from '../mailbox/ExpandedLetter';
import { AVATAR_TIERS } from '../avatars/avatarArt';

// Sign-up offers every Level 1 avatar (Avatar System V1.0): the one chosen is worn, three others are her gift.
const LEVEL_1 = AVATAR_TIERS[0].ids;
import { UserAvatar } from '../avatars/UserAvatar';

// The sign-up pages (the owner's mock-ups, 2026-11-06): one garden scene (wisteria, a misty
// waterfall, a lotus pond and a lantern; painted with FLUX.2 klein from the mock-up) behind a cream
// card with an arched top and a double gold frame, the Garden Fairy leaning on its right side.
// "Create your account" takes the account name and password; "Welcome to your garden" then shows
// that name and takes the fairy's name and an avatar (the original portraits). Small painted-line
// icons are drawn with Skia so they look the same on the web and on phones.

const BACKGROUND = require('../../../assets/auth/signup/background.webp');
const FAIRY = require('../../../assets/auth/signup/fairy-leaning.webp');
const FAIRY_RATIO = 684 / 620;
const GOLD = '#C9A35E', INK = '#4A3426', BROWN = '#6B4A2F', TEXT = '#5A4636', HINT = '#6E5B4B', PARCHMENT = '#FBF4EA';

// ---- Small line icons (24-unit paths) ----
const PATHS = {
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
  lock: 'M7 10.5h10a2.5 2.5 0 0 1 2.5 2.5v6a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 19v-6A2.5 2.5 0 0 1 7 10.5z M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5',
  eye: 'M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12s-4 7.5-10.5 7.5S1.5 12 1.5 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12s-4 7.5-10.5 7.5S1.5 12 1.5 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M3 3l18 18',
  envelope: 'M3.5 6.5h17v11h-17z M3.5 6.5l8.5 7 8.5-7',
  back: 'M14.5 5.5L8 12l6.5 6.5',
  flower: 'M12 3.6c1.5 0 2.5 1.5 2.1 3.2 1.5-.9 3.4-.4 3.9 1 .5 1.4-.6 2.8-2.3 3 1.3 1 1.5 3 .4 3.9-1.1 1-3 .6-3.7-.9-.6 1.5-2.3 2.3-3.6 1.5-1.3-.8-1.5-2.6-.4-3.7-1.6-.4-2.6-1.9-1.9-3.2.7-1.3 2.5-1.7 3.8-.9 0-1.8.8-3 1.7-3z M12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
  fleuron: 'M12 1C10.8 5 10.8 9 12 14 13.2 9 13.2 5 12 1Z M11.5 9C8.5 7 5 7.8 2.5 11 6 12.2 9.5 10.8 11.5 9Z M12.5 9C15.5 7 19 7.8 21.5 11 18 12.2 14.5 10.8 12.5 9Z',
  diamond: 'M12 4l3.5 8L12 20l-3.5-8z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};
type Glyph = keyof typeof PATHS;
const FILLED: Glyph[] = ['fleuron', 'diamond'];
function Icon({ name, size = 20, color = BROWN, strokeWidth = 1.7 }: { name: Glyph; size?: number; color?: string; strokeWidth?: number }) {
  const path = useMemo(() => Skia.Path.MakeFromSVGString(PATHS[name]), [name]);
  if (!path) return null;
  return <Canvas style={{ width: size, height: size }} pointerEvents="none">
    <Group transform={[{ scale: size / 24 }]}>
      <Path path={path} color={color} style={FILLED.includes(name) ? 'fill' : 'stroke'} strokeWidth={strokeWidth} strokeCap="round" strokeJoin="round" />
    </Group>
  </Canvas>;
}

function Divider() {
  return <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={styles.dividerLine} /><Icon name="diamond" size={12} color={GOLD} /><View style={styles.dividerLine} />
  </View>;
}

// ---- The frame both pages share ----
export function AccountFrame({ title, subtitle, left, right, children, fairyAt }: {
  title: string; subtitle: string; left?: ReactNode; right?: ReactNode; children: ReactNode;
  /** How far down the card the fairy leans in (beside the fields), in points; none: no fairy. */
  fairyAt?: number;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const card = Math.min(width - 28, 460);
  // The square scene covers the screen, shifted a little left so the lantern stays in view on a phone.
  const side = Math.max(width, height);
  const offsetX = Math.min(0, Math.max(width - side, (width - side) * 0.36));
  const fairyWidth = Math.round(card * (width < 420 ? 0.5 : 0.46));
  return <View style={styles.root}>
    <Image source={BACKGROUND} resizeMode="cover" style={{ position: 'absolute', width: side, height: side, left: offsetX, top: Math.min(0, (height - side) / 2) }}
      accessibilityIgnoresInvertColors />
    <View style={styles.veil} pointerEvents="none" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 28 }]}>
        <View style={[styles.card, { width: card }]} testID="account-card">
          <View style={styles.cardInset} pointerEvents="none" />
          <View style={styles.ornament}><Icon name="fleuron" size={26} color={GOLD} /></View>
          <Text accessibilityRole="header" style={styles.brand}>PetalPal</Text>
          <View style={styles.brandMark}><Icon name="flower" size={16} color={GOLD} strokeWidth={1.4} /></View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Divider />
          <View>
            {fairyAt !== undefined ? <View pointerEvents="none" style={{ position: 'absolute', right: -40, top: fairyAt }}>
              <Image source={FAIRY} resizeMode="contain" accessibilityIgnoresInvertColors
                style={{ width: fairyWidth, height: Math.round(fairyWidth * FAIRY_RATIO) }} /></View> : null}
            {children}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    {left ? <View style={[styles.corner, { top: insets.top + 12, left: insets.left + 12 }]}>{left}</View> : null}
    {right ? <View style={[styles.corner, { top: insets.top + 12, right: insets.right + 12, alignItems: 'flex-end' }]}>{right}</View> : null}
  </View>;
}

export function CornerButton({ label, icon, onPress, testID }: { label: string; icon: Glyph; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.cornerButton, pressed && styles.pressed]}>
    <Icon name={icon} size={16} color="#FFF8EC" strokeWidth={1.8} />
    <Text numberOfLines={1} style={styles.cornerText}>{label}</Text>
  </Pressable>;
}

// A labelled field: a little gold flower before the label, a cream pill with an icon, a note below.
export function Field({ label, note, icon, secret, narrow, fixedValue, ...input }: TextInputProps & {
  label: string; note?: string; icon?: Glyph; secret?: boolean; narrow?: boolean; fixedValue?: string;
}) {
  const [shown, setShown] = useState(false);
  return <View style={[styles.field, narrow && styles.narrow]}>
    <View style={styles.labelRow}><Icon name="flower" size={20} color={GOLD} strokeWidth={1.4} /><Text style={styles.label}>{label}</Text></View>
    <View style={[styles.pill, fixedValue !== undefined && styles.pillReadOnly]}>
      {icon ? <Icon name={icon} size={19} color="#8A7563" /> : null}
      {fixedValue !== undefined ? <Text style={styles.input} numberOfLines={1} accessibilityLabel={`${label}: ${fixedValue}`}>{fixedValue}</Text>
        : <TextInput accessibilityLabel={label} placeholderTextColor="#9C8B7B" style={styles.input} secureTextEntry={secret && !shown}
          autoCorrect={false} autoCapitalize="none" {...input} />}
      {secret ? <Pressable accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} hitSlop={10} onPress={() => setShown(!shown)}>
        <Icon name={shown ? 'eye' : 'eyeOff'} size={19} color="#8A7563" />
      </Pressable> : null}
    </View>
    {note ? <Text style={styles.note}>{note}</Text> : null}
  </View>;
}

export function PrimaryButton({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} testID={testID}
    style={({ pressed }) => [styles.primary, disabled && styles.disabled, pressed && styles.pressed]}>
    <View style={styles.primaryInset} pointerEvents="none" />
    <Text style={styles.primaryText}>{label}</Text>
  </Pressable>;
}

export function TextLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress} testID={testID}>
    <Text style={styles.textLink}>{label}</Text>
  </Pressable>;
}

export function FooterLinks({ children }: { children: ReactNode }) {
  return <View style={styles.footer}><Divider /><View style={styles.footerLinks}>{children}</View></View>;
}

// The original portraits, four to a row; the chosen one glows gold.
export function AvatarChoice({ label, value, onChange, disabled }: { label: string; value: string; onChange: (avatar: string) => void; disabled?: boolean }) {
  return <View style={styles.field}>
    <View style={styles.labelRow}><Icon name="flower" size={20} color={GOLD} strokeWidth={1.4} /><Text style={styles.label}>{label}</Text></View>
    <View style={styles.avatars} accessibilityRole="radiogroup">
      {LEVEL_1.map((avatar, index) => <Pressable key={avatar} accessibilityRole="radio" accessibilityLabel={`Avatar ${index + 1}`}
        accessibilityState={{ selected: value === avatar }} disabled={disabled} onPress={() => onChange(avatar)} testID={`avatar-${avatar}`}
        style={[styles.avatar, value === avatar && styles.avatarOn]}>
        <UserAvatar avatar={avatar} size={50} />
      </Pressable>)}
      {/* Five to a row: spacers keep the last row's avatars under the columns above. */}
      {Array.from({ length: (5 - LEVEL_1.length % 5) % 5 }, (_, i) => <View key={`spacer-${i}`} style={styles.avatarSpacer} />)}
    </View>
  </View>;
}

export function Check({ checked, label, onPress, link, onLink }: { checked: boolean; label: string; onPress: () => void; link?: string; onLink?: () => void }) {
  return <View style={styles.checkRow}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${label} ${link ?? ''}`.trim()} onPress={onPress}
      hitSlop={8} style={styles.checkHit}>
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>{checked ? <Icon name="check" size={14} color="#FFF8EC" strokeWidth={2.4} /> : null}</View>
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
    {link && onLink ? <Text accessibilityRole="link" onPress={onLink} style={[styles.checkText, styles.underline]}>{link}</Text> : null}
  </View>;
}

export function Message({ text, alert }: { text: string; alert?: boolean }) {
  return <Text accessibilityRole={alert ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.message, alert && styles.messageAlert]}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E9DDEB', overflow: 'hidden' },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 244, 236, 0.12)' },
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  card: { backgroundColor: 'rgba(251, 244, 234, 0.97)', borderTopLeftRadius: 150, borderTopRightRadius: 150, borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26, borderWidth: 1.6, borderColor: GOLD, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 26,
    shadowColor: '#5B3F2A', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  cardInset: { position: 'absolute', top: 7, left: 7, right: 7, bottom: 7, borderTopLeftRadius: 143, borderTopRightRadius: 143, borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20, borderWidth: 1, borderColor: 'rgba(201, 163, 94, 0.45)' },
  ornament: { alignItems: 'center', marginBottom: 2 },
  brand: { fontFamily: FONT_DISPLAY, fontSize: 34, color: INK, textAlign: 'center', letterSpacing: 0.5 },
  brandMark: { alignItems: 'center', marginTop: 2, marginBottom: 10 },
  title: { fontFamily: FONT_TITLE, fontStyle: 'italic', fontSize: 38, lineHeight: 44, color: BROWN, textAlign: 'center' },
  subtitle: { fontFamily: FONT_BODY, fontSize: 16, lineHeight: 23, color: TEXT, textAlign: 'center', marginTop: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginVertical: 16, alignSelf: 'center', width: '66%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(201, 163, 94, 0.7)' },
  field: { marginBottom: 16 },
  narrow: { width: '64%' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  label: { fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: '700', fontSize: 20, color: INK },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 24, borderWidth: 1.3, borderColor: '#D9B87C',
    backgroundColor: '#FBF1E2', paddingHorizontal: 16 },
  pillReadOnly: { backgroundColor: '#F6EBDA' },
  input: { flex: 1, minWidth: 0, width: '100%', fontFamily: FONT_BODY, fontSize: 16, color: INK, paddingVertical: Platform.OS === 'web' ? 12 : 8,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) },
  note: { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 13.5, lineHeight: 19, color: HINT, marginTop: 6, marginLeft: 4 },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  avatarSpacer: { width: '18.5%' },
  avatar: { width: '18.5%', aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(201, 163, 94, 0.55)' },
  avatarOn: { borderWidth: 3, borderColor: '#E7C26B', shadowColor: '#F2C766', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  checkRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5, marginTop: 2, marginBottom: 6 },
  checkHit: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  checkBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.4, borderColor: GOLD, backgroundColor: '#FFF9F0', alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: '#8E6BAA', borderColor: '#8E6BAA' },
  checkText: { fontFamily: FONT_BODY, fontSize: 15, color: TEXT },
  underline: { textDecorationLine: 'underline' },
  primary: { alignSelf: 'center', minWidth: '78%', minHeight: 58, marginTop: 16, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28, backgroundColor: '#8F6CAD', borderWidth: 2, borderColor: '#D8B572',
    shadowColor: '#5B3F7A', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  primaryInset: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255, 240, 210, 0.55)' },
  primaryText: { fontFamily: FONT_TITLE, fontSize: 24, color: '#FFF8EC', letterSpacing: 0.5 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  footer: { marginTop: 14 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18, rowGap: 6 },
  textLink: { fontFamily: FONT_BODY, fontStyle: 'italic', fontSize: 15, color: BROWN, textDecorationLine: 'underline', textAlign: 'center' },
  corner: { position: 'absolute', zIndex: 50, maxWidth: '48%' },
  cornerButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingHorizontal: 13, borderRadius: 18,
    backgroundColor: 'rgba(58, 48, 70, 0.62)', borderWidth: 1, borderColor: 'rgba(233, 201, 121, 0.75)' },
  cornerText: { fontFamily: FONT_BODY, fontSize: 15, color: '#FFF8EC', flexShrink: 1 },
  message: { fontFamily: FONT_BODY, fontSize: 15, lineHeight: 21, color: TEXT, textAlign: 'center', marginTop: 10 },
  messageAlert: { color: '#9A3D3D' },
});
