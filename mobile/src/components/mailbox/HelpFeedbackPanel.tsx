import { memo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FONT_BODY, FONT_TITLE } from './ExpandedLetter';
import { ENVELOPE_PAPER_BACKGROUND } from './paperTextures';

const PANEL_POP_KEYFRAMES = `
@keyframes petalpalPanelPop {
  0% {
    transform: scale(0.92) translateY(-6px);
    opacity: 0;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
.petalpal-help-card {
  animation: petalpalPanelPop 0.26s cubic-bezier(0.22, 1, 0.36, 1) !important;
  transform-origin: top right !important;
}
`;

if (typeof document !== 'undefined' && !document.getElementById('petalpal-panel-pop')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'petalpal-panel-pop';
  styleEl.textContent = PANEL_POP_KEYFRAMES;
  document.head.appendChild(styleEl);
}

const TOP_LAVENDER_SPRIG = require('../../../assets/mailbox/help_lavender_top.png');
const BOTTOM_LAVENDER_SPRIG = require('../../../assets/mailbox/help_lavender_bottom.png');

export interface SupportMenuItem {
  id: string;
  title: string;
  description: string;
  iconType: 'feedback' | 'help' | 'privacy' | 'support';
}

export const SUPPORT_MENU_ITEMS: SupportMenuItem[] = [
  {
    id: 'feedback',
    title: 'Send Feedback',
    description: 'Share bugs, ideas, or thoughts',
    iconType: 'feedback',
  },
  {
    id: 'help_center',
    title: 'Help Center',
    description: 'Garden, Journal, AI Fairy, Friends, Mailbox',
    iconType: 'help',
  },
  {
    id: 'privacy',
    title: 'Privacy & Safety',
    description: 'How your data is handled · Report a concerning AI reply',
    iconType: 'privacy',
  },
  {
    id: 'support',
    title: 'Contact Support',
    description: 'Account, login, sync, or technical issues',
    iconType: 'support',
  },
];

/**
 * 1. Clean SVG Botanical Vector Icons
 */
export const BotanicalSupportIcon = memo(function BotanicalSupportIcon({
  type,
  size = 28,
}: {
  type: SupportMenuItem['iconType'] | 'trigger';
  size?: number;
}) {
  if (Platform.OS !== 'web') {
    // Fallback glyphs for native platforms
    const glyphMap: Record<string, string> = {
      feedback: '💭',
      help: '📖',
      privacy: '🛡️',
      support: '✉️',
      trigger: '💭',
    };
    return (
      <View style={[styles.nativeIconCircle, { width: size, height: size }]}>
        <Text style={{ fontSize: size * 0.55 }}>{glyphMap[type] || '✿'}</Text>
      </View>
    );
  }

  if (type === 'trigger') {
    return (
      <svg width={18} height={18} viewBox="0 0 24 24" style={{ overflow: 'visible' } as any}>
        {/* Soft rounded speech bubble */}
        <path
          d="M12 3 C6.8 3 2.5 6.7 2.5 11.2 C2.5 13.5 3.5 15.6 5.2 17.1 L4.2 21 L8.2 19.3 C9.4 19.8 10.7 20 12 20 C17.2 20 21.5 16.3 21.5 11.2 C21.5 6.7 17.2 3 12 3 Z"
          fill="rgba(195, 170, 205, 0.22)"
          stroke="#4E3B52"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Small delicate lavender blossom inside */}
        <circle cx="12" cy="11.2" r="1.6" fill="#F8DE7E" />
        <circle cx="12" cy="8.6" r="1.5" fill="#A88BC2" />
        <circle cx="14.4" cy="10.2" r="1.5" fill="#A88BC2" />
        <circle cx="13.5" cy="12.8" r="1.5" fill="#A88BC2" />
        <circle cx="10.5" cy="12.8" r="1.5" fill="#A88BC2" />
        <circle cx="9.6" cy="10.2" r="1.5" fill="#A88BC2" />
      </svg>
    );
  }

  if (type === 'feedback') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32">
        {/* Speech bubble outline */}
        <path
          d="M16 4 C9.4 4 4 8.7 4 14.5 C4 17.6 5.4 20.3 7.8 22.2 L6.5 27.5 L12 25 C13.3 25.5 14.6 25.8 16 25.8 C22.6 25.8 28 21.1 28 14.5 C28 8.7 22.6 4 16 4 Z"
          fill="none"
          stroke="#4D3B54"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Delicate lavender 5-petal flower inside */}
        <circle cx="16" cy="14.5" r="2.2" fill="#E8C86A" />
        <circle cx="16" cy="10.8" r="2.1" fill="#AC8EC6" />
        <circle cx="19.5" cy="13.2" r="2.1" fill="#AC8EC6" />
        <circle cx="18.2" cy="17.2" r="2.1" fill="#AC8EC6" />
        <circle cx="13.8" cy="17.2" r="2.1" fill="#AC8EC6" />
        <circle cx="12.5" cy="13.2" r="2.1" fill="#AC8EC6" />
      </svg>
    );
  }

  if (type === 'help') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32">
        {/* Open botanical book */}
        <path
          d="M16 8 C12.5 5.8 7 5.8 4 7.2 L4 24.5 C7 23.2 12.5 23.2 16 25.4 C19.5 23.2 25 23.2 28 24.5 L28 7.2 C25 5.8 19.5 5.8 16 8 Z"
          fill="none"
          stroke="#4D3B54"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M16 8 L16 25.4" stroke="#4D3B54" strokeWidth="1.6" strokeLinecap="round" />
        {/* Subtle bookmark/sprout lines on pages */}
        <path d="M7 11.5 C10 11 13 12 14 13.5" stroke="#9E8CA6" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <path d="M25 11.5 C22 11 19 12 18 13.5" stroke="#9E8CA6" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <circle cx="10" cy="16.5" r="1.1" fill="#9E8CA6" />
        <circle cx="22" cy="16.5" r="1.1" fill="#9E8CA6" />
      </svg>
    );
  }

  if (type === 'privacy') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32">
        {/* Botanical crest shield */}
        <path
          d="M16 4.5 C19.5 7.2 23.5 7.5 26 7.8 C26 17.5 21.5 24.5 16 27.5 C10.5 24.5 6 17.5 6 7.8 C8.5 7.5 12.5 7.2 16 4.5 Z"
          fill="none"
          stroke="#4D3B54"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Slender botanical leaf inside */}
        <path
          d="M16 10 C18.8 12.5 19 16.5 16 21.5 C13 16.5 13.2 12.5 16 10 Z"
          fill="rgba(86, 135, 100, 0.28)"
          stroke="#487856"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M16 12 L16 21.5" stroke="#487856" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  // 'support' — Folded postal stationery envelope with small flower
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      {/* Folded envelope base */}
      <rect
        x="5"
        y="9"
        width="22"
        height="15"
        rx="2"
        fill="none"
        stroke="#4D3B54"
        strokeWidth="1.8"
      />
      {/* Triangular fold flaps */}
      <path
        d="M5 9 L16 17.5 L27 9"
        fill="none"
        stroke="#4D3B54"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Little lavender flower cluster pinned at bottom-right */}
      <circle cx="25.5" cy="22.5" r="1.6" fill="#F8DE7E" />
      <circle cx="25.5" cy="20" r="1.5" fill="#AC8EC6" />
      <circle cx="27.8" cy="21.5" r="1.5" fill="#AC8EC6" />
      <circle cx="27" cy="24" r="1.5" fill="#AC8EC6" />
      <circle cx="24" cy="24" r="1.5" fill="#AC8EC6" />
      <circle cx="23.2" cy="21.5" r="1.5" fill="#AC8EC6" />
    </svg>
  );
});

/**
 * 2. Help & Feedback Trigger Button (Top-Right Chrome)
 */
interface HelpFeedbackTriggerProps {
  isOpen: boolean;
  onPress: () => void;
  style?: any;
}

export const HelpFeedbackTrigger = memo(function HelpFeedbackTrigger({
  isOpen,
  onPress,
  style,
}: HelpFeedbackTriggerProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Help and feedback"
      accessibilityState={{ expanded: isOpen }}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.triggerPill,
        isOpen && styles.triggerPillActive,
        pressed && styles.triggerPillPressed,
        hovered && styles.triggerPillHovered,
        style,
      ]}
    >
      <BotanicalSupportIcon type="trigger" size={18} />
      <Text style={[styles.triggerText, isOpen && styles.triggerTextActive]}>
        Help & Feedback
      </Text>
    </Pressable>
  );
});

/**
 * 3. Help & Feedback Floating Paper Panel
 */
interface HelpFeedbackPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic?: (topicId: string) => void;
  onShareFeedback?: () => void;
  onViewFaqs?: () => void;
}

export const HelpFeedbackPanel = memo(function HelpFeedbackPanel({
  isOpen,
  onClose,
  onSelectTopic,
  onShareFeedback,
  onViewFaqs,
}: HelpFeedbackPanelProps) {
  const [feedbackPromptVisible, setFeedbackPromptVisible] = useState(false);
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRowPress = (item: SupportMenuItem) => {
    if (onSelectTopic) {
      onSelectTopic(item.id);
    }
    setActiveNotice(
      `Opening ${item.title}: Connected to PetalPal Garden Support in the upcoming update.`
    );
    setTimeout(() => setActiveNotice(null), 3200);
  };

  const handlePrimaryPress = () => {
    if (onShareFeedback) {
      onShareFeedback();
    }
    setFeedbackPromptVisible(true);
    setTimeout(() => setFeedbackPromptVisible(false), 3600);
  };

  const handleFaqsPress = () => {
    if (onViewFaqs) {
      onViewFaqs();
    }
    setActiveNotice(
      'PetalPal Garden FAQ articles will open in your garden companion journal.'
    );
    setTimeout(() => setActiveNotice(null), 3200);
  };

  return (
    <View style={styles.floatingPanelAnchor} pointerEvents="box-none">
      {/* Backdrop overlay dismiss handler on mobile */}
      <Pressable
        style={styles.backdropDismiss}
        onPress={onClose}
        accessibilityLabel="Close help panel"
      />

      {/* Upward speech caret connecting trigger to panel */}
      <View style={styles.panelSpeechCaret} pointerEvents="none" />

      {/* Main Parchment Support Card */}
      <View
        accessibilityLabel="Help and Feedback panel"
        style={styles.parchmentCard}
        {...(Platform.OS === 'web' ? ({ className: 'petalpal-help-card' } as any) : {})}
      >
        {/* Tactile handmade paper grain texture */}
        <View style={styles.paperGrainLayer} pointerEvents="none" />

        {/* ── BOTANICAL ACCENT 1: Top-Left Lavender Floral Sprig ── */}
        <View pointerEvents="none" style={styles.topLavenderWrapper}>
          <Image
            source={TOP_LAVENDER_SPRIG}
            style={styles.topLavenderIllustration}
            resizeMode="contain"
          />
        </View>

        {/* ── BOTANICAL ACCENT 2: Bottom-Right Lavender Floral Sprig ── */}
        <View pointerEvents="none" style={styles.bottomLavenderWrapper}>
          <Image
            source={BOTTOM_LAVENDER_SPRIG}
            style={styles.bottomLavenderIllustration}
            resizeMode="contain"
          />
        </View>

        {/* ── PANEL HEADER ── */}
        <View style={styles.headerSection}>
          <View style={styles.headerTitleColumn}>
            <Text style={styles.headerMainTitle}>Help & Feedback</Text>
            <Text style={styles.headerSubtitle}>Every thought matters.</Text>
          </View>

          {/* Elegant Close Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed, hovered }: any) => [
              styles.closeIconButton,
              pressed && styles.closePressed,
              hovered && styles.closeHovered,
            ]}
          >
            <Text style={styles.closeIconGlyph}>✕</Text>
          </Pressable>
        </View>

        {/* ── 4 PRIMARY SUPPORT MENU ITEMS ── */}
        <View style={styles.menuItemsList}>
          {SUPPORT_MENU_ITEMS.map((item, index) => {
            const isLast = index === SUPPORT_MENU_ITEMS.length - 1;
            return (
              <View key={item.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}: ${item.description}`}
                  onPress={() => handleRowPress(item)}
                  style={({ pressed, hovered }: any) => [
                    styles.menuRow,
                    pressed && styles.menuRowPressed,
                    hovered && styles.menuRowHovered,
                  ]}
                >
                  <View style={styles.iconColumn}>
                    <BotanicalSupportIcon type={item.iconType} size={30} />
                  </View>

                  <View style={styles.rowTextColumn}>
                    <Text style={styles.rowTitleText}>{item.title}</Text>
                    <Text style={styles.rowDescriptionText} numberOfLines={2}>
                      {item.description}
                    </Text>
                  </View>

                  <View style={styles.rowChevronColumn}>
                    <Text style={styles.rowChevronText}>›</Text>
                  </View>
                </Pressable>

                {!isLast && <View style={styles.refinedDividerLine} />}
              </View>
            );
          })}
        </View>

        {/* ── BOTTOM ACTIONS ── */}
        <View style={styles.bottomActionsArea}>
          {/* Primary Action Button: Soft Botanical Teal "Share Feedback" */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share Feedback"
            onPress={handlePrimaryPress}
            style={({ pressed, hovered }: any) => [
              styles.shareFeedbackButton,
              pressed && styles.buttonPressed,
              hovered && styles.buttonHovered,
            ]}
          >
            <Text style={styles.buttonFlowerIcon}>✿</Text>
            <Text style={styles.shareFeedbackButtonText}>Share Feedback</Text>
          </Pressable>

          {/* Secondary Link: "View FAQs" */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View FAQs"
            onPress={handleFaqsPress}
            style={({ pressed }: any) => [
              styles.faqsLinkButton,
              pressed && { opacity: 0.65 },
            ]}
          >
            <Text style={styles.faqsLinkText}>View FAQs</Text>
          </Pressable>
        </View>

        {/* ── GENTLE IN-WORLD PLACEHOLDER ACKNOWLEDGMENT TOAST ── */}
        {(feedbackPromptVisible || activeNotice) && (
          <View style={styles.inWorldToast} pointerEvents="none">
            <Text style={styles.toastText}>
              {feedbackPromptVisible
                ? '✿ Thank you for sharing your thoughts! Your garden notes will help PetalPal bloom.'
                : activeNotice}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  /* ── Trigger Pill in Top-Right ── */
  triggerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(250, 244, 236, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(175, 148, 180, 0.50)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        boxShadow: '0 3px 10px rgba(45, 30, 40, 0.15)',
        cursor: 'pointer',
        transition: 'all 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
      },
      ios: {
        shadowColor: '#2B1A28',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.20,
        shadowRadius: 5,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  triggerPillActive: {
    backgroundColor: '#FAF5EE',
    borderColor: '#9E80AA',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(110, 80, 120, 0.25)',
      },
    }),
  },
  triggerPillHovered: {
    backgroundColor: '#FFFFFF',
    borderColor: '#9E80AA',
  },
  triggerPillPressed: {
    transform: [{ scale: 0.97 }],
  },
  triggerText: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: FONT_TITLE,
    color: '#3F2F44',
    letterSpacing: 0.2,
  },
  triggerTextActive: {
    color: '#2D1E32',
  },

  /* ── Floating Panel Positioning & Backdrop ── */
  floatingPanelAnchor: {
    position: 'absolute',
    top: 52,
    right: 18,
    zIndex: 60,
    alignItems: 'flex-end',
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFill as any,
    // Transparent tap area to dismiss
    top: -100,
    left: -1200,
    right: -100,
    bottom: -1200,
  },
  panelSpeechCaret: {
    position: 'absolute',
    top: 0,
    right: 32,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FAF6EE',
    zIndex: 62,
    ...Platform.select({
      web: {
        filter: 'drop-shadow(0 -2px 1.5px rgba(160, 130, 165, 0.20))',
      },
    }),
  },

  /* ── Parchment Card Container ── */
  parchmentCard: {
    position: 'relative',
    width: 316,
    maxWidth: '92vw' as any,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: 'rgba(182, 156, 186, 0.35)',
    overflow: 'hidden',
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 16,
    ...Platform.select({
      web: {
        boxShadow:
          '0 18px 46px rgba(35, 20, 30, 0.28), 0 4px 14px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.85)',
      },
      ios: {
        shadowColor: '#241422',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.30,
        shadowRadius: 18,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  paperGrainLayer: {
    ...StyleSheet.absoluteFill as any,
    opacity: 0.5,
    ...Platform.select({
      web: {
        backgroundImage: ENVELOPE_PAPER_BACKGROUND,
      },
    }),
  },

  /* ── Botanical Corner Sprig Illustrations ── */
  topLavenderWrapper: {
    position: 'absolute',
    top: 6,
    left: 8,
    width: 58,
    height: 78,
    zIndex: 1,
  },
  topLavenderIllustration: {
    width: '100%',
    height: '100%',
    opacity: 0.95,
    ...Platform.select({
      web: {
        mixBlendMode: 'multiply',
      } as any,
    }),
  },
  bottomLavenderWrapper: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 46,
    height: 98,
    zIndex: 1,
  },
  bottomLavenderIllustration: {
    width: '100%',
    height: '100%',
    opacity: 0.90,
    ...Platform.select({
      web: {
        mixBlendMode: 'multiply',
      } as any,
    }),
  },

  /* ── Header Section ── */
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingLeft: 64, // Leaves graceful room for top lavender sprig
    paddingRight: 4,
    paddingBottom: 14,
    zIndex: 2,
  },
  headerTitleColumn: {
    gap: 2,
  },
  headerMainTitle: {
    fontSize: 18.5,
    fontWeight: '700',
    fontFamily: FONT_TITLE,
    color: '#2D2034',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12.5,
    fontFamily: FONT_BODY,
    fontStyle: 'italic',
    color: '#76677C',
    letterSpacing: 0.1,
  },
  closeIconButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(165, 140, 175, 0.10)',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.18s ease, transform 0.18s ease',
      },
    }),
  },
  closePressed: {
    transform: [{ scale: 0.92 }],
    backgroundColor: 'rgba(165, 140, 175, 0.25)',
  },
  closeHovered: {
    backgroundColor: 'rgba(165, 140, 175, 0.20)',
  },
  closeIconGlyph: {
    fontSize: 12,
    color: '#5C4C63',
    fontWeight: '600',
  },

  /* ── Menu Rows ── */
  menuItemsList: {
    paddingVertical: 2,
    zIndex: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 12,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.18s ease, transform 0.18s ease',
      },
    }),
  },
  menuRowPressed: {
    backgroundColor: 'rgba(175, 148, 185, 0.14)',
    transform: [{ scale: 0.99 }],
  },
  menuRowHovered: {
    backgroundColor: 'rgba(175, 148, 185, 0.08)',
  },
  iconColumn: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextColumn: {
    flex: 1,
    gap: 2,
  },
  rowTitleText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: FONT_TITLE,
    color: '#322538',
    letterSpacing: 0.2,
  },
  rowDescriptionText: {
    fontSize: 11,
    fontFamily: FONT_BODY,
    fontStyle: 'italic',
    color: '#77687C',
    lineHeight: 14.5,
  },
  rowChevronColumn: {
    paddingLeft: 4,
  },
  rowChevronText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#9E8DA4',
  },
  refinedDividerLine: {
    height: 0.8,
    backgroundColor: 'rgba(180, 155, 190, 0.20)',
    marginHorizontal: 8,
  },

  /* ── Bottom Actions Area ── */
  bottomActionsArea: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
    zIndex: 2,
  },
  shareFeedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: 210,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#437568',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    ...Platform.select({
      web: {
        boxShadow:
          '0 3px 10px rgba(45, 80, 70, 0.32), inset 0 1px 1px rgba(255, 255, 255, 0.30)',
        cursor: 'pointer',
        transition: 'all 0.20s cubic-bezier(0.22, 1, 0.36, 1)',
      },
      ios: {
        shadowColor: '#2D4E45',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  buttonFlowerIcon: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.95,
  },
  shareFeedbackButtonText: {
    fontSize: 13.5,
    fontWeight: '600',
    fontFamily: FONT_TITLE,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  buttonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: '#386358',
  },
  buttonHovered: {
    backgroundColor: '#4C8274',
  },
  faqsLinkButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  faqsLinkText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: FONT_BODY,
    color: '#556379',
    textDecorationLine: 'underline',
    letterSpacing: 0.2,
  },

  /* ── In-World Toast / Acknowledgment ── */
  inWorldToast: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    backgroundColor: '#322538',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(20, 10, 25, 0.35)',
      },
    }),
  },
  toastText: {
    fontSize: 11,
    fontFamily: FONT_BODY,
    color: '#F4ECE0',
    textAlign: 'center',
    lineHeight: 14.5,
  },

  /* Native Fallback Icon */
  nativeIconCircle: {
    borderRadius: 14,
    backgroundColor: 'rgba(165, 140, 175, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HelpFeedbackPanel;
