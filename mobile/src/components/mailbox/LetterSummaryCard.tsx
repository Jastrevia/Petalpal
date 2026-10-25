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
import type { BotanicalIconType, Letter, PaperTone } from './types';

// Bundled botanical assets cropped from reference
const BOTANICAL_ICONS: Record<BotanicalIconType, any> = {
  crocus: require('../../../assets/mailbox/icon_crocus.jpg'),
  bellflower: require('../../../assets/mailbox/icon_bellflower.jpg'),
  chamomile: require('../../../assets/mailbox/icon_chamomile.jpg'),
  lavender: require('../../../assets/mailbox/icon_lavender.jpg'),
  sprig: require('../../../assets/mailbox/icon_sprig.jpg'),
};

const PAPER_TONES: Record<PaperTone, { bg: string; border: string }> = {
  cream: { bg: '#F8F4EA', border: '#DFD4BE' },
  lavender: { bg: '#F2EEF8', border: '#D0C3DF' },
  aged: { bg: '#F4ECE0', border: '#D8C9AE' },
  rose: { bg: '#FAF0ED', border: '#DFC8C0' },
  sage: { bg: '#F0F4EE', border: '#CCD8C8' },
};

interface LetterSummaryCardProps {
  letter: Letter;
  index: number;
  isSelected?: boolean;
  onPress: () => void;
  stackTiltAngle?: number;
  width?: number;
}

export const LetterSummaryCard = memo(function LetterSummaryCard({
  letter,
  index,
  isSelected = false,
  onPress,
  stackTiltAngle = -8,
  width = 230,
}: LetterSummaryCardProps) {
  const tone = PAPER_TONES[letter.paperTone || 'cream'];
  const iconSource = BOTANICAL_ICONS[letter.botanicalIcon];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open letter from ${letter.sender}: ${letter.subject}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardContainer,
        {
          width,
          backgroundColor: tone.bg,
          borderColor: isSelected ? '#B39158' : tone.border,
          borderWidth: isSelected ? 1.5 : 1,
          transform: [
            { rotate: `${stackTiltAngle}deg` },
            { scale: pressed ? 1.03 : 1 },
          ],
        },
        isSelected && styles.cardSelected,
      ]}
    >
      {/* Deckled Edge Inset Line */}
      <View style={[styles.innerFrame, { borderColor: tone.border }]}>
        <View style={styles.cardContent}>
          {/* Botanical Watercolor Emblem */}
          <View style={styles.iconContainer}>
            {iconSource ? (
              <Image source={iconSource} style={styles.botanicalImage} resizeMode="contain" />
            ) : (
              <Text style={styles.fallbackFlower}>🌸</Text>
            )}
          </View>

          {/* Letter Summary Text */}
          <View style={styles.textContainer}>
            {/* Top Row: Sender & Date */}
            <View style={styles.topRow}>
              <Text style={styles.senderText} numberOfLines={1}>
                {letter.sender}
              </Text>
              {letter.date ? <Text style={styles.dateText}>{letter.date}</Text> : null}
            </View>

            {/* Subject */}
            <Text style={styles.subjectText} numberOfLines={1}>
              {letter.subject}
            </Text>

            {/* Snippet */}
            <Text style={styles.snippetText} numberOfLines={1}>
              {letter.snippet}
            </Text>
          </View>
        </View>

        {/* Paper crease / texture line */}
        <View style={styles.paperFoldCrease} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    height: 74,
    borderRadius: 7,
    padding: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#1A140E',
        shadowOffset: { width: -3, height: 5 },
        shadowOpacity: 0.32,
        shadowRadius: 7,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '-3px 5px 10px rgba(26, 20, 14, 0.32), 0 1px 3px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  cardSelected: {
    ...Platform.select({
      ios: {
        shadowColor: '#8C6C38',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
      android: {
        elevation: 9,
      },
      web: {
        boxShadow: '0 0 12px rgba(179, 145, 88, 0.5), -3px 6px 12px rgba(26, 20, 14, 0.35)',
      },
    }),
  },
  innerFrame: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 0.8,
    borderStyle: 'dashed',
    paddingHorizontal: 7,
    paddingVertical: 5,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    width: 38,
    height: 48,
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botanicalImage: {
    width: 38,
    height: 48,
  },
  fallbackFlower: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  senderText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#4B3E2F',
    fontFamily: FONT_DISPLAY,
    maxWidth: 120,
    letterSpacing: 0.3,
  },
  dateText: {
    fontSize: 9.5,
    color: '#847461',
    fontWeight: '600',
    fontFamily: FONT_TITLE,
    letterSpacing: 0.8,
  },
  subjectText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2C2319',
    fontFamily: FONT_TITLE,
    letterSpacing: 0.2,
  },
  snippetText: {
    fontSize: 10,
    color: '#6E6152',
    fontFamily: FONT_BODY,
    fontStyle: 'italic',
    lineHeight: 13,
  },
  paperFoldCrease: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
});

export default LetterSummaryCard;
