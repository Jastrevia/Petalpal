import React from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';
import type { AppLocale } from '../../services/locale';
import { FLOWER_ASSETS } from '../../data/flowerAssets';
const flowerCollectionJson = require('../../data/flowerLanguageCollection.json');

const botanical = require('../../../assets/reflection/botanical.png');

export interface CollectionPageData {
  pageNumber: number;
  header?: string;
  eyebrow?: string;
  categoryId: string;
  render: (interactive: boolean) => React.ReactNode;
}

export interface BookmarkCategory {
  id: string;
  label: { en: string; 'zh-Hans': string };
}

export const BOOKMARK_CATEGORIES: BookmarkCategory[] = [
  { id: 'happy', label: { en: 'Happy', 'zh-Hans': '快乐' } },
  { id: 'anger', label: { en: 'Anger', 'zh-Hans': '愤怒' } },
  { id: 'anxiety', label: { en: 'Anxiety', 'zh-Hans': '焦虑' } },
  { id: 'calm', label: { en: 'Calm', 'zh-Hans': '平静' } },
  { id: 'love', label: { en: 'Love', 'zh-Hans': '关爱' } },
  { id: 'sad', label: { en: 'Sad', 'zh-Hans': '悲伤' } },
  { id: 'surprise', label: { en: 'Surprise', 'zh-Hans': '惊喜' } },
  { id: 'tiredness', label: { en: 'Tiredness', 'zh-Hans': '疲惫' } },
];

export function buildFlowerLanguageCollectionPages(
  lang: AppLocale,
  compact: boolean
): {
  pages: CollectionPageData[];
  categoryPageMap: Record<string, number>;
  categoryRanges: Array<{ id: string; startPage: number; endPage: number }>;
} {
  const isZh = lang === 'zh-Hans';
  const localeKey = isZh ? 'zh' : 'en';
  const pages: CollectionPageData[] = [];
  const categoryPageMap: Record<string, number> = {};
  const categoryRanges: Array<{ id: string; startPage: number; endPage: number }> = [];

  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

  (flowerCollectionJson.categories as any[]).forEach((category, catIdx) => {
    const startPage = pages.length + 1;
    categoryPageMap[category.id] = startPage;

    (category.pages as any[]).forEach((pageItem) => {
      const pageNum = pages.length + 1;

      if (pageItem.type === 'category') {
        const roman = romanNumerals[catIdx] || String(catIdx + 1);
        const chapterEyebrow = isZh
          ? `第 ${catIdx + 1} 章 · 卷首`
          : `CHAPTER ${roman} · INTRODUCTION`;

        const titleText = pageItem.title?.[localeKey] ?? category.title?.[localeKey] ?? '';
        const moodsText =
          typeof pageItem.moods?.[localeKey] === 'string'
            ? pageItem.moods[localeKey]
            : Array.isArray(category.moods?.[localeKey])
            ? category.moods[localeKey].join(' · ')
            : '';
        const introText = pageItem.intro?.[localeKey] ?? category.intro?.[localeKey] ?? '';

        pages.push({
          pageNumber: pageNum,
          eyebrow: chapterEyebrow,
          categoryId: category.id,
          render: () => (
            <View style={[styles.pageRoot, compact && styles.pageRootCompact]}>
              {/* Category Header */}
              <View style={styles.catHeaderGroup}>
                <Text style={[styles.catMainTitle, compact && styles.catMainTitleCompact]}>
                  {titleText}
                </Text>
                <Text style={[styles.catMoodsText, compact && styles.catMoodsTextCompact]}>
                  {moodsText}
                </Text>
              </View>

              {/* Botanical Fleuron Divider */}
              <View style={styles.ornamentLine}>
                <View style={styles.fleuronLine} />
                <Text style={styles.fleuronSymbol}>❦</Text>
                <View style={styles.fleuronLine} />
              </View>

              {/* Introductory Paragraph */}
              <Text style={[styles.catIntroParagraph, compact && styles.catIntroParagraphCompact]}>
                {introText}
              </Text>

              {/* Subtle Botanical Decoration at Bottom */}
              <View style={[styles.catVignetteContainer, compact && styles.catVignetteCompact]}>
                <Image
                  source={botanical}
                  style={styles.catVignetteArt}
                  resizeMode="contain"
                  accessible={false}
                />
              </View>
            </View>
          ),
        });
      } else if (pageItem.type === 'flower') {
        const flower = pageItem;
        const assetSource = FLOWER_ASSETS[flower.imageFile];
        const flowerEyebrow = isZh
          ? `花语典籍 · 第 ${pageNum} 页`
          : `BOTANICAL SPECIMEN · FOLIO ${pageNum}`;

        const nameText = flower.name?.[localeKey] ?? flower.flowerId;
        const meaningText = flower.meaning?.[localeKey] ?? '';
        const descText = flower.description?.[localeKey] ?? '';

        pages.push({
          pageNumber: pageNum,
          eyebrow: flowerEyebrow,
          categoryId: category.id,
          render: () => (
            <View style={[styles.pageRoot, compact && styles.pageRootCompact]}>
              {/* Top: Flower name in elegant serif typography */}
              <View style={styles.flowerHeaderBlock}>
                <Text
                  style={[styles.flowerNameText, compact && styles.flowerNameCompact]}
                  numberOfLines={1}
                >
                  {nameText}
                </Text>
                <View style={styles.flowerHeaderRule} />
              </View>

              {/* Center: Large, high-quality botanical illustration using original transparent PNG */}
              <View style={[styles.flowerImageFrame, compact && styles.flowerImageFrameCompact]}>
                {assetSource ? (
                  <Image
                    source={assetSource}
                    style={styles.flowerImage}
                    resizeMode="contain"
                    accessible
                    accessibilityLabel={nameText}
                  />
                ) : (
                  <Text style={styles.missingAssetNotice}>
                    Missing image: {flower.imageFile}
                  </Text>
                )}
              </View>

              {/* Below: Flower language / symbolic meanings */}
              <View style={styles.flowerMeaningBlock}>
                <View style={styles.meaningLabelRow}>
                  <Text style={styles.meaningFleuron}>❧</Text>
                  <Text style={[styles.meaningLabelText, compact && styles.meaningLabelCompact]}>
                    {isZh ? '花语寄意' : 'The Language of Flowers'}
                  </Text>
                  <Text style={styles.meaningFleuron}>❧</Text>
                </View>
                <Text
                  style={[styles.meaningValueText, compact && styles.meaningValueCompact]}
                  numberOfLines={2}
                >
                  {meaningText}
                </Text>
              </View>

              {/* Bottom: Short descriptive paragraph */}
              <View style={styles.flowerDescBlock}>
                <Text
                  style={[styles.flowerDescText, compact && styles.flowerDescCompact]}
                  numberOfLines={3}
                >
                  {descText}
                </Text>
              </View>
            </View>
          ),
        });
      }
    });

    const endPage = pages.length;
    categoryRanges.push({ id: category.id, startPage, endPage });
  });

  return { pages, categoryPageMap, categoryRanges };
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  pageRootCompact: {
    paddingVertical: 2,
  },

  // Category Introduction Styles
  catHeaderGroup: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 6,
  },
  catMainTitle: {
    fontFamily: 'Georgia',
    fontSize: 27,
    lineHeight: 33,
    color: '#342211',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.8,
  },
  catMainTitleCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  catMoodsText: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 14.5,
    color: '#76562E',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  catMoodsTextCompact: {
    fontSize: 13,
    marginTop: 4,
  },
  ornamentLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
    gap: 12,
  },
  fleuronLine: {
    width: 44,
    height: 1,
    backgroundColor: '#B5945888',
  },
  fleuronSymbol: {
    fontFamily: 'Georgia',
    fontSize: 16,
    color: '#9C7A41',
  },
  catIntroParagraph: {
    fontFamily: 'Georgia',
    fontSize: 15.5,
    lineHeight: 26,
    color: '#43311E',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginVertical: 6,
  },
  catIntroParagraphCompact: {
    fontSize: 13.5,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  catVignetteContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
    marginTop: 8,
    opacity: 0.85,
  },
  catVignetteCompact: {
    height: 90,
    marginTop: 4,
  },
  catVignetteArt: {
    width: '80%',
    height: '100%',
  },

  // Flower Individual Page Styles
  flowerHeaderBlock: {
    alignItems: 'center',
    paddingTop: 2,
    marginBottom: 4,
  },
  flowerNameText: {
    fontFamily: 'Georgia',
    fontSize: 23,
    lineHeight: 28,
    color: '#332110',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  flowerNameCompact: {
    fontSize: 19,
    lineHeight: 24,
  },
  flowerHeaderRule: {
    width: 52,
    height: 1,
    backgroundColor: '#B5945866',
    marginTop: 5,
  },
  flowerImageFrame: {
    flex: 1,
    minHeight: 140,
    maxHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    paddingHorizontal: 8,
  },
  flowerImageFrameCompact: {
    minHeight: 120,
    maxHeight: 190,
    marginVertical: 4,
    paddingHorizontal: 4,
  },
  flowerImage: {
    width: '100%',
    height: '100%',
  },
  missingAssetNotice: {
    fontFamily: 'Georgia',
    fontSize: 13,
    color: '#B23A3A',
    fontStyle: 'italic',
  },
  flowerMeaningBlock: {
    alignItems: 'center',
    marginVertical: 4,
    paddingHorizontal: 8,
  },
  meaningLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  meaningFleuron: {
    fontFamily: 'Georgia',
    fontSize: 11,
    color: '#9C7A41',
  },
  meaningLabelText: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#846231',
    textTransform: 'uppercase',
  },
  meaningLabelCompact: {
    fontSize: 10.5,
  },
  meaningValueText: {
    fontFamily: 'Georgia',
    fontSize: 14.5,
    lineHeight: 21,
    color: '#332110',
    fontWeight: '600',
    textAlign: 'center',
  },
  meaningValueCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  flowerDescBlock: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#CBB48A33',
    alignItems: 'center',
  },
  flowerDescText: {
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    fontSize: 13.5,
    lineHeight: 20,
    color: '#4B3824',
    textAlign: 'center',
  },
  flowerDescCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
});
