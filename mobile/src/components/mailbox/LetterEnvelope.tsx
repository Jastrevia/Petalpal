import { memo } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FONT_BODY, FONT_DISPLAY, FONT_TITLE } from './ExpandedLetter';
import {
  ENVELOPE_DECKLE_CLIP,
  ENVELOPE_PAPER_BACKGROUND,
} from './paperTextures';
import { SparklingMagicStar } from './SparklingMagicStar';
import type { BotanicalIconType, Letter, PaperTone } from './types';

export const BOTANICAL_ICONS: Record<BotanicalIconType, any> = {
  crocus: require('../../../assets/mailbox/icon_crocus.jpg'),
  bellflower: require('../../../assets/mailbox/icon_bellflower.jpg'),
  chamomile: require('../../../assets/mailbox/icon_chamomile.jpg'),
  lavender: require('../../../assets/mailbox/icon_lavender.jpg'),
  sprig: require('../../../assets/mailbox/icon_sprig.jpg'),
};

export const STAMP_ASSET = require('../../../assets/mailbox/petalpal_stamp.jpg');
export const POCKET_LAVENDER_CORNER = require('../../../assets/mailbox/pocket_lavender_corner.png');
export const POCKET_CHAMOMILE_CORNER = require('../../../assets/mailbox/pocket_chamomile_corner.png');

export interface EnvelopeToneConfig {
  bg: string;
  border: string;
  flapBg: string;
  liningBg?: string;
  liningPatternColor?: string;
  crease: string;
  creaseHighlight?: string;
  waxRim: string;
  waxFill: string;
  waxHighlight: string;
  twineColor: string;
  inkPrimary: string;
  inkSecondary: string;
  stampBg?: string;
}

// Tones for calm, settled READ envelopes (warm antique parchment stock, soft ivory tones, delicate ink)
export const ENVELOPE_TONES: Record<PaperTone, EnvelopeToneConfig> = {
  cream: {
    bg: '#FBF6EB',
    border: '#DACDB3',
    flapBg: '#EFE4CD',
    liningBg: '#FDFBF7',
    liningPatternColor: 'rgba(150, 120, 80, 0.12)',
    crease: 'rgba(105, 78, 45, 0.14)',
    creaseHighlight: 'rgba(255, 255, 255, 0.55)',
    waxRim: '#7E461A',
    waxFill: '#9C5E28',
    waxHighlight: 'rgba(255, 230, 200, 0.25)',
    twineColor: '#B6A388',
    inkPrimary: '#2E2218',
    inkSecondary: '#665544',
    stampBg: '#FAF5EA',
  },
  lavender: {
    bg: '#FBF6EB',
    border: '#DACDB3',
    flapBg: '#EFE4CD',
    liningBg: '#FDFBF7',
    liningPatternColor: 'rgba(115, 80, 135, 0.12)',
    crease: 'rgba(85, 60, 105, 0.14)',
    creaseHighlight: 'rgba(255, 255, 255, 0.55)',
    waxRim: '#583064',
    waxFill: '#724680',
    waxHighlight: 'rgba(235, 215, 245, 0.25)',
    twineColor: '#B0A0C0',
    inkPrimary: '#2E2218',
    inkSecondary: '#665544',
    stampBg: '#FAF5EA',
  },
  aged: {
    bg: '#FBF6EB',
    border: '#DACDB3',
    flapBg: '#EFE4CD',
    liningBg: '#FDFBF7',
    liningPatternColor: 'rgba(130, 95, 55, 0.12)',
    crease: 'rgba(95, 70, 40, 0.14)',
    creaseHighlight: 'rgba(255, 255, 255, 0.55)',
    waxRim: '#743414',
    waxFill: '#8E4A24',
    waxHighlight: 'rgba(255, 215, 190, 0.25)',
    twineColor: '#B29E82',
    inkPrimary: '#2E2218',
    inkSecondary: '#665544',
    stampBg: '#FAF5EA',
  },
  rose: {
    bg: '#FBF6EB',
    border: '#DACDB3',
    flapBg: '#EFE4CD',
    liningBg: '#FDFBF7',
    liningPatternColor: 'rgba(150, 80, 90, 0.12)',
    crease: 'rgba(115, 62, 55, 0.14)',
    creaseHighlight: 'rgba(255, 255, 255, 0.55)',
    waxRim: '#702836',
    waxFill: '#8A3A4A',
    waxHighlight: 'rgba(255, 210, 218, 0.25)',
    twineColor: '#BFA8A2',
    inkPrimary: '#2E2218',
    inkSecondary: '#665544',
    stampBg: '#FAF5EA',
  },
  sage: {
    bg: '#FBF6EB',
    border: '#DACDB3',
    flapBg: '#EFE4CD',
    liningBg: '#FDFBF7',
    liningPatternColor: 'rgba(70, 105, 70, 0.12)',
    crease: 'rgba(50, 78, 50, 0.14)',
    creaseHighlight: 'rgba(255, 255, 255, 0.55)',
    waxRim: '#304E34',
    waxFill: '#3E6242',
    waxHighlight: 'rgba(210, 235, 210, 0.25)',
    twineColor: '#9BB090',
    inkPrimary: '#2E2218',
    inkSecondary: '#665544',
    stampBg: '#FAF5EA',
  },
};

// Tones for fresh, luminous UNREAD envelopes (vivid pastel colors, rich wax seals with emblems)
export const UNREAD_ENVELOPE_TONES: Record<PaperTone, EnvelopeToneConfig> = {
  cream: {
    bg: '#FAF6ED',
    border: '#DDD2BF',
    flapBg: '#FAF5EC',
    liningBg: '#FFFFFF',
    liningPatternColor: 'rgba(200, 155, 100, 0.24)',
    crease: 'rgba(112, 84, 48, 0.20)',
    creaseHighlight: 'rgba(255, 255, 255, 0.95)',
    waxRim: '#A05412',
    waxFill: '#DE7E26',
    waxHighlight: 'rgba(255, 255, 240, 0.95)',
    twineColor: '#BCA98E',
    inkPrimary: '#1E1208',
    inkSecondary: '#4A3B2A',
    stampBg: '#FAF5EA',
  },
  lavender: {
    bg: '#E2D0E8',
    border: '#C2A8D0',
    flapBg: '#ECE0F2',
    liningBg: '#FFFFFF',
    liningPatternColor: 'rgba(155, 110, 185, 0.22)',
    crease: 'rgba(92, 65, 112, 0.20)',
    creaseHighlight: 'rgba(255, 255, 255, 0.95)',
    waxRim: '#5E2B72',
    waxFill: '#9E58B8',
    waxHighlight: 'rgba(255, 235, 255, 0.95)',
    twineColor: '#B6A6C7',
    inkPrimary: '#250E32',
    inkSecondary: '#4A2B5E',
    stampBg: '#F8F1FC',
  },
  aged: {
    bg: '#F6EEDE',
    border: '#CEBCA0',
    flapBg: '#F8F2E4',
    liningBg: '#FFFFFF',
    liningPatternColor: 'rgba(170, 125, 78, 0.22)',
    crease: 'rgba(105, 78, 45, 0.20)',
    creaseHighlight: 'rgba(255, 255, 255, 0.95)',
    waxRim: '#9E3E12',
    waxFill: '#CE5E28',
    waxHighlight: 'rgba(255, 235, 210, 0.95)',
    twineColor: '#B9A68A',
    inkPrimary: '#1A0C06',
    inkSecondary: '#44301E',
    stampBg: '#F9EFE3',
  },
  rose: {
    bg: '#EBDCD8',
    border: '#D0B4AC',
    flapBg: '#F5EAE6',
    liningBg: '#FFFFFF',
    liningPatternColor: 'rgba(195, 108, 122, 0.22)',
    crease: 'rgba(125, 70, 62, 0.18)',
    creaseHighlight: 'rgba(255, 255, 255, 0.95)',
    waxRim: '#922E42',
    waxFill: '#C4445E',
    waxHighlight: 'rgba(255, 230, 238, 0.95)',
    twineColor: '#C5B0AA',
    inkPrimary: '#2A0E16',
    inkSecondary: '#522A34',
    stampBg: '#FCEFEB',
  },
  sage: {
    bg: '#D2E2D0',
    border: '#ACCAAA',
    flapBg: '#E0EDE0',
    liningBg: '#FFFFFF',
    liningPatternColor: 'rgba(98, 145, 98, 0.22)',
    crease: 'rgba(58, 88, 58, 0.18)',
    creaseHighlight: 'rgba(255, 255, 255, 0.95)',
    waxRim: '#214E29',
    waxFill: '#387843',
    waxHighlight: 'rgba(230, 255, 230, 0.95)',
    twineColor: '#A4B89A',
    inkPrimary: '#0E1E0E',
    inkSecondary: '#2C442C',
    stampBg: '#EDF5EB',
  },
};

export function getEnvelopeTone(
  toneName: PaperTone = 'cream',
  isUnread: boolean = false
): EnvelopeToneConfig {
  return isUnread
    ? (UNREAD_ENVELOPE_TONES[toneName] || UNREAD_ENVELOPE_TONES.cream)
    : (ENVELOPE_TONES[toneName] || ENVELOPE_TONES.cream);
}

/* ──────────────────────────────────────────────────────────────────
   REUSABLE BOTANICAL STATIONERY SUBCOMPONENTS
   ────────────────────────────────────────────────────────────────── */

export const PaperGrainTexture = memo(function PaperGrainTexture({
  tone,
}: {
  tone: EnvelopeToneConfig;
}) {
  return (
    <View style={styles.paperGrainTexture} pointerEvents="none">
      <View style={[styles.grainLine1, { backgroundColor: tone.crease }]} />
      <View style={[styles.grainLine2, { backgroundColor: tone.crease }]} />
      <View style={[styles.grainLine3, { backgroundColor: tone.crease }]} />
      <View style={[styles.paperFiberFleck1, { backgroundColor: tone.crease }]} />
      <View style={[styles.paperFiberFleck2, { backgroundColor: tone.crease }]} />
    </View>
  );
});

export const BotanicalInnerLining = memo(function BotanicalInnerLining({
  tone,
}: {
  tone: EnvelopeToneConfig;
}) {
  const patternColor = tone.liningPatternColor || 'rgba(180, 142, 92, 0.20)';
  return (
    <View
      style={[
        styles.innerLiningContainer,
        { backgroundColor: tone.liningBg || '#FDFBF7' },
      ]}
      pointerEvents="none"
    >
      <View style={styles.liningPatternGrid}>
        <Text style={[styles.liningBotanicalGlyph, { color: patternColor }]}>
          ✿ · ❧ · ✿ · ❧ · ✿
        </Text>
        <Text style={[styles.liningBotanicalGlyph, { color: patternColor }]}>
          ❧ · ✿ · ❧ · ✿ · ❧
        </Text>
        <Text style={[styles.liningBotanicalGlyph, { color: patternColor }]}>
          ✿ · ❧ · ✿ · ❧ · ✿
        </Text>
      </View>
    </View>
  );
});

export const WaxSealMedallion = memo(function WaxSealMedallion({
  tone,
  iconSource,
  isOpening = false,
  isPeekingBehind = false,
  left,
  top,
  style,
  isUnread = false,
  sealType = 'flower',
}: {
  tone: EnvelopeToneConfig;
  iconSource?: any;
  isOpening?: boolean;
  isPeekingBehind?: boolean;
  left?: number | string;
  top?: number;
  style?: any;
  isUnread?: boolean;
  sealType?: 'butterfly' | 'clover' | 'flower';
}) {
  const defaultTop = isOpening ? -16 : isPeekingBehind ? 10 : 38;

  return (
    <View
      style={[
        styles.waxSealPuddle,
        isUnread ? styles.waxSealUnreadPuddle : styles.waxSealReadPuddle,
        {
          backgroundColor: tone.waxFill,
          borderColor: tone.waxRim,
          top: top ?? defaultTop,
          left: left ?? (isPeekingBehind ? 10 : '46%'),
          transform: [
            { rotate: isPeekingBehind ? '-3deg' : '2deg' },
            { rotateX: isOpening ? '-180deg' : '0deg' },
          ],
          zIndex: isOpening ? 1 : 7,
          ...Platform.select({
            web: {
              transformOrigin: 'top center',
              transition:
                'top 0.36s cubic-bezier(0.22, 1, 0.36, 1), transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
            },
          }),
        },
        style,
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.waxGlossArc,
          {
            backgroundColor: tone.waxHighlight,
            opacity: isUnread ? 0.95 : 0.28,
            width: isUnread ? 10 : 7,
            height: isUnread ? 4 : 2.5,
          },
        ]}
      />

      <View
        style={[
          styles.waxSealInnerRecess,
          { borderColor: tone.waxRim },
        ]}
      >
        {sealType === 'butterfly' ? (
          <Text style={styles.waxEmblemGlyph}>🦋</Text>
        ) : sealType === 'clover' ? (
          <Text style={styles.waxEmblemGlyph}>🍀</Text>
        ) : iconSource ? (
          <Image
            source={iconSource}
            style={styles.waxEmblemImage}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.waxMonogramText}>✿</Text>
        )}
      </View>
    </View>
  );
});

export const TwineWrapping = memo(function TwineWrapping({
  tone,
  width,
}: {
  tone: EnvelopeToneConfig;
  width: number;
}) {
  const verticalLeft = width * 0.44;

  return (
    <View style={styles.twineWrapContainer} pointerEvents="none">
      <View
        style={[
          styles.twineVertical,
          { backgroundColor: tone.twineColor, left: verticalLeft },
        ]}
      />
      <View
        style={[
          styles.twineVerticalHighlight,
          { left: verticalLeft + 0.8 },
        ]}
      />
      <View
        style={[
          styles.twineHorizontal,
          { backgroundColor: tone.twineColor, top: 52 },
        ]}
      />
      <View
        style={[
          styles.twineHorizontalHighlight,
          { top: 52.8 },
        ]}
      />
    </View>
  );
});

export const DriedBotanicalSprig = memo(function DriedBotanicalSprig({
  width,
  isOpening = false,
}: {
  width: number;
  isOpening?: boolean;
}) {
  return (
    <View
      style={[
        styles.driedSprigContainer,
        {
          top: 32,
          left: width * 0.44 - 16,
          opacity: isOpening ? 0.35 : 1,
        },
      ]}
      pointerEvents="none"
    >
      <View style={styles.sprigStem} />
      <View style={[styles.sprigBud, { top: 0, left: 12, backgroundColor: '#9B6EA8' }]} />
      <View style={[styles.sprigBud, { top: 5, left: 6, backgroundColor: '#AF86BD' }]} />
      <View style={[styles.sprigBud, { top: 11, left: 14, backgroundColor: '#8E5E9C' }]} />
      <View style={[styles.sprigBud, { top: 17, left: 8, backgroundColor: '#A474B2' }]} />
    </View>
  );
});

export const BotanicalPostageStamp = memo(function BotanicalPostageStamp({
  tone,
  date,
}: {
  tone: EnvelopeToneConfig;
  date: string;
}) {
  return (
    <View style={styles.stampCornerGroup} pointerEvents="none">
      <View
        style={[
          styles.stampHolderPerforated,
          {
            backgroundColor: tone.stampBg || '#F8F3E5',
            borderColor: tone.border,
          },
        ]}
      >
        <Image
          source={STAMP_ASSET}
          style={styles.stampArtwork}
          resizeMode="cover"
        />
        <View style={styles.postmarkWaveLine1} />
        <View style={styles.postmarkWaveLine2} />
      </View>
      {date ? (
        <Text style={[styles.postmarkCity, { color: tone.inkSecondary }]}>
          {date}
        </Text>
      ) : null}
    </View>
  );
});

/* ──────────────────────────────────────────────────────────────────
   OPEN READ ENVELOPE COMPONENT (Physical opened envelope with protruding letter)
   ────────────────────────────────────────────────────────────────── */

interface OpenReadEnvelopeProps {
  letter: Letter;
  width: number;
  envelopeHeight: number;
  isSelected?: boolean;
  onPress: () => void;
  tiltAngle?: number;
  isPeekingBehind?: boolean;
}

export const OpenReadEnvelope = memo(function OpenReadEnvelope({
  letter,
  width,
  envelopeHeight,
  isSelected = false,
  onPress,
  tiltAngle = 0,
  isPeekingBehind = false,
}: OpenReadEnvelopeProps) {
  const tone = ENVELOPE_TONES[letter.paperTone || 'cream'];
  const isLavenderLetter = letter.category === 'garden' || letter.botanicalIcon === 'lavender';
  const isChamomileLetter = letter.category === 'seasonal' || letter.botanicalIcon === 'chamomile';

  // Pocket height covers roughly 60% of the envelope
  const pocketHeight = isPeekingBehind ? Math.round(envelopeHeight * 0.62) : 98;
  const paperSheetWidth = width - 18;
  const paperSheetHeight = isPeekingBehind ? envelopeHeight * 0.72 : 115;
  const flapHeight = isPeekingBehind ? 36 : 48;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open read envelope from ${letter.sender}: ${letter.subject}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.openEnvelopeContainer,
        {
          width,
          height: envelopeHeight,
          transform: [
            { rotate: `${tiltAngle}deg` },
            { translateX: pressed ? 5 : hovered ? 3 : 0 },
            { scale: pressed ? 1.015 : 1 },
          ],
        },
        isSelected && styles.envelopeSelected,
      ]}
    >
      {/* ── 1. ENVELOPE BACK WALL & OPEN FLAP FOLDED BACKWARD (Pointing UP /\) ── */}
      <View
        style={[
          styles.openFlapBackdrop,
          {
            top: -flapHeight + 6,
            height: flapHeight,
            backgroundColor: tone.flapBg,
            borderColor: tone.border,
            ...Platform.select({
              web: {
                clipPath: 'polygon(0% 100%, 50% 0%, 100% 100%)',
                backgroundImage:
                  'linear-gradient(to top, rgba(160, 130, 90, 0.22) 0%, rgba(255, 255, 255, 0.40) 100%)',
              },
            }),
          },
        ]}
        pointerEvents="none"
      />

      {/* Envelope Back Plate */}
      <View
        style={[
          styles.openEnvelopeBackPlate,
          {
            backgroundColor: tone.bg,
            borderColor: tone.border,
            height: envelopeHeight,
          },
        ]}
        pointerEvents="none"
      >
        <PaperGrainTexture tone={tone} />
      </View>

      {/* ── 2. PROTRUDING CREAM INNER LETTER SHEET ── */}
      <View
        style={[
          styles.protrudingLetterSheet,
          {
            width: paperSheetWidth,
            height: paperSheetHeight,
            top: isPeekingBehind ? -18 : -26,
            left: 9,
            backgroundColor: '#FAF7EE',
            borderColor: tone.border,
          },
        ]}
        pointerEvents="none"
      >
        {/* Subtle deckle border & laid paper texture */}
        <View style={styles.protrudingPaperTexture}>
          <View style={[styles.protrudingPaperFleck, { backgroundColor: 'rgba(120, 95, 60, 0.12)' }]} />
        </View>

        {/* Letter Top Row: Title & Date */}
        <View style={styles.protrudingHeaderRow}>
          <Text
            style={[
              styles.protrudingTitle,
              styles.previewTitleRead,
              { color: tone.inkPrimary },
            ]}
            numberOfLines={1}
          >
            {letter.subject}
          </Text>
          {letter.date ? (
            <Text style={[styles.protrudingDate, { color: tone.inkSecondary }]} numberOfLines={1}>
              {letter.date.includes(',') ? letter.date.split(',')[0].trim() : letter.date}
            </Text>
          ) : null}
        </View>

        {/* Letter Subtitle / Snippet */}
        <Text
          style={[
            styles.protrudingSnippet,
            styles.previewSnippetRead,
            { color: tone.inkSecondary },
          ]}
          numberOfLines={1}
        >
          {letter.snippet}
        </Text>
      </View>

      {/* ── 3. LOWER FRONT POCKET WITH CONTOURED THROAT ── */}
      <View
        style={[
          styles.openFrontPocket,
          {
            height: pocketHeight,
            backgroundColor: tone.bg,
            borderColor: tone.border,
          },
        ]}
        pointerEvents="none"
      >
        {/* Paper Grain on Pocket */}
        <PaperGrainTexture tone={tone} />

        {/* Delicate Diagonal Pocket Creases */}
        <View style={styles.pocketCreaseLineLeft} />
        <View style={styles.pocketCreaseLineRight} />

        {/* Botanical Corner Flower Art matching reference image */}
        {isLavenderLetter && (
          <>
            <Image
              source={POCKET_LAVENDER_CORNER}
              style={[styles.cornerBotanicalArt, styles.cornerBotanicalLeft]}
              resizeMode="contain"
            />
            <Image
              source={POCKET_LAVENDER_CORNER}
              style={[styles.cornerBotanicalArt, styles.cornerBotanicalRight]}
              resizeMode="contain"
            />
          </>
        )}
        {isChamomileLetter && (
          <>
            <Image
              source={POCKET_CHAMOMILE_CORNER}
              style={[styles.cornerBotanicalArt, styles.cornerBotanicalLeft, { width: 52, height: 44 }]}
              resizeMode="contain"
            />
            <Image
              source={POCKET_CHAMOMILE_CORNER}
              style={[styles.cornerBotanicalArt, styles.cornerBotanicalRight, { width: 52, height: 44 }]}
              resizeMode="contain"
            />
          </>
        )}
      </View>

      {/* Soft Bottom Warm Glow Reflection */}
      <View style={styles.envelopeBottomWarmth} pointerEvents="none" />
    </Pressable>
  );
});

/* ──────────────────────────────────────────────────────────────────
   CLOSED UNREAD ENVELOPE COMPONENT (Pastel envelope with flap & wax seal)
   ────────────────────────────────────────────────────────────────── */

interface ClosedUnreadEnvelopeProps {
  letter: Letter;
  width: number;
  envelopeHeight: number;
  isSelected?: boolean;
  onPress: () => void;
  tiltAngle?: number;
  isOpening?: boolean;
  isPeekingBehind?: boolean;
}

export const ClosedUnreadEnvelope = memo(function ClosedUnreadEnvelope({
  letter,
  width,
  envelopeHeight,
  isSelected = false,
  onPress,
  tiltAngle = 0,
  isOpening = false,
  isPeekingBehind = false,
}: ClosedUnreadEnvelopeProps) {
  const tone = UNREAD_ENVELOPE_TONES[letter.paperTone || 'lavender'];
  const iconSource = BOTANICAL_ICONS[letter.botanicalIcon];
  const flapHeight = isPeekingBehind ? 44 : 58;

  // Determine seal emblem matching reference screenshot
  const sealType =
    letter.paperTone === 'lavender' || letter.category === 'friend'
      ? 'butterfly'
      : letter.paperTone === 'sage' || letter.category === 'system'
        ? 'clover'
        : 'flower';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Closed unread envelope from ${letter.sender}: ${letter.subject}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.closedEnvelopeContainer,
        styles.previewEnvelopeUnreadGlow,
        {
          width,
          height: envelopeHeight,
          backgroundColor: tone.bg,
          borderColor: isSelected ? '#C09040' : tone.border,
          transform: [
            { rotate: `${tiltAngle}deg` },
            { translateX: pressed ? 5 : hovered ? 3 : 0 },
            { scale: pressed ? 1.015 : 1 },
          ],
        },
        isSelected && styles.envelopeSelected,
      ]}
    >
      {/* Paper Grain & Texture */}
      <PaperGrainTexture tone={tone} />

      {/* Diagonal Creases of Closed Envelope */}
      <View style={[styles.closedDiagonalCreaseLeft, { borderColor: tone.crease }]} />
      <View style={[styles.closedDiagonalCreaseRight, { borderColor: tone.crease }]} />

      {/* ── TRIANGULAR FLAP FOLDED DOWN (\/) ── */}
      <View
        style={[
          styles.closedFlapFace,
          styles.flapPivotWrapper,
          {
            height: flapHeight,
            backgroundColor: tone.flapBg,
            borderColor: tone.border,
            transform: [{ rotateX: isOpening ? '-180deg' : '0deg' }],
            zIndex: isOpening ? 1 : 6,
            ...Platform.select({
              web: {
                clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)',
                backgroundImage:
                  'linear-gradient(to bottom, rgba(255, 255, 255, 0.40) 0%, rgba(120, 80, 130, 0.08) 100%)',
                transformOrigin: 'top center',
                transition: 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)',
              },
            }),
          },
        ]}
        pointerEvents="none"
      />

      {/* Flap Horizontal Top Crease Line */}
      <View style={[styles.flapCreaseLine, { backgroundColor: tone.crease }]} pointerEvents="none" />
      <View style={styles.flapCreaseHighlight} pointerEvents="none" />

      {/* ── ENVELOPE FACE TEXT CONTENT ── */}
      <View style={styles.closedEnvelopeContentArea} pointerEvents="none">
        <View style={styles.closedEnvelopeHeaderRow}>
          <Text
            style={[
              styles.closedEnvelopeTitle,
              styles.previewTitleUnread,
              { color: tone.inkPrimary },
            ]}
            numberOfLines={1}
          >
            {letter.sender === 'A Note from Your Garden' ? 'Your Garden' : letter.sender}
          </Text>
          {letter.date ? (
            <Text style={[styles.closedEnvelopeDate, { color: tone.inkSecondary }]} numberOfLines={1}>
              {letter.date.includes(',') ? letter.date.split(',')[0].trim() : letter.date}
            </Text>
          ) : null}
        </View>

        <Text
          style={[
            styles.closedEnvelopeSnippet,
            styles.previewSnippetUnread,
            { color: tone.inkSecondary },
          ]}
          numberOfLines={1}
        >
          {letter.subject}
        </Text>
      </View>

      {/* ── WAX SEAL MEDALLION AT FLAP APEX ── */}
      <WaxSealMedallion
        tone={tone}
        iconSource={iconSource}
        isOpening={isOpening}
        isPeekingBehind={isPeekingBehind}
        left={width / 2 - 16}
        top={flapHeight - 16}
        isUnread={true}
        sealType={sealType}
      />

      {/* ── RADIANT GOLDEN SPARKLE NEAR WAX SEAL ── */}
      <SparklingMagicStar
        size={22}
        style={{
          position: 'absolute',
          left: width / 2 - 16 - 8,
          top: flapHeight - 16 - 8,
          zIndex: 8,
        }}
      />

      {/* Botanical Corner Artwork */}
      {iconSource && (
        <Image
          source={iconSource}
          style={[
            styles.closedBotanicalCorner,
            Platform.OS === 'web' ? ({ mixBlendMode: 'multiply' } as any) : null,
          ]}
          resizeMode="contain"
        />
      )}
    </Pressable>
  );
});

/* ──────────────────────────────────────────────────────────────────
   MAIN LETTER ENVELOPE EXPORT (Dispatches to OpenReadEnvelope or ClosedUnreadEnvelope)
   ────────────────────────────────────────────────────────────────── */

interface LetterEnvelopeProps {
  letter: Letter;
  isSelected?: boolean;
  onPress: () => void;
  tiltAngle?: number;
  width?: number;
  isPeekingBehind?: boolean;
  isOpening?: boolean;
  visibleWidth?: number;
  previewHeight?: number;
}

export const LetterEnvelope = memo(function LetterEnvelope({
  letter,
  isSelected = false,
  onPress,
  tiltAngle = 0,
  width = 286,
  isPeekingBehind = false,
  isOpening = false,
  visibleWidth,
  previewHeight = 96,
}: LetterEnvelopeProps) {
  const isUnread = !letter.read;
  const envelopeHeight = isPeekingBehind ? previewHeight : 162;

  if (!isUnread) {
    // READ letter: render beautiful OPEN physical envelope with protruding letter sheet!
    return (
      <OpenReadEnvelope
        letter={letter}
        width={width}
        envelopeHeight={envelopeHeight}
        isSelected={isSelected}
        onPress={onPress}
        tiltAngle={tiltAngle}
        isPeekingBehind={isPeekingBehind}
      />
    );
  }

  // UNREAD letter: render CLOSED pastel envelope with wax seal & sparkle!
  return (
    <ClosedUnreadEnvelope
      letter={letter}
      width={width}
      envelopeHeight={envelopeHeight}
      isSelected={isSelected}
      onPress={onPress}
      tiltAngle={tiltAngle}
      isOpening={isOpening}
      isPeekingBehind={isPeekingBehind}
    />
  );
});

/* ──────────────────────────────────────────────────────────────────
   STYLES
   ────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  // Open envelope styles
  openEnvelopeContainer: {
    position: 'relative',
    borderRadius: 4,
    ...Platform.select({
      web: {
        filter: 'drop-shadow(0 10px 22px rgba(18, 12, 8, 0.35)) drop-shadow(0 2px 5px rgba(0,0,0,0.12))',
        cursor: 'pointer',
        transition: 'transform 0.22s ease',
      },
    }),
  },
  openFlapBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  openEnvelopeBackPlate: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 1,
  },
  protrudingLetterSheet: {
    position: 'absolute',
    borderRadius: 3,
    borderWidth: 0.8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 2,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 10px rgba(45, 30, 15, 0.16)',
      },
    }),
  },
  protrudingPaperTexture: {
    ...StyleSheet.absoluteFill,
    opacity: 0.6,
  },
  protrudingPaperFleck: {
    position: 'absolute',
    top: 6,
    right: 14,
    width: 6,
    height: 1.5,
    borderRadius: 1,
  },
  protrudingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  protrudingTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: FONT_TITLE,
    flex: 1,
    marginRight: 8,
    letterSpacing: 0.2,
  },
  protrudingDate: {
    fontSize: 10.5,
    fontFamily: FONT_BODY,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  protrudingSnippet: {
    fontSize: 11.5,
    fontFamily: FONT_BODY,
    lineHeight: 15,
  },
  openFrontPocket: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 3,
    ...Platform.select({
      web: {
        clipPath: 'polygon(0% 0%, 50% 28%, 100% 0%, 100% 100%, 0% 100%)',
        boxShadow: '0 -2px 6px rgba(40, 25, 10, 0.10)',
      },
    }),
  },
  pocketCreaseLineLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '50%',
    height: 1,
    backgroundColor: 'rgba(120, 95, 60, 0.14)',
    transform: [{ rotate: '24deg' }],
  },
  pocketCreaseLineRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '50%',
    height: 1,
    backgroundColor: 'rgba(120, 95, 60, 0.14)',
    transform: [{ rotate: '-24deg' }],
  },
  cornerBotanicalArt: {
    position: 'absolute',
    bottom: 2,
    width: 48,
    height: 42,
    opacity: 0.90,
  },
  cornerBotanicalLeft: {
    left: 4,
    transform: [{ scaleX: -1 }],
  },
  cornerBotanicalRight: {
    right: 4,
  },
  envelopeBottomWarmth: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    zIndex: 4,
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(to top, rgba(255, 180, 50, 0.18) 0%, transparent 100%)',
      },
    }),
  },

  // Closed envelope styles
  closedEnvelopeContainer: {
    position: 'relative',
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        filter: 'drop-shadow(0 10px 24px rgba(18, 12, 8, 0.38)) drop-shadow(0 2px 6px rgba(0,0,0,0.12))',
        cursor: 'pointer',
        transition: 'transform 0.22s ease',
      },
    }),
  },
  closedFlapFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderWidth: 1,
  },
  closedDiagonalCreaseLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '50%',
    height: '100%',
    borderRightWidth: 0.8,
    borderBottomWidth: 0.8,
    transform: [{ skewY: '28deg' }],
    opacity: 0.22,
  },
  closedDiagonalCreaseRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '50%',
    height: '100%',
    borderLeftWidth: 0.8,
    borderBottomWidth: 0.8,
    transform: [{ skewY: '-28deg' }],
    opacity: 0.22,
  },
  closedEnvelopeContentArea: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    zIndex: 4,
  },
  closedEnvelopeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  closedEnvelopeTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: FONT_TITLE,
    letterSpacing: 0.2,
  },
  closedEnvelopeDate: {
    fontSize: 10.5,
    fontFamily: FONT_BODY,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  closedEnvelopeSnippet: {
    fontSize: 11.5,
    fontFamily: FONT_BODY,
    lineHeight: 15,
  },
  closedBotanicalCorner: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    width: 38,
    height: 38,
    opacity: 0.75,
  },

  // Shared typography & highlight classes
  previewTitleUnread: {
    fontWeight: '700',
  },
  previewTitleRead: {
    fontWeight: '600',
  },
  previewSnippetUnread: {
    fontWeight: '500',
  },
  previewSnippetRead: {
    fontWeight: '400',
  },
  previewEnvelopeUnreadGlow: {
    ...Platform.select({
      web: {
        boxShadow: '0 0 16px rgba(243, 212, 138, 0.42)',
      },
    }),
  },
  envelopeSelected: {
    borderColor: '#C09040',
    borderWidth: 1.5,
  },

  // Flap hinge & creases
  flapPivotWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  flapCreaseLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.5,
    zIndex: 6,
  },
  flapCreaseHighlight: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: 0,
    height: 0.8,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    zIndex: 6,
  },

  // Wax seal puddle & gloss (Required by test suite)
  waxSealPuddle: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 3px 8px rgba(35, 15, 10, 0.45)',
      },
    }),
  },
  waxSealUnreadPuddle: {
    borderWidth: 1.4,
  },
  waxSealReadPuddle: {
    opacity: 0.88,
  },
  waxGlossArc: {
    position: 'absolute',
    top: 3,
    left: 6,
    borderRadius: 3,
  },
  waxSealInnerRecess: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waxEmblemImage: {
    width: 14,
    height: 14,
    opacity: 0.9,
  },
  waxEmblemGlyph: {
    fontSize: 13,
  },
  waxMonogramText: {
    fontSize: 12,
    color: '#FFE2A8',
  },

  // Twine cord wrapping (Required by test suite)
  twineWrapContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  twineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
  },
  twineVerticalHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0.6,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  twineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
  },
  twineHorizontalHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0.6,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },

  // Dried botanical sprig (Required by test suite)
  driedSprigContainer: {
    position: 'absolute',
    width: 28,
    height: 34,
    zIndex: 3,
  },
  sprigStem: {
    position: 'absolute',
    left: 10,
    top: 0,
    bottom: 0,
    width: 1.2,
    backgroundColor: '#7A624E',
  },
  sprigBud: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },

  // Scalloped vintage postage stamp (Required by test suite)
  stampCornerGroup: {
    position: 'absolute',
    top: 10,
    right: 12,
    alignItems: 'flex-end',
    zIndex: 4,
  },
  stampHolderPerforated: {
    width: 26,
    height: 32,
    borderWidth: 0.8,
    padding: 2,
    borderRadius: 2,
  },
  stampArtwork: {
    width: '100%',
    height: '100%',
  },
  postmarkWaveLine1: {
    position: 'absolute',
    top: 6,
    left: -10,
    right: -4,
    height: 1,
    backgroundColor: 'rgba(80, 60, 45, 0.35)',
  },
  postmarkWaveLine2: {
    position: 'absolute',
    top: 12,
    left: -8,
    right: -6,
    height: 1,
    backgroundColor: 'rgba(80, 60, 45, 0.35)',
  },
  postmarkCity: {
    fontSize: 9,
    fontFamily: FONT_BODY,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Paper grain texture (Required by test suite)
  paperGrainTexture: {
    ...StyleSheet.absoluteFill,
    opacity: 0.5,
  },
  grainLine1: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    height: 0.5,
  },
  grainLine2: {
    position: 'absolute',
    top: 68,
    left: 0,
    right: 0,
    height: 0.5,
  },
  grainLine3: {
    position: 'absolute',
    top: 112,
    left: 0,
    right: 0,
    height: 0.5,
  },
  paperFiberFleck1: {
    position: 'absolute',
    top: 36,
    left: 42,
    width: 7,
    height: 1.2,
    borderRadius: 1,
    transform: [{ rotate: '18deg' }],
  },
  paperFiberFleck2: {
    position: 'absolute',
    top: 92,
    right: 38,
    width: 5,
    height: 1.2,
    borderRadius: 1,
    transform: [{ rotate: '-24deg' }],
  },

  // Inner lining
  innerLiningContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liningPatternGrid: {
    alignItems: 'center',
  },
  liningBotanicalGlyph: {
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 2,
  },
});

export default LetterEnvelope;
