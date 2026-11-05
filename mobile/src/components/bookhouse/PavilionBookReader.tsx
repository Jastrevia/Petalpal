import React, { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Easing, Platform,
  Image, useWindowDimensions, AccessibilityInfo,
} from 'react-native';
import type { AppLocale } from '../../services/locale';
import type { PavilionBookId } from './pavilionMotion';
import { EmotionalSafetyNote } from '../features/EmotionalSafetyNote';
import { AiOutputReport } from '../features/AiPrivacySettings';
import { MoodPetalChart } from '../features/WeeklyBloom';
import { petalCardArt } from '../petalCards/petalCardArt';
import {
  weekLabel, shortDate, type SavedReport, type ReflectionReport,
  SHORT_COPY, monthly2, shortWeekly,
} from '../../services/reflections';
type PrimaryMood = 'SUNNY_BLOOM' | 'GENTLE_BLOOM' | 'QUIET_BLOOM' | 'HEALING_BLOOM' | 'FIRE_BLOOM' | 'WONDER_BLOOM' | 'DRIFTING_BLOOM' | 'PEACEFUL_BLOOM';
import type { Rect } from './bookMotion';
import {
  buildFlowerLanguageCollectionPages,
  BOOKMARK_CATEGORIES,
} from './flowerLanguagePages';
import {
  buildInstructionPages,
  INSTRUCTION_BOOKMARK_CATEGORIES,
} from './instructionPages';

const parchment = require('../../../assets/bookhouse/journal/parchment.webp');
const botanical = require('../../../assets/reflection/botanical.png');

export interface BookReaderProps {
  bookId: PavilionBookId;
  locale: AppLocale;
  leaves: { left: Rect; right: Rect };
  readingRect: Rect;
  compact: boolean;
  reports: SavedReport[];
  details: Record<string, ReflectionReport>;
  selectedReport: SavedReport | null;
  onSelectReport: (report: SavedReport) => void;
  onClose: () => void;
  onWriteEvent?: () => void;
}

interface PageData {
  pageNumber: number;
  header?: string;
  eyebrow?: string;
  render: (interactive: boolean) => ReactNode;
}

const TURN_DURATION = 540;

export function PavilionBookReader({
  bookId, locale, leaves, readingRect, compact,
  reports, details, selectedReport, onSelectReport, onClose, onWriteEvent,
}: BookReaderProps) {
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [turning, setTurning] = useState<{ from: number; to: number; dir: 1 | -1 } | null>(null);
  const turnProgress = useRef(new Animated.Value(0)).current;
  const isTurningLocked = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReducedMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; sub.remove(); turnProgress.stopAnimation(); };
  }, [turnProgress]);

  // Reset spread when bookId changes
  useEffect(() => {
    setSpreadIndex(0);
    setTurning(null);
    isTurningLocked.current = false;
  }, [bookId]);

  // Dimensions
  const leftPageWidth = leaves.left.width;
  const rightPageWidth = leaves.right.width;
  const rightPageOffset = compact ? 0 : leaves.right.x - readingRect.x;
  const pageHeight = Math.max(100, readingRect.height);
  const pageWidth = compact ? readingRect.width : rightPageWidth;

  // Build the Flower Language Collection pages (Tomus I - 8 categories, 26 flowers, 34 physical pages)
  const flowerCollection = useMemo(() => {
    return buildFlowerLanguageCollectionPages(locale, compact);
  }, [locale, compact]);

  // Build the Instruction pages (7 chapters, 24 pages)
  const instructionCollection = useMemo(() => {
    return buildInstructionPages(locale, compact);
  }, [locale, compact]);

  // Build pages for the active book
  const pages: PageData[] = useMemo(() => {
    switch (bookId) {
      case 'notes':
        return instructionCollection.pages;
      case 'collection':
        return flowerCollection.pages;
      case 'weekly':
        return buildWeeklyPages(locale, selectedReport, details, onWriteEvent);
      case 'monthly':
        return buildMonthlyPages(locale, selectedReport, details);
      default:
        return [];
    }
  }, [bookId, locale, flowerCollection, instructionCollection, selectedReport, details, onWriteEvent]);

  // Group pages into spreads
  const spreads = useMemo(() => {
    if (compact) {
      return pages.map((page, i) => ({
        spreadNumber: i,
        left: null,
        right: page,
      }));
    }
    const result: Array<{ spreadNumber: number; left: PageData | null; right: PageData | null }> = [];
    for (let i = 0; i < pages.length; i += 2) {
      result.push({
        spreadNumber: Math.floor(i / 2),
        left: pages[i] || null,
        right: pages[i + 1] || null,
      });
    }
    if (result.length === 0) {
      result.push({ spreadNumber: 0, left: null, right: null });
    }
    return result;
  }, [pages, compact]);

  const maxSpread = Math.max(0, spreads.length - 1);
  const currentSpread = Math.min(spreadIndex, maxSpread);

  // Physical 3D page navigation
  const goToSpread = useCallback((targetSpreadIndex: number) => {
    if (isTurningLocked.current || targetSpreadIndex === currentSpread) return;
    if (targetSpreadIndex < 0 || targetSpreadIndex > maxSpread) return;

    if (reducedMotion) {
      setSpreadIndex(targetSpreadIndex);
      return;
    }

    const dir: 1 | -1 = targetSpreadIndex > currentSpread ? 1 : -1;
    isTurningLocked.current = true;
    turnProgress.setValue(0);
    setTurning({ from: currentSpread, to: targetSpreadIndex, dir });

    Animated.timing(turnProgress, {
      toValue: 1,
      duration: TURN_DURATION,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) {
        setSpreadIndex(targetSpreadIndex);
      }
      setTurning(null);
      isTurningLocked.current = false;
    });
  }, [currentSpread, maxSpread, reducedMotion, turnProgress]);

  const turnPage = useCallback((dir: 1 | -1) => {
    goToSpread(currentSpread + dir);
  }, [currentSpread, goToSpread]);

  // Active category / chapter detection for bookmarks
  const activeCategoryId = useMemo(() => {
    if (bookId === 'collection') {
      const activeSpread = spreads[currentSpread];
      if (!activeSpread) return 'happy';

      if (compact) {
        const pageNum = activeSpread.right?.pageNumber ?? 1;
        const match = flowerCollection.categoryRanges.find(
          r => pageNum >= r.startPage && pageNum <= r.endPage
        );
        return match?.id ?? 'happy';
      }

      // Two-page spread: if right page is the category intro, highlight it
      const rightPageNum = activeSpread.right?.pageNumber;
      const rightMatch = rightPageNum
        ? flowerCollection.categoryRanges.find(r => r.startPage === rightPageNum)
        : null;
      if (rightMatch) return rightMatch.id;

      const leftPageNum = activeSpread.left?.pageNumber ?? rightPageNum ?? 1;
      const leftMatch = flowerCollection.categoryRanges.find(
        r => leftPageNum >= r.startPage && leftPageNum <= r.endPage
      );
      return leftMatch?.id ?? 'happy';
    }

    if (bookId === 'notes') {
      const activeSpread = spreads[currentSpread];
      if (!activeSpread) return 'welcome';

      if (compact) {
        const pageNum = activeSpread.right?.pageNumber ?? 1;
        const match = instructionCollection.chapterRanges.find(
          r => pageNum >= r.startPage && pageNum <= r.endPage
        );
        return match?.id ?? 'welcome';
      }

      // Two-page spread: if right page is the chapter intro, highlight it
      const rightPageNum = activeSpread.right?.pageNumber;
      const rightMatch = rightPageNum
        ? instructionCollection.chapterRanges.find(r => r.startPage === rightPageNum)
        : null;
      if (rightMatch) return rightMatch.id;

      const leftPageNum = activeSpread.left?.pageNumber ?? rightPageNum ?? 1;
      const leftMatch = instructionCollection.chapterRanges.find(
        r => leftPageNum >= r.startPage && leftPageNum <= r.endPage
      );
      return leftMatch?.id ?? 'welcome';
    }

    return null;
  }, [bookId, spreads, currentSpread, compact, flowerCollection, instructionCollection]);

  // Bookmark click handler (navigates to that category/chapter introductory page)
  const handleBookmarkClick = useCallback((catId: string) => {
    if (bookId === 'collection') {
      const targetPage = flowerCollection.categoryPageMap[catId];
      if (targetPage == null) return;
      const targetSpread = compact ? targetPage - 1 : Math.floor((targetPage - 1) / 2);
      goToSpread(targetSpread);
    } else if (bookId === 'notes') {
      const targetPage = instructionCollection.chapterPageMap[catId];
      if (targetPage == null) return;
      const targetSpread = compact ? targetPage - 1 : Math.floor((targetPage - 1) / 2);
      goToSpread(targetSpread);
    }
  }, [bookId, compact, flowerCollection, instructionCollection, goToSpread]);

  // Reader debug tools for testing and visual verification
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__readerDebug = {
        get spreadIndex() { return currentSpread; },
        get spreadsCount() { return spreads.length; },
        goToSpread,
        turnPage,
        pauseTurnAt: (val: number) => {
          turnProgress.stopAnimation();
          isTurningLocked.current = true;
          setTurning({ from: currentSpread, to: currentSpread + 1, dir: 1 });
          turnProgress.setValue(val);
        },
        resumeTurn: () => {
          turnProgress.setValue(1);
          setSpreadIndex(currentSpread + 1);
          setTurning(null);
          isTurningLocked.current = false;
        },
      };
    }
  }, [currentSpread, spreads.length, goToSpread, turnPage, turnProgress]);

  // Keyboard navigation on web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') turnPage(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turnPage(-1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [turnPage]);

  // Render individual page surface
  const renderPageSurface = (
    page: PageData | null,
    side: 'left' | 'right',
    interactive: boolean,
    isTurningLeaf = false
  ) => {
    const isLeft = side === 'left';
    const thisPageWidth = compact ? pageWidth : (isLeft ? leftPageWidth : rightPageWidth);

    return (
      <View
        testID={isLeft ? 'reflection-left-page' : 'reflection-right-page'}
        style={[
          styles.pageSurface,
          { width: thisPageWidth, height: pageHeight },
          compact ? styles.compactPageBackground : (isLeft ? styles.leftPageCorners : styles.rightPageCorners),
          isTurningLeaf && (isLeft ? styles.leftPageShadow : styles.rightPageShadow),
        ]}
      >
        {/* The full parchment paper texture of the physical page */}
        <Image source={parchment} style={StyleSheet.absoluteFill} resizeMode="stretch" />

        {/* Central gutter spine crease shading */}
        {!compact && (
          <View
            pointerEvents="none"
            style={[styles.spineFoldShading, isLeft ? styles.spineFoldLeft : styles.spineFoldRight]}
          />
        )}

        {/* Outer fore-edge vignette */}
        {!compact && (
          <View
            pointerEvents="none"
            style={[styles.foreEdgeVignette, isLeft ? styles.foreEdgeLeft : styles.foreEdgeRight]}
          />
        )}

        {/* The unified decorative gold border */}
        <View
          pointerEvents="none"
          style={[
            styles.decorativeGoldBorder,
            compact ? { left: 16, right: 16 } : (isLeft ? styles.leftGoldBorder : styles.rightGoldBorder),
          ]}
        />

        {/* Content container inside the decorative frame */}
        {page ? (
          <View
            style={[
              styles.pageInnerContainer,
              compact
                ? ((bookId === 'collection' || bookId === 'notes') ? styles.pageInnerCompactCollection : styles.pageInnerCompact)
                : (isLeft ? styles.pageInnerLeft : styles.pageInnerRight),
            ]}
          >
            {/* Header / Eyebrow */}
            {(page.eyebrow || page.header) && (
              <View style={styles.pageHeader}>
                {page.eyebrow && <Text style={styles.pageEyebrow}>{page.eyebrow}</Text>}
                {page.header && <Text style={styles.pageHeaderText}>{page.header}</Text>}
                <View style={styles.headerRule} />
              </View>
            )}

            {/* Page Body Content */}
            <View style={styles.pageBodyContent}>
              {page.render(interactive)}
            </View>

            {/* Subtle Page Footer & Number */}
            <View style={styles.pageFooter}>
              {(isLeft || compact) && currentSpread > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={locale === 'zh-Hans' ? '上一页' : 'Previous page'}
                  hitSlop={12}
                  onPress={() => turnPage(-1)}
                  style={styles.navArrowBtn}
                >
                  <Text style={styles.arrowSymbol}>‹</Text>
                </Pressable>
              )}
              <Text style={styles.pageNumberText}>
                {locale === 'zh-Hans' ? `第 ${page.pageNumber} 页` : `— ${page.pageNumber} —`}
              </Text>
              {(!isLeft || compact) && currentSpread < maxSpread && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={locale === 'zh-Hans' ? '下一页' : 'Next page'}
                  hitSlop={12}
                  onPress={() => turnPage(1)}
                  style={styles.navArrowBtn}
                >
                  <Text style={styles.arrowSymbol}>›</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View style={[styles.pageInnerContainer, styles.blankPageContainer]}>
            <Image source={botanical} style={styles.blankPageWatermark} resizeMode="contain" />
          </View>
        )}

        {/* Tap zones on outer edges */}
        {interactive && (
          <>
            {isLeft && currentSpread > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={locale === 'zh-Hans' ? '向前翻页' : 'Turn page back'}
                onPress={() => turnPage(-1)}
                style={styles.leftEdgeTapZone}
              >
                <View style={styles.edgeHintTab}><Text style={styles.edgeHintArrow}>‹</Text></View>
              </Pressable>
            )}
            {!isLeft && currentSpread < maxSpread && !(compact && bookId === 'collection') && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={locale === 'zh-Hans' ? '向后翻页' : 'Turn page forward'}
                onPress={() => turnPage(1)}
                style={styles.rightEdgeTapZone}
              >
                <View style={styles.edgeHintTab}><Text style={styles.edgeHintArrow}>›</Text></View>
              </Pressable>
            )}
          </>
        )}
      </View>
    );
  };

  // 3D Turning Leaf Math
  const activeSpread = spreads[currentSpread] || spreads[0];
  const targetSpread = turning ? spreads[turning.to] : null;

  // Rotation angles
  const isBackwards = turning ? turning.dir === -1 : false;
  const rotateY = turnProgress.interpolate({
    inputRange: [0, 1],
    outputRange: isBackwards ? ['-180deg', '0deg'] : ['0deg', '-180deg'],
  });

  const frontOpacity = turnProgress.interpolate({
    inputRange: [0, 0.499, 0.501, 1],
    outputRange: isBackwards ? [0, 0, 1, 1] : [1, 1, 0, 0],
  });

  const backOpacity = turnProgress.interpolate({
    inputRange: [0, 0.499, 0.501, 1],
    outputRange: isBackwards ? [1, 1, 0, 0] : [0, 0, 1, 1],
  });

  const dynamicShadowOpacity = turnProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.32, 0],
  });

  const foldHighlightOpacity = turnProgress.interpolate({
    inputRange: [0, 0.3, 0.7, 1],
    outputRange: [0, 0.75, 0.75, 0],
  });

  return (
    <View style={[styles.readerRoot, { width: readingRect.width, height: pageHeight }]}>
      {/* Left Page (Resting) */}
      {!compact && (
        <View style={{ position: 'absolute', left: 0, top: 0, width: leftPageWidth, height: pageHeight }}>
          {renderPageSurface(
            turning ? (isBackwards ? targetSpread?.left ?? null : activeSpread.left) : activeSpread.left,
            'left',
            !turning,
            false
          )}
        </View>
      )}

      {/* Right Page (Resting) */}
      <View style={{ position: 'absolute', left: rightPageOffset, top: 0, width: rightPageWidth, height: pageHeight }}>
        {renderPageSurface(
          turning ? (isBackwards ? activeSpread.right : targetSpread?.right ?? null) : activeSpread.right,
          compact ? 'left' : 'right',
          !turning,
          false
        )}
      </View>

      {/* 3D Physical Turning Leaf */}
      {turning && (
        <Animated.View
          testID="reflection-turning-leaf"
          pointerEvents="none"
          accessible={false}
          aria-hidden
          style={[
            styles.turningLeafWrapper,
            {
              position: 'absolute',
              left: rightPageOffset,
              top: 0,
              width: rightPageWidth,
              height: pageHeight,
              ...(Platform.OS === 'web' ? { transformStyle: 'preserve-3d' as const } : {}),
              transform: [
                { perspective: rightPageWidth * 7 },
                { translateX: -rightPageWidth / 2 },
                { rotateY },
                { translateX: rightPageWidth / 2 },
              ],
            },
          ]}
        >
          {/* Front of the turning leaf (Current spread right page) */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backfaceVisibility: 'hidden', opacity: frontOpacity },
            ]}
          >
            {renderPageSurface(
              isBackwards ? targetSpread?.right ?? null : activeSpread.right,
              'right',
              false,
              true
            )}
          </Animated.View>

          {/* Back of the turning leaf (Next spread left page, rotated 180deg) */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backfaceVisibility: 'hidden',
                opacity: backOpacity,
                transform: [{ rotateY: '180deg' }],
              },
            ]}
          >
            {renderPageSurface(
              isBackwards ? activeSpread.left : targetSpread?.left ?? null,
              'left',
              false,
              true
            )}
            {/* Backside paper tint */}
            <View style={[StyleSheet.absoluteFill, styles.backsidePaperTint]} />
          </Animated.View>

          {/* Specular Ridge Highlight */}
          <Animated.View
            style={[
              styles.ridgeHighlight,
              { opacity: foldHighlightOpacity },
            ]}
          />

          {/* Dynamic cast shadow across page */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.movingLeafShadow,
              { opacity: dynamicShadowOpacity },
            ]}
          />
        </Animated.View>
      )}

      {/* Put back button (Close book and return to shelf) */}
      <Pressable
        testID="reflection-put-back"
        accessibilityRole="button"
        accessibilityLabel={locale === 'zh-Hans' ? '把书放回书架' : 'Put the book back on the shelf'}
        disabled={!!turning}
        onPress={onClose}
        hitSlop={10}
        style={[
          styles.closeBookBtn,
          {
            left: readingRect.width - (compact ? 36 : 28),
            top: 4,
          },
        ]}
      >
        <Text style={styles.closeBookBtnText}>✕</Text>
      </Pressable>

      {/* 8 Physical Bookmarks along the outer right edge for Flower Language Collection */}
      {bookId === 'collection' && (
        <View
          testID="reflection-bookmarks"
          pointerEvents={turning ? 'none' : 'box-none'}
          style={[
            styles.bookmarksContainer,
            compact ? styles.bookmarksCompact : styles.bookmarksDesktop,
            {
              top: compact
                ? Math.max(14, (pageHeight - 8 * 34) / 2)
                : Math.max(22, (pageHeight - 8 * 42) / 2),
            },
          ]}
        >
          {BOOKMARK_CATEGORIES.map((tab) => {
            const isActive = activeCategoryId === tab.id;
            const tabLabel = typeof tab.label === 'string' ? tab.label : (tab.label[locale] ?? tab.label.en);
            return (
              <Pressable
                key={tab.id}
                testID={`reflection-bookmark-${tab.id}`}
                accessibilityRole="tab"
                accessibilityLabel={locale === 'zh-Hans' ? `书签：${tabLabel}` : `Bookmark ${tabLabel}`}
                accessibilityState={{ selected: isActive }}
                hitSlop={
                  compact
                    ? { top: 2, bottom: 2, left: 4, right: 6 }
                    : { top: 3, bottom: 3, left: 4, right: 8 }
                }
                onPress={() => handleBookmarkClick(tab.id)}
                style={[
                  styles.bookmarkTab,
                  compact ? styles.bookmarkTabCompact : styles.bookmarkTabDesktop,
                  isActive && (compact ? styles.bookmarkTabActiveCompact : styles.bookmarkTabActiveDesktop),
                ]}
              >
                <View
                  style={[
                    styles.tabAccentLine,
                    compact && styles.tabAccentLineCompact,
                    isActive && styles.tabAccentLineActive,
                  ]}
                />
                <Text
                  style={[
                    styles.bookmarkTabText,
                    compact ? styles.bookmarkTabTextCompact : styles.bookmarkTabTextDesktop,
                    isActive && styles.bookmarkTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {tabLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 7 Physical Bookmarks along the outer right edge for Instruction Book */}
      {bookId === 'notes' && (
        <View
          testID="reflection-bookmarks"
          pointerEvents={turning ? 'none' : 'box-none'}
          style={[
            styles.bookmarksContainer,
            compact ? styles.bookmarksCompact : styles.bookmarksDesktop,
            {
              top: compact
                ? Math.max(14, (pageHeight - 7 * 34) / 2)
                : Math.max(22, (pageHeight - 7 * 42) / 2),
            },
          ]}
        >
          {INSTRUCTION_BOOKMARK_CATEGORIES.map((tab) => {
            const isActive = activeCategoryId === tab.id;
            const tabLabel = typeof tab.label === 'string' ? tab.label : (tab.label[locale] ?? tab.label.en);
            return (
              <Pressable
                key={tab.id}
                testID={`reflection-bookmark-${tab.id}`}
                accessibilityRole="tab"
                accessibilityLabel={locale === 'zh-Hans' ? `书签：${tabLabel}` : `Bookmark ${tabLabel}`}
                accessibilityState={{ selected: isActive }}
                hitSlop={
                  compact
                    ? { top: 2, bottom: 2, left: 4, right: 6 }
                    : { top: 3, bottom: 3, left: 4, right: 8 }
                }
                onPress={() => handleBookmarkClick(tab.id)}
                style={[
                  styles.bookmarkTab,
                  styles.instructionBookmarkTab,
                  compact ? styles.bookmarkTabCompact : styles.bookmarkTabDesktop,
                  isActive && (compact ? styles.instructionBookmarkTabActiveCompact : styles.instructionBookmarkTabActiveDesktop),
                ]}
              >
                <View
                  style={[
                    styles.tabAccentLine,
                    styles.instructionTabAccentLine,
                    compact && styles.tabAccentLineCompact,
                    isActive && styles.instructionTabAccentLineActive,
                  ]}
                />
                <Text
                  style={[
                    styles.bookmarkTabText,
                    styles.instructionBookmarkTabText,
                    compact ? styles.bookmarkTabTextCompact : styles.bookmarkTabTextDesktop,
                    isActive && styles.instructionBookmarkTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {tabLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Book Chapter / Ribbon Navigation for Weekly/Monthly */}
      {(bookId === 'weekly' || bookId === 'monthly') && reports.length > 1 && (
        <View style={styles.chapterRibbonBar}>
          <Text style={styles.chapterRibbonLabel}>
            {locale === 'zh-Hans' ? '往期回看:' : 'Volumes:'}
          </Text>
          {reports.slice(0, 5).map(rep => {
            const isSelected = selectedReport?.id === rep.id;
            let title = rep.periodKey;
            if (rep.type === 'weekly') {
              title = weekLabel(rep.periodKey, locale).title;
            } else if (rep.type === 'monthly') {
              const match = rep.periodKey.match(/(\d{4})-(\d{2})/);
              if (match) {
                title = locale === 'zh-Hans'
                  ? `${Number(match[1])}年${Number(match[2])}月`
                  : new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              }
            }
            return (
              <Pressable
                key={rep.id}
                onPress={() => { onSelectReport(rep); setSpreadIndex(0); }}
                style={[styles.chapterPill, isSelected && styles.chapterPillActive]}
              >
                <Text style={[styles.chapterPillText, isSelected && styles.chapterPillTextActive]}>
                  {title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ----------------------------------------------------------------------
// 1. INSTRUCTION BOOK BUILDER (notes)
// Rendered via instructionPages.tsx
// ----------------------------------------------------------------------
// 2. FLOWER LANGUAGE COLLECTION (collection)
// Rendered via flowerLanguagePages.tsx
// ----------------------------------------------------------------------
// 3. WEEKLY REFLECTION PAGES (weekly)
// ----------------------------------------------------------------------
function buildWeeklyPages(
  lang: AppLocale,
  report: SavedReport | null,
  details: Record<string, ReflectionReport>,
  onWriteEvent?: () => void
): PageData[] {
  const isZh = lang === 'zh-Hans';
  const detail = report ? details[report.id] ?? null : null;
  const label = report ? weekLabel(report.periodKey, lang) : null;
  const short = detail ? shortWeekly(detail) : null;
  const copy = SHORT_COPY[lang];

  const pages: PageData[] = [];

  // Page 1: Week Title, Drop Cap Summary, Bouquet illustration
  pages.push({
    pageNumber: 1,
    eyebrow: isZh ? '周度回看 · 第一章' : 'WEEKLY REFLECTION · OVERVIEW',
    render: (interactive) => {
      const summaryText = detail?.summary || (isZh ? '暂无文字摘要。' : 'No written reflection summary recorded.');
      return (
        <View style={styles.flowSection}>
          <Text style={styles.bookMainTitle}>
            {label ? `${label.title} · ${label.range}` : (isZh ? '你的周报' : 'Your Weekly Reflection')}
          </Text>
          <View style={styles.ornamentLine}>
            <View style={styles.fleuronLine} />
            <Text style={styles.fleuronSymbol}>❧</Text>
            <View style={styles.fleuronLine} />
          </View>
          <Text style={styles.storybookParagraph}>
            <Text style={styles.dropCap}>{summaryText.charAt(0)}</Text>
            {summaryText.slice(1)}
          </Text>
          <View style={styles.illustrationFrame}>
            <Image source={botanical} style={styles.inlineBotanicalArt} resizeMode="contain" />
          </View>
        </View>
      );
    },
  });

  // Page 2: Mood Petal Chart & Card
  pages.push({
    pageNumber: 2,
    eyebrow: isZh ? '情绪花瓣与洞察' : 'MOOD PETALS & CARD',
    render: (interactive) => (
      <View style={styles.flowSection}>
        <Text style={styles.subHeading}>{isZh ? '八种情绪图谱' : 'The Petal Distribution'}</Text>
        {short?.curve?.points && short.curve.points.length > 0 ? (
          <View style={styles.chartCenterBox}>
            <MoodPetalChart
              points={short.curve.points}
              names={copy.moods as Record<PrimaryMood, string>}
              label={copy.curve}
              width={180}
            />
          </View>
        ) : (
          <View style={styles.illustrationFrame}>
            <Image source={botanical} style={styles.inlineBotanicalArt} resizeMode="contain" />
          </View>
        )}
        {short?.card ? (
          <View style={styles.weeklyCardPreviewBox}>
            <Text style={styles.weeklyCardTitle}>{short.card.name}</Text>
            <Text style={styles.weeklyCardWhy}>{short.card.line}</Text>
          </View>
        ) : null}
      </View>
    ),
  });

  // Page 3: Themes & Top Topics
  pages.push({
    pageNumber: 3,
    eyebrow: isZh ? '本周主题' : 'WEEKLY THEMES',
    render: (interactive) => (
      <View style={styles.flowSection}>
        <Text style={styles.subHeading}>{isZh ? '记录的主题' : 'Recorded Themes'}</Text>
        {detail?.topTopics && detail.topTopics.length > 0 ? (
          <View style={styles.topicTagsWrap}>
            {detail.topTopics.map(t => (
              <View key={t.topic} style={styles.topicBadge}>
                <Text style={styles.topicBadgeFleuron}>❧</Text>
                <Text style={styles.topicBadgeName}>{t.topic}</Text>
                <Text style={styles.topicBadgeCount}>{t.count} {isZh ? '次' : 'entries'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.storybookParagraph}>
            {isZh ? '本周未发现突出主题。' : 'No major recurring themes noted for this week.'}
          </Text>
        )}
        <View style={styles.ornamentLine}>
          <Text style={styles.fleuronSymbol}>— ✿ —</Text>
        </View>
        {detail?.trendSignals?.topicChanges && detail.trendSignals.topicChanges.length > 0 ? (
          <View style={styles.trendChangesBlock}>
            <Text style={styles.sectionMiniTitle}>{isZh ? '主题频次变化' : 'Topic Changes'}</Text>
            {detail.trendSignals.topicChanges.map(c => (
              <Text key={c.topic} style={styles.trendRowText}>
                ❧  {c.topic}: {c.previousCount} → {c.currentCount}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    ),
  });

  // Page 4: Patterns & Question for Next Week
  pages.push({
    pageNumber: 4,
    eyebrow: isZh ? '规律与留给下周的提问' : 'PATTERNS & QUESTION',
    render: (interactive) => (
      <View style={styles.flowSection}>
        <Text style={styles.subHeading}>{isZh ? '留给下周的提问' : 'Question for Next Week'}</Text>
        {short?.question ? (
          <View style={styles.questionCardBox}>
            <Text style={styles.questionPrompt}>“{short.question}”</Text>
            {interactive && onWriteEvent && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isZh ? '写一条来回答' : 'Write an entry to answer'}
                onPress={onWriteEvent}
                style={styles.answerActionBtn}
              >
                <Text style={styles.answerActionBtnText}>
                  {isZh ? '写一条来回答 ✎' : 'Write an entry to answer ✎'}
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Text style={styles.storybookParagraph}>
            {isZh ? '继续写下心境，下周回看时便有新的探索。' : 'Keep journaling through the week ahead.'}
          </Text>
        )}
        {detail && interactive && (
          <View style={styles.aiPrivacyFooter}>
            <AiOutputReport
              kind="weekly"
              outputId={detail.id}
              title={isZh ? '举报最终内容' : 'Report final output'}
            />
          </View>
        )}
      </View>
    ),
  });

  return pages;
}

// ----------------------------------------------------------------------
// 4. MONTHLY REFLECTION PAGES (monthly)
// ----------------------------------------------------------------------
function buildMonthlyPages(
  lang: AppLocale,
  report: SavedReport | null,
  details: Record<string, ReflectionReport>
): PageData[] {
  const isZh = lang === 'zh-Hans';
  const detail = report ? details[report.id] ?? null : null;
  const monthData = detail ? monthly2(detail) : null;

  const pages: PageData[] = [];

  // Page 1: Month Title & Garden Calendar
  pages.push({
    pageNumber: 1,
    eyebrow: isZh ? '月度回看 · 卷首' : 'MONTHLY REFLECTION · CALENDAR',
    render: () => (
      <View style={styles.flowSection}>
        <Text style={styles.bookMainTitle}>
          {report ? report.periodKey : (isZh ? '你的月报' : 'Monthly Reflection')}
        </Text>
        <View style={styles.ornamentLine}>
          <View style={styles.fleuronLine} />
          <Text style={styles.fleuronSymbol}>❧</Text>
          <View style={styles.fleuronLine} />
        </View>
        <Text style={styles.storybookParagraph}>
          {detail?.summary || (isZh ? '整月的心绪与足迹，都在花园历表中盛开。' : 'The month’s garden in bloom upon the reading table.')}
        </Text>
        <View style={styles.illustrationFrame}>
          <Image source={botanical} style={styles.inlineBotanicalArt} resizeMode="contain" />
        </View>
      </View>
    ),
  });

  // Page 2: Shifts & Emotional Trajectory
  pages.push({
    pageNumber: 2,
    eyebrow: isZh ? '心绪流转与主题' : 'SHIFTS & TRAJECTORY',
    render: () => (
      <View style={styles.flowSection}>
        <Text style={styles.subHeading}>{isZh ? '本月心境变化' : 'What Shifted'}</Text>
        <Text style={styles.storybookParagraph}>
          {monthData?.headline || (isZh ? '每一段经历都在滋养着心境的花圃。' : 'Moments gathered and distilled across the month.')}
        </Text>
        {detail?.topTopics && detail.topTopics.length > 0 && (
          <View style={styles.topicTagsWrap}>
            {detail.topTopics.map(t => (
              <View key={t.topic} style={styles.topicBadge}>
                <Text style={styles.topicBadgeFleuron}>❧</Text>
                <Text style={styles.topicBadgeName}>{t.topic}</Text>
                <Text style={styles.topicBadgeCount}>{t.count} {isZh ? '次' : 'times'}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    ),
  });

  // Page 3: People of the Month
  pages.push({
    pageNumber: 3,
    eyebrow: isZh ? '本月提及的人' : 'PEOPLE & COMPANIONS',
    render: () => (
      <View style={styles.flowSection}>
        <Text style={styles.subHeading}>{isZh ? '同行的印记' : 'People of the Month'}</Text>
        {monthData?.people && monthData.people.length > 0 ? (
          <View style={styles.peopleCardsColumn}>
            {monthData.people.map(p => (
              <View key={p.word} style={styles.personCardItem}>
                <Text style={styles.personName}>❧  {p.word}</Text>
                <Text style={styles.personSnippet}>{p.count} {isZh ? '次相遇' : 'mentions'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.storybookParagraph}>
            {isZh ? '本月未特别突出提及的人名记录。' : 'No individuals prominently mentioned this month.'}
          </Text>
        )}
      </View>
    ),
  });

  // Page 4: Monthly Petal Card & Question
  pages.push({
    pageNumber: 4,
    eyebrow: isZh ? '月度花语与来月提问' : 'MONTHLY CARD & QUESTION',
    render: (interactive) => (
      <View style={styles.flowSection}>
        <Text style={styles.subHeading}>{isZh ? '留给下个月的思考' : 'Question for Next Month'}</Text>
        {monthData?.question ? (
          <View style={styles.questionCardBox}>
            <Text style={styles.questionPrompt}>“{monthData.question}”</Text>
          </View>
        ) : (
          <Text style={styles.storybookParagraph}>
            {isZh ? '愿下一月的花园更加清澈安然。' : 'May the coming month bring calm and clarity.'}
          </Text>
        )}
        <View style={styles.colophonBlock}>
          <Text style={styles.colophonSymbol}>❦</Text>
          <Text style={styles.colophonText}>
            {isZh ? '月度回看 · 终章' : 'End of Monthly Reflection'}
          </Text>
        </View>
        {detail && interactive && (
          <View style={styles.aiPrivacyFooter}>
            <AiOutputReport
              kind="monthly"
              outputId={detail.id}
              title={isZh ? '举报最终内容' : 'Report final output'}
            />
          </View>
        )}
      </View>
    ),
  });

  return pages;
}

// ----------------------------------------------------------------------
// STYLES
// ----------------------------------------------------------------------
const styles = StyleSheet.create({
  readerRoot: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'visible',
  },
  pageSurface: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F3E4C7',
    borderRadius: 6,
  },
  compactPageBackground: {
    backgroundColor: '#F3E4C7',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#C29A4A',
    boxShadow: '0 4px 14px rgba(25, 14, 5, 0.4)',
  },
  leftPageCorners: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  rightPageCorners: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  decorativeGoldBorder: {
    position: 'absolute',
    top: 18,
    bottom: 18,
    borderWidth: 1.4,
    borderColor: '#AA895188',
    borderRadius: 6,
  },
  leftGoldBorder: {
    left: 22,
    right: 14,
  },
  rightGoldBorder: {
    left: 14,
    right: 22,
  },
  spineFoldShading: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 22,
    zIndex: 2,
  },
  spineFoldLeft: {
    right: 0,
    backgroundColor: 'rgba(70, 42, 16, 0.16)',
  },
  spineFoldRight: {
    left: 0,
    backgroundColor: 'rgba(70, 42, 16, 0.16)',
  },
  foreEdgeVignette: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 14,
    zIndex: 2,
  },
  foreEdgeLeft: {
    left: 0,
    backgroundColor: 'rgba(80, 50, 20, 0.06)',
  },
  foreEdgeRight: {
    right: 0,
    backgroundColor: 'rgba(80, 50, 20, 0.06)',
  },
  pageInnerContainer: {
    flex: 1,
    paddingTop: 16,
    paddingBottom: 14,
    justifyContent: 'space-between',
  },
  pageInnerLeft: {
    paddingLeft: 34,
    paddingRight: 24,
    paddingTop: 24,
    paddingBottom: 22,
  },
  pageInnerRight: {
    paddingLeft: 24,
    paddingRight: 34,
    paddingTop: 24,
    paddingBottom: 22,
  },
  pageInnerCompact: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
  },
  pageInnerCompactCollection: {
    paddingLeft: 16,
    paddingRight: 48,
    paddingTop: 22,
    paddingBottom: 18,
  },
  blankPageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  blankPageWatermark: {
    width: '75%',
    height: '65%',
    opacity: 0.25,
  },
  leftPageShadow: {
    boxShadow: 'inset -14px 0 16px -8px rgba(70,42,16,0.35), 0 4px 12px rgba(0,0,0,0.18)',
  },
  rightPageShadow: {
    boxShadow: 'inset 14px 0 16px -8px rgba(70,42,16,0.35), 0 4px 12px rgba(0,0,0,0.18)',
  },
  turningLeafWrapper: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  backsidePaperTint: {
    backgroundColor: 'rgba(80,50,25,0.12)',
  },
  ridgeHighlight: {
    position: 'absolute',
    right: 0,
    top: 6,
    bottom: 6,
    width: 2,
    backgroundColor: '#FFF8E6',
  },
  movingLeafShadow: {
    backgroundColor: '#604322',
  },
  leftEdgeTapZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 44,
    zIndex: 15,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 6,
  },
  rightEdgeTapZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    zIndex: 15,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  edgeHintTab: {
    backgroundColor: '#EAD5B099',
    borderRadius: 14,
    width: 24,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C5A77566',
  },
  edgeHintArrow: {
    fontFamily: 'Georgia',
    fontSize: 20,
    color: '#6B5232',
  },
  pageHeader: {
    marginBottom: 8,
  },
  pageEyebrow: {
    fontFamily: 'Georgia',
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#8C6E3A',
    textTransform: 'uppercase',
  },
  pageHeaderText: {
    fontFamily: 'Georgia',
    fontSize: 13,
    color: '#554228',
    marginTop: 2,
  },
  headerRule: {
    height: 1,
    backgroundColor: '#C8B18766',
    marginTop: 6,
  },
  pageBodyContent: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  pageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#C8B18744',
  },
  navArrowBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  arrowSymbol: {
    fontFamily: 'Georgia',
    fontSize: 20,
    color: '#725332',
  },
  pageNumberText: {
    fontFamily: 'Georgia',
    fontSize: 11,
    color: '#725C42',
    textAlign: 'center',
    flex: 1,
  },
  flowSection: {
    flex: 1,
  },
  bookMainTitle: {
    fontFamily: 'Georgia',
    fontSize: 20,
    color: '#3D2A18',
    lineHeight: 26,
    fontWeight: '600',
  },
  bookSubtitle: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 12,
    color: '#6B5435',
    marginTop: 4,
  },
  subHeading: {
    fontFamily: 'Georgia',
    fontSize: 16,
    color: '#4A331E',
    fontWeight: '600',
    marginBottom: 8,
  },
  ornamentLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 10,
  },
  fleuronLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#BFA06366',
  },
  fleuronSymbol: {
    fontFamily: 'Georgia',
    fontSize: 15,
    color: '#9C7A3C',
  },
  storybookParagraph: {
    fontFamily: 'Georgia',
    fontSize: 13.5,
    lineHeight: 21,
    color: '#423220',
    marginBottom: 10,
  },
  dropCap: {
    fontSize: 28,
    lineHeight: 28,
    fontFamily: 'Georgia',
    fontWeight: '700',
    color: '#7E6131',
    paddingRight: 3,
  },
  safetyCardParchment: {
    backgroundColor: '#EAD7B288',
    borderColor: '#C8AF7A88',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  illustrationFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
  },
  inlineBotanicalArt: {
    width: '100%',
    height: 120,
    opacity: 0.88,
  },
  colophonBlock: {
    alignItems: 'center',
    marginTop: 14,
  },
  colophonSymbol: {
    fontSize: 20,
    color: '#8A6A34',
  },
  colophonText: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 11,
    color: '#785D36',
    marginTop: 4,
  },
  collectionStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#EAD5AE66',
    borderWidth: 1,
    borderColor: '#C8AF7A66',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: '700',
    color: '#553E24',
  },
  statLabel: {
    fontFamily: 'Georgia',
    fontSize: 10,
    color: '#785E3B',
    marginTop: 2,
  },
  almanacOrnamentPlate: {
    alignItems: 'center',
    marginTop: 14,
  },
  almanacQuote: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 12,
    color: '#6E5637',
    marginTop: 6,
    textAlign: 'center',
  },
  cardFlowerName: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: '600',
    color: '#3B2917',
  },
  cardDate: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 11,
    color: '#7A6240',
    marginBottom: 8,
  },
  encyclopediaCardFrame: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#E8D2A855',
    borderWidth: 1,
    borderColor: '#C2A77266',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  cardTextContent: {
    flex: 1,
  },
  cardMeaningHeading: {
    fontFamily: 'Georgia',
    fontSize: 12,
    fontWeight: '600',
    color: '#654C28',
    marginBottom: 4,
  },
  cardMeaningText: {
    fontFamily: 'Georgia',
    fontSize: 12.5,
    lineHeight: 18,
    color: '#453523',
  },
  cardKeptInsightBox: {
    backgroundColor: '#E4CC9F44',
    borderLeftWidth: 3,
    borderColor: '#987A46',
    padding: 8,
    marginTop: 10,
  },
  insightNoteLabel: {
    fontFamily: 'Georgia',
    fontSize: 11,
    fontWeight: '600',
    color: '#6E542C',
  },
  insightNoteText: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 12,
    lineHeight: 17,
    color: '#473623',
    marginTop: 2,
  },
  threadItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8D2A844',
    borderWidth: 1,
    borderColor: '#C6AC7555',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  threadTextColumn: {
    flex: 1,
  },
  threadTitle: {
    fontFamily: 'Georgia',
    fontSize: 12.5,
    color: '#3F301F',
  },
  threadDate: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 10,
    color: '#7E6643',
    marginTop: 2,
  },
  unfollowBtn: {
    backgroundColor: '#D9BE8E66',
    borderWidth: 1,
    borderColor: '#BFA06388',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unfollowBtnText: {
    fontFamily: 'Georgia',
    fontSize: 10,
    color: '#553E24',
  },
  lettersList: {
    gap: 8,
    marginBottom: 8,
  },
  letterItemCard: {
    backgroundColor: '#E8D2A844',
    borderWidth: 1,
    borderColor: '#C6AC7555',
    borderRadius: 6,
    padding: 8,
  },
  letterContent: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 12.5,
    color: '#443422',
  },
  letterMeta: {
    fontFamily: 'Georgia',
    fontSize: 10,
    color: '#7D6442',
    marginTop: 4,
  },
  mutesTagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  muteTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E4CB9B66',
    borderWidth: 1,
    borderColor: '#C2A66F77',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  muteTagText: {
    fontFamily: 'Georgia',
    fontSize: 11,
    color: '#4F3C24',
  },
  muteTagRemove: {
    paddingHorizontal: 2,
  },
  muteTagRemoveText: {
    fontSize: 13,
    color: '#7E6136',
  },
  emptyNotice: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 12,
    color: '#7D6745',
    marginVertical: 10,
  },
  sectionMiniTitle: {
    fontFamily: 'Georgia',
    fontSize: 11.5,
    letterSpacing: 1,
    color: '#7D643B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  chartCenterBox: {
    alignItems: 'center',
    marginVertical: 6,
  },
  weeklyCardPreviewBox: {
    backgroundColor: '#E8D4AE55',
    borderWidth: 1,
    borderColor: '#C8AE7766',
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
  },
  weeklyCardTitle: {
    fontFamily: 'Georgia',
    fontSize: 13,
    fontWeight: '600',
    color: '#45331F',
  },
  weeklyCardWhy: {
    fontFamily: 'Georgia',
    fontSize: 11.5,
    color: '#554228',
    marginTop: 3,
  },
  topicTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 8,
  },
  topicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6D0A355',
    borderWidth: 1,
    borderColor: '#C6AC7566',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  topicBadgeFleuron: {
    fontSize: 13,
    color: '#7E6334',
  },
  topicBadgeName: {
    fontFamily: 'Georgia',
    fontSize: 11.5,
    color: '#45331E',
  },
  topicBadgeCount: {
    fontFamily: 'Georgia',
    fontSize: 10,
    color: '#7F6643',
  },
  trendChangesBlock: {
    marginTop: 8,
  },
  trendRowText: {
    fontFamily: 'Georgia',
    fontSize: 11.5,
    lineHeight: 18,
    color: '#524029',
  },
  questionCardBox: {
    backgroundColor: '#E8D2A855',
    borderWidth: 1,
    borderColor: '#C8AF7977',
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    alignItems: 'center',
  },
  questionPrompt: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: '#423220',
    textAlign: 'center',
  },
  answerActionBtn: {
    marginTop: 10,
    backgroundColor: '#3E5742',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  answerActionBtnText: {
    fontFamily: 'Georgia',
    fontSize: 11.5,
    color: '#FFF8EA',
    fontWeight: '600',
  },
  aiPrivacyFooter: {
    marginTop: 8,
    alignItems: 'center',
  },
  peopleCardsColumn: {
    gap: 6,
    marginVertical: 6,
  },
  personCardItem: {
    backgroundColor: '#E8D4AE44',
    borderWidth: 1,
    borderColor: '#C7AD7655',
    borderRadius: 6,
    padding: 8,
  },
  personName: {
    fontFamily: 'Georgia',
    fontSize: 12.5,
    fontWeight: '600',
    color: '#453320',
  },
  personSnippet: {
    fontFamily: 'Georgia',
    fontSize: 11.5,
    color: '#5E4A31',
    marginTop: 2,
  },
  closeBookBtn: {
    position: 'absolute',
    zIndex: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3E7CCD9',
    borderWidth: 1,
    borderColor: '#BFA36D99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBookBtnText: {
    fontSize: 14,
    color: '#5E4B33',
    fontWeight: '600',
  },
  chapterRibbonBar: {
    position: 'absolute',
    top: -26,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chapterRibbonLabel: {
    fontFamily: 'Georgia',
    fontSize: 11,
    color: '#A08151',
  },
  chapterPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#EEDCBA88',
    borderWidth: 1,
    borderColor: '#C8AD7866',
  },
  chapterPillActive: {
    backgroundColor: '#4A3B28',
    borderColor: '#3D2F1E',
  },
  chapterPillText: {
    fontFamily: 'Georgia',
    fontSize: 10,
    color: '#5E492F',
  },
  chapterPillTextActive: {
    color: '#FFF6E2',
    fontWeight: '600',
  },

  // Bookmarks Layout & Styling (Unified, Neat Column Alignment)
  bookmarksContainer: {
    position: 'absolute',
    zIndex: 25,
  },
  bookmarksDesktop: {
    left: '100%',
    width: 76,
  },
  bookmarksCompact: {
    right: 2,
    width: 46,
  },
  bookmarkTab: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#DEC595',
    borderColor: '#A88752',
    borderWidth: 1,
    boxShadow: '2px 2px 5px rgba(50, 30, 12, 0.22)',
    position: 'relative',
  },
  bookmarkTabDesktop: {
    height: 38,
    marginVertical: 2,
    paddingLeft: 10,
    paddingRight: 6,
    borderLeftWidth: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  bookmarkTabCompact: {
    height: 30,
    marginVertical: 2,
    paddingLeft: 6,
    paddingRight: 3,
    borderRadius: 4,
    borderLeftWidth: 1,
  },
  bookmarkTabActiveDesktop: {
    backgroundColor: '#F7E8C6',
    borderColor: '#7A5B2B',
    boxShadow: '2px 2px 6px rgba(40, 20, 8, 0.32)',
  },
  bookmarkTabActiveCompact: {
    backgroundColor: '#F7E8C6',
    borderColor: '#7A5B2B',
    boxShadow: '2px 2px 5px rgba(40, 20, 8, 0.28)',
  },
  tabAccentLine: {
    position: 'absolute',
    left: 4.5,
    top: '20%',
    bottom: '20%',
    width: 2.5,
    backgroundColor: '#B59458',
    borderRadius: 1.5,
  },
  tabAccentLineCompact: {
    left: 2.5,
    width: 2,
  },
  tabAccentLineActive: {
    backgroundColor: '#8C672E',
  },
  bookmarkTabText: {
    fontFamily: 'Georgia',
    color: '#4B351E',
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  bookmarkTabTextDesktop: {
    fontSize: 10,
    letterSpacing: 0.15,
  },
  bookmarkTabTextCompact: {
    fontSize: 7.5,
    letterSpacing: 0,
  },
  bookmarkTabTextActive: {
    color: '#2E1E0F',
    fontWeight: '700',
  },

  // Instruction Bookmarks (Purple & Antique Gold)
  instructionBookmarkTab: {
    backgroundColor: '#EAE1EE',
    borderColor: '#9E85A5',
    boxShadow: '2px 2px 5px rgba(50, 20, 52, 0.22)',
  },
  instructionBookmarkTabActiveDesktop: {
    backgroundColor: '#5C3864',
    borderColor: '#CBA768',
    boxShadow: '2px 2px 6px rgba(35, 12, 38, 0.35)',
  },
  instructionBookmarkTabActiveCompact: {
    backgroundColor: '#5C3864',
    borderColor: '#CBA768',
    boxShadow: '2px 2px 5px rgba(35, 12, 38, 0.3)',
  },
  instructionTabAccentLine: {
    backgroundColor: '#6C4772',
  },
  instructionTabAccentLineActive: {
    backgroundColor: '#E5C77A',
  },
  instructionBookmarkTabText: {
    color: '#4B344F',
    textAlign: 'center',
    width: '100%',
  },
  instructionBookmarkTabTextActive: {
    color: '#FFF8F0',
    fontWeight: '700',
  },
});
