# 短周报 2.0 第一阶段：基于事实的发现

状态：**已实现，默认关闭**（`WEEKLY_INSIGHTS_OWNER_IDS`，2026-10-29）。只有离线测试和本地网页假数据检查，
**没有调用过真实模型**，没有部署。建在现有短周报（[WEEKLY_SHORT_REPORT_DESIGN.md](WEEKLY_SHORT_REPORT_DESIGN.md)，
`weekly-short-v1`）之上，不替换它。本阶段不做推送、开场仪式、追踪线索、收藏、写给未来、月报/年报改版，
也不做“反复的自我对话”“身体信号”这类敏感模块。是否把发现分付费档位仍待主人决定；第一阶段对开关名单里的人全开。

主人睡前把四个决定交给实现方按建议做（2026-10-29，经主会话转达），**明天审验**：
1. 抽取用代码规则现算；2. 隐藏关联只说“亮”的方向；3. 之后再没写到的打算不出候选；4. 文案先用下面的草稿——
**§3 标题、§5 卡池与理由句、各模块事实句都等主人审。**

## 为什么

现在的“并排放”只是把用户写过的两件事复述一遍。2.0 的思路：先由代码从每条 Event 里抽出**原话片段**
（人、打算、自问、小好事），再由代码算出规律和数字，模型只负责挑和措辞，最后每一句都对回用户自己的话。
数字、名字、引文都不能来自模型。

## 现状里和原提案不一样的两件事

1. **记忆抽取没有模型。** `lib/event-memory.js` 的 `DeterministicMemoryExtractor` 只把 Event 正文截到 500 字存成
   `summary`；`people` / `topics` 读的是 Event 上不存在的字段，所以线上**一直是空数组**。所以这里是新写一套抽取。
2. 周报的模型调用只有一次（Sonnet，`lib/sonnet-weekly.js`），在周一 00:00（账户时区）之后才发生。

## 1. 抽取：代码规则，周报生成时现算

`eventSpans({ id, text, mood })`（[lib/event-memory.js](../../lib/event-memory.js)），输入一条 Event 的 `summary`：

| 字段 | 规则（zh-Hans / en） |
|---|---|
| `people` | 固定关系词表（妈妈、室友、同事、老板、朋友……/ mom, roommate, boss, friend…），长词优先（男朋友不算朋友）。不猜人名 |
| `topics` | 固定话题词表（跑步、考试、面试、工作、睡觉……/ running, exam, interview…）。原稿里“重复出现的短语”没做，词表够第一阶段用 |
| `intents` | “我/我们/句首 +（还/也/真…）+ 想/要/打算/准备/计划/决定”，排除 想到/想起/想法/要是/不想 等；`I want to / I'm going to / I plan to / I'll …`。问句不算 |
| `questions` | 以 ？/? 结尾、句里有 我/自己（I/me/my），不含引号、不是转述（他问我、asked me） |
| `smallGoods` | **只来自** 晴朗/平静/疗愈/温柔 的 Event；4–40 字（3–20 个英文词）的整句，不是问句、不是打算、不含引号和否定/负面词 |
| `sensitive` | `immediateSupportRequired` ＋ 自伤/暴力/性内容词表；命中则这条 Event **什么都不抽**，也不进任何计数和证据 |

句子切分同 then-and-now（被 500 字截断的最后半句丢掉），右引号跟着它的句子。每项都是用户自己字符的整句，带 `sourceEventId`。
规则是确定的，所以**不存库、不迁移、不回填、不加付费调用**；代价是“小好事是否具体”只靠规则粗筛，最后由模型在候选里挑。

## 2. 计算：[lib/insight-compute.js](../../lib/insight-compute.js)（只有代码）

窗口 = 短周报本来就读的五周（本周＋前四周，同一个 source fence），不新增时间规则。
“亮” = 晴朗/平静/疗愈/温柔，与花语卡相同。阈值都是第一版猜测，等真实数据再调（`INSIGHT_LIMITS`）。

| 类型 | 出现条件（不满足就没有候选） | 代码写的事实句（zh） |
|---|---|---|
| `HIDDEN_LINK` 隐藏关联 | 某人/话题在 ≥3 条有心情的 Event 里，≥1 条在本周；其余 Event ≥2 条；这些 Event 的“亮”占比 ≥ ⅔，且比五周总体高 ≥ 25 个百分点 | 这五周有 n 条记录写到“妈妈”，其中 k 条的心情是晴朗、平静、疗愈或温柔；全部 N 条记录里是 B 条。 |
| `SAID_BEFORE` 说过的话 | 一条打算之后还有 ≥3 条 Event，其中 ≥1 条写到同一个关键词（词表词，或去掉虚词后 2–4 个汉字，或英文最后一个实词）；打算或提到它的记录至少一条在本周 | 10月7日你写过：“我想每天早上跑步。”之后的 m 条记录里，有 c 条写到“跑步”。 |
| `SMALL_GOODS` 好事清单 | 本周 ≥2 句小好事（最多送 6 句） | 无（模型挑 2–4 句，代码原样列出） |
| `OPEN_QUESTION` 没回答的问题 | 本周的自问，之后到周末没有 Event 写到它的关键词（没有关键词就算开着）；最多 2 个 | 无（原句由代码引用） |

`score = freshness × strength`：freshness = 证据 Event 的平均 0.7^(第几周前)；strength 按类型、封顶 2。
同分按 HIDDEN_LINK > SAID_BEFORE > SMALL_GOODS > OPEN_QUESTION；最多 6 个候选。
少于 3 条本周 Event 时没有发现（与短周报“并排放”同一条件）。

## 3. 写作：模型合约 `weekly-short-v2`

开关名单里的人才用；其他人仍是 `weekly-short-v1`，一字不变。仍是**一次** Sonnet 调用。

- 输入 = v1 的包 ＋ `candidates: [{ id, type, fact?, quotes: [{ id, text }] }]`，`include` 里多一个 `insights`。
  **注意隐私范围变化：** 候选引文可能来自前四周的 Event，所以前几周的原句现在会发给模型（同一账户、同一授权范围；
  v1 只发本周的）。
- 输出 = v1 的 `line`、`sideBySide`、`question` ＋ `insights: [{ candidate, role: main|secondary, text, picks }]`（最多 4 个）。
- 1 个主发现、最多 3 个副发现；主发现不过而有副发现通过时，分数最高的副发现升为主发现。
- 包的大小：网关的 Weekly 上限不变（8192 字节）。放不下时依次去掉：分数最低的候选（留 2 个）→ 最长的 Event（留 3 条）
  → 剩下的候选 → Event 到 1 条。测试覆盖 6 条 500 字中文和 500 个需要转义的字符两种最坏情况。
- 输出更长（最多 4 段，每段 ≤240 字符），`AI_WEEKLY_REPORT_MAX_OUTPUT_TOKENS` 默认 2048；提示里要求每段 60 字以内。
  上真实模型前要看一次真实输出长度。

**标题（代码模板，≤16 个汉字 / 40 个英文字符，超长或带引号就用后备句）：**

| 主发现 | zh-Hans | en |
|---|---|---|
| HIDDEN_LINK | 写到{主题}的日子，多是亮的 /（后备）常在亮的日子里出现 | Brighter days with {subject} / Often on brighter days |
| SAID_BEFORE | 你说过想{事} / 你说过的一句话 | You said you wanted to {thing} / Something you said |
| SMALL_GOODS | 这周的 {n} 件小好事 / 这周的小好事 | {n} small good things this week |
| OPEN_QUESTION | 一个还开着的问题 | A question still open |

## 4. 校验（任何一条不过，只丢那一条发现）

沿用 [lib/weekly-short.js](../../lib/weekly-short.js) 的 `groundedSentence`（引号里必须是来源 Event 的完整分句、数字只能来自来源）、
`INTERPRETIVE`、`ADVICE`，支持周照旧不调模型。新增：

1. `candidate` 必须是送出的候选；每个发现保存它的证据 Event id 和日期。
2. 数字只能来自该候选的事实句或它的证据原文。
3. 正文里出现的词表人/话题必须在该候选的证据里；英文句中大写词必须出现在来源里。
4. 因果、诊断、预测禁词（导致、由于、让你、焦虑症、抑郁、创伤、人格、以后会、注定、未来… / caused, due to, made you,
   anxiety, trauma, will become, predict…）。这些检查都只看引号**外**的话，用户原话不受影响；
   候选自己的主题词、关键词或心情名可以带引号。
5. 长度 zh ≤80 字、en ≤240 字符，句末标点最多两个；不能是问句。
6. 证据 Event 必须仍在 source fence 里、仍不敏感、仍包含引用的那句话。
7. 好事清单的 `picks` 必须是 2–4 个不重复的本候选引文 id。

整篇超长时从后往前去掉副发现；连主发现都放不下、全部不过、或这段代码抛任何错，**都退回今天的短周报**
（金句、心情曲线、花语卡、并排放、那时与现在、问题），测试逐字比较两者相同。

## 5. 花语卡

仍由代码匹配，仍需 ≥3 个心情点，仍按 owner + 周 的哈希选（重做同一周还是同一张），重牌照旧不进周报。
有主发现时按类型用固定卡池，并加一句代码写的“为什么是这张”（`reason`）；心情事实句 `fact` 照留：

| 主发现 | 卡池 | 为什么是这张 |
|---|---|---|
| HIDDEN_LINK | 圣杯二、教皇、圣杯三、圣杯十 | 小花仙看到你常写到“{主题}”，给你配了「{卡名}」。 |
| SAID_BEFORE | 权杖二、魔术师、星币七、星币八 | 小花仙记得你写过想{事}，给你配了「{卡名}」。（事太长：…写过的那个打算…） |
| SMALL_GOODS | 圣杯九、权杖四、太阳、星币九 | 这周你记下了 {n} 件小好事，小花仙给你配了「{卡名}」。 |
| OPEN_QUESTION | 女祭司、隐士、宝剑侍从、权杖侍从 | 这周你问了自己一个问题，小花仙给你配了「{卡名}」。 |
| 无 | 现有心情走向规则 | 无（只有原来的事实句） |

## 6. 保存与前端

- 保存的每一节仍标 `contractVersion: weekly-short-v1`；新内容是新的 `HEADLINE`、`INSIGHT` 节，旧版 App 认不出就跳过，
  照样显示金句、曲线、花语卡、那时与现在、问题（已用 `main` 上的 App 解析代码验证）。网页和后端分开部署也不会坏。
- `INSIGHT` 节：`type`、`role`、`text`（模型）、`fact`（代码）、`items`（好事清单原句）、`quote`（打算/问题原句）、
  `evidence: [{ sourceEventId, date }]`。`evidenceRefs` 为空（证据可能是前几周、不在本周的选中证据里），
  删除 Event 时 `reportShowsEvent` 会查这些 id。
- [ShortWeeklyReport.tsx](../../mobile/src/components/features/ShortWeeklyReport.tsx)（只负责显示）：标题 → 主发现卡
  （正文、事实句、可点的日期小标签，点开用原来“看完整记录”的读 Event 方式）→ 心情曲线（每朵花可点）→ “这周还有”的副发现卡，
  竖着排 → 本周一句 → 花语卡＋“为什么是这张” → 那时与现在 → 问题＋“写一写”。同一时间只展开一条记录。
  没有发现时版面和今天完全一样。

## 7. 开关、版本和时间

- `WEEKLY_INSIGHTS_OWNER_IDS`：逗号分隔 id 或 `*`；未设、空、格式错 → 没人开（不报错）。只对已在
  `AI_WEEKLY_SHORT_OWNER_IDS` 里的人起作用。
- 任务幂等键里的 `REPORT_NARRATIVE_GENERATION_VERSION` 不变：已经生成过的周不会重做；开关打开后从下一次生成起生效。
- 不新增时间边界、不读时钟：周仍是账户时区周一 00:00 到下周一 00:00。“第几周前”按账户时区本地日期和
  `previousWeeklyPeriod` 算；“之后”都指 `occurredAt` 更晚。见 [time.md](../../time.md) 短周报一节。

## 8. 测试与本地检查

- [test/back/weekly-insights.test.js](../../test/back/weekly-insights.test.js)：抽取规则、四种候选的阈值、每条校验单独失败、
  全部失败/抛错/放不下时与 v1 逐字相同、包大小最坏情况、开关、卡池。
- [test/back/sonnet-weekly.test.js](../../test/back/sonnet-weekly.test.js)：真实 worker ＋ 假网关：开关打开时一次请求用新合约并保存；
  发现不过时保存的是 v1 版面；开关关/格式错时仍是 v1。
- [mobile/test/shortWeeklyReport.test.mjs](../../mobile/test/shortWeeklyReport.test.mjs)（现已加入 mobile `npm test`）。
- 本地网页：`npm run web:local` 的假数据里有两份周报（第 3 周有发现、第 2 周没有），由后端渲染代码离线生成。

## 上真实模型之前

1. 主人审 §3、§5 和事实句的文案。
2. 主人批准后，用合成账户跑一次真实 Sonnet（付费），看输出长度、发现通过率和语气。
3. 再决定给谁开 `WEEKLY_INSIGHTS_OWNER_IDS`。
