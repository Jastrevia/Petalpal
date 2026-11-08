// Little flower notes shown while PetalPal wakes up (the free server sleeps at night): one card for
// each flower an Event can grow (lib/flower-variant-config.js PRIMARY_GARDEN_MOOD_CONFIG). Each card's
// name and meaning are the Garden's own (data/flowerDB.js canonical, services/flowerNames.ts).
export type FactLocale = 'en' | 'zh-Hans';
// `species` draws that flower's Garden artwork, so the picture is always the flower named.
export interface FlowerFact { species: string; flower: Record<FactLocale, string>; text: Record<FactLocale, string> }

const fact = (species: string, en: string, zh: string, textEn: string, textZh: string): FlowerFact =>
  ({ species, flower: { en, 'zh-Hans': zh }, text: { en: textEn, 'zh-Hans': textZh } });

export const FLOWER_FACTS: FlowerFact[] = [
  // Sunny
  fact('SUNFLOWER', 'Sunflower', '向日葵',
    'Young sunflowers follow the sun across the sky. Once they bloom, most settle facing east to greet the morning. Here it means happiness.',
    '年轻的向日葵会跟着太阳转。开花以后，大多数就停下来朝着东方，迎接每天的早晨。它的花语是「幸福」。'),
  fact('GERBERA_DAISY', 'Gerbera Daisy', '非洲菊',
    'The gerbera grows wild in South Africa and is named after the German botanist Traugott Gerber. Here it means cheerfulness.',
    '非洲菊原生于南非，名字来自德国植物学家特劳戈特·格伯。它的花语是「开朗」。'),
  fact('COREOPSIS', 'Coreopsis', '金鸡菊',
    'Coreopsis is also called tickseed: its little seeds look like tiny bugs, which is what its Greek name means. Here it means bright days.',
    '金鸡菊的种子小小的，像一只只小虫子，它的希腊语名字就是这个意思。它的花语是「明亮的日子」。'),
  fact('DAISY', 'Daisy', '雏菊',
    '"Daisy" comes from the Old English for "day\'s eye": the flower opens at dawn and closes at dusk. Here it means simple joy.',
    '雏菊的英文 daisy 来自古英语「白昼之眼」：它清晨张开，傍晚合上。它的花语是「简单的快乐」。'),
  // Gentle
  fact('HYDRANGEA', 'Hydrangea', '绣球花',
    'A hydrangea can change colour with its soil: acidic soil tends to turn it blue, alkaline soil pink. Here it means heartfelt thanks.',
    '绣球花会随土壤变色：酸性土壤偏蓝，碱性土壤偏粉。它的花语是「由衷的感谢」。'),
  // Quiet
  fact('BLUEBELL', 'Bluebell', '蓝铃花',
    'Bluebells hang their bells along one side of a nodding stem, and in spring they can carpet a whole wood in blue. Here they mean gentle solitude.',
    '蓝铃花的小铃铛都挂在弯弯花茎的同一侧。春天，它们能把整片树林铺成蓝色。它的花语是「温柔的独处」。'),
  fact('ANEMONE', 'Anemone', '银莲花',
    'Anemone comes from the Greek for "wind", and it is still called the windflower. Here it means quiet longing.',
    '银莲花的名字来自希腊语的「风」，所以它也叫「风之花」。它的花语是「安静的思念」。'),
  fact('HEATHER', 'Heather', '石楠花',
    'In Scotland, finding white heather is said to bring good luck. In your garden, heather means holding on.',
    '在苏格兰，人们说找到白色石楠花会带来好运。在你的花园里，它的花语是「坚持」。'),
  // Healing
  fact('CHAMOMILE', 'Chamomile', '洋甘菊',
    'Chamomile\'s name comes from the Greek for "ground apple", after its soft, apple-like scent. Here it means strength in hard times.',
    '洋甘菊的名字来自希腊语「地上的苹果」，因为它有淡淡的苹果香。它的花语是「逆境中的力量」。'),
  fact('SNOWDROP', 'Snowdrop', '雪花莲',
    'Snowdrops flower in late winter, often right through the snow. That is why, in your garden, they mean hope.',
    '雪花莲在冬末开花，常常直接从雪里钻出来，所以在你的花园里，它的花语是「希望」。'),
  // Fire
  fact('POPPY', 'Poppy', '虞美人',
    'Poppy seeds can wait in the soil for years and bloom the moment the ground is turned. Here they mean a burning heart.',
    '虞美人的种子能在土里等上好几年，土一翻动就开花。它的花语是「炽热的心」。'),
  fact('PETUNIA', 'Petunia', '矮牵牛',
    'The petunia is a cousin of the tomato and the potato, and its name comes from an old South American word for tobacco. Here it means restless energy.',
    '矮牵牛和番茄、土豆是亲戚，它的名字来自南美洲一个指「烟草」的古老词语。它的花语是「躁动的能量」。'),
  fact('GENTIAN', 'Gentian', '龙胆花',
    'Gentians bloom a deep, true blue high in the mountains, through wind and cold. Here they mean standing firm.',
    '龙胆花开在高高的山上，顶着风和寒冷，开出深深的蓝色。它的花语是「坚定」。'),
  // Wonder
  fact('TULIP', 'Tulip', '郁金香',
    'In the 1630s the Dutch went so wild for tulips that a single rare bulb could cost as much as a house. Here it means fresh wonder.',
    '17 世纪 30 年代，荷兰人对郁金香着了迷，一颗稀有的球茎能卖到一栋房子的价钱。它的花语是「新鲜的好奇」。'),
  fact('BIRD_OF_PARADISE', 'Bird of Paradise', '天堂鸟',
    'When a sunbird lands on a bird of paradise, its weight opens the flower and dusts its feet with pollen. Here it means wonder.',
    '太阳鸟落在天堂鸟上时，它的重量会把花压开，让花粉沾在鸟的脚上。它的花语是「惊奇」。'),
  fact('YELLOW_DAFFODIL', 'Yellow Daffodil', '黄水仙',
    'Daffodils are among the first flowers of spring, and in Wales people wear them on St David\'s Day, 1 March. Here they mean new beginnings.',
    '黄水仙是春天最早开的花之一。在威尔士，人们会在 3 月 1 日圣大卫节戴上它。它的花语是「新的开始」。'),
  fact('WHITE_ROSE', 'White Rose', '白玫瑰',
    'People have grown roses for thousands of years; in England the white rose was the badge of the House of York. Here it means an open heart.',
    '人们种玫瑰已经有几千年了。在英国，白玫瑰曾是约克家族的徽章。它的花语是「敞开的心」。'),
  // Drifting
  fact('DANDELION', 'Dandelion', '蒲公英',
    'One dandelion clock holds well over a hundred seeds, each with its own tiny parachute. Here they mean wishes on the wind.',
    '一朵蒲公英的绒球里有一百多颗种子，每颗都带着自己的小降落伞。它的花语是「随风的愿望」。'),
  fact('ASTER', 'Aster', '紫菀',
    'Aster is Greek for "star", after its star-shaped flowers, which wait until late summer and autumn to bloom. Here it means patience.',
    '紫菀的名字在希腊语里是「星星」，因为它的花像星星。它要等到夏末秋初才开。它的花语是「耐心」。'),
  fact('YELLOW_RAPESEED_FLOWER', 'Yellow Rapeseed Flower', '油菜花',
    'In spring, rapeseed turns whole fields gold, and its seeds are pressed for cooking oil. Here it means gentle drift.',
    '春天，油菜花能把整片田野染成金黄，它的种子还能榨成食用油。它的花语是「轻轻飘荡」。'),
  // Peaceful
  fact('LAVENDER', 'Lavender', '薰衣草',
    'People have tucked lavender into pillows and baths for centuries to help them unwind. Here it means serenity.',
    '几百年来，人们把薰衣草放进枕头和浴水里，帮自己放松下来。它的花语是「宁静」。'),
  fact('CHINESE_VIOLET_CRESS', 'Chinese Violet Cress', '二月兰',
    'Its Chinese name says it blooms in the second month of the lunar year, and it seeds itself back in the same place every spring. Here it means quiet companionship.',
    '二月兰的名字说的是它在农历二月开花，它每年春天都会在同一个地方自己长回来。它的花语是「安静的陪伴」。'),
  fact('OLIVE', 'Olive', '橄榄花',
    'An olive tree can live for more than a thousand years, and since ancient Greece its branch has stood for peace. Here it means peace.',
    '一棵橄榄树能活一千多年。从古希腊开始，橄榄枝就代表和平。它的花语是「平和」。'),
];

export const WAKING_COPY = {
  en: { note: 'This can take up to a minute when PetalPal has been resting.', did: 'Did you know?', next: 'Next flower' },
  'zh-Hans': { note: 'PetalPal 休息了一阵，第一次打开可能要等一分钟左右。', did: '你知道吗？', next: '下一朵花' },
};

// Start somewhere different each time, then go round the list.
export const factAt = (start: number, step: number) => FLOWER_FACTS[(start + step) % FLOWER_FACTS.length];
