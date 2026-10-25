import { memo } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BotanicalIconType, Letter, PaperTone } from './types';
import {
  LETTER_DECKLE_CLIP,
  LETTER_PAPER_BACKGROUND,
} from './paperTextures';

// Inject artistic Google Fonts in web environment for poetic stationery feel
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const fontId = 'petalpal-mailbox-fonts';
  if (!document.getElementById(fontId)) {
    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,600&display=swap';
    document.head.appendChild(link);
  }
}

// Literary typography hierarchy with graceful CJK serif fallbacks
export const FONT_DISPLAY = Platform.select({
  web: '"Playfair Display", "Cormorant Garamond", "Songti SC", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", "Baskerville", Georgia, serif',
  ios: 'Baskerville',
  default: 'serif',
});

export const FONT_TITLE = Platform.select({
  web: '"Cormorant Garamond", "Playfair Display", "Songti SC", "Noto Serif CJK SC", "Baskerville", Georgia, serif',
  ios: 'Baskerville',
  default: 'serif',
});

export const FONT_BODY = Platform.select({
  web: '"Cormorant Garamond", "EB Garamond", "Songti SC", "SimSun", "Noto Serif CJK SC", "Kaiti SC", "Palatino", Georgia, serif',
  ios: 'Georgia',
  default: 'serif',
});

export const FONT_SIGNATURE = Platform.select({
  web: '"Alex Brush", "Caveat", "Kaiti SC", "STKaiti", "Snell Roundhand", cursive',
  ios: 'Snell Roundhand',
  default: 'cursive',
});

const BOTANICAL_ICONS: Record<BotanicalIconType, any> = {
  crocus: require('../../../assets/mailbox/icon_crocus.jpg'),
  bellflower: require('../../../assets/mailbox/icon_bellflower.jpg'),
  chamomile: require('../../../assets/mailbox/icon_chamomile.jpg'),
  lavender: require('../../../assets/mailbox/icon_lavender.jpg'),
  sprig: require('../../../assets/mailbox/icon_sprig.jpg'),
};

const STAMP_ASSET = require('../../../assets/mailbox/petalpal_stamp.jpg');
const MINI_SCENE_ASSET = require('../../../assets/mailbox/mini_garden_scene.jpg');

export interface StationeryToneConfig {
  bg: string;
  border: string;
  deckleInner: string;
  creaseShadow: string;
  creaseHighlight: string;
  faintWatermark: string;
  inkPrimary: string;
  inkSecondary: string;
  accentParchment: string;
}

export const STATIONERY_TONES: Record<PaperTone, StationeryToneConfig> = {
  cream: {
    bg: '#FAF6ED',
    border: '#DACDB3',
    deckleInner: 'rgba(195, 180, 155, 0.45)',
    creaseShadow: 'rgba(75, 52, 28, 0.12)',
    creaseHighlight: 'rgba(255, 255, 255, 0.85)',
    faintWatermark: 'rgba(100, 75, 45, 0.05)',
    inkPrimary: '#2D2115',
    inkSecondary: '#6B5743',
    accentParchment: 'rgba(240, 230, 215, 0.75)',
  },
  lavender: {
    bg: '#F3EEF9',
    border: '#D2C3E0',
    deckleInner: 'rgba(185, 170, 205, 0.45)',
    creaseShadow: 'rgba(70, 45, 90, 0.12)',
    creaseHighlight: 'rgba(255, 255, 255, 0.85)',
    faintWatermark: 'rgba(95, 65, 115, 0.05)',
    inkPrimary: '#271B2F',
    inkSecondary: '#645172',
    accentParchment: 'rgba(235, 225, 245, 0.75)',
  },
  aged: {
    bg: '#F6EEDE',
    border: '#D2C1A5',
    deckleInner: 'rgba(185, 170, 142, 0.45)',
    creaseShadow: 'rgba(80, 50, 25, 0.14)',
    creaseHighlight: 'rgba(255, 255, 255, 0.80)',
    faintWatermark: 'rgba(95, 68, 38, 0.06)',
    inkPrimary: '#2A1D12',
    inkSecondary: '#66523E',
    accentParchment: 'rgba(238, 226, 208, 0.75)',
  },
  rose: {
    bg: '#FAF1ED',
    border: '#E1C8C0',
    deckleInner: 'rgba(205, 175, 168, 0.45)',
    creaseShadow: 'rgba(90, 48, 40, 0.12)',
    creaseHighlight: 'rgba(255, 255, 255, 0.82)',
    faintWatermark: 'rgba(110, 60, 50, 0.05)',
    inkPrimary: '#302022',
    inkSecondary: '#70545A',
    accentParchment: 'rgba(245, 228, 224, 0.75)',
  },
  sage: {
    bg: '#EFF6ED',
    border: '#C6D8C1',
    deckleInner: 'rgba(175, 195, 170, 0.45)',
    creaseShadow: 'rgba(45, 75, 45, 0.12)',
    creaseHighlight: 'rgba(255, 255, 255, 0.85)',
    faintWatermark: 'rgba(50, 80, 50, 0.05)',
    inkPrimary: '#1E281E',
    inkSecondary: '#526852',
    accentParchment: 'rgba(228, 240, 226, 0.75)',
  },
};

interface ExpandedLetterProps {
  letter: Letter;
  onCollapse: () => void;
  width?: number;
  maxHeight?: number;
  sheetHeight?: number;
  isFolded?: boolean;
  hideFoldTab?: boolean;
}

export const ExpandedLetter = memo(function ExpandedLetter({
  letter,
  onCollapse,
  width = 345,
  maxHeight = 520,
  sheetHeight,
  isFolded = false,
  hideFoldTab = false,
}: ExpandedLetterProps) {
  const tone = STATIONERY_TONES[letter.paperTone || 'cream'];
  const iconSource = BOTANICAL_ICONS[letter.botanicalIcon];

  // Dynamic natural height: shorter notes take less vertical canvas, longer ones expand
  const naturalTargetHeight = Math.min(
    letter.estimatedHeight || 420,
    maxHeight
  );

  const effectiveHeight = sheetHeight !== undefined ? sheetHeight : undefined;

  const isWeb = Platform.OS === 'web';

  return (
    <View
      accessibilityLabel="Expanded Reading Letter"
      style={[
        styles.paperWrapper,
        {
          width,
          height: effectiveHeight,
          minHeight: effectiveHeight ? undefined : naturalTargetHeight,
          maxHeight: effectiveHeight ? undefined : maxHeight,
          overflow: isFolded ? 'hidden' : 'visible',
        },
      ]}
    >
      <View
        style={[
          styles.handmadePaperSheet,
          {
            backgroundColor: tone.bg,
            borderColor: tone.border,
            height: effectiveHeight ? '100%' : undefined,
            overflow: 'hidden',
            ...Platform.select({
              web: {
                borderWidth: 0,
                backgroundImage: LETTER_PAPER_BACKGROUND,
                clipPath: LETTER_DECKLE_CLIP,
              },
            }),
          },
        ]}
      >
      {/* ── 1. SUBTLE NATURAL PAPER GRAIN & ORGANIC FIBERS ── */}
      {/* Authentic high-end stationery maintains generous calm negative space */}
      {/* Delicate botanical paper fiber specks replace artificial horizontal notebook ruling */}
      <View style={styles.paperFiberLayer} pointerEvents="none">
        <View style={[styles.fiberFleck, styles.fiber1, { backgroundColor: tone.inkSecondary }]} />
        <View style={[styles.fiberFleck, styles.fiber2, { backgroundColor: tone.inkSecondary }]} />
        <View style={[styles.fiberFleck, styles.fiber3, { backgroundColor: tone.inkSecondary }]} />
        <View style={[styles.fiberFleck, styles.fiber4, { backgroundColor: tone.inkSecondary }]} />
      </View>

      {/* ── 1b. TRIFOLD PANEL TONES & CREASE MEMORY ──
          The sheet remembers being folded in thirds: each panel catches the
          light slightly differently and two soft valley creases run across it. */}
      {!isFolded && (
        <View style={styles.foldMemoryLayer} pointerEvents="none">
          <View style={[styles.foldPanelMiddle, { backgroundColor: tone.creaseShadow }]} />
          <View style={[styles.foldCreaseBand, { top: '33.3%' }]}>
            <View style={[styles.foldCreaseValley, { backgroundColor: tone.creaseShadow }]} />
            <View style={[styles.foldCreaseRidge, { backgroundColor: tone.creaseHighlight }]} />
          </View>
          <View style={[styles.foldCreaseBand, { top: '66.6%' }]}>
            <View style={[styles.foldCreaseRidge, { backgroundColor: tone.creaseHighlight }]} />
            <View style={[styles.foldCreaseValley, { backgroundColor: tone.creaseShadow }]} />
          </View>
        </View>
      )}

      {/* ── 2. DECKLED NATURAL PAPER INSET BEVEL ── */}
      <View
        style={[
          styles.innerDeckledFrame,
          { borderColor: 'transparent' },
        ]}
      >
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.letterContentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* ── 3. LETTERHEAD: Botanical Study Emblem, Sender & Postage ── */}
          <View style={styles.letterheadRow}>
            {/* Left: Botanical Study Emblem & Scription */}
            <View style={styles.letterheadLeft}>
              <View
                style={[
                  styles.botanicalStudyBadge,
                  { borderColor: tone.deckleInner },
                ]}
              >
                {iconSource && (
                  <Image
                    source={iconSource}
                    style={styles.studyBadgeImage}
                    resizeMode="contain"
                  />
                )}
              </View>
              <View style={styles.senderScriptGroup}>
                <Text
                  style={[styles.letterSenderTitle, { color: tone.inkPrimary }]}
                >
                  {letter.sender}
                </Text>
                <Text
                  style={[styles.letterDateSubtitle, { color: tone.inkSecondary }]}
                >
                  {letter.postmarkText || 'PetalPal Sanctuary'}
                </Text>
              </View>
            </View>

            {/* Right: Italic date above a vintage stamp with round postmark */}
            <View style={styles.stampHeaderGroup}>
              {letter.date ? (
                <Text style={[styles.letterheadDate, { color: tone.inkSecondary }]}>
                  {letter.date}
                </Text>
              ) : null}
              <View style={styles.stampPostmarkCluster}>
                <View style={styles.postageStampMini}>
                  <Image
                    source={STAMP_ASSET}
                    style={styles.stampHeaderImage}
                    resizeMode="cover"
                  />
                </View>
                <View style={[styles.roundPostmark, { borderColor: tone.inkSecondary }]}>
                  <Text style={[styles.roundPostmarkGlyph, { color: tone.inkSecondary }]}>✿</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── 4. SPRIG ORNAMENT DIVIDER ── */}
          <View style={styles.ornamentDivider}>
            <View style={[styles.ornamentRule, { backgroundColor: tone.deckleInner }]} />
            <Text style={[styles.ornamentGlyph, { color: tone.inkSecondary }]}>❦</Text>
            <View style={[styles.ornamentRule, { backgroundColor: tone.deckleInner }]} />
          </View>

          {/* ── 5. CALLIGRAPHIC HEADLINE ── */}
          {letter.headline && (
            <Text
              style={[styles.headlineCalligraphy, { color: tone.inkPrimary }]}
            >
              {letter.headline}
            </Text>
          )}

          {/* ── 6. BODY PARAGRAPHS — FULL COMFORTABLE LINE LENGTH ── */}
          {/* Unconstrained full-width text column prevents narrow-wrap squishing */}
          <View style={styles.bodyContentLayout}>
            <Text
              style={[styles.letterBodyText, { color: tone.inkPrimary }]}
            >
              {letter.body}
            </Text>
          </View>

          {/* ── 7–9. CLOSING ROW: script sign-off (left) + vignette / pressed botanical (right) ── */}
          <View style={styles.closingRow}>
            <View style={styles.closingSection}>
              <Text
                style={[styles.signoffPhrase, { color: tone.inkSecondary }]}
              >
                {letter.signoff || 'With warm affection,'}
              </Text>
              <Text
                style={[styles.cursiveSignature, { color: tone.inkPrimary }]}
              >
                {letter.signature === 'PetalPal' ? 'The PetalPal Garden' : letter.signature}
              </Text>
              <Text style={[styles.floretIcon, { color: tone.inkSecondary }]}>❦</Text>
            </View>

            {/* ARTISTIC WATERCOLOR VIGNETTE PLATE (taped photograph) */}
            {letter.illustrationType === 'gazebo' ? (
              <View style={styles.vignetteRowCentered}>
                <View
                  style={[
                    styles.vignetteFrame,
                    { borderColor: tone.deckleInner },
                  ]}
                >
                  <View style={styles.vignetteTape} />
                  <Image
                    source={MINI_SCENE_ASSET}
                    style={styles.vignetteImage}
                    resizeMode="cover"
                  />
                  <View style={styles.vignetteCaption}>
                    <Text style={[styles.vignetteCaptionText, { color: tone.inkSecondary }]}>
                      Central Bluff this morning ♡
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              iconSource && (
                <Image
                  source={iconSource}
                  style={[
                    styles.closingBotanical,
                    isWeb ? ({ mixBlendMode: 'multiply' } as any) : null,
                  ]}
                  resizeMode="contain"
                />
              )
            )}
          </View>

          {/* ── 10. BOTANICAL FOOTER BANNER ── */}
          <View style={styles.footerMottoBanner}>
            <Text
              style={[styles.footerMottoText, { color: tone.inkSecondary }]}
            >
              {letter.footerQuote || 'KIND WORDS BLOOM BRIGHTER'} ♡
            </Text>
          </View>
        </ScrollView>
      </View>
      </View>

      {/* ── 11. ORGANIC PARCHMENT FOLD TAB (hangs over the top edge, outside the deckle clip) ── */}
      {!hideFoldTab && !isFolded && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fold letter back into envelope"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onCollapse}
          style={({ pressed }) => [
            styles.foldTabButton,
            {
              backgroundColor: tone.accentParchment,
              borderColor: tone.border,
            },
            pressed && styles.foldTabPressed,
          ]}
        >
          <Text style={[styles.foldTabText, { color: tone.inkSecondary }]}>
            Fold Mail ⤹
          </Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  paperWrapper: {
    position: 'relative',
    alignSelf: 'center',
    ...Platform.select({
      web: {
        filter:
          'drop-shadow(0 14px 28px rgba(22, 14, 8, 0.36)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.12))',
      },
      ios: {
        shadowColor: '#160E08',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.38,
        shadowRadius: 18,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  foldMemoryLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  foldPanelMiddle: {
    position: 'absolute',
    top: '33.3%',
    bottom: '33.3%',
    left: 0,
    right: 0,
    opacity: 0.03,
  },
  foldCreaseBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    marginTop: -2,
  },
  foldCreaseValley: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.2,
    opacity: 0.16,
  },
  foldCreaseRidge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.2,
    opacity: 0.35,
  },
  handmadePaperSheet: {
    // Nearly square corners with subtle natural softness (3-4px)
    borderTopLeftRadius: 4,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 3,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#160E08',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.38,
        shadowRadius: 18,
      },
      android: {
        elevation: 14,
      },
      web: {
        transition:
          'height 0.46s cubic-bezier(0.22, 1, 0.36, 1), transform 0.44s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease',
      },
    }),
  },
  paperFiberLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  fiberFleck: {
    position: 'absolute',
    opacity: 0.12,
  },
  fiber1: {
    top: 54,
    left: 28,
    width: 6,
    height: 1,
    transform: [{ rotate: '25deg' }],
  },
  fiber2: {
    top: 140,
    right: 36,
    width: 8,
    height: 1,
    transform: [{ rotate: '-18deg' }],
  },
  fiber3: {
    top: 260,
    left: 45,
    width: 7,
    height: 1,
    transform: [{ rotate: '42deg' }],
  },
  fiber4: {
    bottom: 80,
    right: 50,
    width: 9,
    height: 1,
    transform: [{ rotate: '-30deg' }],
  },
  innerDeckledFrame: {
    flex: 1,
    margin: 6,
    borderRadius: 3,
    borderWidth: 0.8,
    borderStyle: 'solid',
    zIndex: 1,
    overflow: 'hidden',
  },
  scrollArea: {
    flex: 1,
  },
  letterContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 8,
  },
  letterheadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 4,
  },
  letterheadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  botanicalStudyBadge: {
    width: 36,
    height: 44,
    borderRadius: 3,
    borderWidth: 0.8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    flexShrink: 0,
  },
  studyBadgeImage: {
    width: 36,
    height: 44,
  },
  senderScriptGroup: {
    gap: 2,
    flexShrink: 1,
  },
  letterSenderTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: FONT_DISPLAY,
    letterSpacing: 0.5,
  },
  letterDateSubtitle: {
    fontSize: 9.5,
    fontWeight: '600',
    fontFamily: FONT_TITLE,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
  stampHeaderGroup: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  letterheadDate: {
    fontSize: 10,
    fontStyle: 'italic',
    fontFamily: FONT_BODY,
    letterSpacing: 0.3,
    marginBottom: 2,
    textAlign: 'right',
  },
  stampPostmarkCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  postageStampMini: {
    width: 44,
    height: 30,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 0.8,
    borderColor: '#C6B69C',
  },
  roundPostmark: {
    position: 'absolute',
    left: -12,
    top: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.65,
    transform: [{ rotate: '-12deg' }],
  },
  roundPostmarkGlyph: {
    fontSize: 12,
  },
  stampHeaderImage: {
    width: '100%',
    height: '100%',
  },
  ornamentDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 2,
    opacity: 0.55,
  },
  ornamentRule: {
    flex: 1,
    height: 0.6,
  },
  ornamentGlyph: {
    fontSize: 10,
  },
  creaseDuoLine: {
    width: '100%',
    marginVertical: 3,
  },
  creaseShadowBar: {
    width: '100%',
    height: 0.8,
  },
  creaseHighlightBar: {
    width: '100%',
    height: 0.8,
  },
  headlineCalligraphy: {
    fontSize: 18,
    fontWeight: '600',
    fontStyle: 'italic',
    fontFamily: FONT_TITLE,
    lineHeight: 23,
    letterSpacing: 0.3,
  },
  bodyContentLayout: {
    width: '100%',
  },
  letterBodyText: {
    fontSize: 13.5,
    lineHeight: 21,
    fontFamily: FONT_BODY,
    letterSpacing: 0.25,
  },
  closingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 10,
  },
  vignetteRowCentered: {
    alignItems: 'center',
    marginVertical: 4,
  },
  vignetteFrame: {
    width: 112,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    padding: 2.5,
    paddingBottom: 3.5,
    position: 'relative',
    transform: [{ rotate: '2deg' }],
    ...Platform.select({
      web: {
        boxShadow: '0 3px 10px rgba(35, 20, 10, 0.22), 0 1px 2px rgba(0, 0, 0, 0.08)',
      },
    }),
  },
  vignetteTape: {
    position: 'absolute',
    top: -5,
    width: 28,
    height: 8,
    backgroundColor: 'rgba(235, 220, 190, 0.75)',
    borderRadius: 1,
    transform: [{ rotate: '-4deg' }],
    zIndex: 5,
    borderWidth: 0.4,
    borderColor: 'rgba(180, 150, 110, 0.4)',
  },
  vignetteImage: {
    width: 106,
    height: 60,
    borderRadius: 2,
  },
  vignetteCaption: {
    paddingTop: 3,
    alignItems: 'center',
  },
  vignetteCaptionText: {
    fontSize: 8,
    fontStyle: 'italic',
    fontFamily: FONT_BODY,
    letterSpacing: 0.2,
  },
  closingBotanical: {
    width: 54,
    height: 68,
    opacity: 0.85,
    transform: [{ rotate: '-6deg' }],
  },
  closingSection: {
    alignItems: 'flex-start',
    gap: 2,
    flex: 1,
  },
  floretIcon: {
    fontSize: 14,
    color: '#8A6E5C',
  },
  signoffPhrase: {
    fontSize: 12,
    fontStyle: 'italic',
    fontFamily: FONT_BODY,
    letterSpacing: 0.5,
  },
  cursiveSignature: {
    fontSize: 16.5,
    fontStyle: 'italic',
    fontWeight: '600',
    fontFamily: FONT_SIGNATURE,
    letterSpacing: 0.5,
    lineHeight: 22,
  },
  footerMottoBanner: {
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 0.8,
    borderTopColor: 'rgba(140, 110, 80, 0.16)',
  },
  footerMottoText: {
    fontSize: 9.5,
    letterSpacing: 1.6,
    fontWeight: '600',
    fontFamily: FONT_DISPLAY,
    textTransform: 'uppercase',
  },
  foldTabButton: {
    position: 'absolute',
    top: -10,
    left: 20,
    minHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    borderWidth: 0.8,
    zIndex: 15,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 1.5px 4px rgba(35, 25, 15, 0.20)',
        transition: 'transform 0.18s ease, background-color 0.18s ease',
      },
    }),
  },
  foldTabPressed: {
    opacity: 0.75,
  },
  foldTabText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: FONT_TITLE,
    letterSpacing: 0.4,
  },
});

export default ExpandedLetter;
