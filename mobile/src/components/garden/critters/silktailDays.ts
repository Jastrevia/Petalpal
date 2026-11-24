// When the Silktail Fox (绢尾狐) spends a day in the Garden, and what it says when it arrives.
//
// - Milestone: the day the owner has written Events on 14 different days (then 28, 42 ...). The
//   backend counts them from Event.localDate, the account's local day (GET /api/garden/silktail,
//   lib/silktail.js); `visiting` is true all of that day.
// - Holidays: the whole local day (the device's calendar date) of each holiday below, for
//   everyone, with a greeting in the app's language. No calendar service: the dates are built in.
//   The Chinese festivals follow the lunar calendar, so their dates are listed year by year
//   (Hong Kong Observatory Gregorian-lunar tables, UTC+8, checked 2026-11-23); extend the table
//   before 2036. The fixed-date ones need no table.
// A milestone day that is also a holiday shows the milestone (it is the owner's own).

export type HolidayId = 'newYear' | 'valentines' | 'halloween' | 'christmas'
  | 'springFestival' | 'lantern' | 'dragonBoat' | 'qixi' | 'midAutumn';
export type FoxReason = { kind: 'milestone'; days: number } | { kind: 'holiday'; holiday: HolidayId };
export type SilktailState = { eventDays: number; nextIn: number; milestone: number | null; milestoneDate: string | null; today: string; visiting: boolean };

const FIXED: Readonly<Record<string, HolidayId>> = { '01-01': 'newYear', '02-14': 'valentines', '10-31': 'halloween', '12-25': 'christmas' };
export const LUNAR_HOLIDAYS: Readonly<Record<'springFestival' | 'lantern' | 'dragonBoat' | 'qixi' | 'midAutumn', readonly string[]>> = {
  springFestival: ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03', '2031-01-23', '2032-02-11', '2033-01-31', '2034-02-19', '2035-02-08'],
  lantern: ['2026-03-03', '2027-02-20', '2028-02-09', '2029-02-27', '2030-02-17', '2031-02-06', '2032-02-25', '2033-02-14', '2034-03-05', '2035-02-22'],
  dragonBoat: ['2026-06-19', '2027-06-09', '2028-05-28', '2029-06-16', '2030-06-05', '2031-06-24', '2032-06-12', '2033-06-01', '2034-06-20', '2035-06-10'],
  qixi: ['2026-08-19', '2027-08-08', '2028-08-26', '2029-08-16', '2030-08-05', '2031-08-24', '2032-08-12', '2033-08-01', '2034-08-20', '2035-08-10'],
  midAutumn: ['2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12', '2031-10-01', '2032-09-19', '2033-09-08', '2034-09-27', '2035-09-16'],
};
const LUNAR_BY_DATE: ReadonlyMap<string, HolidayId> = new Map(
  (Object.entries(LUNAR_HOLIDAYS) as [HolidayId, readonly string[]][]).flatMap(([id, dates]) => dates.map(date => [date, id] as const)));

// The device's local calendar date, YYYY-MM-DD.
export function localDateOf(now: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function holidayOn(date: string): HolidayId | null {
  return LUNAR_BY_DATE.get(date) ?? FIXED[date.slice(5)] ?? null;
}

export function foxReason(milestone: SilktailState | null, deviceDate: string): FoxReason | null {
  if (milestone?.visiting && milestone.milestone) return { kind: 'milestone', days: milestone.milestone };
  const holiday = holidayOn(deviceDate);
  return holiday ? { kind: 'holiday', holiday } : null;
}

// One key per visit, so its arrival and message play once (later visits that day it is simply there).
export const foxVisitKey = (reason: FoxReason, date: string) =>
  `${date}:${reason.kind === 'milestone' ? `m${reason.days}` : reason.holiday}`;

const GREETINGS: Readonly<Record<HolidayId, { en: string; 'zh-Hans': string }>> = {
  newYear: { en: 'Happy New Year! The Silktail Fox came to start the year with you.', 'zh-Hans': '新年快乐！绢尾狐来花园陪你迎接新的一年。' },
  valentines: { en: 'Happy Valentine’s Day! The Silktail Fox brings you a little love.', 'zh-Hans': '情人节快乐！绢尾狐给你捎来一点温柔。' },
  halloween: { en: 'Happy Halloween! The Silktail Fox dropped by to celebrate.', 'zh-Hans': '万圣节快乐！绢尾狐也来花园凑个热闹。' },
  christmas: { en: 'Merry Christmas! The Silktail Fox is spending the day in your Garden.', 'zh-Hans': '圣诞快乐！绢尾狐来花园陪你过节。' },
  springFestival: { en: 'Happy Lunar New Year! The Silktail Fox came to celebrate with you.', 'zh-Hans': '春节快乐！绢尾狐来给你拜年啦。' },
  lantern: { en: 'Happy Lantern Festival! The Silktail Fox came to see the lanterns with you.', 'zh-Hans': '元宵节快乐！绢尾狐陪你赏花灯。' },
  dragonBoat: { en: 'Happy Dragon Boat Festival! The Silktail Fox came to wish you well.', 'zh-Hans': '端午安康！绢尾狐来看你啦。' },
  qixi: { en: 'Happy Qixi! The Silktail Fox brings you a starlit wish.', 'zh-Hans': '七夕快乐！绢尾狐为你送上星光下的祝福。' },
  midAutumn: { en: 'Happy Mid-Autumn Festival! The Silktail Fox came to watch the moon with you.', 'zh-Hans': '中秋快乐！绢尾狐陪你一起赏月。' },
};

export function foxMessage(reason: FoxReason, locale: 'en' | 'zh-Hans') {
  if (reason.kind === 'holiday') return GREETINGS[reason.holiday][locale];
  return locale === 'zh-Hans'
    ? `你已经在 ${reason.days} 个日子里写下了事件！绢尾狐今天来花园陪你一整天。`
    : `You have written Events on ${reason.days} days! The Silktail Fox is spending today in your Garden.`;
}
