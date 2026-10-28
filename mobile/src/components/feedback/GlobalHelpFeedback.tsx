/**
 * PetalPal Global Help & Feedback Component
 *
 * Mounts once at the shared root application layout level to provide
 * consistent, accessible Help & Feedback across all user-facing screens:
 * - Garden
 * - Journal / Record
 * - Mailbox
 * - Friends / Profile (and future screens)
 *
 * Features:
 * - Route visibility rules (hidden on auth, onboarding, etc.)
 * - Safe area inset handling on mobile devices
 * - Responsive trigger button (full label on desktop, compact on mobile)
 * - Seamless view navigation between Main Menu and Send Feedback form
 * - Full draft preservation via FeedbackDraftContext
 * - Zero touch interception when closed (pointerEvents="box-none")
 */

import { usePathname } from 'expo-router';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { onOpenHelpFeedback } from './helpFeedbackBus';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_BODY, FONT_DISPLAY, FONT_TITLE } from '../mailbox/ExpandedLetter';
import {
  BotanicalSupportIcon,
  HelpFeedbackTrigger,
  SUPPORT_MENU_ITEMS,
} from '../mailbox/HelpFeedbackPanel';
import { ENVELOPE_PAPER_BACKGROUND } from '../mailbox/paperTextures';
import { useFeedbackDraft } from './FeedbackDraftContext';
import { HelpFeedbackView, SupportTopicItem } from './feedbackTypes';
import { SendFeedbackForm } from './SendFeedbackForm';

const TOP_LAVENDER_SPRIG = require('../../../assets/mailbox/help_lavender_top.png');
const BOTTOM_LAVENDER_SPRIG = require('../../../assets/mailbox/help_lavender_bottom.png');

/**
 * Route-level visibility filter:
 * Only hide on authentication, onboarding, splash, or system dialog routes.
 * All normal user-facing screens (Garden, Journal, Mailbox, Explore, etc.) display it.
 */
const HIDDEN_ROUTE_PATTERNS = [
  /^\/auth/i,
  /^\/login/i,
  /^\/sign-in/i,
  /^\/register/i,
  /^\/onboarding/i,
  /^\/splash/i,
  /^\/reset-project/i,
];

export function isHelpFeedbackVisibleOnRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === '/login-preview') return true;
  return !HIDDEN_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export const GlobalHelpFeedback = memo(function GlobalHelpFeedback() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { hasDraft } = useFeedbackDraft();

  const [isOpen, setIsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<HelpFeedbackView>('menu');
  const [comingSoonNotice, setComingSoonNotice] = useState<string | null>(null);
  const draft = useRef(hasDraft); draft.current = hasDraft;
  useEffect(() => {
    const open = () => { setIsOpen(true); setCurrentView('feedback_form'); setComingSoonNotice(null); };
    return onOpenHelpFeedback(open);
  }, []);

  // Check route visibility
  const isVisible = isHelpFeedbackVisibleOnRoute(pathname);
  if (!isVisible) return null;

  const isSmallScreen = windowWidth < 460;

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      // If opening with an active draft, go straight to feedback form
      if (next && hasDraft) {
        setCurrentView('feedback_form');
      } else if (!next) {
        // Reset view to menu when closing
        setCurrentView('menu');
        setComingSoonNotice(null);
      }
      return next;
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setCurrentView('menu');
    setComingSoonNotice(null);
  };

  const handleSelectMenuItem = (item: SupportTopicItem) => {
    if (item.id === 'feedback') {
      setCurrentView('feedback_form');
      setComingSoonNotice(null);
    } else {
      // Modest in-world coming soon notice for other categories
      const notices: Record<string, string> = {
        help_center:
          'Help Center articles are blossoming soon in the garden companion journal.',
        privacy:
          'Privacy & Safety guidelines and AI fairy guardrails will be available in the upcoming release.',
        support:
          'Direct fairy post support will be available in an upcoming release.',
      };
      setComingSoonNotice(
        notices[item.id] || `${item.title} will be available in a future update.`
      );
      setTimeout(() => setComingSoonNotice(null), 3600);
    }
  };

  const handlePrimaryCta = () => {
    setCurrentView('feedback_form');
    setComingSoonNotice(null);
  };

  const handleViewFaqs = () => {
    setComingSoonNotice(
      'Garden FAQ articles will be available soon in the upcoming update.'
    );
    setTimeout(() => setComingSoonNotice(null), 3200);
  };

  // Safe area offsets — anchored to the player-visible viewport
  const topOffset = (insets.top || 0) + (Platform.OS === 'web' ? 14 : 10);
  const rightOffset = (insets.right || 0) + 14;

  // Card width based on view and screen
  const cardWidth = currentView === 'feedback_form' ? 380 : 316;
  const responsiveCardWidth = Math.min(cardWidth, windowWidth - 28);

  return (
    <View
      style={[
        styles.globalOverlayRoot,
        {
          top: topOffset,
          right: rightOffset,
        },
      ]}
      pointerEvents="box-none"
    >


      {/* ── FLOATING PAPER PANEL ── */}
      {isOpen && (
        <View style={styles.panelAnchor} pointerEvents="box-none">
          {/* Backdrop Tap Dismiss */}
          <Pressable
            style={styles.backdropDismiss}
            onPress={handleClose}
            accessibilityLabel="Close help panel"
          />


          {/* Parchment Card Container */}
          <View
            accessibilityLabel="Help and Feedback panel"
            style={[styles.parchmentCard, { width: responsiveCardWidth }]}
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

            {/* ── VIEW A: MAIN HELP & FEEDBACK MENU ── */}
            {/* ── VIEW B: SEND FEEDBACK FORM ── */}
            {currentView === 'feedback_form' && (
              <SendFeedbackForm
                onBack={handleClose}
                onClose={handleClose}
                currentRoute={pathname}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  globalOverlayRoot: {
    position: 'absolute',
    zIndex: 9999,
    alignItems: 'flex-end',
  },

  /* ── Trigger Pill ── */
  triggerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(250, 246, 238, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(182, 156, 186, 0.50)',
    gap: 6,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow:
          '0 2px 8px rgba(45, 30, 48, 0.16), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(8px)',
        transition: 'all 0.18s ease',
      } as any,
      ios: {
        shadowColor: '#2D1E30',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  triggerPillActive: {
    backgroundColor: '#FAF6EE',
    borderColor: '#8E7398',
  },
  triggerPillPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  triggerPillHovered: {
    backgroundColor: '#FFFDF9',
    borderColor: '#9E85A8',
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
  draftIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#437568',
    marginLeft: 1,
  },

  /* ── Panel Positioning & Backdrop ── */
  panelAnchor: {
    position: 'relative',
    alignItems: 'flex-end',
    marginTop: 6,
    zIndex: 10000,
  },
  backdropDismiss: {
    ...Platform.select({
      web: {
        position: 'fixed' as any,
        top: -2000,
        left: -2000,
        right: -2000,
        bottom: -2000,
      },
      default: {
        position: 'absolute',
        top: -2000,
        left: -2000,
        right: -2000,
        bottom: -2000,
        width: 4000,
        height: 4000,
      },
    }),
    zIndex: 1,
  },
  panelSpeechCaret: {
    position: 'absolute',
    top: 0,
    right: 22,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FAF6EE',
    zIndex: 3,
    ...Platform.select({
      web: {
        filter: 'drop-shadow(0 -2px 1.5px rgba(160, 130, 165, 0.20))',
      },
    }),
  },

  /* ── Parchment Card Container ── */
  parchmentCard: {
    position: 'relative',
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#FAF6EE',
    borderWidth: 1,
    borderColor: 'rgba(182, 156, 186, 0.35)',
    overflow: 'hidden',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    zIndex: 2,
    maxHeight: '88vh' as any,
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

  /* ── Menu Container ── */
  menuContainer: {
    zIndex: 2,
  },

  /* ── Header Section ── */
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingLeft: 64, // Leaves room for top lavender sprig
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
    color: '#65526B',
  },
  closeIconButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(182, 156, 186, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  closePressed: {
    opacity: 0.7,
  },
  closeHovered: {
    backgroundColor: 'rgba(182, 156, 186, 0.30)',
  },
  closeIconGlyph: {
    fontSize: 12,
    color: '#4F3B54',
    lineHeight: 14,
  },

  /* ── Menu Items List ── */
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
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.18s ease',
      } as any,
    }),
  },
  menuRowPressed: {
    backgroundColor: 'rgba(182, 156, 186, 0.14)',
  },
  menuRowHovered: {
    backgroundColor: 'rgba(182, 156, 186, 0.09)',
  },
  iconColumn: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowTextColumn: {
    flex: 1,
    gap: 2,
  },
  rowTitleText: {
    fontSize: 13.5,
    fontWeight: '600',
    fontFamily: FONT_TITLE,
    color: '#322336',
    letterSpacing: 0.15,
  },
  rowDescriptionText: {
    fontSize: 11,
    fontFamily: FONT_BODY,
    color: '#6B5872',
    lineHeight: 14,
  },
  rowChevronColumn: {
    paddingLeft: 6,
  },
  rowChevronText: {
    fontSize: 16,
    color: '#9E85A8',
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(182, 156, 186, 0.20)',
    marginHorizontal: 8,
  },

  /* ── Bottom Actions ── */
  bottomActions: {
    paddingTop: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
  },
  primaryActionButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#437568',
    borderRadius: 22,
    paddingVertical: 10,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(67, 117, 104, 0.32)',
        transition: 'all 0.18s ease',
      } as any,
    }),
  },
  primaryActionPressed: {
    backgroundColor: '#355F54',
    transform: [{ scale: 0.985 }],
  },
  primaryActionHovered: {
    backgroundColor: '#3B685C',
  },
  primaryActionIcon: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  primaryActionText: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: FONT_TITLE,
    color: '#FFFFFF',
    letterSpacing: 0.3,
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

  /* ── Modest In-World Notice ── */
  inWorldNotice: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
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
  noticeText: {
    fontSize: 11,
    fontFamily: FONT_BODY,
    color: '#F4ECE0',
    textAlign: 'center',
    lineHeight: 14.5,
  },
});

export default GlobalHelpFeedback;
