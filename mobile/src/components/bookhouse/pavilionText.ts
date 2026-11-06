import type { AppLocale } from '../../services/locale';
import type { PavilionBookId } from './pavilionMotion';

// Uses the same preferredLocale as every other PetalPal screen.
export const PAVILION_TEXT: Record<AppLocale, { instruction: string; titles: Record<PavilionBookId, string> }> = {
  en: { instruction: 'Select a book from the shelf to open', titles: {
    weekly: 'Weekly', monthly: 'Monthly', notes: 'Instruction', collection: 'Flower Language Collection',
  } },
  'zh-Hans': { instruction: '点击书架上的书打开', titles: {
    weekly: '每周回顾', monthly: '每月回顾', notes: '使用指南', collection: '花语集',
  } },
};
export function pavilionTitleLines(id: PavilionBookId, locale: AppLocale, onCover = false) {
  if (!onCover && locale === 'zh-Hans') return [{ weekly: '周回顾', monthly: '月回顾', notes: '说明书', collection: '花语集' }[id]];
  if (id === 'collection' && locale === 'en') return onCover ? ['Flower Language', 'Collection'] : ['Flower', 'Language'];
  return [PAVILION_TEXT[locale].titles[id]];
}
