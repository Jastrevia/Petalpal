# 花语卡牌面文案 V2：全稿（B 批，待批注）

状态（2026-11-11）：**只是稿子，代码没有改**。确认后才会写进 `lib/petal-cards.js` 并同步测试。
方向见 [CONTENT_UPGRADE.md](CONTENT_UPGRADE.md)：温柔但不诗意。

## 两轮改稿

- **第一轮（已通过）：牌名下面那一句。** 用平常的话说这张牌讲什么；原句已经平实的没动，表里标“一句不变”。
- **第二轮（这次新改，待确认）：正文。** 第一轮的正文是“画面描述 + 这张牌讲的是……”，批注后全部重写：
  - 不描述画面（用户看得到牌），不用固定句式；
  - 一到两句平实的话，讲这张牌的传统含义：通常描述什么处境，在工作、关系、自己身上常指什么；
  - 不重复上面那一句的意思，在它之外补充；
  - 不比喻、不抒情、不用安慰式收尾；不对用户提建议或预测（这段也会出现在周报里）；
  - 正逆位共用，只写牌本身；各张开头不同；英文按同一标准独立写。

表里“改后”一栏：**粗体是一句（第一轮）**，下面是正文（第二轮）。

## 写进代码时连带要改的两处（还没改）

1. 解读 prompt（`lib/petal-reading.js`）里对 `d` 的说明，从“picture text”改成“牌面含义文字”，“不复述 s / d”保留。
2. 周报“为什么是这张”（`lib/insight-write.js`）去掉第二句“这张牌讲的是……”，只留事实句。卡片正文已经在讲牌的含义，两处不再说同一件事。这是改动最少的做法：删掉 `CARD_MEANINGS` 和拼接，测试里对应的断言同步。

## 大阿尔卡那（19 张）

| 牌 | | 现在 | 改后 | 批注 |
|---|---|---|---|---|
| 愚者<br>`major-00` | 中 | **带着好奇，先走出一步。**<br>小花仙扛着小包袱、捧着一束小白花走到崖边，小白狗跟在脚边。路还看不清，好奇心已经先出发了。 | **带着好奇，开始一件新的事。**<br>常指一段新的经历刚开始：没有经验，也没有包袱，结果还说不准。 | |
| The Fool | EN | **Curious first, one step out.**<br>The fairy walks to the cliff’s edge with a small bundle and a handful of white flowers, a white pup at her heels. The path isn’t clear yet, but her curiosity has already set off. | **Starting something new, out of curiosity.**<br>Usually about the very start of something: little experience, little baggage, and no way yet to know how it will turn out. | |
| 魔术师<br>`major-01` | 中 | **手边的东西，已经够开始了。**<br>小花仙举起一根魔杖，桌上摆着一只杯子、一枚星币、一把小剑和一根枝条。不用等都准备齐，手边这些就能用。 | （一句不变）<br>指有能力、有条件把想法变成实际的东西。常出现在需要自己动手、主动推进的事情上。 | |
| The Magician | EN | **What’s at hand is enough to begin.**<br>The fairy raises a wand; on the table sit a cup, a pentacle, a small sword and a branch. Nothing needs to be complete first. These are enough. | **What you have is enough to begin.**<br>Having the skill and the means to turn an idea into something real. It often comes up around things you have to start and drive yourself. | |
| 女祭司<br>`major-02` | 中 | **安静下来，先听听自己。**<br>小花仙坐在两根柱子中间，手里拿着一卷书卷，脚边有一弯月亮。外面很吵的时候，心里的声音也还在。 | **安静下来，听听自己的想法。**<br>和直觉有关：有些事心里其实已经有了答案，只是还没说出口，也说不清理由。 | |
| The High Priestess | EN | **Get quiet, and listen to yourself.**<br>The fairy sits between two pillars, a scroll in her hands and a crescent moon at her feet. When the world is loud, your own voice is still there. | **Get quiet and listen to yourself.**<br>About intuition: an answer you already half know but have not said aloud and cannot yet explain. | |
| 皇后<br>`major-03` | 中 | **被照顾，也照顾别人。**<br>小花仙靠在花藤缠绕的椅子上，脚边是金黄的麦子和一只小兔子。被好好照顾过的心，长得出照顾别人的力气。 | （一句不变）<br>多指生活里滋养人的那一面：身体、饮食、休息，和让人放松的关系。也和创造、孕育新的东西有关。 | |
| The Empress | EN | **Cared for, and caring too.**<br>The fairy leans back in a flower-wound chair, golden wheat and a small rabbit at her feet. A heart that has been well looked after grows the strength to look after others. | **Being cared for, and caring for others.**<br>The nourishing side of life: the body, food, rest and relationships you can relax in. Also linked to creating or growing something. | |
| 皇帝<br>`major-04` | 中 | **给日子搭一个稳稳的框。**<br>小花仙坐在刻着羊头的石椅上，背后是不动的山。有一点规律和边界，心就有地方可以靠。 | **给生活定下规律和边界。**<br>关于结构和责任：定规则、做安排、对结果负责。在工作里常指管理和权威。 | |
| The Emperor | EN | **A steady frame for the days.**<br>The fairy sits on a stone chair carved with rams, still mountains behind her. A little routine and a few edges give the heart something to lean on. | **Routine and clear boundaries.**<br>About structure and responsibility: setting rules, making arrangements and answering for the result. At work it often points to management and authority. | |
| 教皇<br>`major-05` | 中 | **靠近信任的人和熟悉的方式。**<br>小花仙坐在高高的椅子上，两个小伙伴在下面安静地听她讲。熟悉的做法和信任的人，本身就是一种依靠。 | **信任的人，熟悉的做法。**<br>涉及老师、长辈、学校、行业这类既有的体系，以及从中学到的规矩和价值观。 | |
| The Hierophant | EN | **Close to trusted people and familiar ways.**<br>The fairy sits up high while two friends listen quietly below. Familiar ways and people you trust are a kind of support in themselves. | **Trusted people and familiar ways.**<br>Concerns established systems such as teachers, elders, schools or a profession, and the rules and values learned from them. | |
| 恋人<br>`major-06` | 中 | **重要的人，重要的选择。**<br>小花仙和伙伴手牵着手站在花园里，头顶有一位发着光的花仙张开双手。在意谁、选择什么，都藏着你很珍惜的东西。 | （一句不变）<br>既指亲密的感情，也指按自己的价值观做出的决定。两个人是否合拍，常是它的重点。 | |
| The Lovers | EN | **People who matter, choices that matter.**<br>The fairy and a friend stand hand in hand in the garden, a glowing fairy opening her arms above them. Who you care about and what you choose both hold something you treasure. | **The people and choices that matter.**<br>Both close relationships and decisions made by your own values. Whether two people are well matched is often its focus. | |
| 战车<br>`major-07` | 中 | **带着决心，往前推一点。**<br>小花仙站在小车上，前面趴着一黑一白两只斯芬克斯。心里有一股劲的时候，不一样的力气也能一起往前。 | **下了决心，往前推进。**<br>常见于需要自律和意志力的时候：目标明确，但心里有几种不同的想法，要靠自己统一起来。 | |
| The Chariot | EN | **Pushing on, with resolve.**<br>The fairy stands in a small chariot, a black sphinx and a white one resting in front. With that drive inside, different strengths can still move forward together. | **Decided, and moving forward.**<br>Common when self-discipline and willpower are needed: the goal is clear, but you want several different things and have to bring them into line yourself. | |
| 力量<br>`major-08` | 中 | **温柔地，和情绪待在一起。**<br>小花仙轻轻捧着狮子张开的嘴，狮子身上挂着花环。很大的情绪不用赶走，温柔地陪着它就好。 | **耐心地和情绪相处。**<br>这里的力量是内在的：自制、勇气和同情心。它描述的是不靠强硬也能把局面稳住。 | |
| Strength | EN | **Staying gently with a feeling.**<br>The fairy gently holds the lion’s open jaws; a garland hangs on its mane. A big feeling doesn’t have to be chased away. Keeping it gentle company is enough. | **Being patient with a strong feeling.**<br>The strength here is inner: self-control, courage and compassion. It describes keeping a situation steady without being hard. | |
| 隐士<br>`major-09` | 中 | **一个人的时候，向里看看。**<br>小花仙提着一盏小灯，站在夜里的山顶上。灯只照亮脚下一步，也够了。 | **独处，向内看。**<br>多指主动从热闹里退出来一段时间，为的是弄明白自己真正要什么。也可以指向有经验的人求教。 | |
| The Hermit | EN | **Time alone, looking inward.**<br>The fairy holds a small lantern on a mountaintop at night. The light only reaches the next step, and that is enough. | （一句不变）<br>Usually a deliberate step back from company for a while, to work out what you really want. It can also point to seeking advice from someone experienced. | |
| 命运之轮<br>`major-10` | 中 | **起起落落，日子在转。**<br>一个大轮子在云里慢慢转，小花仙坐在轮子顶上，四个角的小兽在读书。高的时候和低的时候，都是同一个轮子的一部分。 | **有起有落，事情在变化。**<br>涉及不由个人控制的转变，比如时机和环境。强调的是变化本身，不分好坏。 | |
| The Wheel of Fortune | EN | **Ups and downs, the days keep turning.**<br>A great wheel turns slowly in the clouds, the fairy sitting on top while creatures read in the four corners. The high times and the low ones belong to the same wheel. | **Ups and downs; things are changing.**<br>Concerns turns that are outside one person’s control, such as timing and circumstances. The emphasis is on change itself, neither good nor bad. | |
| 正义<br>`major-11` | 中 | **对自己诚实一点。**<br>小花仙坐在两根柱子中间，一手举剑，一手拿天平。心里两边的东西都放上去看看，不急着分对错。 | **对自己诚实。**<br>关于责任和后果：做过的事会有相应的结果。也常和合同、规则、需要权衡的决定有关。 | |
| Justice | EN | **A little more honest with yourself.**<br>The fairy sits between two pillars, a sword in one hand and scales in the other. Both sides can go on the scales, with no rush to decide who is right. | **Being honest with yourself.**<br>About accountability: actions have matching consequences. Often linked to contracts, rules and decisions that need weighing. | |
| 倒吊人<br>`major-12` | 中 | **停一停，换个角度看。**<br>小花仙倒挂在树枝上，头发垂下来，表情很平静。卡住的时候停一下，倒过来的世界也挺有意思。 | （一句不变）<br>描述一段主动或被动的停顿：事情推不动，原来的做法行不通。常伴随着放下某个坚持。 | |
| The Hanged Man | EN | **Pause, and look from another side.**<br>The fairy hangs upside down from a branch, hair falling, face calm. Stuck is a fine time to pause, and the world upside down is interesting too. | **Pause and look from another angle.**<br>Describes a pause, chosen or not: things will not move and the old approach is not working. It often goes with letting go of something you were holding to. | |
| 节制<br>`major-14` | 中 | **慢慢调和，不着急。**<br>小花仙把水从一只杯子倒进另一只杯子，一滴也没洒。冷的热的、快的慢的，可以一点一点兑匀。 | **慢慢调整，找到合适的度。**<br>常指把两样不同的东西配合好，比如工作和休息、自己和别人的需要。重点在耐心和适度。 | |
| Temperance | EN | **Blending slowly, no hurry.**<br>The fairy pours water from one cup into another without spilling a drop. Warm and cold, fast and slow can be blended a little at a time. | **Adjusting slowly to find the right balance.**<br>Often about fitting two different things together, such as work and rest, or your needs and someone else’s. Patience and moderation are the point. | |
| 星星<br>`major-17` | 中 | **难过之后，一点点亮起来。**<br>大星星挂在夜空，小花仙跪在池边，把两只罐子里的水慢慢倒出来。不急，也不用马上变好。 | **难过之后，慢慢恢复。**<br>和希望、信任有关：相信事情有改善的可能，也愿意重新坦诚地面对自己。也指平静和疗愈。 | |
| The Star | EN | **After the hurt, a little light.**<br>A big star hangs in the night sky as the fairy kneels by the pool, slowly pouring out two jugs of water. No hurry, and no need to be better right away. | **Slowly recovering after a hard time.**<br>Linked to hope and trust: believing things can improve and being open with yourself again. Also associated with calm and healing. | |
| 月亮<br>`major-18` | 中 | **看不清的时候，也没关系。**<br>月光下的小路弯弯绕绕，小狗和小狼在路边望着月亮。路看不太清，也可以先在月光里待一会儿。 | **事情还看不清楚。**<br>涉及想象、担心和没有说出口的事。信息不全的时候，人容易把猜测当成事实。 | |
| The Moon | EN | **When things are unclear, that’s okay.**<br>Under the moon a path winds away while a dog and a wolf look up at the sky. The road isn’t clear, and you can stay in the moonlight a while. | **Things are not clear yet.**<br>Involves imagination, worry and things left unsaid. When information is incomplete, guesses are easily taken for facts. | |
| 太阳<br>`major-19` | 中 | **明亮、简单的快乐。**<br>太阳底下，小花仙骑着小白马，向日葵开了一整排。快乐有时候就是这么简单。 | **简单、直接的开心。**<br>多指事情顺利、身体有活力、和人相处坦率。也和成功、被看见有关。 | |
| The Sun | EN | **Bright, simple joy.**<br>Under the sun the fairy rides a white horse past a whole row of sunflowers. Sometimes happiness is just this simple. | **Simple, direct happiness.**<br>Usually about things going well, physical energy and openness with people. Also linked to success and being seen. | |
| 审判<br>`major-20` | 中 | **回头看看，再重新出发。**<br>小花仙在云上吹响号角，下面的伙伴们从木箱里站起来，张开手臂。走过的路都还在，可以从这里接着走。 | **回头看一看，再重新开始。**<br>指对过去做一次清楚的总结：承认发生过的事，原谅或放下，然后做出一个重要的决定。 | |
| Judgement | EN | **Look back, then set out again.**<br>The fairy sounds a horn from the clouds, and friends below rise from wooden boxes with open arms. The road behind you is still there, and you can carry on from here. | **Looking back, then starting again.**<br>A clear reckoning with the past: admitting what happened, forgiving or letting go, and then making an important decision. | |
| 世界<br>`major-21` | 中 | **一段路，走圆了。**<br>小花仙拿着两根小杖在花环中间跳舞，四个角上是天使、老鹰、牛和狮子。一个阶段走完了，值得停下来好好看一眼。 | **一个阶段完成了。**<br>常和毕业、项目收尾、长期目标达成有关，也指生活的各个方面配合到了一起。之后往往接着一个新的开始。 | |
| The World | EN | **A stretch of road, come full circle.**<br>The fairy dances inside a wreath holding two small wands, with an angel, an eagle, a bull and a lion in the corners. One chapter is complete, and it’s worth pausing to look at it. | **One stage is complete.**<br>Often linked to graduating, finishing a project or reaching a long-held goal, and to different parts of life coming together. A new beginning commonly follows. | |

## 权杖（14 张）

| 牌 | | 现在 | 改后 | 批注 |
|---|---|---|---|---|
| 权杖一<br>`wands-01` | 中 | **一个新念头冒出来了。**<br>一只手从云里伸出来，握着一根刚发芽的枝条。新念头还小小的，先让它冒出来就好。 | **一个新的想法。**<br>也指新的机会，或者一股想做事的热情。它是起点，还没有计划，也还没有结果。 | |
| Ace of Wands | EN | **A new idea pops up.**<br>A hand reaches out of a cloud holding a freshly budding branch. The idea is still small; letting it appear is enough for now. | **A new idea.**<br>Also a new opportunity or a burst of enthusiasm to do something. It is a starting point, with no plan or result yet. | |
| 权杖二<br>`wands-02` | 中 | **站在高处，想想远方。**<br>小花仙站在城墙上，手里捧着一个小小的地球。远方还远，想一想它也是一种出发。 | **站在高处，考虑更远的事。**<br>描述在已有的基础上做决定：留在熟悉的地方，还是去更大的范围试一试。 | |
| Two of Wands | EN | **Up high, thinking of far away.**<br>The fairy stands on a castle wall holding a small globe. Far away is still far, and thinking about it is a kind of setting out. | **Looking ahead and planning.**<br>Describes a decision made from an established base: stay with what is familiar, or try a wider field. | |
| 权杖三<br>`wands-03` | 中 | **等自己种下的东西。**<br>小花仙站在山坡上，看着远处海上的小船。做过的事需要一点时间，等待也是其中一部分。 | **做了之后，等结果。**<br>多指事情已经铺开，开始往更大的范围发展，比如合作，或者远方的机会。需要的是远见和耐心。 | |
| Three of Wands | EN | **Waiting for what you planted.**<br>The fairy stands on a hill watching small ships far out at sea. What you’ve done takes time, and the waiting is part of it. | **Waiting for results after acting.**<br>Usually means things are under way and beginning to expand, for example through partnerships or opportunities far away. It calls for foresight and patience. | |
| 权杖四<br>`wands-04` | 中 | **值得庆祝的小归属。**<br>花环搭在四根枝条上，小花仙和朋友们在下面举着花跳舞。有个能回去的地方，本身就值得庆祝。 | **有归属，有庆祝。**<br>常和家、团聚、阶段性的成果有关，比如搬家、聚会、订婚这类大家一起高兴的事。 | |
| Four of Wands | EN | **A little place to belong, worth celebrating.**<br>A garland hangs across four branches while the fairy and her friends dance below with flowers. Having somewhere to come back to is worth celebrating on its own. | **Belonging and celebration.**<br>Often linked to home, reunions and milestones, such as a move, a gathering or an engagement that people celebrate together. | |
| 权杖五<br>`wands-05` | 中 | **磕磕碰碰的时候。**<br>几个小身影举着枝条乱挥，看起来更像在打闹。有摩擦的时候心里烦，那份烦也说明你在意。 | **有摩擦，有争执。**<br>多是小范围的较量：团队里的分歧，同学或同事之间的竞争。通常不严重，但消耗精力。 | |
| Five of Wands | EN | **When things bump and clash.**<br>A few small figures wave branches at each other, more play-fight than fight. Friction is irritating, and the irritation shows how much you care. | **Friction and disagreement.**<br>Mostly small-scale contests: disagreement within a team, rivalry among classmates or colleagues. Usually not serious, but tiring. | |
| 权杖六<br>`wands-06` | 中 | **被看见，被认可。**<br>小花仙骑着小马走在队伍前面，手里举着一根挂着花环的枝条。被别人看见的那一刻，可以好好收下。 | （一句不变）<br>指努力之后的公开成果，比如表扬、升职、比赛获胜。也涉及自信，以及别人的评价对自己的影响。 | |
| Six of Wands | EN | **Seen, and recognized.**<br>The fairy rides at the front of the crowd, holding up a branch hung with a wreath. When someone sees you, you can take that moment in. | **Seen and recognized.**<br>A public result after effort, such as praise, a promotion or a win. It also touches on confidence and how much other people’s opinion affects you. | |
| 权杖七<br>`wands-07` | 中 | **守住自己在意的东西。**<br>小花仙站在小坡上，挡住下面伸上来的六根枝条。守着很累，也说明它对你很重要。 | （一句不变）<br>描述处在需要为自己辩护的位置：观点受到质疑，或者有人来争同一样东西。 | |
| Seven of Wands | EN | **Holding on to what matters.**<br>The fairy stands on a small rise, holding off six branches reaching up from below. Holding on is tiring, and it shows how much this matters to you. | **Standing up for what matters to you.**<br>Describes having to defend yourself: your view is being challenged, or others are competing for the same thing. | |
| 权杖八<br>`wands-08` | 中 | **事情忽然快起来了。**<br>八根开着花的枝条一齐斜着飞过天空，下面是安静的河。一下子变快的时候，有点手忙脚乱也正常。 | **事情一下子快起来了。**<br>常指消息、出行、突然推进的计划。几件事同时发生，没有多少犹豫的时间。 | |
| Eight of Wands | EN | **Suddenly, things speed up.**<br>Eight flowering branches fly across the sky together above a quiet river. When everything speeds up at once, feeling a bit flustered is normal. | **Things suddenly speed up.**<br>Often about messages, travel and plans that suddenly move. Several things happen at once, with little time to hesitate. | |
| 权杖九<br>`wands-09` | 中 | **累了，但还站着。**<br>小花仙手臂上缠着绷带，紧紧握着一根枝条，身后立着一排。很累了还在坚持，这份力气值得被看见。 | **很累了，还在坚持。**<br>多出现在一件事的后半段：经历过挫折，变得防备，对新的麻烦格外警觉。 | |
| Nine of Wands | EN | **Tired, but still standing.**<br>The fairy grips a branch, a bandage on her arm and a row of branches behind her. Still going while this tired takes strength, and that strength deserves to be seen. | **Tired, and still going.**<br>Tends to appear late in a long effort: after setbacks, guarded, and on the lookout for the next problem. | |
| 权杖十<br>`wands-10` | 中 | **肩上的东西有点多。**<br>小花仙背着一大捆枝条，弯着腰往远处的小城走。背着这么多，走得慢一点也没关系。 | **担子太重。**<br>指责任和工作压在一个人身上，其中有些本来可以不由自己承担。常和过劳有关。 | |
| Ten of Wands | EN | **A lot on your shoulders.**<br>The fairy carries a huge bundle of branches on her back, bending toward a far-off town. Carrying this much, it’s fine to walk slower. | **Carrying too much.**<br>Responsibility and work piled on one person, some of which need not have been theirs to carry. Often linked to overwork. | |
| 权杖侍从<br>`wands-11` | 中 | **好奇心，想去试试。**<br>小花仙握着一根比她还高的枝条，抬头看顶上的花。想试试的那点心动，本身就很珍贵。 | **好奇，想去试一试。**<br>代表初学者的状态：兴趣很高，经验不多，想法比计划多。也指好消息或新的提议。 | |
| Page of Wands | EN | **Curious, wanting to try.**<br>The fairy holds a branch taller than she is and looks up at the flower on top. That little flutter of wanting to try is precious in itself. | **Curious and wanting to try.**<br>A beginner’s state: high interest, little experience, more ideas than plans. It can also mean good news or a new proposal. | |
| 权杖骑士<br>`wands-12` | 中 | **一股想出发的冲劲。**<br>小花仙骑着白马跃起来，裙摆和丝带被风吹得飘起来。心里有股冲劲的时候，连风都是热的。 | **有冲劲，想马上出发。**<br>行动很快，耐心不多。常和旅行、换环境、一时兴起的决定有关。 | |
| Knight of Wands | EN | **An urge to set off.**<br>The fairy rides a rearing white horse, her skirt and ribbons lifting in the wind. With that much drive inside, even the wind feels warm. | **Full of drive, wanting to set off.**<br>Quick to act and short on patience. Often linked to travel, a change of scene or a decision made on impulse. | |
| 权杖皇后<br>`wands-13` | 中 | **温暖又自信的光。**<br>小花仙坐在向日葵中间的椅子上，脚边坐着一只小黑猫。被自己的温暖照着，心也是亮的。 | **温暖，有自信。**<br>描述一个开朗、独立、有主见的人，或者这样的状态：知道自己要什么，也能带动身边的人。 | |
| Queen of Wands | EN | **A warm, confident light.**<br>The fairy sits on a chair among sunflowers, a little black cat at her feet. Lit by your own warmth, the heart is bright too. | **Warm and confident.**<br>Describes an outgoing, independent, decisive person, or that state: knowing what you want and bringing others along. | |
| 权杖国王<br>`wands-14` | 中 | **看得远，也愿意带头。**<br>小花仙坐在高高的椅子上，手里的枝条冒着新芽，身边有只小蜥蜴。看清方向，又愿意先迈一步，是一种很稳的力气。 | **看得远，愿意带头。**<br>多指有经验的领导者：能定方向、做决定，并对结果负责。在工作里常指创业者或主管的角色。 | |
| King of Wands | EN | **Seeing far, willing to lead.**<br>The fairy sits on a high chair holding a budding branch, a small lizard beside her. Seeing the way and being willing to take the first step is a steady kind of strength. | **Seeing ahead and willing to lead.**<br>Usually an experienced leader: able to set direction, decide and answer for the outcome. At work it often points to a founder’s or manager’s role. | |

## 圣杯（14 张）

| 牌 | | 现在 | 改后 | 批注 |
|---|---|---|---|---|
| 圣杯一<br>`cups-01` | 中 | **心里有东西在流动。**<br>一只手从云里托出杯子，白鸽在上面展开翅膀，水沿着杯沿流进开满睡莲的池子。心里满满的时候，让它流一会儿就好。 | **心里有了新的感情。**<br>可以是一段新关系的开始，也可以是对人更有同情心、更愿意表达。和创作灵感也有关。 | |
| Ace of Cups | EN | **Something is flowing in your heart.**<br>A hand from the clouds holds out a cup as a white dove spreads its wings above, water spilling into a pond of water lilies. When your heart is full, let it flow a while. | **A new feeling in the heart.**<br>It can be the start of a relationship, or simply more compassion and willingness to express yourself. Also linked to creative inspiration. | |
| 圣杯二<br>`cups-02` | 中 | **两个人，彼此靠近。**<br>小花仙和一个小伙伴各举一只杯子，轻轻碰在一起。被人看见，也看见别人，是很暖的事。 | **两个人彼此靠近。**<br>不只指恋爱，也指友情和合作里的对等关系：双方都愿意付出，也互相尊重。 | |
| Two of Cups | EN | **Two people, drawing closer.**<br>The fairy and a friend each raise a cup toward the other. Being seen, and seeing someone, is a warm thing. | **Two people drawing closer.**<br>Not only romance; also friendship and partnership on equal terms, where both sides give and respect each other. | |
| 圣杯三<br>`cups-03` | 中 | **和朋友在一起的时光。**<br>三个小花仙一起高高举杯，脚边堆着葡萄和果子。和喜欢的人一起笑，这段时光本身就很好。 | **和朋友在一起的开心。**<br>常和聚会、庆祝、朋友圈子有关，也指大家互相支持。 | |
| Three of Cups | EN | **Time with friends.**<br>Three fairies raise their cups high together, grapes and fruit at their feet. Laughing with people you like is good in itself. | **Happiness with friends.**<br>Often linked to gatherings, celebrations and a circle of friends, and to people supporting one another. | |
| 圣杯四<br>`cups-04` | 中 | **提不起劲的时候。**<br>小花仙托着下巴坐在树下，面前摆着三只杯子，云里又递来一只。什么都不太想要的时候，坐一会儿也可以。 | **提不起劲。**<br>多指厌倦或不满足的状态：注意力向内收，对外面的事反应冷淡。 | |
| Four of Cups | EN | **When nothing feels worth reaching for.**<br>The fairy sits under a tree, chin in hand, three cups in front of her and a fourth offered from a cloud. When you don’t want much of anything, sitting a while is fine. | **Hard to feel interested.**<br>Usually boredom or dissatisfaction: attention turns inward and the response to outside things is flat. | |
| 圣杯五<br>`cups-05` | 中 | **失落之外，还剩下的东西。**<br>小花仙低头看着倒下的三只杯子，身后还立着两只。难过的时候顾不上别的，那两只杯子也还在那里。 | **失落，但不是什么都没剩下。**<br>涉及遗憾、难过和对过去的惦记，常见于分手、失败或错过之后。 | |
| Five of Cups | EN | **Past the loss, what’s still here.**<br>The fairy looks down at three spilled cups while two still stand behind her. When it hurts you can’t see anything else, and those two cups are still there. | **A loss, with something still left.**<br>Involves regret, sadness and dwelling on the past, common after a breakup, a failure or a missed chance. | |
| 圣杯六<br>`cups-06` | 中 | **想起过去的温暖。**<br>小花仙把一只插着小花的杯子递给更小的伙伴。想起从前被好好对待的时候，心里软软的。 | （一句不变）<br>和童年、老朋友、故乡有关，也指单纯的善意和礼物。有时表示和过去的人重新联系。 | |
| Six of Cups | EN | **Remembering old warmth.**<br>The fairy hands a cup of flowers to a smaller friend. Remembering times you were treated kindly, the heart goes soft. | **Remembering past warmth.**<br>Linked to childhood, old friends and hometown, and to simple kindness and gifts. Sometimes it means getting back in touch with someone from the past. | |
| 圣杯七<br>`cups-07` | 中 | **很多想法，一时难选。**<br>七只杯子飘在云里，每只里面装着不一样的东西。想法太多挑不出来，先看看也没关系。 | **选择太多，一时难定。**<br>其中有些选项只是愿望或幻想，并不实际。也和分心、拖延有关。 | |
| Seven of Cups | EN | **So many ideas, hard to choose.**<br>Seven cups float in the clouds, each holding something different. When there are too many to pick from, just looking is okay. | **Too many choices to decide yet.**<br>Some of the options are wishes or fantasies and not realistic. Also associated with distraction and putting things off. | |
| 圣杯八<br>`cups-08` | 中 | **离开不再合适的地方。**<br>小花仙背对着叠好的八只杯子，往月光下的山里走。离开需要一点勇气，也可以慢慢走。 | （一句不变）<br>这种离开通常是自己的决定，没有人逼。带着失望，也带着对更有意义的东西的期待。 | |
| Eight of Cups | EN | **Leaving what no longer fits.**<br>The fairy turns away from eight stacked cups and walks toward the mountains under the moon. Leaving takes a little courage, and you can walk slowly. | （一句不变）<br>The departure is usually your own decision, not forced. It carries disappointment, and a hope for something more meaningful. | |
| 圣杯九<br>`cups-09` | 中 | **小小的心满意足。**<br>小花仙端着杯子坐着笑，身后一排杯子摆得整整齐齐。这一刻的满足，可以好好享受。 | **心满意足。**<br>常被叫作愿望牌：物质和感情上都觉得够了。有时也带一点自得。 | |
| Nine of Cups | EN | **A small contentment.**<br>The fairy sits smiling with a cup in hand, a neat row of cups behind her. This moment of contentment is yours to enjoy. | **Contentment.**<br>Often called the wish card: feeling you have enough, materially and emotionally. It can carry a touch of self-satisfaction. | |
| 圣杯十<br>`cups-10` | 中 | **家的温暖。**<br>彩虹上挂着十只杯子，小花仙和家人在下面张开手。被身边的人围着的感觉，暖暖的。 | **家人和睦，心里温暖。**<br>指长期、稳定的感情关系，重点在归属感和共同的生活，不在一时的激情。 | |
| Ten of Cups | EN | **The warmth of home.**<br>Ten cups arch across a rainbow while the fairy and her family open their arms below. Being surrounded by the people close to you feels warm. | **A warm, harmonious home.**<br>Long-term, stable relationships, with the weight on belonging and a shared life, not on passing excitement. | |
| 圣杯侍从<br>`cups-11` | 中 | **心里的小惊喜。**<br>小花仙捧着杯子，杯里探出一条小鱼和她对视。心里冒出的小惊喜，值得笑一下。 | **一点小惊喜。**<br>代表感情上年轻、好奇的一面：爱幻想，容易被打动。也指感情方面的消息，或者一个创作的念头。 | |
| Page of Cups | EN | **A small surprise inside.**<br>The fairy holds a cup, and a little fish peeks out to look back at her. A small surprise in the heart is worth a smile. | **A small surprise.**<br>The young, curious side of feeling: dreamy and easily touched. It can also mean news about a relationship or a creative idea. | |
| 圣杯骑士<br>`cups-12` | 中 | **跟着心走的邀请。**<br>小花仙骑着白马慢慢蹚过小溪，一手举着一只杯子。听见心里的声音时，走慢一点也没关系。 | **跟着感情走。**<br>描述浪漫、理想化的人或做法，常和表白、邀请、追求有关。有时偏理想，不太顾及现实。 | |
| Knight of Cups | EN | **An invitation to follow your heart.**<br>The fairy rides a white horse slowly across a stream, holding up a cup in one hand. When your heart calls, going slowly is fine. | **Following your feelings.**<br>Describes a romantic, idealistic person or approach, often linked to a confession, an invitation or courtship. It can lean idealistic and overlook practical matters. | |
| 圣杯皇后<br>`cups-13` | 中 | **体贴别人，也体贴自己。**<br>小花仙坐在海边，安静地看着手里那只精致的杯子。对别人的温柔，也可以留一点给自己。 | （一句不变）<br>描述一个温和、善于倾听的人：情感细腻，直觉强，容易感受到周围人的情绪。 | |
| Queen of Cups | EN | **Kind to others, kind to yourself.**<br>The fairy sits by the sea, quietly gazing at the fine cup in her hands. The gentleness you give others can be kept a little for yourself too. | **Kind to others and to yourself.**<br>Describes a gentle person who listens well: emotionally perceptive, intuitive and quick to sense how others feel. | |
| 圣杯国王<br>`cups-14` | 中 | **情绪起伏里的平稳。**<br>小花仙坐在海中央的石座上，四周浪起浪落。心里有浪的时候，也有一块稳稳的地方。 | **情绪有起伏，人是稳的。**<br>描述成熟、包容的人，能在别人激动的时候保持冷静，常是别人愿意倾诉的对象。 | |
| King of Cups | EN | **Steady amid the waves.**<br>The fairy sits on a stone throne in the sea while waves rise and fall around her. Even with waves inside, there is a steady place too. | **Steady while feelings rise and fall.**<br>Describes a mature, tolerant person who stays calm when others are upset, and whom people tend to confide in. | |

## 宝剑（9 张）

| 牌 | | 现在 | 改后 | 批注 |
|---|---|---|---|---|
| 宝剑一<br>`swords-01` | 中 | **忽然想清楚了。**<br>一只手从云里伸出来，握着一把亮亮的小剑，剑尖上顶着一顶小王冠和两枝叶子。一下子想通的感觉，像雾被拨开了一角。 | **一下子想清楚了。**<br>和真相、决定、把话说明白有关。常是一个新的思路或一个明确结论的开始。 | |
| Ace of Swords | EN | **Suddenly, it’s clear.**<br>A hand from the clouds holds up a bright sword topped with a small crown and two sprigs. That moment of seeing clearly is like fog parting at one corner. | **Suddenly seeing it clearly.**<br>Linked to truth, decisions and saying things plainly. Often the start of a new line of thought or a firm conclusion. | |
| 宝剑二<br>`swords-02` | 中 | **两难时，先不急着决定。**<br>小花仙蒙着眼睛坐在水边，两把剑交叉抱在胸前。两边都放不下的时候，先坐一会儿也是一种选择。 | **两难，暂时没有决定。**<br>常伴随回避：不想看、不想谈，希望问题自己过去。两边的理由往往差不多重。 | |
| Two of Swords | EN | **Torn, and no need to decide yet.**<br>The fairy sits blindfolded by the water, two swords crossed over her chest. When you can’t let go of either side, sitting a while is also a choice. | **Torn, and not deciding for now.**<br>Often comes with avoidance: not wanting to look or talk, hoping the problem passes. The reasons on each side tend to weigh about the same. | |
| 宝剑四<br>`swords-04` | 中 | **休息也是一种前进。**<br>小花仙躺在安静的小屋里，墙上挂着三把剑，身边放着一把。停下来的时候，身体和心都在慢慢恢复。 | **停下来休息。**<br>多出现在压力或冲突之后，指暂时退出、独自安静一段时间，也可以指休假。 | |
| Four of Swords | EN | **Rest is a way forward too.**<br>The fairy lies in a quiet chapel, three swords on the wall and one beneath her. While you rest, body and heart are slowly mending. | **Stopping to rest.**<br>Tends to follow stress or conflict: withdrawing for a while to be quiet and alone. It can also mean taking leave. | |
| 宝剑六<br>`swords-06` | 中 | **慢慢离开难过的地方。**<br>小花仙搂着一个小家伙坐在小船上，船夫撑着篙，往平静的水面划过去。离开可以很慢，水面一点点平下来。 | （一句不变）<br>可以是实际的搬家、换环境，也可以是心情上的告别。旧的事还没完全放下，但人已经不在原来的处境里。 | |
| Six of Swords | EN | **Slowly leaving a sad place.**<br>The fairy holds a little one close in a small boat as the ferryman poles toward calm water. Leaving can be slow, and the water settles little by little. | **Slowly leaving a hard place.**<br>It can be a real move or change of surroundings, or an inner goodbye. The old matter is not fully put down, but you are no longer in the same situation. | |
| 宝剑七<br>`swords-07` | 中 | **用自己的方法绕过去。**<br>小花仙抱着几把剑踮着脚走开，回头看了一眼。正面走不通的时候，换一条自己的路也可以。 | **用自己的办法绕过去。**<br>也指隐瞒、取巧或不完全坦白：有些事没有说，或者没有按规矩来。 | |
| Seven of Swords | EN | **Going around it your own way.**<br>The fairy tiptoes away with an armful of swords, glancing back. When the straight way doesn’t work, a path of your own is fine too. | **Getting around it your own way.**<br>Also concealment, shortcuts or not being fully open: something is left unsaid, or done outside the rules. | |
| 宝剑侍从<br>`swords-11` | 中 | **好奇地看看四周。**<br>小花仙举着小剑站在风很大的山坡上，望着远处。对什么都想多看两眼，这份好奇很可爱。 | **好奇，多看多想。**<br>代表思维活跃、爱提问的状态：学东西快，说话直。有时也指打听消息，或者保持戒备。 | |
| Page of Swords | EN | **Curiously looking around.**<br>The fairy holds up a small sword on a windy hillside, gazing into the distance. Wanting a second look at everything is a lovely kind of curiosity. | **Curious and watchful.**<br>A quick, questioning state of mind: fast to learn and blunt in speech. Sometimes it means looking for information or staying on guard. | |
| 宝剑骑士<br>`swords-12` | 中 | **急着说出口、做出来。**<br>小花仙骑着马迎风冲过来，剑举得高高的。心里急的时候冲得很快，那股急也是一种在乎。 | **急着说出来、做出来。**<br>描述行动快、目标明确、不太顾及别人感受的状态。常和争论、赶进度有关。 | |
| Knight of Swords | EN | **Rushing to say it, to do it.**<br>The fairy charges in on horseback, sword raised high. When you’re in a hurry you move fast, and that hurry is a way of caring. | **In a hurry to say it and do it.**<br>Describes moving fast with a clear aim and not much regard for others’ feelings. Often linked to arguments or pushing to meet a deadline. | |
| 宝剑皇后<br>`swords-13` | 中 | **清醒，而且诚实。**<br>小花仙坐在云边，一手举剑，一手向前伸开。看清楚自己真实的感受，也是一种温柔。 | **头脑清楚，说话坦率。**<br>描述一个独立、有原则的人：经历过事情，判断不靠情绪。给人的感觉可能有些距离。 | |
| Queen of Swords | EN | **Clear and honest.**<br>The fairy sits among the clouds, one hand raising a sword and the other reaching out. Seeing your real feelings clearly is a kind of gentleness. | **Clear-headed and frank.**<br>Describes an independent, principled person who has been through things and does not judge by emotion. Can come across as somewhat distant. | |
| 宝剑国王<br>`swords-14` | 中 | **冷静地看一看。**<br>小花仙坐在高高的椅子上，手里竖着一把剑，椅边停着一只白猫头鹰。先冷静下来再看，事情就清楚一些。 | **冷静地判断。**<br>多指专业、权威的角色，比如法官、老师、顾问。看重逻辑和规则，感情放在其次。 | |
| King of Swords | EN | **Taking a calm look.**<br>The fairy sits on a high chair holding an upright sword, a white owl perched beside her. Once things calm down, they look a little clearer. | **Judging calmly.**<br>Usually a professional or authoritative role, such as a judge, teacher or adviser. Logic and rules come first, feelings second. | |

## 星币（13 张）

| 牌 | | 现在 | 改后 | 批注 |
|---|---|---|---|---|
| 星币一<br>`pentacles-01` | 中 | **一个踏实的开始。**<br>一只手从云里托出一枚金色星币，下面是一道通向远处的花拱门。踏实的开始不用很大，握在手里就好。 | （一句不变）<br>多和钱、工作、健康这些具体的事有关，比如一份新工作、一笔收入，或者一个可以长期做下去的计划。 | |
| Ace of Pentacles | EN | **A solid start.**<br>A hand from the clouds holds out a golden pentacle above a flowered arch leading far away. A solid start doesn’t need to be big; holding it is enough. | （一句不变）<br>Mostly about concrete matters such as money, work and health: a new job, some income, or a plan that can be kept up over time. | |
| 星币二<br>`pentacles-02` | 中 | **在忙碌里找平衡。**<br>小花仙一边跳舞一边抛着两枚星币，身后的海浪起起伏伏。事情多的时候晃一晃也没关系，还在接着就好。 | **事情多，在找平衡。**<br>常指时间和钱的安排：工作和生活，收入和开支。情况一直在变，没有一劳永逸的分配。 | |
| Two of Pentacles | EN | **Finding balance in the busy days.**<br>The fairy dances while juggling two pentacles, waves rising and falling behind her. A little wobble when things are busy is okay. You’re still catching them. | **Busy, and balancing.**<br>Often about arranging time and money: work and life, income and spending. Circumstances keep changing, and no single arrangement lasts. | |
| 星币三<br>`pentacles-03` | 中 | **一起把事情做好。**<br>小花仙站在木架上雕一扇拱窗，两个伙伴拿着图纸在下面看。和别人一起把一件事做好，是很踏实的开心。 | **和别人一起把事情做好。**<br>强调专业能力被别人看到和需要。常见于学一门手艺、做团队项目、接受指导的阶段。 | |
| Three of Pentacles | EN | **Doing it well, together.**<br>The fairy carves an arched window from a scaffold while two friends below study the plans. Getting something done well with others is a grounded kind of happiness. | **Doing good work together.**<br>Stresses skill that others see and need. Common when learning a craft, working on a team project or being mentored. | |
| 星币四<br>`pentacles-04` | 中 | **抓紧手里的安全感。**<br>小花仙怀里抱着一枚星币，头上顶一枚，脚下踩两枚。想抓紧的时候，说明那份安心对你很重要。 | （一句不变）<br>涉及储蓄、节省和控制，也指情感上的保留：不轻易花钱，也不轻易敞开。 | |
| Four of Pentacles | EN | **Holding tight to what feels safe.**<br>The fairy holds a pentacle close, with one on her head and two under her feet. Wanting to hold on shows how much that feeling of safety matters to you. | **Holding tightly to security.**<br>Involves saving, thrift and control, and also emotional reserve: slow to spend and slow to open up. | |
| 星币六<br>`pentacles-06` | 中 | **给予，也接受。**<br>小花仙拿着一杆小秤，把星币分给跪在下面的两个伙伴。给出去和收下来，都是一种温柔。 | （一句不变）<br>关注的是双方的位置是否对等：谁有资源，谁需要帮助。常和资助、借贷、分享有关。 | |
| Six of Pentacles | EN | **Giving, and receiving.**<br>The fairy holds a small scale and hands pentacles to two friends kneeling below. Giving and receiving are both gentle. | **Giving and receiving.**<br>Its focus is whether the two sides are equal: who has the resources and who needs help. Often linked to support, loans and sharing. | |
| 星币七<br>`pentacles-07` | 中 | **耐心看着它长大。**<br>小花仙靠在小锄头上，看着藤上长出来的星币。长得慢的东西，看着它就已经是在照顾它。 | **耐心等它长大。**<br>指长期努力的中间阶段：回头看已有的成果，判断是继续，还是调整做法。 | |
| Seven of Pentacles | EN | **Patiently watching it grow.**<br>The fairy leans on a small hoe, watching pentacles grow on the vine. With slow-growing things, watching is already a way of tending them. | **Waiting patiently for it to grow.**<br>The middle of a long effort: looking at what has come of it and judging whether to continue or change approach. | |
| 星币八<br>`pentacles-08` | 中 | **专注地一点点练。**<br>小花仙坐在小凳上，一枚一枚地刻着星币，旁边已经挂了一排。一点一点做下去，手慢慢就记住了。 | **专心练习，一点点进步。**<br>常和学徒期、备考、打磨一项技能有关。工作本身可能单调，重点在质量和细节。 | |
| Eight of Pentacles | EN | **Practicing, bit by bit.**<br>The fairy sits on a small bench working one pentacle after another, a row already hung beside her. Bit by bit, the hands slowly remember. | **Focused practice, steady progress.**<br>Often linked to an apprenticeship, exam preparation or refining a skill. The work may be repetitive; quality and detail are the point. | |
| 星币九<br>`pentacles-09` | 中 | **自己给自己的从容。**<br>小花仙站在葡萄园里，手上停着一只小鸟。自己慢慢攒下的从容，可以安心享受。 | **靠自己得来的从容。**<br>描述经济和生活上能自己做主的状态：有条件享受，也习惯独处。 | |
| Nine of Pentacles | EN | **An ease you gave yourself.**<br>The fairy stands in a vineyard, a small bird on her hand. The ease you have slowly built up is yours to enjoy. | **Ease you earned yourself.**<br>Describes being able to run your own finances and life, with the means to enjoy things and a habit of solitude. | |
| 星币十<br>`pentacles-10` | 中 | **家，和慢慢积累的东西。**<br>拱门下，一家人和两只小狗待在一起，老人坐在旁边。慢慢积累下来的日子，本身就很珍贵。 | **家，和长期积累下来的东西。**<br>涉及家族、传承、房产这类跨越几代人的事，也指长期的稳定和保障。 | |
| Ten of Pentacles | EN | **Home, and what slowly builds up.**<br>Under an arch, a family and two dogs stay close, an elder seated beside them. Days slowly gathered together are precious in themselves. | **Home, and what has been built over time.**<br>Concerns matters that span generations, such as family, inheritance and property, and long-term stability and security. | |
| 星币侍从<br>`pentacles-11` | 中 | **认真学一样新东西。**<br>小花仙站在草地上，双手举着一枚星币仔细端详。认真看一样东西的样子，本身就很好。 | （一句不变）<br>代表学生的状态：有目标，肯花时间，重视实际的结果。也指学业或工作方面的新机会。 | |
| Page of Pentacles | EN | **Learning something new, carefully.**<br>The fairy stands in a meadow, holding up a pentacle to study it. The look of someone carefully studying something is lovely in itself. | **Studying something new with care.**<br>A student’s state: a goal, time put in, and attention to practical results. It can also mean a new opportunity in study or work. | |
| 星币骑士<br>`pentacles-12` | 中 | **一步一步，稳稳地走。**<br>小花仙骑着一匹不慌不忙的黑马，停在刚翻过的田边。慢一点没关系，每一步都算数。 | **一步一步，稳稳地做。**<br>描述做事有计划、负责、守时的人。进度不快，也不太愿意改变做法。 | |
| Knight of Pentacles | EN | **Step by step, steadily.**<br>The fairy sits on an unhurried black horse at the edge of a freshly turned field. Slower is fine; every step counts. | （一句不变）<br>Describes someone who works to a plan, responsibly and on time. Progress is not fast, and there is little wish to change method. | |
| 星币皇后<br>`pentacles-13` | 中 | **好好照顾日常。**<br>小花仙坐在花园里，膝上捧着一枚星币，脚边有只小兔子。把日常照顾好，就是在照顾自己。 | **把日常照顾好。**<br>描述一个务实、可靠、让人安心的人：擅长打理家和钱，同时兼顾工作。 | |
| Queen of Pentacles | EN | **Taking good care of the everyday.**<br>The fairy sits in the garden with a pentacle in her lap and a small rabbit at her feet. Taking care of the everyday is taking care of yourself. | **Taking good care of everyday life.**<br>Describes a practical, dependable, reassuring person, good with home and money while also keeping up with work. | |
| 星币国王<br>`pentacles-14` | 中 | **稳稳的掌控感。**<br>小花仙坐在刻着牛头的椅子上，手里扶着一枚星币，脚边趴着一头小牛。日子有条有理的时候，心也跟着安稳。 | **稳定，有把握。**<br>多指事业或财务上已经站稳的人：做事稳重，也愿意照应别人，看重长期的保障。 | |
| King of Pentacles | EN | **A steady sense of things in hand.**<br>The fairy sits on a chair carved with bulls, a pentacle under her hand and a small bull resting at her feet. When the days are in order, the heart settles too. | **Stable and in control.**<br>Usually someone established in career or finances, steady in what they do and willing to provide for others. Long-term security matters to them. | |

## 重牌（9 张，这次不动）

只在 `PETAL_HEAVY_CARDS=on` 时进每日牌组，周报从不匹配。原画到了以后对着画改；其中宝剑三、宝剑九、宝剑十、星币五现在的第二句在许诺结果，到时一起处理。

| 牌 | | 现在 |
|---|---|---|
| 死神<br>`major-13` | 中 | **一段结束，腾出新的位置。**<br>骑着白马的身影慢慢走过，远处的太阳正从两座塔之间升起。有些东西走到了尽头，空出来的地方，正好长出新的。 |
| Death | EN | **An ending that makes room.**<br>A figure on a white horse passes slowly by as the sun rises between two towers. Something has reached its close, and the space it leaves is where something new can grow. |
| 恶魔<br>`major-15` | 中 | **看看那根松松的链子。**<br>两个小伙伴被链子拴在台座边，链子其实很松。让人放不下的东西，看清了它，手就能慢慢松开。 |
| The Devil | EN | **Notice how loose the chain is.**<br>Two small friends are chained beside a pedestal, yet the chains hang loose. What holds on to you is easier to set down once you can see it clearly. |
| 高塔<br>`major-16` | 中 | **旧的框，忽然松动了。**<br>一道闪电落在高塔上，塔顶的王冠掉了下来。突然的变化让人慌，也照亮了原本就不稳的地方。 |
| The Tower | EN | **An old frame, suddenly shaken.**<br>Lightning strikes the tower and its crown tumbles down. Sudden change is unsettling, and it also lights up what was never quite steady. |
| 宝剑三<br>`swords-03` | 中 | **心疼的时候，允许它疼。**<br>三把剑穿过一颗心，天上下着雨。难过不用藏起来，雨下完了，天会一点点放晴。 |
| Three of Swords | EN | **When it hurts, let it hurt.**<br>Three swords pierce a heart under falling rain. Sadness doesn’t need hiding; the rain passes, and the sky clears little by little. |
| 宝剑五<br>`swords-05` | 中 | **赢了，却不太开心。**<br>一个身影抱着捡来的剑，另外两个慢慢走远了。争到最后，可以停下来问问自己：这是我真正想要的吗？ |
| Five of Swords | EN | **A win that doesn’t feel like one.**<br>One figure gathers up the swords while two others walk away. At the end of a quarrel, it’s worth pausing to ask whether this is what you wanted. |
| 宝剑八<br>`swords-08` | 中 | **被困住的感觉，不是全部。**<br>蒙着眼的身影站在一圈剑中间，四周其实留着路。看不见出口的时候，先摘下眼前那块布。 |
| Eight of Swords | EN | **Feeling stuck isn’t the whole story.**<br>A blindfolded figure stands inside a ring of swords, with gaps all around. When no way out is visible, start with the cloth over the eyes. |
| 宝剑九<br>`swords-09` | 中 | **夜里的担心，会显得特别大。**<br>半夜从床上坐起来，墙上挂着九把剑。黑夜里的担心总显得很大，等天亮再看，它会小一些。 |
| Nine of Swords | EN | **Night makes worries look bigger.**<br>Sitting up in bed at night, nine swords on the wall. Worries look larger in the dark; by morning they shrink a little. |
| 宝剑十<br>`swords-10` | 中 | **最低的地方，也是转折。**<br>十把剑落在地上，远处的天边已经泛起亮光。走到最低的地方，接下来就是往上的路。 |
| Ten of Swords | EN | **The lowest point is also a turn.**<br>Ten swords lie on the ground while the far horizon begins to brighten. From the lowest place, the road leads upward. |
| 星币五<br>`pentacles-05` | 中 | **冷的时候，旁边有一盏灯。**<br>两个身影在雪里走过，身旁的窗户亮着暖暖的光。难熬的时候，帮助常常就在不远处。 |
| Five of Pentacles | EN | **In the cold, a lit window nearby.**<br>Two figures walk through the snow past a warmly lit window. In hard times, help is often closer than it seems. |
