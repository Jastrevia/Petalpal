import { flowerNameText } from './flowerNames';

// The Treehouse's words in the owner's language (Me → language, services/locale.ts). Like the rest of the app, English
// is the key and zh-Hans owners read the table; dates and counts are written per language. The Treehouse screen sets
// the language once per render (setTreehouseLocale), before its books, shelves and painted pages are drawn, so one
// screen never mixes languages. Anything missing from the table stays in English.
let zh = false;
export function setTreehouseLocale(locale: string | null | undefined) { zh = locale === 'zh-Hans'; }
export const treehouseZh = () => zh;
export function tt(text: string) { return zh ? ZH[text] ?? text : text; }

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** "Nov" / "11月" (spines, bookmarks). */
export const monthShort = (month: number) => zh ? `${month}月` : MONTH_SHORT[month - 1];
/** "November" / "11月". */
export const monthLong = (month: number) => zh ? `${month}月` : MONTH_LONG[month - 1];
/** "November 2026" / "2026年11月". */
export const monthYear = (year: number, month: number) => zh ? `${year}年${month}月` : `${MONTH_LONG[month - 1]} ${year}`;
/** "Nov 3, 2026" / "2026年11月3日". */
export const dateText = (year: number, month: number, day: number) => zh ? `${year}年${month}月${day}日` : `${MONTH_SHORT[month - 1]} ${day}, ${year}`;
/** "Nov 3" / "11月3日". */
export const monthDay = (month: number, day: number) => zh ? `${month}月${day}日` : `${MONTH_SHORT[month - 1]} ${day}`;
/** 0 = Sunday. */
export const weekdayName = (index: number) => (zh ? WEEKDAY_ZH : WEEKDAY)[index];
/** "1 journal" / "3 journals" / "3 篇日记". */
export const journalCount = (n: number) => zh ? `${n} 篇日记` : `${n} ${n === 1 ? 'journal' : 'journals'}`;
/** A flower's name in the owner's language (services/flowerNames.ts). */
export const flowerName = (name: string) => flowerNameText(name, zh ? 'zh-Hans' : 'en');
/** A stored mood label ("SUNNY_BLOOM", "curiosity") in Chinese, or null to keep the English title. */
export const moodZh = (label: string) => zh ? MOOD_ZH[label] ?? MOOD_ZH[label.toLowerCase()] ?? null : null;

// The month books' frontispiece flowers (book3d/assets.ts FLOWERS, same order).
export const MONTH_FLOWERS_ZH = ['雪花莲', '紫罗兰', '水仙', '紫藤', '玫瑰', '毛地黄', '飞燕草', '绣球花', '向日葵', '万寿菊', '菊花', '冬青'];

// Primary moods as the rest of the app names them (FlowerDetailModal, EventsPanel); the V2 secondary labels.
const MOOD_ZH: Record<string, string> = {
  SUNNY_BLOOM: '开心', PEACEFUL_BLOOM: '平静', GENTLE_BLOOM: '温柔', WONDER_BLOOM: '好奇', HEALING_BLOOM: '治愈',
  QUIET_BLOOM: '低落', DRIFTING_BLOOM: '迷茫', FIRE_BLOOM: '愤怒',
  admiration: '欣赏', amusement: '开怀', anger: '生气', annoyance: '烦躁', approval: '认可', caring: '关爱', confusion: '困惑',
  curiosity: '好奇', disappointment: '失望', disapproval: '不认同', disgust: '反感', excitement: '兴奋', fear: '害怕',
  gratitude: '感激', joy: '快乐', love: '爱', neutral: '平常', optimism: '乐观', remorse: '懊悔', sadness: '难过', surprise: '惊讶',
};

const ZH: Record<string, string> = {
  // Treehouse screen
  'My Journals': '我的日记',
  'Back to Garden': '回到花园',
  'Unable to load your book. Please try again.': '没能打开你的日记本，请再试一次。',
  'Tap to retry.': '点一下重试。',
  'Some flower, Event or mood records could not be loaded. They will appear once the connection returns.': '有些花、事件或心情记录没能加载，网络恢复后就会出现。',
  'Journal deleted.': '日记已删除。',
  'Unsaved journal': '日记还没保存',
  'Keep writing': '继续写',
  'Close the book, keep the draft': '合上书，保留草稿',
  'Leave without saving': '不保存，直接离开',
  'You have writing that hasn’t been saved yet. If you leave the Treehouse now, it will be lost.': '你有还没保存的内容。现在离开树屋的话，这些内容会丢失。',
  'Flower History': '花的历史',
  'Retry flower history': '重新加载花的历史',
  'Your Garden has no flowers yet.': '你的花园还没有花。',
  'No written entry attached.': '没有附带文字。',
  'No secondary emotions': '没有其他情绪',
  'No messages received.': '还没有收到留言。',
  'Planted': '种下于',
  'Created': '创建于',
  'Friend': '朋友',
  'support': '个支持',
  'Flower': '花',
  // Shelf
  'This month has not arrived yet.': '这个月还没到。',
  'This year has not arrived yet.': '这一年还没到。',
  'Journal years': '日记年份',
  'this year': '今年',
  'locked': '未解锁',
  'no journals yet': '还没有日记',
  // Open book
  'Back to both pages': '回到两页',
  'Back to bookshelf': '回到书架',
  'Previous day': '前一天',
  'Next day': '后一天',
  'Today': '今天',
  'Turn to today': '翻到今天',
  'Unsaved draft · tap the page to finish': '草稿未保存 · 点书页继续写',
  'No journals or records this month': '这个月还没有日记或记录',
  'Earlier bookmarks': '更早的书签',
  'Later bookmarks': '更晚的书签',
  'Date bookmarks': '日期书签',
  'Brings the left page close: the day\'s flower, Event and mood': '拉近左页：当天的花、事件和心情',
  'Brings the right page close': '拉近右页',
  'today': '今天',
  'no journal': '没有日记',
  '❦  Journal saved': '❦  日记已保存',
  'Journal saved': '日记已保存',
  // Records page (left)
  "The day's flower": '当天的花',
  'The day\'s flowers': '当天的花',
  'GREW FROM AN EVENT': '来自一条事件',
  'GREW FROM DAILY GROW': '来自每日成长',
  'FROM AN EVENT': '来自一条事件',
  'FROM DAILY GROW': '来自每日成长',
  'Grew from an Event': '来自一条事件',
  'Grew from Daily Grow': '来自每日成长',
  'Also grew': '还长出了',
  'No flower grew on this day.': '这一天没有长出花。',
  'Event': '事件',
  'Events': '事件',
  'No Event recorded.': '没有记录事件。',
  'Mood analysis': '心情分析',
  'No mood recorded.': '没有记录心情。',
  'Tap the page to read': '点书页阅读',
  'Tap the page to read or write': '点书页阅读或写字',
  'Tap the page to write': '点书页写字',
  // Writing page (right)
  'Write your thoughts here…': '在这里写下你的心情…',
  'Title (optional)': '标题（可不填）',
  'Journal title (optional)': '日记标题（可不填）',
  'Private journal': '私密日记',
  'Only for you. Not sent to AI or saved as an Event memory.': '只属于你，不会发送给 AI，也不会存成事件记忆。',
  'Saving…': '正在保存…',
  'Save failed': '保存失败',
  'Unsaved changes': '未保存',
  'Saved': '已保存',
  'Edit': '编辑',
  'Edit this journal': '编辑这篇日记',
  'Journal actions': '日记操作',
  'Write another journal for today': '今天再写一篇',
  'From Daily Grow · read-only. It grew a flower, so it stays as written to keep your Flower History whole.': '来自每日成长 · 只读。它长出了一朵花，所以保持原样，让你的花的历史完整。',
  'From Daily Grow · read-only': '来自每日成长 · 只读',
  'From Daily Grow · kept as written': '来自每日成长 · 保持原样',
  'No private journal on this day.': '这一天没有私密日记。',
  'New journals are written on today’s page — tap the Today bookmark.': '新日记写在今天这一页，点「今天」书签就能翻过去。',
  'New journals are written on today’s page.': '新日记写在今天这一页。',
  'New journals are written\non today’s page.': '新日记写在\n今天这一页。',
  'No journal or records\nfor this month.': '这个月还没有\n日记或记录。',
  'No journals yet': '还没有日记',
  'Photos can be added once the journal is saved.': '日记保存后就可以加照片。',
  'Transcribing…': '正在转成文字…',
  'Preparing microphone…': '正在准备麦克风…',
  'Recording': '录音中',
  'Done recording': '结束录音',
  'Cancel voice input': '取消语音输入',
  'Dictate private journal': '语音写日记',
  'Record up to three minutes, then review before saving': '最多录三分钟，保存前可以再看一遍',
  'Done editing': '编辑完成',
  'Done': '完成',
  'Cancel': '取消',
  'Retry saving journal': '重新保存日记',
  'Save changes': '保存修改',
  'Save private journal': '保存私密日记',
  'Retry': '重试',
  'Save': '保存',
  'Unable to save your journal.': '没能保存你的日记。',
  ' If the connection was interrupted, check this page before saving again.': '如果网络断过，再次保存前先看看这一页。',
  // Photo
  'Loading…': '正在加载…',
  'Change photo': '换一张照片',
  'Add a photo': '加一张照片',
  'Remove photo': '移除照片',
  'Change journal photo': '更换日记照片',
  'Add journal photo': '添加日记照片',
  'Remove journal photo': '移除日记照片',
  'Private journal photo': '私密日记照片',
  'Unable to load photo.': '照片没能加载。',
  'Choose a smaller photo (up to 512 KB).': '请选一张小一点的照片（不超过 512 KB）。',
  'Unable to save photo. Please try again.': '照片没能保存，请再试一次。',
  'Unable to remove photo. Please try again.': '照片没能移除，请再试一次。',
  // Journal actions
  'Close journal actions': '关闭日记操作',
  'Delete this journal': '删除这篇日记',
  'This journal grew a flower through Daily Grow, so it stays as written to keep your Flower History whole.': '这篇日记通过每日成长长出了一朵花，所以保持原样，让你的花的历史完整。',
  'Delete this journal?': '删除这篇日记？',
  'Keep journal': '保留日记',
  'Keep it': '保留',
  'Confirm delete journal': '确认删除日记',
  'Delete': '删除',
  'Unable to delete this journal. Please try again.': '没能删除这篇日记，请再试一次。',
};
