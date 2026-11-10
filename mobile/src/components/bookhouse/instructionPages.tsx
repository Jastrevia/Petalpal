import React from 'react';
import { View, Text, StyleSheet, Image, Platform, Pressable, Linking } from 'react-native';
import type { AppLocale } from '../../services/locale';
import { FLOWER_ASSETS } from '../../data/flowerAssets';

const instructionManualJson = require('../../data/instructionManual.json');
const botanical = require('../../../assets/reflection/botanical.webp');

// Book cover miniatures for Guide-05
const bookCovers = {
  collection: require('../../../assets/reflection/pavilion-cover-collection-hd.webp'),
  weekly: require('../../../assets/reflection/pavilion-cover-weekly-hd.webp'),
  notes: require('../../../assets/reflection/pavilion-cover-notes-hd.webp'),
  monthly: require('../../../assets/reflection/pavilion-cover-monthly-hd.webp'),
};

// Mailbox stamp for Guide-07
const petalpalStamp = require('../../../assets/mailbox/petalpal_stamp.jpg');

export interface InstructionPageData {
  pageNumber: number;
  header?: string;
  eyebrow?: string;
  chapterId: string;
  pageId: string;
  render: (interactive: boolean) => React.ReactNode;
}

export interface InstructionBookmarkCategory {
  id: string;
  label: { en: string; 'zh-Hans': string };
}

export const INSTRUCTION_BOOKMARK_CATEGORIES: InstructionBookmarkCategory[] = [
  { id: 'welcome', label: { en: 'Welcome', 'zh-Hans': '欢迎' } },
  { id: 'guide', label: { en: 'Guide', 'zh-Hans': '指南' } },
  { id: 'reflection', label: { en: 'Reflection', 'zh-Hans': '回顾' } },
  { id: 'ai-policy', label: { en: 'AI Policy', 'zh-Hans': 'AI 原则' } },
  { id: 'privacy', label: { en: 'Privacy', 'zh-Hans': '隐私' } },
  { id: 'wellbeing', label: { en: 'Wellbeing', 'zh-Hans': '身心支持' } },
  { id: 'help', label: { en: 'Help', 'zh-Hans': '帮助' } },
];

// Curated botanical flower keys matching the mood and theme of each content page
const CONTENT_FLOWER_KEYS: Record<string, string> = {
  'welcome-02': 'flower-clover.png',
  'guide-02': 'flower-buttercup.png',
  'guide-03': 'flower-forget-me-not.png',
  'guide-04': 'flower-jasmine.png',
  'guide-06': 'flower-sunflower.png',
  'guide-08': 'flower-iris.png',
  'reflection-02': 'flower-camellia.png',
  'reflection-03': 'flower-amaryllis.png',
  'reflection-04': 'flower-alyssum.png',
  'ai-02': 'flower-clematis.png',
  'ai-03': 'flower-daffodil.png',
  'privacy-02': 'flower-lavender.png',
  'privacy-03': 'flower-morning-glory.png',
  'wellbeing-02': 'flower-lily-of-the-valley.png',
  'help-02': 'flower-cornflower.png',
};

export function buildInstructionPages(
  lang: AppLocale,
  compact: boolean
): {
  pages: InstructionPageData[];
  chapterPageMap: Record<string, number>;
  chapterRanges: Array<{ id: string; startPage: number; endPage: number }>;
} {
  const isZh = lang === 'zh-Hans';
  const localeKey = isZh ? 'zh-Hans' : 'en';
  const pages: InstructionPageData[] = [];
  const chapterPageMap: Record<string, number> = {};
  const chapterRanges: Array<{ id: string; startPage: number; endPage: number }> = [];

  const sections = (instructionManualJson.sections as any[]) || [];

  sections.forEach((section) => {
    const startPage = pages.length + 1;
    chapterPageMap[section.id] = startPage;

    (section.pages as any[]).forEach((pageItem) => {
      const pageNum = pages.length + 1;
      const isChapterPage = pageItem.type === 'chapter';

      const eyebrowText = pageItem.eyebrow?.[localeKey] || '';
      const titleText = pageItem.title?.[localeKey] || '';
      const paragraphs: string[] = pageItem.paragraphs?.[localeKey] || [];
      const items: string[] = pageItem.items?.[localeKey] || [];
      const pageId: string = pageItem.id;

      pages.push({
        pageNumber: pageNum,
        eyebrow: eyebrowText,
        chapterId: section.id,
        pageId,
        render: () => {
          if (isChapterPage) {
            return (
              <View style={[styles.pageRoot, compact && styles.pageRootCompact]}>
                {/* Chapter Title Group */}
                <View style={[styles.chapterHeaderGroup, compact && styles.chapterHeaderGroupCompact]}>
                  <Text style={[styles.chapterTitleText, compact && styles.chapterTitleTextCompact]}>
                    {titleText}
                  </Text>
                </View>

                {/* Botanical Fleuron Divider */}
                <View style={[styles.ornamentLine, compact && styles.ornamentLineCompact]}>
                  <View style={styles.fleuronLine} />
                  <Text style={styles.fleuronSymbol}>❦</Text>
                  <View style={styles.fleuronLine} />
                </View>

                {/* Chapter Paragraphs */}
                <View style={styles.paragraphsContainer}>
                  {paragraphs.map((pText, pIdx) => (
                    <Text
                      key={`p-${pIdx}`}
                      style={[
                        styles.storybookParagraph,
                        compact && styles.storybookParagraphCompact,
                        pIdx > 0 && styles.paragraphSpacing,
                      ]}
                    >
                      {pText}
                    </Text>
                  ))}
                </View>

                {/* Elegant Antique Botanical Vignette at Bottom */}
                <View style={[styles.chapterVignetteContainer, compact && styles.chapterVignetteCompact]}>
                  <Image
                    source={botanical}
                    style={styles.chapterVignetteArt}
                    resizeMode="contain"
                    accessible={false}
                  />
                </View>
              </View>
            );
          }

          // Content Page
          const flowerKey = CONTENT_FLOWER_KEYS[pageId];
          const flowerAsset = flowerKey ? FLOWER_ASSETS[flowerKey] : null;

          return (
            <View style={[styles.pageRoot, compact && styles.pageRootCompact]}>
              {/* Content Page Title */}
              <View style={[styles.contentHeaderGroup, compact && styles.contentHeaderGroupCompact]}>
                <Text style={[styles.contentTitleText, compact && styles.contentTitleTextCompact]}>
                  {titleText}
                </Text>
                <View style={styles.subtleRule} />
              </View>

              {/* Body Paragraphs */}
              <View style={styles.paragraphsContainer}>
                {pageId === 'help-02' ? (
                  <>
                    {/* Paragraph 1 */}
                    {paragraphs[0] && (
                      <Text style={[styles.storybookParagraph, compact && styles.storybookParagraphCompact]}>
                        {paragraphs[0]}
                      </Text>
                    )}
                    {/* Paragraph 2: Lead-in to email */}
                    {paragraphs[1] && (
                      <Text style={[styles.storybookParagraph, compact && styles.storybookParagraphCompact, styles.paragraphSpacing]}>
                        {paragraphs[1]}
                      </Text>
                    )}

                    {/* Prominent, clickable contact email address with subtle gold/dark-brown underlined lettering */}
                    <View style={[styles.emailContainer, compact && styles.emailContainerCompact]}>
                      <Pressable
                        testID="instruction-contact-email"
                        accessibilityRole="link"
                        accessibilityLabel={isZh ? "发送邮件至 contact@jastrevia.com" : "Email contact@jastrevia.com"}
                        accessibilityHint={isZh ? "使用默认邮件客户端打开" : "Opens default email application"}
                        onPress={() => {
                          Linking.openURL('mailto:contact@jastrevia.com').catch(() => {});
                        }}
                        style={({ pressed }) => [
                          styles.emailLinkWrapper,
                          pressed && styles.emailLinkPressed,
                        ]}
                      >
                        <Text style={styles.emailFleuron}>✉</Text>
                        <Text style={[styles.emailLinkText, compact && styles.emailLinkTextCompact]}>
                          contact@jastrevia.com
                        </Text>
                      </Pressable>
                    </View>

                    {/* Paragraph 3: Privacy and screenshot advice */}
                    {paragraphs[2] && (
                      <Text style={[styles.storybookParagraph, compact && styles.storybookParagraphCompact, styles.paragraphSpacing]}>
                        {paragraphs[2]}
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    {paragraphs.map((pText, pIdx) => (
                      <Text
                        key={`p-${pIdx}`}
                        style={[
                          styles.storybookParagraph,
                          compact && styles.storybookParagraphCompact,
                          pIdx > 0 && styles.paragraphSpacing,
                        ]}
                      >
                        {pText}
                      </Text>
                    ))}

                    {/* Bullet List Items (e.g. Guide-02 steps) */}
                    {items.length > 0 && (
                      <View style={[styles.itemsListContainer, compact && styles.itemsListContainerCompact]}>
                        {items.map((itemText, iIdx) => (
                          <View key={`item-${iIdx}`} style={styles.itemRow}>
                            <Text style={styles.itemBullet}>❖</Text>
                            <Text style={[styles.itemText, compact && styles.itemTextCompact]}>
                              {itemText}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>

              {/* Special Graphic Illustrations for Specific Pages */}
              {pageId === 'guide-05' ? (
                /* Four Books in Order */
                <View style={[styles.fourBooksContainer, compact && styles.fourBooksContainerCompact]}>
                  <View style={styles.miniBookItem}>
                    <Image source={bookCovers.collection} style={compact ? styles.miniBookCoverCompact : styles.miniBookCover} resizeMode="contain" />
                    <Text style={[styles.miniBookLabel, compact && styles.miniBookLabelCompact]}>
                      {isZh ? '花语集' : 'Collection'}
                    </Text>
                  </View>
                  <View style={styles.miniBookItem}>
                    <Image source={bookCovers.weekly} style={compact ? styles.miniBookCoverCompact : styles.miniBookCover} resizeMode="contain" />
                    <Text style={[styles.miniBookLabel, compact && styles.miniBookLabelCompact]}>
                      {isZh ? '周回顾' : 'Weekly'}
                    </Text>
                  </View>
                  <View style={styles.miniBookItem}>
                    <Image source={bookCovers.notes} style={compact ? styles.miniBookCoverCompact : styles.miniBookCover} resizeMode="contain" />
                    <Text style={[styles.miniBookLabel, compact && styles.miniBookLabelCompact]}>
                      {isZh ? '说明书' : 'Instruction'}
                    </Text>
                  </View>
                  <View style={styles.miniBookItem}>
                    <Image source={bookCovers.monthly} style={compact ? styles.miniBookCoverCompact : styles.miniBookCover} resizeMode="contain" />
                    <Text style={[styles.miniBookLabel, compact && styles.miniBookLabelCompact]}>
                      {isZh ? '月回顾' : 'Monthly'}
                    </Text>
                  </View>
                </View>
              ) : pageId === 'guide-07' ? (
                /* Postage Stamp Illustration */
                <View style={[styles.stampContainer, compact && styles.stampContainerCompact]}>
                  <View style={styles.stampOuterFrame}>
                    <Image source={petalpalStamp} style={compact ? styles.stampImageCompact : styles.stampImage} resizeMode="contain" />
                  </View>
                </View>
              ) : flowerAsset ? (
                /* Botanical Specimen Illustration */
                <View style={[styles.contentFlowerContainer, compact && styles.contentFlowerCompact]}>
                  <Image
                    source={flowerAsset}
                    style={compact ? styles.contentFlowerArtCompact : styles.contentFlowerArt}
                    resizeMode="contain"
                    accessible={false}
                  />
                </View>
              ) : (
                /* Fallback Subtle Fleuron Flourish */
                <View style={styles.fallbackOrnamentContainer}>
                  <Text style={styles.fleuronSymbolSmall}>❧ ❦ ☙</Text>
                </View>
              )}
            </View>
          );
        },
      });
    });

    const endPage = pages.length;
    chapterRanges.push({ id: section.id, startPage, endPage });
  });

  return { pages, chapterPageMap, chapterRanges };
}

const serifFontFamily = Platform.select({
  web: "Georgia, 'Songti SC', 'Source Han Serif SC', 'Noto Serif CJK SC', serif",
  default: 'Georgia',
});

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  pageRootCompact: {
    paddingVertical: 2,
  },

  // Chapter Introduction Header
  chapterHeaderGroup: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  chapterHeaderGroupCompact: {
    marginTop: 2,
    marginBottom: 2,
  },
  chapterTitleText: {
    fontFamily: serifFontFamily,
    fontSize: 23,
    lineHeight: 29,
    color: '#2E1E12',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  chapterTitleTextCompact: {
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: 0.3,
  },

  // Content Page Header
  contentHeaderGroup: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  contentHeaderGroupCompact: {
    marginTop: 2,
    marginBottom: 2,
  },
  contentTitleText: {
    fontFamily: serifFontFamily,
    fontSize: 20,
    lineHeight: 25,
    color: '#342211',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  contentTitleTextCompact: {
    fontSize: 16.5,
    lineHeight: 21,
    letterSpacing: 0.2,
  },
  subtleRule: {
    width: 60,
    height: 1,
    backgroundColor: '#C5A87688',
    marginTop: 6,
    marginBottom: 2,
  },

  // Botanical Fleuron Divider
  ornamentLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    gap: 10,
  },
  ornamentLineCompact: {
    marginVertical: 4,
    gap: 8,
  },
  fleuronLine: {
    width: 36,
    height: 1,
    backgroundColor: '#B5945888',
  },
  fleuronSymbol: {
    fontFamily: serifFontFamily,
    fontSize: 15,
    color: '#9C7A41',
  },
  fleuronSymbolSmall: {
    fontFamily: serifFontFamily,
    fontSize: 13,
    color: '#A68854',
    letterSpacing: 4,
  },

  // Paragraphs
  paragraphsContainer: {
    paddingHorizontal: 8,
    marginVertical: 2,
  },
  storybookParagraph: {
    fontFamily: serifFontFamily,
    fontSize: 13.5,
    lineHeight: 21.5,
    color: '#3E2E20',
    textAlign: 'justify',
    letterSpacing: 0.15,
  },
  storybookParagraphCompact: {
    fontSize: 11.5,
    lineHeight: 17,
    letterSpacing: 0,
  },
  paragraphSpacing: {
    marginTop: 8,
  },

  // Contact Email Inscription (Help-02)
  emailContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C5A87655',
    backgroundColor: '#F5EEDB55',
  },
  emailContainerCompact: {
    marginVertical: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  emailLinkWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emailFleuron: {
    fontSize: 14,
    color: '#8C672E',
  },
  emailLinkText: {
    fontFamily: serifFontFamily,
    fontSize: 15.5,
    lineHeight: 22,
    color: '#3E2A18',
    fontWeight: '700',
    letterSpacing: 0.6,
    textDecorationLine: 'underline',
    textDecorationColor: '#B59458',
  },
  emailLinkTextCompact: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  emailLinkPressed: {
    opacity: 0.6,
  },

  // Bullet Lists (Guide-02)
  itemsListContainer: {
    marginTop: 8,
    paddingLeft: 6,
    gap: 4,
  },
  itemsListContainerCompact: {
    marginTop: 4,
    gap: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  itemBullet: {
    fontSize: 9,
    color: '#9C7A41',
    marginTop: 4,
  },
  itemText: {
    fontFamily: serifFontFamily,
    fontSize: 12.5,
    lineHeight: 18.5,
    color: '#423223',
    flex: 1,
  },
  itemTextCompact: {
    fontSize: 11,
    lineHeight: 15.5,
  },

  // Chapter Bottom Vignette (botanical engraving)
  // The illustrations take the room the words leave (up to their full size), so a long page never pushes its words
  // or its picture past the page number.
  chapterVignetteContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flexBasis: 95,
    maxHeight: 95,
    minHeight: 0,
    flexShrink: 1,
    marginTop: 4,
    opacity: 0.82,
  },
  chapterVignetteCompact: {
    height: 60,
    marginTop: 2,
  },
  chapterVignetteArt: {
    width: '75%',
    height: '100%',
  },

  // Flower Specimen Vignette
  contentFlowerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flexBasis: 90,
    maxHeight: 90,
    minHeight: 0,
    flexShrink: 1,
    marginTop: 4,
    opacity: 0.9,
  },
  contentFlowerCompact: {
    height: 55,
    marginTop: 2,
  },
  contentFlowerArt: {
    height: '100%',
    maxHeight: 80,
    aspectRatio: 1,
  },
  contentFlowerArtCompact: {
    width: 50,
    height: 50,
  },

  // Four Books in Guide-05
  fourBooksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 90,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  fourBooksContainerCompact: {
    height: 60,
    marginTop: 2,
  },
  miniBookItem: {
    alignItems: 'center',
    flex: 1,
  },
  miniBookCover: {
    width: 44,
    height: 58,
    borderRadius: 3,
  },
  miniBookCoverCompact: {
    width: 32,
    height: 42,
    borderRadius: 2,
  },
  miniBookLabel: {
    fontFamily: serifFontFamily,
    fontSize: 9.5,
    color: '#5C442A',
    marginTop: 3,
    textAlign: 'center',
  },
  miniBookLabelCompact: {
    fontSize: 7.5,
    marginTop: 1,
  },

  // Stamp in Guide-07
  stampContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 90,
    marginTop: 4,
  },
  stampContainerCompact: {
    height: 55,
    marginTop: 2,
  },
  stampOuterFrame: {
    padding: 3,
    backgroundColor: '#F3ECE0',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#C8B084',
    boxShadow: '1px 2px 5px rgba(60, 40, 20, 0.18)',
  },
  stampImage: {
    width: 65,
    height: 75,
    borderRadius: 2,
  },
  stampImageCompact: {
    width: 42,
    height: 48,
    borderRadius: 1,
  },

  // Fallback ornament
  fallbackOrnamentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flexBasis: 30,
    minHeight: 0,
    flexShrink: 1,
  },
});
