import type { ClosenessSource } from '../../services/fairyCloseness';

// Words for Our Bond, the calendar check-in and the keepsake book. English by default;
// Simplified Chinese only for owners who chose it (same rule as the rest of the app).
export type BondLocale = 'en' | 'zh-Hans';

// Title tiers as in the design's level screen; English leads, Chinese is the second line.
export const BOND_TIERS = [
  { level: 1, en: 'First Encounter', zh: '初次相遇' },
  { level: 3, en: 'Getting Familiar', zh: '渐渐熟悉' },
  { level: 5, en: 'Garden Friend', zh: '花园好友' },
  { level: 8, en: 'Trusted Companion', zh: '心事伙伴' },
  { level: 12, en: 'Kindred Spirit', zh: '知心花友' },
  { level: 16, en: 'In Perfect Harmony', zh: '默契知己' },
  { level: 20, en: 'Eternal Bloom', zh: '一生花伴' },
] as const;

export const BOND_COPY = {
  en: {
    title: 'Our Bond', close: 'Close', loading: 'Loading…', error: "Couldn't load. Try again.", retry: 'Try again',
    withPpl: 'With PPL', tapHint: 'Tap PPL to hear more', tapPpl: 'PPL', reached: 'Reached', levelLocked: 'Locked',
    toNext: (points: number, level: number) => `${points} more to Lv ${level}`, maxed: 'Highest level reached',
    daysTogether: 'Days together', keepsakes: 'Keepsakes',
    checkInWaiting: "Today's check-in is waiting in the calendar", checkedIn: 'Checked in today',
    today: "Today's progress", done: 'Done', points: (n: number) => `+${n} closeness`,
    sources: {
      CHECK_IN: 'Daily check-in', STREAK_7: '7th-day streak bonus', EVENT: 'Write a mood',
      MOMENT_LIKE: "Like PPL's Moments", FAIRY_TAP: 'Spend time with PPL in the Garden', WEEKLY_READ: 'Open your weekly report',
    } as Record<ClosenessSource, string>,
    rewards: 'Check-in rewards', thisRound: 'This round', days: (n: number, of: number) => `${n} / ${of} days`,
    day: (n: number) => `Day ${n}`, seventh: 'Day 7: a rare keepsake', thisMonth: 'This month',
    limited: (name: string, needed: number) => `Check in ${needed} days this month for the ${name}`,
    earnedThisMonth: 'Collected this month', noLimited: 'No limited keepsake this month yet',
    levels: 'Levels', comingSoon: 'Coming soon',
    unlocks: {
      MOMENTS_FOR_YOU: 'Posts written for you', MORE_RARE_KEEPSAKES: 'Rare keepsakes appear more often',
      MAILBOX_LETTERS: 'Letters in the mailbox', AVATAR_FRAME: 'Her avatar frame',
      EASIER_MONTHLY_KEEPSAKE: 'Limited keepsake after 16 days', ETERNAL_LETTER: 'A special letter',
    } as Record<string, string>,
    book: 'My keepsakes', openBook: 'Open my keepsakes', collected: (owned: number, total: number) => `Collected ${owned} / ${total}`,
    filters: { ALL: 'All', COMMON: 'Common', RARE: 'Rare', MONTHLY: 'Limited' },
    rarity: { COMMON: 'Common', RARE: 'Rare', MONTHLY: 'Limited' },
    receivedOn: 'Received', times: (n: number) => `×${n}`, locked: 'Not found yet',
    reveal: 'A keepsake from PPL', keep: 'Keep it', next: 'Next', isNew: 'New',
    levelUp: (level: number, title: string) => `Level up! Lv ${level} · ${title}`, grace: 'PPL kept your streak for you',
    checkIn: 'Daily check-in', checkInButton: "Check in for today's keepsake", checkingIn: 'Checking in…',
    streak: (n: number) => (n ? `${n}-day streak` : 'Start a streak today'),
    rareSoon: (n: number) => (n === 1 ? 'Check in today for a rare keepsake' : `${n} more check-ins to a rare keepsake`),
    checkInFailed: "The check-in didn't go through. Try again.",
    dayCheckIn: (name: string, points: number) => `Daily check-in · ${name} · +${points}`, legendCheckIn: 'Checked in',
    legendFlowers: '· n flowers or events',
    petalDraw: "Draw today's petal card", petalSee: (name: string) => `Today's petal card · ${name}`,
    dayPetal: (name: string) => `Petal card · ${name}`,
  },
  'zh-Hans': {
    title: '亲密度', close: '关闭', loading: '正在加载…', error: '没加载出来，再试一次。', retry: '再试一次',
    withPpl: '与小花仙 PPL', tapHint: '轻点 PPL，听她多说几句', tapPpl: '小花仙 PPL', reached: '已达成', levelLocked: '未解锁',
    toNext: (points: number, level: number) => `还差 ${points} 点升到 Lv ${level}`, maxed: '已经是最高等级',
    daysTogether: '陪伴天数', keepsakes: '信物数量',
    checkInWaiting: '今天还没签到，去日历签到吧', checkedIn: '今天已签到',
    today: '今日进度', done: '已完成', points: (n: number) => `+${n} 亲密度`,
    sources: {
      CHECK_IN: '每日签到', STREAK_7: '连签第 7 天奖励', EVENT: '写一条心情',
      MOMENT_LIKE: '给她的朋友圈点赞', FAIRY_TAP: '在花园里和她互动', WEEKLY_READ: '打开周报',
    } as Record<ClosenessSource, string>,
    rewards: '签到奖励', thisRound: '本周签到', days: (n: number, of: number) => `${n} / ${of} 天`,
    day: (n: number) => `第${n}天`, seventh: '第 7 天奖励：一个稀有信物', thisMonth: '本月签到',
    limited: (name: string, needed: number) => `本月签到满 ${needed} 天，获得${name}`,
    earnedThisMonth: '本月已获得', noLimited: '本月暂时没有限定信物',
    levels: '亲密度等级', comingSoon: '即将开放',
    unlocks: {
      MOMENTS_FOR_YOU: '「写给你」的帖子', MORE_RARE_KEEPSAKES: '稀有信物更常出现',
      MAILBOX_LETTERS: '信箱里的信', AVATAR_FRAME: '她的专属头像框',
      EASIER_MONTHLY_KEEPSAKE: '签满 16 天即得限定信物', ETERNAL_LETTER: '一封特别的信',
    } as Record<string, string>,
    book: '我的信物', openBook: '打开我的信物', collected: (owned: number, total: number) => `已收集 ${owned} / ${total}`,
    filters: { ALL: '全部', COMMON: '普通', RARE: '稀有', MONTHLY: '限定' },
    rarity: { COMMON: '普通', RARE: '稀有', MONTHLY: '限定' },
    receivedOn: '获得时间', times: (n: number) => `×${n}`, locked: '还没有遇到',
    reveal: 'PPL 送你的今日信物', keep: '收下信物', next: '下一个', isNew: '新收集',
    levelUp: (level: number, title: string) => `升级啦！Lv ${level} · ${title}`, grace: 'PPL 帮你把连签留住了',
    checkIn: '每日签到', checkInButton: '签到，领取今日信物', checkingIn: '正在签到…',
    streak: (n: number) => (n ? `已连签 ${n} 天` : '今天开始连签吧'),
    rareSoon: (n: number) => (n === 1 ? '今天签到必得稀有信物' : `再签 ${n} 天得稀有信物`),
    checkInFailed: '签到没有成功，再试一次。',
    dayCheckIn: (name: string, points: number) => `每日签到 · ${name} · +${points}`, legendCheckIn: '已签到',
    legendFlowers: '· n 朵花或心情',
    petalDraw: '抽今日花语卡', petalSee: (name: string) => `今日花语卡 · ${name}`,
    dayPetal: (name: string) => `花语卡 · ${name}`,
  },
};

// The cream-and-gold paper the calendar and the design's bond screens use.
export const BOND = {
  paper: '#FAF3DF', card: '#FFFBF0', ink: '#254E43', muted: '#6B7B69', edge: '#C4AF79', rule: '#D9CBA0',
  gold: '#B8913F', purple: '#7E62AE', lilac: '#EDE4F6', bar: '#5E9478', barTrack: '#E6DFC8', green: '#123D37',
};
