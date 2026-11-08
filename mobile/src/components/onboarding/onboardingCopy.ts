import type { OnboardingStep } from './onboardingSteps';

// What the Fairy says on each step. The Chinese lines are the owner-approved script; the
// English lines carry the same meaning for English-language accounts. "It's your turn!" is
// the same in every language.
export type OnboardingLocale = 'en' | 'zh-Hans';
type Line = { en: string; 'zh-Hans': string };

export const FINALE_LINE = "It's your turn!";

export const STEP_LINES: Record<OnboardingStep, Line> = {
  'intro.name': {
    'zh-Hans': '你好！我是你的小花园的专属小花仙，请为我起一个名字吧！',
    en: "Hello! I'm the flower fairy of your very own little garden. Will you give me a name?",
  },
  'intro.celebrate': {
    'zh-Hans': '让我带你看看你的专属小花园吧！',
    en: 'Let me show you around your very own garden!',
  },
  'garden.zoom': {
    'zh-Hans': '你可以点击或移动来探索花园，也可以用手指缩放，看看花园里的每一个角落。',
    en: 'Tap or drag to explore the garden, and pinch to zoom in on every corner.',
  },
  'event.nav': {
    'zh-Hans': '先告诉我你今天感觉怎么样。',
    en: 'First, tell me how you feel today.',
  },
  'event.write': {
    'zh-Hans': '写下今天发生的一件小事吧，什么都可以。',
    en: 'Write down something that happened today. Anything at all.',
  },
  'event.mood': {
    'zh-Hans': '再选一个最贴近你此刻心情的花语。',
    en: 'Now choose the mood that feels closest to this moment.',
  },
  'event.save': {
    'zh-Hans': '点击「Save Event」，把这一刻交给我吧。',
    en: "Tap Save Event, and I'll keep this moment safe.",
  },
  'event.flower': {
    'zh-Hans': '看！你的心情长成了一朵花。点「Plant flower」把它种进花园吧。',
    en: 'Look, your feeling grew into a flower! Tap Plant flower to bring it into the garden.',
  },
  'plant.place': {
    'zh-Hans': '这片花圃属于这个月。点一点，选一个你喜欢的位置，然后种下它。',
    en: 'This bed belongs to this month. Tap a spot you like, then plant your flower.',
  },
  'plant.growth': {
    'zh-Hans': '你每天记录，花园会慢慢变成只属于你的样子。',
    en: 'Record a little every day, and your garden will slowly become yours alone.',
  },
  'plant.months': {
    'zh-Hans': '花园有十二片花圃，每一片都开着一个月的花。',
    en: 'The garden has twelve beds. Each one holds the flowers of one month of your year.',
  },
  'treehouse.enter': {
    'zh-Hans': '这里是你的秘密树屋。那些不想告诉别人，却又想写下来的心事，都可以留在这里。',
    en: "This is your secret treehouse. Thoughts you don't want to tell anyone, but still want to write down, can stay here.",
  },
  'treehouse.shelf': {
    'zh-Hans': '这里收藏着你每个月的花园回忆。来，打开这个月的书看看吧！',
    en: "Here are your garden memories from every month. Come, let's open this month's book and take a look!",
  },
  'treehouse.books': {
    'zh-Hans': '点击这本书，我们一起看看这个月留下了什么。',
    en: "Tap this book, and let's see what this month has held.",
  },
  'treehouse.archive': {
    'zh-Hans': '左边是 Flower History，记录着这个月你种下的花朵，以及它们背后的点滴回忆。',
    en: 'On the left is Flower History, recording the flowers you planted this month and the memories behind them.',
  },
  'treehouse.journal': {
    'zh-Hans': '右边是你的 Journal，可以随时写下心情、故事和想记录的事情。',
    en: 'On the right is your Journal, where you can write down your thoughts, stories, and anything you wish to remember.',
  },
  'treehouse.back': {
    'zh-Hans': '好啦，点「Back to Garden」回到花园吧。',
    en: 'All right, tap Back to Garden to return.',
  },
  'mailbox': {
    'zh-Hans': '这里是你的信箱。你收到的信件，还有过去的来信，都可以在这里找到。',
    en: "This is your mailbox. Letters you've received, and the ones from before, are all kept here.",
  },
  'friends.nav': {
    'zh-Hans': '在这里，你可以搜索好友的名字，添加他们为好友。',
    en: "Here you can search for your friends' names and add them as friends.",
  },
  'friends.search': {
    'zh-Hans': '点「Add Friends」，输入名字或账号 ID，就能找到他们。',
    en: 'Tap Add Friends and enter a name or account ID to find them.',
  },
  'friends.house': {
    'zh-Hans': '成为好友后，名字下方会出现一座小房子。房子亮着，表示可以去拜访对方的花园；没有亮，表示对方选择暂不开放花园。',
    en: "Once you're friends, a little house appears under their name. A lit house means you may visit their garden; an unlit one means they've chosen to keep it closed.",
  },
  'friends.visit': {
    'zh-Hans': '在好友的花园里，你每天可以给每位好友一次支持，也可以留下一条留言。花园主人能看到收到的支持和留言，留言会显示是谁写的、写了什么。',
    en: 'In a friend\'s garden you can give them one Support and leave one message each day. The owner sees every Support and message, with who wrote it and what it says.',
  },
  'friends.return': {
    'zh-Hans': '好啦，点「Return to Garden」回到花园吧。',
    en: 'All right, tap Return to Garden to go back.',
  },
  'fairy.feed': {
    'zh-Hans': '在这里，你可以看到我的朋友圈，还有我们之间的亲密度。每天和我互动，就可以慢慢积累亲密度和特别的信物！',
    en: 'Here you can see my Moments and how close we are. Spend a little time with me each day, and our bond and special keepsakes will grow!',
  },
  'fairy.bond': {
    'zh-Hans': '每天来签到、陪我聊聊天，我们的亲密度就会一点点升级。',
    en: 'Check in and chat with me each day, and our bond will level up little by little.',
  },
  'fairy.keepsakes': {
    'zh-Hans': '我们越来越亲近时，我会送你特别的信物，它们都会收进你的信物册里。',
    en: "As we grow closer, I'll give you special keepsakes. They're all kept in your keepsake book.",
  },
  'me.space': {
    'zh-Hans': '最后，这里是你的个人空间。你可以管理自己的资料、权限和隐私设置。',
    en: 'Finally, this is your own space. Manage your profile, permissions and privacy here.',
  },
  'me.privacy': {
    'zh-Hans': '在设置里，你可以决定好友能不能拜访你的花园，也可以管理 AI 与隐私选项。',
    en: 'In Settings you decide whether friends may visit your garden, and manage AI and privacy choices.',
  },
  'finale': { 'zh-Hans': FINALE_LINE, en: FINALE_LINE },
  'done': { 'zh-Hans': '', en: '' },
};

export const UI_COPY = {
  en: { namePlaceholder: 'Her name', nameAction: 'Name her', saving: 'Saving…', next: 'Next',
    nameHint: (max: number) => `Up to ${max} letters`, nameEmpty: 'Give her a name first.', nameLong: (max: number) => `Her name can be up to ${max} letters.`, nameCharacters: 'Use letters, numbers and spaces.', retry: 'Try again', monthsTitle: 'Twelve months, twelve beds',
    litHouse: 'Visits open', unlitHouse: 'Garden closed', noFlower: "Today's flowers have already grown, so this Event didn't add one. Your next flower will bloom here." },
  'zh-Hans': { namePlaceholder: '她的名字', nameAction: '就叫这个名字', saving: '正在保存…', next: '下一步',
    nameHint: (max: number) => `最多 ${max} 个字`, nameEmpty: '先给她起个名字吧。', nameLong: (max: number) => `名字最多 ${max} 个字。`, nameCharacters: '请使用文字、数字或空格。', retry: '再试一次', monthsTitle: '十二个月，十二片花圃',
    litHouse: '可以拜访', unlitHouse: '暂不开放', noFlower: '今天的花已经开满了，这次记录没有长出新花。下一朵花会开在这里。' },
} as const;

export const onboardingLocale = (preferred?: string | null): OnboardingLocale =>
  preferred?.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en';
export const stepLine = (step: OnboardingStep, locale: OnboardingLocale) => STEP_LINES[step][locale];
