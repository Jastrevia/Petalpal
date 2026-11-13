import assert from "node:assert/strict";
import test from "node:test";
import { assertSocialContent, socialMessageRejected } from "../../lib/community-policy.js";

// Written independently for this change: synthetic phrases only, no copied dictionary.
const rejected = [
  "kys", "go die", "go kill yourself", "I hope you die", "you should just die", "drop dead",
  "nobody likes you", "everyone hates you", "the world would be better without you",
  "retard", "you faggot", "send me nudes", "show me your body", "suck my dick", "you are so ugly", "u r a loser", "stfu",
  "你去死吧", "你怎么不去死", "赶紧去死", "死全家", "你妈死了", "你不配活", "你怎么不去跳楼",
  "没人喜欢你", "大家都讨厌你", "尼玛", "草泥马", "操你", "cnm", "nmsl", "你个sb", "傻叉", "煞笔", "智障", "脑残",
  "王八蛋", "婊子", "给我滚", "滚出去", "你就是个垃圾", "黑鬼", "约炮", "发张裸照", "想睡你",
  "fuck you", "你这个傻逼",
];
// The writer's own distress, ordinary words that share letters, and kind messages stay open.
const accepted = [
  "我想去死", "I want to die", "我去死吧太累了", "这朵花真好看", "我好想你", "加油，今天辛苦了",
  "滚动一下看看", "水滚开了", "垃圾桶在哪", "我妈的生日", "低能耗灯泡", "白天很长",
  "I killed it at the gym", "Dick is my uncle", "spicy food", "classic", "assessment", "Nigeria", "Scunthorpe", "cocktail",
  "USB 线", "sbs", "I hope you feel better", "nobody else could do it like you",
];

test("social text: abuse, death wishes, slurs and harassment aimed at a friend are rejected", () => {
  for (const text of rejected) {
    assert.throws(() => assertSocialContent(text), error => error.code === "CONTENT_REJECTED" && error.status === 422, text);
  }
});

test("social text: own distress, look-alike words and kind messages are accepted", () => {
  for (const text of accepted) assert.doesNotThrow(() => assertSocialContent(text), text);
});

test("social text: the rejection is said in the writer's language and never echoes the message", () => {
  assert.match(socialMessageRejected("zh-Hans"), /留言没有发出去/);
  assert.match(socialMessageRejected("en"), /was not sent/);
  assert.equal(socialMessageRejected(undefined), socialMessageRejected("en"));
});
