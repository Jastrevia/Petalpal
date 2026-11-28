// The dogs' foods in the feed panel (lib/garden-pets.js PET_FOODS): painted icons (FLUX.2 klein from
// one style set, cut out, 128 px; 2026-11-23), how to serve each one, and the foods dogs must never
// eat. Serving tips and the never list follow the ASPCA ("People Foods to Avoid Feeding Your Pets")
// and the AKC (fruits and vegetables / human foods dogs can and can't eat), read 2026-11-23.
type Words = { en: string; 'zh-Hans': string };

export const FOOD_ICONS: Record<string, number> = {
  kibble: require('@/assets/garden/pets/foods/kibble.webp'),
  carrot: require('@/assets/garden/pets/foods/carrot.webp'),
  blueberries: require('@/assets/garden/pets/foods/blueberries.webp'),
  apple: require('@/assets/garden/pets/foods/apple.webp'),
  pumpkin: require('@/assets/garden/pets/foods/pumpkin.webp'),
  banana: require('@/assets/garden/pets/foods/banana.webp'),
  strawberries: require('@/assets/garden/pets/foods/strawberries.webp'),
  salmon: require('@/assets/garden/pets/foods/salmon.webp'),
  egg: require('@/assets/garden/pets/foods/egg.webp'),
};

// Shown after feeding it, under the panel.
export const FOOD_TIPS: Record<string, Words> = {
  kibble: { en: 'Kibble is their everyday food: their main meals.', 'zh-Hans': '狗粮是狗狗每天的主食。' },
  carrot: { en: 'Raw or cooked, cut into small pieces.', 'zh-Hans': '生的熟的都可以，切成小块再喂。' },
  blueberries: { en: 'A few make a good treat.', 'zh-Hans': '当零食给几颗就好。' },
  apple: { en: 'Slices only: take out the core and seeds.', 'zh-Hans': '去掉果核和籽，切片再喂。' },
  pumpkin: { en: 'Plain cooked pumpkin or pure purée, no spices.', 'zh-Hans': '原味熟南瓜或纯南瓜泥，不加调料。' },
  banana: { en: 'A little at a time: bananas are sweet.', 'zh-Hans': '香蕉糖分高，少量就好。' },
  strawberries: { en: 'Washed, and just a few: they are sweet.', 'zh-Hans': '洗干净，少量喂，糖分不低。' },
  salmon: { en: 'Fully cooked and boneless, never raw.', 'zh-Hans': '一定要煮熟、去刺，不能生吃。' },
  egg: { en: 'Fully cooked and plain, no salt or butter.', 'zh-Hans': '一定要煮熟，不放盐和黄油。' },
};

export const NEVER_FEED_TITLE: Words = { en: 'Never give dogs', 'zh-Hans': '狗狗绝对不能吃' };
export const NEVER_FEED: readonly Words[] = [
  { en: 'Chocolate and cocoa', 'zh-Hans': '巧克力、可可' },
  { en: 'Grapes and raisins', 'zh-Hans': '葡萄、葡萄干' },
  { en: 'Onion, garlic, leeks, chives', 'zh-Hans': '洋葱、大蒜、韭菜、葱' },
  { en: 'Xylitol (sugar-free gum and sweets)', 'zh-Hans': '木糖醇（无糖口香糖、糖果）' },
  { en: 'Macadamia nuts', 'zh-Hans': '夏威夷果' },
  { en: 'Alcohol', 'zh-Hans': '酒' },
  { en: 'Coffee, tea, caffeine', 'zh-Hans': '咖啡、茶等含咖啡因的东西' },
  { en: 'Raw yeast dough', 'zh-Hans': '生面团' },
  { en: 'Cooked bones (they splinter)', 'zh-Hans': '熟骨头（会碎裂扎伤）' },
  { en: 'Cherry and peach pits', 'zh-Hans': '樱桃核、桃核' },
];
export const NEVER_FEED_NOTE: Words = {
  en: 'If your dog eats any of these, call a vet. From the ASPCA and the AKC.',
  'zh-Hans': '狗狗误食了请马上联系兽医。参考 ASPCA 和美国养犬俱乐部（AKC）。',
};
