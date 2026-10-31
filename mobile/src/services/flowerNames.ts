// Flower names and meanings come from the server in English (data/flowerDB.js). Every screen shows
// them through these, so a zh-Hans owner never sees an English flower. Unknown names stay as they are.
const NAMES: Record<string, string> = {
  Sunflower: '向日葵', 'Gerbera Daisy': '非洲菊', Coreopsis: '金鸡菊', Daisy: '雏菊', Hydrangea: '绣球花', Bluebell: '蓝铃花',
  Anemone: '银莲花', Heather: '石楠花', Chamomile: '洋甘菊', Snowdrop: '雪花莲', Poppy: '虞美人', Petunia: '矮牵牛', Gentian: '龙胆花',
  Tulip: '郁金香', 'Bird of Paradise': '天堂鸟', 'Yellow Daffodil': '黄水仙', 'White Rose': '白玫瑰', Dandelion: '蒲公英', Aster: '紫菀',
  'Yellow Rapeseed Flower': '油菜花', Lavender: '薰衣草', 'Chinese Violet Cress': '二月兰', Olive: '橄榄花', 'Blue Rose': '蓝玫瑰',
  Lotus: '莲花', 'Cherry Blossom': '樱花', 'Garden Flower': '花园里的花',
};
const MEANINGS: Record<string, string> = {
  Happiness: '幸福', Cheerfulness: '开朗', 'Bright days': '明亮的日子', 'Simple joy': '简单的快乐', 'Heartfelt thanks': '由衷的感谢',
  'Gentle solitude': '温柔的独处', 'Quiet longing': '安静的思念', 'Holding on': '坚持', 'Strength in hard times': '逆境中的力量', Hope: '希望',
  'Burning heart': '炽热的心', 'Restless energy': '躁动的能量', 'Standing firm': '坚定', 'Fresh wonder': '新鲜的好奇', Wonder: '惊奇',
  'New beginnings': '新的开始', 'An open heart': '敞开的心', 'Wishes on the wind': '随风的愿望', Patience: '耐心', 'Gentle drift': '轻轻飘荡',
  Serenity: '宁静', 'Quiet companionship': '安静的陪伴', Peace: '平和', Melancholy: '淡淡的忧伤', Gentleness: '温柔',
};
const zh = (locale?: string | null) => locale === 'zh-Hans';
const known = (table: Record<string, string>, text: string) => Object.hasOwn(table, text) ? table[text] : text;
export const flowerNameText = (name: string, locale?: string | null) => zh(locale) ? known(NAMES, name) : name;
export const flowerMeaningText = (meaning: string, locale?: string | null) => zh(locale) ? known(MEANINGS, meaning) : meaning;
export const canonicalFlowerNames = () => Object.keys(NAMES);
