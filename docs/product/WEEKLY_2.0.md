# 花语周报 2.0：实现说明（P0 地基 + P1 的四个模块）

状态：**已实现，默认关闭**（`WEEKLY_INSIGHTS_OWNER_IDS`，2026-10-29）。只有离线测试和本地网页假数据检查，
**没有调用过真实模型**，迁移**没有**在任何数据库上跑过，没有部署。产品方向以主人的提案为准：
[WEEKLY_2.0_PROPOSAL.md](WEEKLY_2.0_PROPOSAL.md)（原文不改）。本文件只记录现在的代码做了什么、和提案哪里不同、还差什么。
它替代了第一阶段的说明（原 `WEEKLY_INSIGHTS_V1.md`，见 git 历史）。

一句话：开关名单里的人，周报不再有复述段（“并排放”“本周一句”），改成 **标题 → 主洞察 → 本周花束（心情曲线）→
次洞察 → 那时与现在（“还有一件事”）→ 花语卡 → 给下周的问题**。模型只在两端：抽取（可选 Haiku）和措辞（Sonnet）；
中间的统计、数字、选卡和最后的校验全是代码。任何一步失败，周报只会变短或改用代码模板，不会出错，也不会退回旧版复述。

## 四层流水线

| 层 | 文件 | 做什么 |
|---|---|---|
| 1 抽取 | [lib/insight-extract.js](../../lib/insight-extract.js) | 每条 Event 的记忆存好后，排一个 `INSIGHT_EXTRACTION` 任务（只给开关名单里的人）。抽出人/地点/活动、打算、自问、自我评价、身体信号、小好事；每项存原文和在 `Event.content` 里的 `[start, end)` 位置，存进 `EventInsightExtraction`。 |
| 2 计算 | [lib/insight-compute.js](../../lib/insight-compute.js) | 读本周＋前四周（短周报原有的 source fence），按门槛出候选，写好每条的事实句和数字，排序。 |
| 3 写作 | [lib/insight-write.js](../../lib/insight-write.js) | 一次 Sonnet 调用，输入**只有**候选（E/S 别名、事实句、引文），输出 `headline`、`insights[{id, role, text, evidence_ids, picks}]`、`question`。 |
| 4 校验 | [lib/insight-validate.js](../../lib/insight-validate.js) | 逐条检查，不过就丢；主洞察丢了由下一名补；标题和问题不过就用代码模板。 |

### 1. 抽取

- **默认是代码规则**（词表＋句式，和第一阶段同一套规则，搬进了 `insight-extract.js`）。
  只有同时设了 `AI_INSIGHT_EXTRACTION_PROVIDER=anthropic` 和 `AI_INSIGHT_EXTRACTION_MODEL=claude-haiku-5-5` 才调 Haiku（经 AI Gateway，
  每天每人最多 100 次，计入现有美元上限）。**这是付费推理，开之前要主人单独批准。**
- 模型的输出也要对回原文：找不到原样文字的项直接丢；打算/自问/自我评价一律扩成整句。模型调用失败或被拒，照样存代码规则的结果。
- 敏感内容（`immediateSupportRequired` ＋ 自伤/暴力/性词表，或模型判 `sensitive`）：这条 Event 什么都不存（`status: SENSITIVE`）。
- 存之前在同一事务里重新确认授权、任务认领，并且 Event 没被改过；改过就不存（`SOURCE_CHANGED`）。
- 读的时候（`spanView`）每一项都重新对一遍：文字还在原位置才用，所以改过的 Event 不会引用旧话。没有存储结果的 Event 现算规则。
- 数据去向：Event 删除、账户删除时级联删除；**关闭 Memory 时和记忆、周报一起删除**（`lib/ai-consent.js`）。
- 历史回填：[scripts/backfill-insight-extraction.js](../../scripts/backfill-insight-extraction.js)，只排任务，默认只数不排
  （`INSIGHT_BACKFILL_APPLY=true` 才排），必须写明 owner id，默认回看 90 天。配了 Haiku 时每个任务是一次付费调用，每次实际运行要主人批准。

### 2. 计算（已做的模块）

| 类型 | 门槛（不满足就没有候选） | 事实句（代码写，zh） |
|---|---|---|
| `SAID_BEFORE` 说过的话 | 打算之后还有 ≥3 条 Event，其中 ≥1 条写到同一关键词；打算或提到它的记录至少一条在本周 | 10月7日你写过：“我想每天早上跑步。”之后的 m 条记录里，有 c 条写到“跑步”。 |
| `HIDDEN_LINK` 隐藏关联 | 某人/地点/活动在 ≥3 条有心情的 Event 里，≥1 条在本周，其余 Event ≥2 条；“亮”占比 ≥ ⅔ 且比五周总体高 ≥ 25 个百分点 | 这五周有 n 条记录写到“妈妈”，其中 k 条的心情是晴朗、平静、疗愈或温柔；全部 N 条记录里是 B 条。 |
| `SMALL_GOODS` 好事清单 | 本周亮心情 Event 里 ≥2 句小好事（最多 6 句） | 无（模型挑 2–4 句，代码原样列出） |
| `OPEN_QUESTION` 没回答的问题 | 本周的自问，之后没有 Event 再写到它的关键词；最多 2 个 | 无（原句由代码引用） |
| `TREND` 走向（兜底） | 本周 ≥4 个心情，前半周（一到四）和后半周（五到日）明显变亮或变暗 | 前半周多是「迷茫」，后半周「疗愈」多了起来。（只用代码句，不发给模型措辞） |

- 主洞察按提案的优先级挑：说过的话 > 隐藏关联 > 好事清单 > 没回答的问题 > 走向；**上周的主洞察类型这周让位**
  （从上周保存的 `HEADLINE.insightType` 读）。其余按 `新鲜度 × 证据强度 × 情感显著度` 排，最多 6 个候选。
- 本周少于 3 条 Event：不出洞察，标题是“这周的花还在长”，问题是“这周有哪一刻，你想记下来？”，**不调用模型**。
- “时间回声”暂由现有的“那时与现在”承担（放在次洞察之后，作为“还有一件事”）；向量版的回声没有做。

### 3. 写作

- 仍是**一次** Sonnet 调用（`claude-sonnet-5-5`），合约版本 `weekly-2.0`。包里没有 id、日期、心情和分数，只有别名；
  放不下网关的 8192 字节时从分数最低的候选开始去掉。
- 只剩代码兜底的走向、或者没有候选时，不调用模型（`REPORT_TEMPLATE_ONLY`）。
- 模型侧失败（超时、网络、提供方错误、限流、输出格式错、额度用完）时，这一周用代码模板生成，`provider` 为空；
  授权、配置、任务认领的错误照旧报错，不降级。

### 4. 校验（任何一条不过，只丢那一条）

1. `evidence_ids` 必须非空，而且全是这个候选自己的证据 Event；候选 id 必须是送出去的。
2. 引号里的文字必须是证据 Event 的完整分句（沿用 `groundedSentence`）；候选自己的主题词、关键词和心情名可以带引号。
3. 数字只能来自这个候选的事实句或证据原文。
4. 词表里的人/地点/活动、英文大写词，必须出现在这个候选的证据里。
5. 禁词只看引号**外**：因果（因为、导致、所以、说明你、由于、让你…）、诊断标签（焦虑症、抑郁、创伤、人格、你是一个…的人）、
   预测（预示、注定、将会、未来会、以后会…）、建议（你应该…），以及短周报原有的解读词表。
6. 长度：洞察 zh ≤80 字 / en ≤240 字符；标题 ≤16 字 / 48 字符；问题必须是一句、以问号结尾。
7. 证据 Event 现在必须仍不敏感、仍包含被引用的话。好事清单的 `picks` 必须是 2–4 个不重复的本候选引文 id。

整篇超长时先从后往前去掉次洞察，再去掉“那时与现在”。

## 花语卡

由主洞察类型决定（[lib/petal-card-match.js](../../lib/petal-card-match.js) `INSIGHT_CARDS`），owner + 周 的哈希只在同类型的几张里打破平局，
同一周重做还是同一张；卡面加“为什么是这张”（代码模板，只填代码给的字段）。

| 主洞察 | 卡池 | 为什么是这张（zh） |
|---|---|---|
| 时间回声（未做） | 命运之轮、月亮 | 你在{日期A}和{日期B}写下了相似的话。… |
| 说过的话 | 战车、权杖三 | 你说过“{原句}”，之后 {N} 次写到它。 |
| 隐藏关联 | 圣杯二、恋人 | 写到{主题}的日子，你常选『{心情}』。 |
| 好事清单 | 圣杯三、太阳 | 这周的晴朗来自{小事1}、{小事2}。 |
| 第一次（未做） | 愚者、权杖王牌 | 这是你第一次写到{关键词}。 |
| 没回答的问题 | 隐士、女祭司 | 你问了自己：“{问题原文}” |
| 身体信号（未做） | 宝剑四、节制 | 写到{信号}的 {N} 天，你都选了『{心情}』。 |
| 走向：变亮 / 变暗 | 星星、审判 / 宝剑四、隐士、力量 | 前半周多是『{A}』，后半周『{B}』多了起来。 |

“说过的话（没再提）”那一行没有做：主人 2026-10-29 决定之后没再写到的打算不出候选。卡池里都没有重牌（测试会查）。

## 保存与 App

- 每节仍标 `contractVersion: weekly-short-v1`，所以旧版 App 照样能读；新的 `HEADLINE`（带 `reportVersion: weekly-2.0` 和
  `insightType`）、`INSIGHT` 节旧版 App 会跳过。`INSIGHT` 节有 `type`、`role`、`text`、`fact`、`items`、`quote`、
  `evidence: [{ sourceEventId, date }]`，代码模板生成的带 `template: true`。删除 Event 时 `reportShowsEvent` 会查这些 id。
- App（[ShortWeeklyReport.tsx](../../mobile/src/components/features/ShortWeeklyReport.tsx)、
  [reflections.ts](../../mobile/src/services/reflections.ts)）：沿用第一阶段的版面，新增读 `TREND` 类型，
  以及没有洞察时也显示 2.0 的标题（“这周的花还在长”）。
- 本地网页 `npm run web:local`：第 2 份周报（`w2`）由 2.0 渲染代码离线生成（合成 Event，没有模型）。

## 开关、版本和时间

- `WEEKLY_INSIGHTS_OWNER_IDS`：逗号分隔 id 或 `*`；未设、空、格式错 → 没人开。只对已在 `AI_WEEKLY_SHORT_OWNER_IDS` 里的人起作用。
  抽取任务也只给名单里的人排。
- `REPORT_NARRATIVE_GENERATION_VERSION` 不变：已经生成过的周不会重做。
- 不新增时间边界、不读时钟，见 [time.md](../../time.md)“Weekly 2.0”一节。

## 测试

- [test/back/weekly-2.test.js](../../test/back/weekly-2.test.js)：抽取规则和偏移、模型抽取只留原文、抽取任务（授权、认领、改过不存、
  模型失败存规则）、各模块门槛和事实句、主洞察优先级和“上周让位”、渲染顺序、每条校验单独失败、模板兜底、包大小、开关、卡池。
- [test/back/sonnet-weekly.test.js](../../test/back/sonnet-weekly.test.js)：真实 worker ＋ 假网关：名单内一次请求用 2.0 合约并保存；
  洞察不过时存代码模板版；提供方失败时也存模板版；名单外/格式错仍是短周报。
- [test/back/ai-consent-lifecycle.test.js](../../test/back/ai-consent-lifecycle.test.js)：关闭 Memory 会删除抽取结果，清理失败时一起回滚。
- [mobile/test/shortWeeklyReport.test.mjs](../../mobile/test/shortWeeklyReport.test.mjs)：`TREND` 主洞察、无洞察时的 2.0 标题。

## 上线前还要做的事（都需要主人决定或批准）

1. 审文案：代码模板标题和问题（`insight-write.js`）、各模块事实句、花语卡“为什么是这张”。
2. 迁移 `202610310001_weekly_insight_extraction`（只新增一张表和一个枚举值）要先在 TEST 环境跑，生产迁移另行批准。
3. 是否开 Haiku 抽取（付费），以及回填的范围和节奏（提案开放问题）。
4. 用合成账户跑一次真实 Sonnet（付费），看输出长度、通过率和语气。
5. 再决定给谁开 `WEEKLY_INSIGHTS_OWNER_IDS`。

## 还没做（提案里有，留到后面）

- P1 的前端新首屏：开报仪式（花苞展开）、本周花束替代心情曲线、次洞察左右滑动、“不准确 / 隐藏”按钮。
- 时间回声（向量检索）、第一次、身体信号、节律、反复的句式、线索更新；花语集、跟进线索、回答问题、给未来的信；月报和年鉴。
- 用户屏蔽人名或主题。
