// Little flower notes shown while PetalPal wakes up (the free server sleeps at night).
// Meanings match the Garden's own (data/flowerDB.js); PPL's crocus line matches her Moments.
export type FactLocale = 'en' | 'zh-Hans';
// `species` draws the flower's Garden artwork; the crocus (not grown in the Garden) uses PPL's keepsake art.
export interface FlowerFact { species: string; flower: Record<FactLocale, string>; text: Record<FactLocale, string> }

export const FLOWER_FACTS: FlowerFact[] = [
  { species: 'CROCUS', flower: { en: 'Crocus', 'zh-Hans': '番红花' },
    text: { en: "PPL's favourite flower. Crocuses are among the first to bloom in spring, sometimes pushing up through late snow. Her words for it: cherish the present, rejoice in new beginnings.",
      'zh-Hans': '番红花是 PPL 最喜欢的花。它是春天最早开的花之一，有时会顶着残雪冒出来。她给它的花语是：珍惜当下，喜悦新生。' } },
  { species: 'SAFFRON', flower: { en: 'Crocus', 'zh-Hans': '番红花' },
    text: { en: 'Saffron is the dried threads of one kind of crocus. It takes about 150 flowers to make a single gram.',
      'zh-Hans': '香料藏红花，其实是一种番红花的花丝晒干而成。大约 150 朵花，才能凑出 1 克。' } },
  { species: 'SNOWDROP', flower: { en: 'Snowdrop', 'zh-Hans': '雪花莲' },
    text: { en: 'Snowdrops flower in late winter, often right through the snow. That is why, in your garden, they mean hope.',
      'zh-Hans': '雪花莲在冬末开花，常常直接从雪里钻出来，所以在你的花园里，它的花语是「希望」。' } },
  { species: 'DAISY', flower: { en: 'Daisy', 'zh-Hans': '雏菊' },
    text: { en: "\"Daisy\" comes from the Old English for \"day's eye\": the flower opens at dawn and closes at dusk.",
      'zh-Hans': '雏菊的英文 daisy 来自古英语「白昼之眼」：它清晨张开，傍晚合上。' } },
  { species: 'SUNFLOWER', flower: { en: 'Sunflower', 'zh-Hans': '向日葵' },
    text: { en: 'Young sunflowers follow the sun across the sky. Once they bloom, most settle facing east to greet the morning.',
      'zh-Hans': '年轻的向日葵会跟着太阳转。开花以后，大多数就停下来朝着东方，迎接每天的早晨。' } },
  { species: 'HYDRANGEA', flower: { en: 'Hydrangea', 'zh-Hans': '绣球花' },
    text: { en: 'A hydrangea can change colour with its soil: acidic soil tends to turn it blue, alkaline soil pink. Here it means heartfelt thanks.',
      'zh-Hans': '绣球花会随土壤变色：酸性土壤偏蓝，碱性土壤偏粉。在这里，它的花语是「由衷的感谢」。' } },
  { species: 'CHAMOMILE', flower: { en: 'Chamomile', 'zh-Hans': '洋甘菊' },
    text: { en: "Chamomile's name comes from the Greek for \"ground apple\", after its soft, apple-like scent. Here it means strength in hard times.",
      'zh-Hans': '洋甘菊的名字来自希腊语「地上的苹果」，因为它有淡淡的苹果香。它的花语是「在难熬的日子里依然坚强」。' } },
  { species: 'DANDELION', flower: { en: 'Dandelion', 'zh-Hans': '蒲公英' },
    text: { en: 'One dandelion clock holds well over a hundred seeds, each with its own tiny parachute. Here they mean wishes on the wind.',
      'zh-Hans': '一朵蒲公英的绒球里有一百多颗种子，每颗都带着自己的小降落伞。它的花语是「随风而去的愿望」。' } },
  { species: 'HEATHER', flower: { en: 'Heather', 'zh-Hans': '石楠花' },
    text: { en: 'In Scotland, finding white heather is said to bring good luck. In your garden, heather means holding on.',
      'zh-Hans': '在苏格兰，人们说找到白色石楠花会带来好运。在你的花园里，它的花语是「坚持下去」。' } },
  { species: 'LAVENDER', flower: { en: 'Lavender', 'zh-Hans': '薰衣草' },
    text: { en: 'People have tucked lavender into pillows and baths for centuries to help them unwind. Here it means serenity.',
      'zh-Hans': '几百年来，人们把薰衣草放进枕头和浴水里，帮自己放松下来。它的花语是「宁静」。' } },
];

export const WAKING_COPY = {
  en: { note: 'This can take up to a minute when PetalPal has been resting.', did: 'Did you know?', next: 'Next flower' },
  'zh-Hans': { note: 'PetalPal 休息了一阵，第一次打开可能要等一分钟左右。', did: '你知道吗？', next: '下一朵花' },
};

// Start somewhere different each time, then go round the list.
export const factAt = (start: number, step: number) => FLOWER_FACTS[(start + step) % FLOWER_FACTS.length];
