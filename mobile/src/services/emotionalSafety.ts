// Local, bounded UI hints only. Never uploads text, diagnoses, blocks saving, notifies anyone or
// claims comprehensive risk detection. The always-visible help path stays primary.
export const GENERAL_SUPPORT = 'PetalPal is for reflection, not medical advice or emergency response. If you or someone else is in immediate danger, contact local emergency services or a trusted person who can help now.';
const normalized = (text: string) => text.normalize('NFKC').replace(/[\p{Cf}]/gu, '').replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ').toLowerCase();

export function immediateSupportHint(text:string):string|null {
 const value=normalized(text);
 const immediate=/\b(?:i (?:am going to|plan to|will) (?:kill|hurt) myself (?:now|tonight|today)|i (?:have )?just (?:took|taken) an overdose|i cannot keep myself safe)\b/u.test(value) || /我(?:现在|今晚|今天)(?:要|打算)(?:自杀|伤害自己)|我刚(?:刚)?(?:服药过量|吃了过量的药)|我无法保证自己的安全/u.test(value);
 if(!immediate)return null;
 return /[\p{Script=Han}]/u.test(value)
 ? '你不必独自面对这一刻。如果现在有危险，请联系当地紧急服务，并尽可能到安全的地方，请信任的人陪伴。PetalPal 无法提供紧急救援，也不会自动通知他人。你仍然可以保存这篇记录。'
 : 'You do not have to face this moment alone. If there is danger now, contact local emergency services, move somewhere safer if you can, and ask someone you trust to stay with you. PetalPal cannot provide emergency response and does not automatically notify anyone. You can still save this entry.';
}

// What the writing seems to touch, read on this device as it is typed. Wider than the rule above,
// because a caring note shown once too often costs little, and one not shown can cost a great deal:
// it matches the words only, so a quote or a story can match too, and saving always stays open.
export type SafetyConcern = 'self_harm' | 'harm_others' | 'being_harmed';

const SELF_HARM: RegExp[] = [
 /\b(?:kill|killing|harm|harming|hang|hanging|shoot|shooting|drown|drowning|poison|poisoning) myself\b/u,
 /\b(?:hurt|hurting|cut|cutting) myself\b(?! (?:at|in|on|during|while|when|by accident|accidentally|shaving|cooking|playing|running|lifting|working|training))/u,
 /\b(?:suicidal|self[- ]?harm(?:ing)?)\b/u,
 /\bsuicide\b(?! squad| mission| doors?| burn| bomb)/u,
 /\b(?:want|wanted|going|ready|deserve|need) to die\b|\b(?:wanna|gonna) die\b/u,
 /\b(?:wish|wishing) i (?:was|were|could be) dead\b/u,
 /\bwish i (?:had )?(?:never (?:been born|existed|woke up)|wouldn't wake up)\b/u,
 /\bbetter off (?:dead|without me)\b/u,
 /\b(?:end|ending|take|taking) (?:it all|my (?:own )?life)\b/u,
 /\b(?:no|nothing|not any) (?:reason|point) (?:to|in) (?:live|living|go on|going on)\b/u,
 /\b(?:don't|do not|dont) want to (?:live|be alive|exist|wake up|be here anymore)\b/u,
 /\b(?:can't|cannot|cant) (?:go on|keep living|live like this|keep myself safe)\b/u,
 /\b(?:overdose|overdosed|slit my wrists?|kms)\b/u,
 /\bjump(?:ing)? (?:off|from) (?:a |the |my )?(?:bridge|building|roof|balcony|cliff)\b/u,
 /\bgoodbye (?:forever|cruel world)\b/u,
 /(?<![《「“])自[杀殺](?!小队|小隊|式|炸弹|炸彈|袭击|襲擊)/u,
 /(?<![不没沒别別])想(?:要)?死(?![你他她它])(?!我(?:了|啦|呀))/u,
 /想去死|要去死|不如死|死了算了|死了就好|死了一了百了|一了百了|寻死|尋死|轻生|輕生/u,
 /不想活(?!动|動|跃|躍|儿|兒|力)|活不下去|不想再活|活着没(?:有)?意思|活着(?:真|好|太)?没意思|活著沒(?:有)?意思|活着好累|活著好累|没有活下去|沒有活下去/u,
 /(?:结束|結束|了结|了結)(?:我?自己)?(?:的)?(?:生命|性命|一切)|了结自己|了結自己/u,
 /(?:跳楼|跳樓|跳河|跳桥|跳橋|跳海|上吊|割腕|卧轨|臥軌|烧炭|燒炭|服毒|喝农药|喝農藥)(?!价|價|大甩卖|大甩賣)/u,
 /(?:吃|吞)(?:了)?(?:很多|好多|一堆|一瓶|整瓶|过量的?|過量的?)?(?:安眠药|安眠藥)|过量(?:的)?(?:药|安眠药)|服药过量|服藥過量/u,
 /自残|自殘|自伤|自傷|(?:伤害|傷害)(?:我)?自己|划手腕|劃手腕/u,
 /不想(?:再)?醒来|不想(?:再)?醒來|撑不下去了|撐不下去了|生无可恋|生無可戀|遗书|遺書|告别这个世界|告別這個世界|离开这个世界|離開這個世界|我无法保证自己的安全|我無法保證自己的安全/u,
];

const PERSON_EN = "(?:someone|somebody|anyone|him|her|them|people|everyone|everybody|a (?:man|woman|person|guy|girl|kid|child|baby)|my (?:wife|husband|mom|mother|dad|father|son|daughter|brother|sister|boss|friend|girlfriend|boyfriend|partner|neighbou?r|roommate|kid|child|baby|ex|teacher|classmate|coworker|colleague))";
const PERSON_ZH = '(?:人|他|她|他们|她们|他們|她們|你|你们|你們|我(?:老公|老婆|爸|妈|媽|爸爸|妈妈|媽媽|孩子|男朋友|女朋友|对象|對象|老板|老闆|同事|同学|同學|朋友|室友|邻居|鄰居)|老公|老婆|男朋友|女朋友)';
const HARM_OTHERS: RegExp[] = [
 new RegExp(`\\bi(?: have| just|'ve| accidentally)* (?:killed|murdered|stabbed|strangled|poisoned|raped|beat up) ${PERSON_EN}\\b`, 'u'),
 new RegExp(`\\bi(?: have| just|'ve)* shot ${PERSON_EN}\\b(?! a (?:text|message|look|email|dm|smile|note|photo))`, 'u'),
 new RegExp(`\\bi(?:'m| am)? ?(?:going to|gonna|want to|wanna|will|plan to|'ll|need to|have to|could|might) (?:kill|murder|stab|shoot|poison|strangle|hurt|attack) ${PERSON_EN}\\b(?! a (?:text|message|look|email|dm|smile|note|photo))`, 'u'),
 new RegExp(`\\bhow (?:to|do i|can i) (?:kill|murder|poison) ${PERSON_EN}\\b`, 'u'),
 /\b(?:school|mass) shooting\b(?= (?:is|tomorrow|today|i|plan))|\bbring(?:ing)? a (?:gun|knife|bomb) to (?:school|work)\b|\bplant(?:ing)? a bomb\b/u,
 /[杀殺]人(?!案|犯|游戏|遊戲|魔|狂|片|电影|電影|小说|小說|剧|劇|事件|蜂|鲸|鯨|不眨眼|诛心|誅心)/u,
 new RegExp(`(?:我|想|要|会|會|打算|准备|準備).{0,4}(?:杀|殺|砍|捅|掐|毒|打|弄|害)(?:死|了|掉|伤|傷)(?:了)?${PERSON_ZH}`, 'u'),
 new RegExp(`(?:把|将|將)${PERSON_ZH}(?:给|給)?(?:杀|殺|砍|捅|掐|毒|打|弄|害)(?:死|了|掉|伤|傷)`, 'u'),
 /(?:想|要|会|會|打算|准备|準備)(?:去)?[杀殺](?:了)?(?:人|他|她|他们|她们|他們|她們|你)/u,
 /投毒|下毒害|纵火|縱火|报复社会|報復社會|(?:炸|血洗)(?:学校|學校|公司|地铁|地鐵|商场|商場)/u,
 /我(?:强奸|強姦|性侵|猥亵|猥褻)了/u,
];

const HARMER_EN = '(?:he|she|they|someone|my (?:husband|wife|boyfriend|girlfriend|partner|dad|father|mom|mother|stepdad|stepmom|brother|sister|ex|boss|teacher|uncle|neighbou?r))';
const HARMER_ZH = '(?:他|她|他们|她们|他們|她們|有人|老公|老婆|男朋友|女朋友|对象|對象|爸|妈|媽|爸爸|妈妈|媽媽|继父|繼父|继母|繼母|后爸|後爸|后妈|後媽|前任|前夫|前妻|哥|姐|老师|老師|同事|邻居|鄰居)';
const BEING_HARMED: RegExp[] = [
 new RegExp(`\\b${HARMER_EN} (?:keeps? |always |often )?(?:hits?|hitting|beats?|beating|chokes?|choked|choking|raped|rapes?|molested|molests?|assaulted|assaults?|threatens? to kill|threatened to kill) me\\b`, 'u'),
 /\bi(?:'m| am| was| got| have been|'ve been) (?:being )?(?:raped|sexually assaulted|molested|abused|beaten|kidnapped|trafficked|stalked)\b/u,
 /\b(?:someone|somebody) (?:is|has been|keeps) (?:following|stalking) me\b|\b(?:someone|somebody) (?:is|just) br(?:eaking|oke) in\b|\b(?:someone|somebody) (?:is going to|wants to) kill me\b/u,
 /\bi(?:'m| am) (?:not safe|in danger)\b|\bi (?:don't|do not) feel safe\b/u,
 /\bdomestic violence\b/u,
 /家暴|家庭暴力/u,
 new RegExp(`${HARMER_ZH}(?:一直|总是|總是|又|经常|經常|老是|天天|每天)?(?:打|殴打|毆打|强奸|強姦|性侵|猥亵|猥褻|掐|虐待|威胁要杀|威脅要殺)(?:了)?我`, 'u'),
 /我(?:一直|总是|總是|又|经常|經常)?被(?:人|他|她|他们|她们)?(?:打(?!动|動|败|敗|扰|擾|断|斷|脸|臉|击|擊|卡|醒|印|包|车|車|针|針|疫苗|折|分|开|開|赏|賞)|家暴|殴打|毆打|强奸|強姦|性侵|猥亵|猥褻|跟踪|跟蹤|绑架|綁架|拐卖|拐賣|虐待|霸凌)/u,
 /有人(?:在|一直)?(?:跟踪|跟蹤)我|有人(?:要|想)(?:杀|殺|害)我|有人(?:闯|闖)进|我(?:现在)?(?:很)?(?:不安全|有危险|有危險)|救救我/u,
];

export function safetyConcern(text: string): SafetyConcern | null {
 const value = normalized(text);
 if (!value.trim()) return null;
 if (SELF_HARM.some(rule => rule.test(value))) return 'self_harm';
 if (HARM_OTHERS.some(rule => rule.test(value))) return 'harm_others';
 if (BEING_HARMED.some(rule => rule.test(value))) return 'being_harmed';
 return null;
}

export interface SupportLine { label: { en: string; 'zh-Hans': string }; number: string; note?: { en: string; 'zh-Hans': string } }
export interface SupportLines { emergency: string | null; crisis: SupportLine | null }
const line = (en: string, zh: string, number: string): SupportLine => ({ label: { en, 'zh-Hans': zh }, number });
const NORTH_AMERICA = /^(?:America\/(?:New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Sitka|Nome|Toronto|Montreal|Vancouver|Edmonton|Calgary|Winnipeg|Regina|Halifax|St_Johns|Moncton|Whitehorse|Yellowknife|Iqaluit|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu|US\/.+|Canada\/.+)$/;
// Which numbers to offer, from the device's own time zone (nothing leaves the device). Numbers that
// were checked for these places; anywhere else the note falls back to "local emergency services".
export function supportLines(timeZone: string | undefined = deviceTimeZone()): SupportLines {
 const zone = timeZone ?? '';
 if (/^Asia\/(?:Shanghai|Urumqi|Chongqing|Harbin|Kashgar)$|^PRC$/.test(zone)) return { emergency: '110', crisis: line('National mental health helpline', '全国统一心理援助热线', '12356') };
 if (zone === 'Asia/Hong_Kong') return { emergency: '999', crisis: line('The Samaritan Befrienders', '撒玛利亚防止自杀会', '23892222') };
 if (zone === 'Asia/Taipei') return { emergency: '110', crisis: line('Taiwan care line', '安心专线', '1925') };
 if (NORTH_AMERICA.test(zone)) return { emergency: '911', crisis: line('Suicide & Crisis Lifeline', '988 自杀与危机热线', '988') };
 if (zone === 'Europe/London' || zone === 'Europe/Dublin') return { emergency: '112', crisis: line('Samaritans', '撒玛利亚会', '116123') };
 if (zone.startsWith('Australia/')) return { emergency: '000', crisis: line('Lifeline', 'Lifeline 生命热线', '131114') };
 if (zone === 'Pacific/Auckland') return { emergency: '111', crisis: line('Need to Talk?', 'Need to Talk 热线', '1737') };
 if (zone.startsWith('Europe/')) return { emergency: '112', crisis: null };
 return { emergency: null, crisis: null };
}
function deviceTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } }
export const FIND_A_HELPLINE_URL = 'https://findahelpline.com';
