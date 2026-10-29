# PetalPal petal cards — design v1 (approved, 2026-10-20)

Status: **design approved by the owner; first build for the beta (2026-10-21).** Artwork: 78
owner-generated PNGs (1024×1536, PetalPal fairy, Rider–Waite–Smith structure), delivered as a local
zip (≈250 MB). The 69 drawable cards are bundled in the app as 600×900 WebP
(`mobile/assets/petal-cards/<id>.webp`, ≈9 MB, `scripts/compress-petal-cards.mjs`); heavy cards are
not bundled. Card names, moods and the owner-reviewed zh-Hans / en copy live in
[lib/petal-cards.js](../../lib/petal-cards.js); every description was checked against its artwork.
In Chinese copy the fairy is 小花仙.

## Position

- A mood-image mirror inside the journaling app, called **petal cards** (花语卡), not "tarot".
- Never prediction, fortune, luck, good/bad omens. (2026-10-30: the daily draw now reads as tarot,
  topics include 今日运势, and readings may speak of tendencies; still never certain outcomes. See the last section.) Apple lists fortune-telling apps as a saturated
  category (App Review Guideline 4.3), so this stays a feature of PetalPal, not a standalone oracle.
- Disclaimer on every card: for self-reflection only; not a prediction or a substitute for counselling.

## Two ways to get a card

| | Daily draw (free) | Matched to my records (paid) |
|---|---|---|
| Trigger | Once a day, random | With the Weekly report |
| Model involved | No | No — code rules, reproducible, no hallucination |
| Pool | 69 cards (heavy cards excluded) | 69 cards, filtered by mood and arc |
| Copy | Prewritten, human-reviewed | Prewritten, plus one code-generated fact line that links to the Events |

## Matching rules (code only)

1. Needs ≥ 3 Events this week, else offer the daily draw only.
2. Dominant mood: the user's most chosen `primaryGardenMood` (tie → the later one).
3. Arc, first half vs second half: low (Quiet, Drifting, Fire) → bright (Sunny, Peaceful, Healing,
   Gentle) = **lifting**; the reverse = **sinking**; ≥ 4 distinct moods = **mixed**; else **steady**.
4. Preference: lifting → The Star, Six of Swords, Temperance, Judgement; sinking → Four of Swords,
   The Hermit, Strength; mixed → Temperance, Wheel of Fortune, Two of Pentacles; steady → cards tagged
   with the dominant mood.
5. Stable: a hash of user + week picks within the candidates, so a refresh never changes the card.

As built ([lib/petal-card-match.js](../../lib/petal-card-match.js), 2026-10-21): the moods are the
short report's mood-curve points (one per period Event with a Primary Garden Mood). The halves are
the curve's own split, Mon–Thu and Fri–Sun of the account-timezone week. **Lifting** = more than half
of Mon–Thu low and more than half of Fri–Sun bright; **sinking** the reverse; both need moods in both
halves. Wonder counts as neither low nor bright. Precedence (owner decision 2026-10-21): lifting /
sinking before mixed, then steady. The hash is `sha256("petal-card:v1:<owner>:<periodKey>")`.

## Safety rules

- The 9 **heavy** cards (Death, The Devil, The Tower, Three/Five/Eight/Nine/Ten of Swords,
  Five of Pentacles) appear only in the collection; they are never drawn or matched.
- If any Event this week triggers the existing support hint, no card; show support resources.
- Copy is prewritten and human-reviewed; no free model text. No advice — at most one question.

## Example (copy style)

Low week, Quiet ×4 and Drifting ×1 early, Healing ×2 late → dominant Quiet, arc lifting → **The Star**.
Card line: 难过之后，一点点亮起来。 Card text: 大星星挂在夜空，小花仙跪在池边，把两只罐子里的水慢慢倒出来。不急，也不用马上变好。
Fact line (code): 这周你 4 次选了「安静」，周五到周日有 2 次「疗愈」。 (The card asks no question; the report keeps its
one model question.)

## In the short Weekly report (beta, 2026-10-21)

- Owner switch `PETAL_CARDS_OWNER_IDS` on the backend (comma-separated `User.id`, surrounding spaces or line breaks ignored, or `*` alone for
  every owner), only for
  owners who also get the short report (`AI_WEEKLY_SHORT_OWNER_IDS`). Free during the beta.
- A `PETAL_CARD` section right after the mood curve: card art, name, card line, card text, the fact
  line and the disclaimer. Saved with the report, so the card never changes for that week.
- Fact lines (code, from mood counts): steady/lifting/sinking `这周你 n 次选了「X」[，周五到周日有 m 次「Y」]。`;
  mixed `这周你选了 k 种心情，最多的是「X」，n 次。`; every mood once `这周你选了 k 种心情，每种 1 次。`
- Not built yet: daily draw, collection, paid gating (development plan PRs 4–6).

## The 78 cards

Traditional keywords paraphrase A. E. Waite, *The Pictorial Key to the Tarot* (1910), Part III
([Wikisource](https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot/Part_3)); where modern
usage differs it is noted. The reflection theme is PetalPal's own wording. Moods are the eight Primary
Garden Moods the user picks. Copyright: the original 1909 Rider–Waite–Smith images are public domain in
the UK/EU (2022) and treated as such in the US; the "Rider-Waite" name and US Games' later editions
are not used ([Wikipedia](https://en.wikipedia.org/wiki/Rider%E2%80%93Waite_Tarot)).

| File | Card | 中文 | Traditional (Waite 1910) | PetalPal theme | Moods | Tone |
|---|---|---|---|---|---|---|
| `0.The Fool` | The Fool | 愚者 | new start, folly, carefree leap | 轻装出发，对未知保持好奇 | Wonder, Sunny | light |
| `1.The Magician` | The Magician | 魔术师 | skill, will, self-confidence | 手边已有的东西，足够开始 | Wonder, Sunny | light |
| `2.The High Priestess` | The High Priestess | 女祭司 | secrets, silence, intuition | 安静下来，先听听自己 | Quiet, Peaceful | tender |
| `3.The Emprees` | The Emprees | 皇后 | fruitfulness, nurture, abundance | 被照顾，也照顾别人 | Gentle, Healing | light |
| `4.The Emperor` | The Emperor | 皇帝 | stability, structure, protection | 给生活搭一个稳稳的框架 | Peaceful, Fire | light |
| `5.The Hierophant` | The Hierophant | 教皇 | tradition, alliance, guidance | 向信任的人和熟悉的方式靠近 | Peaceful, Gentle | light |
| `6.The Lovers` | The Lovers | 恋人 | love, attraction, a meaningful choice | 重要的连接与选择 | Gentle, Sunny | light |
| `7.The Chariot` | The Chariot | 战车 | drive, triumph, willpower | 带着决心往前推 | Fire, Sunny | light |
| `8.Strength` | Strength | 力量 | courage, energy, gentle force | 温柔地和情绪待在一起 | Healing, Gentle | tender |
| `9.The Hermit` | The Hermit | 隐士 | prudence, solitude, inner light | 独处的时间，向内看 | Quiet, Peaceful | tender |
| `10.The Wheel of Fortune` | The Wheel of Fortune | 命运之轮 | fortune, cycles, change | 起起落落，事情在转动 | Drifting, Wonder | tender |
| `11.Justice` | Justice | 正义 | fairness, truth, balance | 对自己诚实，找回平衡 | Peaceful, Fire | tender |
| `12.The Hanged man` | The Hanged man | 倒吊人 | pause, sacrifice, new perspective | 停一停，换个角度看 | Drifting, Quiet | tender |
| `13.Death` | Death | 死神 | ending, transformation | 一段结束，另一段开始 | — | heavy |
| `14.Temperance` | Temperance | 节制 | moderation, balance, healing | 调和，慢慢来 | Healing, Peaceful | light |
| `15.The Devil` | The Devil | 恶魔 | bondage, compulsion, heavy pull | 被什么牵住的感觉 | — | heavy |
| `16.The Tower` | The Tower | 高塔 | sudden upheaval, disruption | 突如其来的变动 | — | heavy |
| `17.The Star` | The Star | 星星 | hope, renewal (Waite: loss; modern: hope) | 难过之后，一点点亮起来 | Healing, Quiet | tender |
| `18.The Moon` | The Moon | 月亮 | uncertainty, illusion, the unclear | 看不清的时候，也没关系 | Drifting, Quiet | tender |
| `19.The Sun` | The Sun | 太阳 | joy, contentment, warmth | 明亮、简单的快乐 | Sunny | light |
| `20.Judgement` | Judgement | 审判 | renewal, awakening, a call | 回头看，然后重新出发 | Healing, Wonder | tender |
| `21.The World` | The World | 世界 | completion, fulfilment, journey | 一个阶段的圆满 | Peaceful, Sunny | light |
| `aa Ace of Wands` | Ace of Wands | 权杖一 | creation, inspiration, new venture | 一个新念头冒出来 | Wonder | light |
| `ab Two of Wands` | Two of Wands | 权杖二 | planning, dominion, looking ahead | 站在高处想想远方 | Wonder | light |
| `ac Three of Wands` | Three of Wands | 权杖三 | enterprise, foresight, waiting for ships | 等待自己种下的东西 | Wonder, Peaceful | light |
| `ad Four of Wands` | Four of Wands | 权杖四 | celebration, harmony, home | 值得庆祝的小归属 | Sunny | light |
| `ae Five of Wands` | Five of Wands | 权杖五 | rivalry, struggle, competition | 磕磕碰碰的摩擦 | Fire | tender |
| `af Six of Wands` | Six of Wands | 权杖六 | victory, recognition, good news | 被看见、被认可 | Sunny | light |
| `ag Seven of Wands` | Seven of Wands | 权杖七 | defending a position, courage | 守住自己在意的东西 | Fire | tender |
| `ah Eight of Wands` | Eight of Wands | 权杖八 | swift action, momentum | 事情忽然加速了 | Sunny, Wonder | light |
| `ai Nine of Wands` | Nine of Wands | 权杖九 | resilience, persistence, wariness | 累了，但还在坚持 | Fire, Drifting | tender |
| `aj Ten of Wands` | Ten of Wands | 权杖十 | burden, overload | 肩上的东西有点多 | Fire, Drifting | tender |
| `ak Page of Wands` | Page of Wands | 权杖侍从 | curiosity, messages, exploration | 好奇心带你去试试 | Wonder | light |
| `al Knight of Wands` | Knight of Wands | 权杖骑士 | energy, departure, adventure | 一股冲劲 | Fire, Wonder | light |
| `am Queen of Wands` | Queen of Wands | 权杖皇后 | warmth, confidence, vitality | 温暖又自信的光 | Sunny | light |
| `an King of Wands` | King of Wands | 权杖国王 | vision, leadership, honesty | 看得远，也愿意带头 | Fire, Sunny | light |
| `ao Ace of Cups` | Ace of Cups | 圣杯一 | new feeling, joy, overflowing heart | 心里有新的东西在流动 | Gentle | light |
| `ap Two of Cups` | Two of Cups | 圣杯二 | partnership, mutual care | 两个人彼此靠近 | Gentle | light |
| `aq Three of Cups` | Three of Cups | 圣杯三 | friendship, celebration | 和朋友在一起的时光 | Sunny, Gentle | light |
| `ar Four of Cups` | Four of Cups | 圣杯四 | apathy, weariness, missed offers | 提不起劲的时候 | Quiet, Drifting | tender |
| `as Five of Cups` | Five of Cups | 圣杯五 | loss, regret, what remains | 失落之外，还剩下的东西 | Quiet | tender |
| `at Six of Cups` | Six of Cups | 圣杯六 | memories, nostalgia, innocence | 想起过去的温暖 | Gentle, Peaceful | light |
| `au Seven of Cups` | Seven of Cups | 圣杯七 | many dreams, choices, illusion | 很多想法，一时难选 | Drifting | tender |
| `av Eight of Cups` | Eight of Cups | 圣杯八 | walking away, seeking more | 离开不再合适的东西 | Quiet, Healing | tender |
| `aw Nine of Cups` | Nine of Cups | 圣杯九 | contentment, wishes fulfilled | 小小的心满意足 | Sunny | light |
| `ax Ten of Cups` | Ten of Cups | 圣杯十 | harmony, lasting happiness, home | 家的温暖 | Gentle, Sunny | light |
| `ay Page of Cups` | Page of Cups | 圣杯侍从 | tender news, intuition, surprise | 心里的小惊喜 | Wonder, Gentle | light |
| `az Knight of Cups` | Knight of Cups | 圣杯骑士 | invitation, romance, following the heart | 跟着心走的邀请 | Gentle | light |
| `ba Queen of Cups` | Queen of Cups | 圣杯皇后 | compassion, intuition, care | 体贴地感受他人和自己 | Gentle, Healing | light |
| `bb King of Cups` | King of Cups | 圣杯国王 | emotional balance, calm wisdom | 情绪起伏里的平稳 | Peaceful | light |
| `bf1 Ace of Swords` | Ace of Swords | 宝剑一 | clarity, breakthrough | 忽然想清楚了 | Wonder, Fire | light |
| `bf2 Two of Swords` | Two of Swords | 宝剑二 | stalemate, difficult choice, truce | 两难时，先不急着决定 | Drifting | tender |
| `bf3 Three of Swords` | Three of Swords | 宝剑三 | heartbreak, sorrow | 心痛 | — | heavy |
| `bf4 Four of Swords` | Four of Swords | 宝剑四 | rest, retreat, recovery | 休息也是一种前进 | Healing, Quiet | tender |
| `bf5 Five of Swords` | Five of Swords | 宝剑五 | conflict, defeat, hollow win | 不愉快的输赢 | — | heavy |
| `bf6 Six of Swords` | Six of Swords | 宝剑六 | transition, moving on, calmer waters | 慢慢离开难过的地方 | Healing, Quiet | tender |
| `bf7 Seven of Swords` | Seven of Swords | 宝剑七 | strategy, going one's own way | 用自己的方法绕过去 | Drifting | tender |
| `bf8 Eight of Swords` | Eight of Swords | 宝剑八 | restriction, feeling trapped | 被思绪困住 | — | heavy |
| `bf9 Nine of Swords` | Nine of Swords | 宝剑九 | anxiety, sleepless worry | 夜里的担心 | — | heavy |
| `bf10 Ten of Swords` | Ten of Swords | 宝剑十 | painful ending, rock bottom | 低谷 | — | heavy |
| `bc Page of Swords` | Page of Swords | 宝剑侍从 | curiosity, vigilance, new ideas | 好奇地观察 | Wonder | light |
| `bd Knight of Swords` | Knight of Swords | 宝剑骑士 | haste, directness, ambition | 急着说出口、做出来 | Fire | tender |
| `be Queen of Swords` | Queen of Swords | 宝剑皇后 | clear boundaries, honesty (Waite: sorrow) | 清醒而诚实 | Peaceful, Fire | tender |
| `bf King of Sword` | King of Sword | 宝剑国王 | clear thinking, authority, judgement | 冷静地判断 | Peaceful | light |
| `bg Ace of Pentacles` | Ace of Pentacles | 星币一 | opportunity, prosperity, a solid start | 一个踏实的开始 | Peaceful | light |
| `bh Two of Pentacles` | Two of Pentacles | 星币二 | juggling, adaptability, balance | 在忙碌里找平衡 | Drifting, Sunny | light |
| `bi Three of Pentacles` | Three of Pentacles | 星币三 | collaboration, craft, recognition | 一起把事情做好 | Sunny | light |
| `bj Four of Pentacles` | Four of Pentacles | 星币四 | holding on, security, control | 抓紧手里的安全感 | Peaceful | tender |
| `bk Five of Pentacles` | Five of Pentacles | 星币五 | hardship, feeling left out in the cold | 难熬的冷天 | — | heavy |
| `bl Six of Pentacles` | Six of Pentacles | 星币六 | generosity, giving and receiving | 给予，也接受 | Gentle | light |
| `bm Seven of Pentacles` | Seven of Pentacles | 星币七 | patience, assessing growth | 耐心看着它长大 | Peaceful | light |
| `bn Eight of Pentacles` | Eight of Pentacles | 星币八 | diligence, practice, craftsmanship | 专注地一点点练 | Peaceful | light |
| `bo Nine of Pentacles` | Nine of Pentacles | 星币九 | self-sufficiency, quiet accomplishment | 自己给自己的从容 | Peaceful, Sunny | light |
| `bp Ten of Pentacles` | Ten of Pentacles | 星币十 | family, legacy, lasting security | 家与慢慢积累的东西 | Gentle, Peaceful | light |
| `bq Page of Pentacles` | Page of Pentacles | 星币侍从 | study, new skill, ambition | 认真学一样新东西 | Wonder | light |
| `br Knight of Pentacles` | Knight of Pentacles | 星币骑士 | steadiness, routine, reliability | 一步一步，稳稳地走 | Peaceful | light |
| `bs Queen of Pentacles` | Queen of Pentacles | 星币皇后 | nurturing, practical care | 好好照顾日常 | Healing, Gentle | light |
| `bt King of Pentacles` | King of Pentacles | 星币国王 | abundance, steady security | 稳稳的掌控感 | Peaceful | light |

File-name notes: `13.Death` has no `.png` extension; `3.The Emprees` and `bf King of Sword` keep the
artwork's spelling.

## Daily draw: the petal ring (built 2026-10-23)

After the calendar check-in the owner spins the **petal ring** and picks one card a day.

- The ring shows a few card places at a time; the whole drawable deck (69 cards) flows
  through them: one step forward brings the next card to the front, a full turn shows the next
  batch, and after the last card it starts again from the first.
- The deck order is shuffled per owner and local day on the server ([lib/petal-card-draw.js](../../lib/petal-card-draw.js)),
  so a refresh or another device shows the same deck. The app learns only the deck size until
  it sends the chosen place; the server then returns that card. One draw a day; a second draw
  returns the first.
- Card backs: the two designs chosen by the owner (`lilac`, `violet`), alternating by day.
- The calendar shows the day's card next to its check-in.
- API: `GET /api/petal-cards/today` (deck size, back, today's card if drawn),
  `POST /api/petal-cards/draw {position}`; `GET /api/fairy/check-ins` adds `petalCards` for the month.
- Migration `202610230003_petal_card_draw` (run it by hand before the backend deploy).

## Daily tarot: topics, reversed cards and the reading (owner decision 2026-10-30)

The daily draw now reads as tarot. The Weekly report card is unchanged (69 cards, code rules,
no model).

- **The whole deck.** The ring deals all 78 cards, the 9 heavy ones included, each with prewritten
  copy that reads its traditional meaning gently (Death: an ending that makes room). Heavy cards
  are still never matched to a Weekly report. Until their 9 paintings are bundled
  (`scripts/compress-petal-cards.mjs`, from the owner's zip) the deck stays at 69: the server deals
  the heavy cards only with `PETAL_HEAVY_CARDS=on`, to set after the web build that bundles them
  (and their copy is checked against the paintings then).
- **Rollout safety.** An app from before topics draws without a topic: it keeps the 69-card deck and
  never gets a reversed card. Only an app that asks `GET /api/petal-cards/today?deck=full` is told
  the full deck size. A card without bundled art keeps its back instead of turning blank.
- **A topic first.** Before spinning, the owner picks one of five topics, once a day:
  今日运势 / Today’s fortune, 接下来的方向 / The way ahead, 感情 / Love, 工作与学习 / Work & study,
  人际关系 / People around you. No money or health topics.
- **Upright or reversed.** About a third of each day's places lie reversed (seeded per owner, day and
  place, like the deck). A reversed card shows upside down, with its reversed keywords; reversed
  means blocked, delayed or turned-inward energy, never bad luck. Every card has three upright and
  three reversed keywords ([lib/petal-card-keywords.js](../../lib/petal-card-keywords.js)).
- **Always:** the card, its orientation and keywords, the prewritten line and text, the disclaimer.
- **The fairy's reading** (owner decision 2026-10-30): every owner gets **3 free readings** (only
  written ones count; a failed attempt does not). After that it is locked until the owner unlocks it
  for good with a one-time purchase, which sets `SubscriptionEntitlement` to `PREMIUM` + `ACTIVE`
  (no purchase flow exists yet; the locked note says it is coming). Owners in
  `PETAL_READING_OWNER_IDS` are never limited. A reading already written stays visible. The reading
  is three short paragraphs by `claude-opus-5-5` ([lib/petal-reading.js](../../lib/petal-reading.js)): what the
  card means in this orientation, what it suggests for the topic today and in the days ahead (as
  tendencies, never certain outcomes), and one gentle thing to keep in mind. Input: the card, its
  orientation, keywords and copy, the topic, and, only while Personalization is on, how often each
  Garden mood was chosen over the last 7 days. Never Event or Journal text.
- **Checked by code:** three paragraphs, language, length (zh 100–280 characters, en 60–190 words),
  no digits, at most one question, content safety, and banned words for certainty, fate, death,
  illness, money and advice. A reading that fails is not shown; each draw gets at most two model
  calls, then the reading section is hidden. The disclaimer is the card's own, added by code.
- **Switches:** `AI_PETAL_READING_MODEL=claude-opus-5-5` turns readings on;
  `AI_PETAL_READING_DAILY_LIMIT=0` stops them (default 3 calls a day per owner). Needs AI Processing.
  Cost: about $0.02 a reading (Opus 5.5, effort low; 30 s gateway timeout). Each call reserves up to
  about $0.05 against `AI_USER_DAILY_USD_LIMIT`, so that limit must allow it.
- API: `GET /api/petal-cards/today` adds `topics` and, on a drawn card, `topic`, `reversed`,
  `keywords` and `reading`; `POST /api/petal-cards/draw {position, topic}`;
  `POST /api/petal-cards/reading {}` writes today's reading if it can and returns its state
  (`NONE`, `GENERATING`, `READY` with `paragraphs`, or `FAILED`), with `freeLeft` (null once
  unlocked) and `locked` (free readings used up).
- Migration `202610300001_petal_tarot` (draw `topic` and `reversed`, the `PetalCardReading` table);
  run it by hand before the backend deploy.
