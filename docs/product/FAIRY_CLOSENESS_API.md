# PPL 亲密度 · 日历签到 · 信物 — 前端接口说明

后端已经写好，前端只需要调下面 5 个接口。加亲密度的大部分逻辑都在后端自动完成。
- 规则：[lib/fairy-closeness.js](../../lib/fairy-closeness.js)
- 信物：[lib/fairy-keepsakes.js](../../lib/fairy-keepsakes.js)，一共 33 个，和美术的 Keepsake Icons 图一一对应，包括 PPL 对每个信物说的话
- 路由：[server.js](../../server.js)

## 通用

- 地址：和其它接口一样走 `EXPO_PUBLIC_API_BASE_URL`，带登录 token（现有的 `apiRequest` 就行）。
- 开关：后端环境变量 `FAIRY_CLOSENESS_OWNER_IDS`（内测填 `*`）。**没开时所有接口返回 404**，前端看到 404 就隐藏亲密度入口和日历签到卡片。
- 语言：返回里的 `locale` 是 `en` 或 `zh-Hans`，跟用户设置里的语言走。信物名字、PPL 的话、称号都已经按这个语言给好，前端直接显示。
- 「一天」按账号时区算，不是手机时区。日期都是 `YYYY-MM-DD` 字符串。

## App 里已经做好的（全部按设计稿接好了）

- 画面 2 花仙入口卡片：[FairyEntryCard.tsx](../../mobile/src/components/fairy/FairyEntryCard.tsx)。点底部的 Fairy 图标会打开，两个按钮的红点都已接好。
- 画面 3、4、5 日历签到：日历顶部是签到卡片，签过的日子有小花，连续的日子之间连一条藤，当天详情里有签到记录。签到后弹出信物。
  代码在 [CalendarCheckIn.tsx](../../mobile/src/components/bond/CalendarCheckIn.tsx) 和 [KeepsakeReveal.tsx](../../mobile/src/components/bond/KeepsakeReveal.tsx)，日历是 [GardenCalendar.tsx](../../mobile/src/components/garden/GardenCalendar.tsx)。
- 画面 5–8 亲密度页面：等级、进度条、PPL 的话、陪伴天数、信物数量、今日进度、签到奖励、等级与解锁，都在 [OurBondPanel.tsx](../../mobile/src/components/bond/OurBondPanel.tsx)。
- 画面 9、10 信物收藏册和详情：[KeepsakeBook.tsx](../../mobile/src/components/bond/KeepsakeBook.tsx)。
  从 2026-11-06 起，信物收藏册和头像收藏不在亲密度页面里，改从花园右侧日历下方的「收藏 Collection」图标打开：[CollectionPanel.tsx](../../mobile/src/components/collection/CollectionPanel.tsx)。今天签到得到、还没在收藏册里看过的信物，以及可以兑换的头像奖励，会让这个图标亮小红点（[collectionAlerts.ts](../../mobile/src/services/collectionAlerts.ts)）；签到弹窗点「收下」后，信物会飞进这个图标。注册时只能在 8 张原版头像里选 1 张（Level 1），同时随机再送 3 张 Level 1 头像；这 3 张在头像收藏里标「New」，看过一次头像收藏后 New 和小红点都会消失。
- 文案在 [bondCopy.ts](../../mobile/src/components/bond/bondCopy.ts)，默认英文，用户设了简体中文才显示中文。
- 信物图在 `mobile/assets/keepsakes/<id>.webp`，是从 Keepsake Icons 图里切出来的，按同样文件名换成原图就会更清楚。
- 在花园里指挥 PPL 去喝茶、荡秋千等，会自动调用 `POST /api/fairy/closeness/tap`。前端最多每分钟调一次，服务器每天最多算 5 次。

## 设计稿 → 接口对照

| 画面 | 用哪个接口 |
|---|---|
| 2 花仙入口卡片（亲密度 / 朋友圈） | 亲密度红点：`GET /api/fairy/closeness` 的 `checkIn.checkedInToday` 为 false 时显示；朋友圈红点：沿用现在的 `moments.unread` |
| 3 日历（签到标记、连签藤蔓、当天详情） | `GET /api/fairy/check-ins?month=` |
| 4 签到领取信物 | `POST /api/fairy/check-in` |
| 5 签到奖励（本周 n/7、本月 n/20、本月限定） | `GET /api/fairy/closeness` 的 `checkIn`、`monthly` |
| 6 亲密度主界面（等级、进度条、PPL 的话、陪伴天数、信物数量） | `GET /api/fairy/closeness` |
| 7 今日进度 | `GET /api/fairy/closeness` 的 `today` |
| 8 等级与解锁 | 当前等级用 `level`，等级表见本文末尾（固定不变） |
| 9、10 信物收藏册和详情 | `GET /api/fairy/keepsakes` |
| 花园里点 PPL | `POST /api/fairy/closeness/tap` |
| 11、12 朋友圈 | 沿用现有的朋友圈接口，见文末「朋友圈设计稿里还没有后端的部分」 |

## 1. `POST /api/fairy/check-in` — 日历里的签到按钮（画面 4）

请求体为空或 `{}`，多传字段会返回 400。每天只能签一次。**重复调用不会报错**，会返回 `created: false` 和今天已经领到的信物，所以可以放心重试。

```json
{
  "created": true,
  "checkIn": { "localDate": "2026-10-22", "streak": 7, "graceUsed": false },
  "keepsakes": [
    { "id": "tiny-shell", "rarity": "COMMON", "name": "小贝壳", "note": "它的主人搬家了，我替你好好收着。", "reason": "DAILY", "firstTime": true },
    { "id": "wisteria-music-box", "rarity": "RARE", "name": "紫藤音乐盒", "note": "它会放紫藤春天哼的歌，想念花园的时候就转一转。", "reason": "STREAK_7", "firstTime": true }
  ],
  "awarded": 30,
  "levelUp": { "level": 3, "title": "渐渐熟悉" },
  "locale": "zh-Hans"
}
```

- `keepsakes`：今天领到的信物，通常 1 个，最多 3 个，按顺序一个个弹出。
  - `note`：放在画面 4 的信纸上，后面落款「— PPL ♡」。
  - `reason`：`DAILY` 每日 / `STREAK_7` 连签第 7 天 / `MONTHLY` 本月限定。
  - `firstTime: true`：可以加一个「新收集」标记。
- `awarded`：这次加了多少亲密度。
- `levelUp`：升级了才有值，不为 null 时弹「升级到 Lv3 · 渐渐熟悉」。
- `graceUsed: true`：表示前一天漏签，用掉了本周的补签机会，可以提示一句「PPL 帮你把连签留住了」。

## 2. `GET /api/fairy/check-ins?month=YYYY-MM` — 日历（画面 3）

`month` 不传就是本月。只返回签过到的那些天：

```json
{
  "locale": "zh-Hans", "month": "2026-10", "today": "2026-10-22",
  "days": [
    { "localDate": "2026-10-21", "streak": 6, "graceUsed": false, "points": 10,
      "keepsakes": [{ "id": "glowing-petal", "rarity": "COMMON", "name": "发光花瓣", "reason": "DAILY" }] },
    { "localDate": "2026-10-22", "streak": 7, "graceUsed": false, "points": 30,
      "keepsakes": [{ "id": "tiny-shell", "rarity": "COMMON", "name": "小贝壳", "reason": "DAILY" },
                    { "id": "wisteria-music-box", "rarity": "RARE", "name": "紫藤音乐盒", "reason": "STREAK_7" }] }
  ]
}
```

- 日历翻月时，用 `month` 参数取那个月的数据。
- **连签藤蔓**：相邻两天都在 `days` 里，就把它们连起来。`graceUsed: true` 的那天，说明前一天的漏签被补上了，藤蔓也照样连过去。
- **当天详情**「每日签到 获得发光花瓣 +10 亲密度」：用 `keepsakes[0].name` 和 `points`。
- 「写下了今日心情」「有花朵」这两类标记，继续用日历现在的数据。

## 3. `GET /api/fairy/closeness` — 亲密度主界面、今日进度、签到奖励（画面 5、6、7）

```json
{
  "locale": "zh-Hans", "localDate": "2026-10-22",
  "level": 3, "title": "渐渐熟悉", "total": 101,
  "pointsIntoLevel": 16, "pointsForNextLevel": 65,
  "nextTitle": { "level": 5, "title": "花园好友" },
  "maxed": false,
  "greeting": "你不在的时候，我会替你看看花。",
  "daysTogether": 18,
  "today": [
    { "source": "CHECK_IN", "count": 1, "dailyCap": 1, "points": 10, "pointsEach": 10 },
    { "source": "STREAK_7", "count": 1, "dailyCap": 1, "points": 20, "pointsEach": 20 },
    { "source": "EVENT", "count": 2, "dailyCap": 3, "points": 10, "pointsEach": 5 },
    { "source": "MOMENT_LIKE", "count": 0, "dailyCap": 3, "points": 0, "pointsEach": 2 },
    { "source": "FAIRY_TAP", "count": 1, "dailyCap": 5, "points": 1, "pointsEach": 1 },
    { "source": "WEEKLY_READ", "count": 0, "dailyCap": 1, "points": 0, "pointsEach": 15 }
  ],
  "checkIn": { "checkedInToday": true, "streak": 7, "cycleDay": 7, "graceAvailable": true, "checkInsToStreakReward": 7 },
  "monthly": { "month": "2026-10", "checkIns": 7, "needed": 20, "earned": false,
    "keepsake": { "id": "crocus-brooch", "rarity": "MONTHLY", "name": "番红花胸针", "month": 10 } },
  "collection": { "owned": 8, "received": 8, "total": 33 },
  "unlocks": [
    { "level": 3, "key": "MOMENTS_FOR_YOU", "status": "coming_soon", "unlocked": true },
    { "level": 5, "key": "MORE_RARE_KEEPSAKES", "status": "live", "unlocked": false },
    { "level": 8, "key": "MAILBOX_LETTERS", "status": "coming_soon", "unlocked": false },
    { "level": 12, "key": "AVATAR_FRAME", "status": "live", "unlocked": false },
    { "level": 16, "key": "EASIER_MONTHLY_KEEPSAKE", "status": "live", "unlocked": false },
    { "level": 20, "key": "ETERNAL_LETTER", "status": "coming_soon", "unlocked": false }
  ]
}
```

**画面 6 亲密度主界面**
- 进度条：`pointsIntoLevel / pointsForNextLevel`，例如「16 / 65，还差 49 点升到 Lv.4」。
  - `maxed: true` 时，`pointsForNextLevel` 是 null，显示满级。
- `nextTitle`：下一个**称号**，不一定是下一级。比如现在是 Lv3，它显示「Lv5 花园好友」。
- `greeting`：PPL 说的那段话。按等级段换内容，同一天内固定不变。
- `daysTogether`：陪伴天数，从 PPL 来到花园那天算起，当天算第 1 天。
- 信物数量：用 `collection.received`，是收到过的总数，重复的也算。

**画面 7 今日进度**
- 用 `today`，每一行显示成「写一条心情 2/3」，也就是 `count` / `dailyCap`。
- `STREAK_7` 只在连签第 7 天才会有，平时可以不显示这一行。

**画面 5 签到奖励，和日历顶部的签到卡片**
- 用 `checkIn`：
  - `checkedInToday`：按钮显示「签到」还是「今天已签到」。
  - `streak`：已连签天数。
  - `cycleDay`：这一轮 7 天里是第几天（1–7），对应「本周签到 5/7 天」和第 1–7 天的图标。
  - `checkInsToStreakReward`：还差几次签到拿稀有信物，等于 1 时显示「今天签到必得稀有信物」。
  - `graceAvailable`：本周的补签机会还没用掉。
- `monthly`：本月限定信物的进度，例如「本月签到 7 / 20 天」。`earned: true` 表示已经拿到。
  - 5 / 10 / 15 / 20 这几个节点只是显示用，只有满 20 天有奖励（Lv16 以后变成 16 天）。
  - **目前只有十月有限定信物，其他月份 `monthly` 是 null**。这时把「本月限定」那一块藏起来，等美术画了新的再加。

**画面 8 等级与解锁**
- `unlocks` 是各等级的解锁内容。`status: "coming_soon"` 的显示「即将开放」。
- `AVATAR_FRAME`（Lv12 头像框）由前端根据 `unlocked` 自己画。
- 列表里的勾和锁，用 `level` 和文末的等级表就能算出来。

## 4. `GET /api/fairy/keepsakes` — 信物收藏册和详情（画面 9、10）

返回全部 33 个信物，没拿到的也会返回，用来显示灰色剪影。**没拿到的不带 `note`**，PPL 的话要拿到后才能看见。

```json
{
  "locale": "zh-Hans", "owned": 8, "received": 8, "total": 33,
  "keepsakes": [
    { "id": "glowing-petal", "rarity": "COMMON", "name": "发光花瓣", "note": "晚上它会微微发光。累的时候，就把它放在身边吧。", "owned": true, "count": 1, "firstLocalDate": "2026-10-21" },
    { "id": "dewdrop", "rarity": "COMMON", "name": "晨露水滴", "owned": false, "count": 0, "firstLocalDate": null }
  ]
}
```

- 底部的「已收集 8 / 33」用 `owned / total`。
- 「全部 / 普通 / 稀有 / 限定」的筛选，按 `rarity` 分：`COMMON` / `RARE` / `MONTHLY`。
- 画面 10 的「获得时间」用 `firstLocalDate`，详情里的那段话用 `note`。
- 顺序固定，和美术图一致：普通 24 个 → 稀有 8 个 → 限定 1 个。

## 5. `POST /api/fairy/closeness/tap` — 在花园里点到 PPL

在花园里点到 PPL 本人时调一次，请求体为空。每天最多算 5 次，超出后返回 `awarded: 0`，不会报错。

```json
{ "awarded": 1, "levelUp": null }
```

## 6. 花园宠物：配饰、食物（[lib/garden-pets.js](../../lib/garden-pets.js)）

和亲密度同一个开关，没开时返回 404。

**等级奖励**

| 等级 | 奖励 |
|---|---|
| Lv3 | 小花仙朋友圈开放。已经有帖子的账号不受影响；不在亲密度开关里的账号照旧 |
| Lv4–8 | 每升一级解锁 1 对第一行配饰（帽子，10 件） |
| Lv9–15 | 每升一级随机解锁 1–3 对第三行配饰（挂饰，13 件），拿完为止 |
| Lv16–20 | 每升一级随机解锁 1–2 对第二行配饰（披肩，9 件），拿完为止 |

一对 = 同一行里随机搭的 2 件，两张配饰图的件混在一起，不重复。解锁只由账号和等级算出来，数据库里不存，所以老用户打开时已经拥有当前等级该有的全部配饰。顺序是帽子、挂饰、披肩：披肩对宠物外形改变最大，放在最后。数量算过：10 件 = 5 级 × 2 件，13 件 ≤ 7 级 × 至少 2 件，9 件 ≤ 5 级 × 至少 2 件，每行到该段最后一级一定发完。

旧的 `unlocks` 列表保留给还没更新的 App。新版读 `GET /api/fairy/closeness` 的 `bondRewards`。Lv5 稀有信物概率和 Lv16 月度信物 16 天这两条效果还在，只是不再列出来。

**食物来源**（`GardenPetFood` 流水，库存 = 求和）

| 来源 | 数量 |
|---|---|
| 每日签到 | 1 个随机食物（`POST /api/fairy/check-in`，同一天重试不重复） |
| 每升一级 | 5 个随机食物。下次打开宠物时补发，老用户已到的等级也补一次 |
| 账号前 7 个本地日，当天第一次种花 | 3 个随机食物，最多 21 个（`POST /users/:userId/flowers/:flowerId/placement` 之后） |

**接口**

- `GET /api/fairy/pets`：`accessories`（32 件，`row` 是 `hat` / `collar` / `pendant`，`unlocked` 决定要不要小锁）、`outfits`（每只宠物穿什么）、`foods`（库存）。
- `PUT /api/fairy/pets/:petId/outfit`，请求体 `{ hat, collar, pendant }`，传 `null` 是脱下。没解锁返回 409 `ACCESSORY_LOCKED`，不是这一行的件返回 400。
- `POST /api/fairy/pets/:petId/feed`，请求体 `{ foodId }`，返回 `{ foodId, count }`。没有库存返回 409 `NO_FOOD`。
- `petId`：`puppy` `hedgehog` `butterfly` `rabbit` `bluebird` `maltese`。喂食和摸头不加亲密度。
- 小白（`maltese`）只能穿自己的两套，每格两件：浅色款是头饰 `flower-sprig`（小花夹）、披风 `petal-capelet`（紫色小披肩）、挂饰 `crystal-drop`（粉色蝴蝶结）；Noble 款是头饰 `golden-circlet`（紫藤金叶头饰）、披风 `midnight-cape`（星夜紫披肩）、挂饰 `crystal-spire`（紫晶扣链）。别的件返回 400 `UNKNOWN_ACCESSORY`（`lib/garden-pets.js` 的 `PET_OWN_PIECES`）。解锁规则和其他件一样。花园里一次只显示一套：有披风就以披风那套为准，没有就看头饰，再看挂饰；Noble 披风自带水晶扣，同时戴的 Noble 挂饰不显示。

**花园里怎么显示（App，[puppyLooks.ts](../../mobile/src/components/garden/critters/puppyLooks.ts)）**

目前只有小狗画了穿搭。它有两套自己的配饰，每套三件：第二套是 `flower-sprig`（头饰）、`petal-capelet`（披风）、`crystal-drop`（挂饰），其余的件都按第一套画。披风自带水晶扣，所以穿披风时不显示挂饰，不穿披风时挂饰显示成项链。一次只画一套：两套的件混穿时，以披风所在的那套为准，没披风就以头饰那套为准，另一套的件不显示。每种造型都有走、追鸟跑、坐下三组动画，同一只狗、同样大小；追鸟跑的时候换装，小狗先坐下再换。

## 后端自动加的亲密度（前端不用调）

| 行为 | 加多少 | 每天上限 | 在哪里加 |
|---|---|---|---|
| 签到 | +10 | 1 | `POST /api/fairy/check-in` |
| 连签第 7 天 | +20 | 1 | 同上 |
| 写一条心情 | +5 | 3 | `POST /events` 创建成功时 |
| 给 PPL 的朋友圈点赞 | +2 | 3 | `POST /api/fairy/moments/:id/like`，同一条帖子只算一次 |
| 在花园里点 PPL | +1 | 5 | `POST /api/fairy/closeness/tap` |
| 打开周报 | +15 | 1 | `GET /ai/reports/weekly/:id`，同一份周报只算一次 |

写完心情、点完赞、看完周报回到页面后，重新拉一次 `GET /api/fairy/closeness` 就能看到最新数值。

## 等级

升下一级需要 `20 + 15 × 当前等级` 点：Lv1→2 要 35 点，Lv5→6 要 95 点，Lv10→11 要 170 点，Lv19→20 要 305 点。满级 Lv20 一共要 3,230 点。

画面 6 里的「420 / 650」只是示意数字，实际以接口返回为准。

| 等级 | 称号（中 / 英，和画面 8 一致） |
|---|---|
| 1–2 | 初次相遇 / First Encounter |
| 3–4 | 渐渐熟悉 / Getting Familiar |
| 5–7 | 花园好友 / Garden Friend |
| 8–11 | 心事伙伴 / Trusted Companion |
| 12–15 | 知心花友 / Kindred Spirit |
| 16–19 | 默契知己 / In Perfect Harmony |
| 20 | 一生花伴 / Eternal Bloom |

## 信物图片

前端用 `id` 对应美术图。名字和文字以后端返回为准。

| 类别 | id（顺序和美术图一致） |
|---|---|
| 普通 | `dewdrop` `glowing-petal` `acorn-teacup` `firefly-bottle` `feather-bookmark` `four-leaf-clover` `tiny-lantern` `crocus-seed-pouch` `pressed-flower-envelope` `lily-pad-pin` `little-ribbon` `mossy-pebble` `butterfly-wing-shard` `morning-mist-vial` `blossom-bell` `tea-biscuit-tin` `miniature-bridge` `tiny-shell` `pearl-leaf` `crystal-raindrop` `hanging-tassel` `flower-key` `tiny-book-token` `garden-coin` |
| 稀有 | `moonlight-shell` `star-candy-jar` `swing-ribbon` `crystal-lantern` `wisteria-music-box` `floating-petal-mirror` `silver-watering-charm` `moonlit-letter-set` |
| 限定 | `crocus-brooch`（十月） |

以后美术每画一个新月份的限定信物，就在 [lib/fairy-keepsakes.js](../../lib/fairy-keepsakes.js) 里加一行，前端加一张图。

## 朋友圈设计稿里还没有后端的部分

画面 11、12 里有几处现在后端还没有，需要的话告诉 Xingran，再单独加：
- 顶部「日常 / 花园 / 写给你」分类：目前帖子没有分类字段。「写给你」对应 Lv3 解锁的 `MOMENTS_FOR_YOU`，现在还是 `coming_soon`。
- 点赞数「128」和评论数「23」：现在只有你自己能给 PPL 点赞，没有总数。
- 评论框「写下你的回应…」：现在还没有评论或回复的接口。

在这之前，画面 11、12 先按现有能力做：显示帖子、可以点赞，不显示数字和评论框。

## 错误

| 状态码 | 含义 |
|---|---|
| 404 | 功能没开，或者账号没有资料 |
| 400 | `month` 格式不对，或者签到、点击接口多传了字段 |
| 401 | 没登录 |
| 500 | 服务器出错，可以稍后重试 |

签到可以安全重试，不会重复发信物。
