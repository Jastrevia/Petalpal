// Weekly 2.0 validation layer (docs/product/WEEKLY_2.0.md, proposal "防编造与安全规则"): code only.
// Every model-written sentence passes here or is dropped; nothing relies on the model's good will.
//   每句话附证据   an insight cites evidence ids, all of them its own candidate's Events
//   引用必须是原文  text in quotation marks is a whole clause of one of those Events, unchanged
//   数字只能由代码算 digits only from the candidate's code-written fact line or its Events
//   实体必须存在   listed people/places/activities and English capitalized words exist in the extraction
//   不说因果 / 不诊断 / 不预测  banned words, checked outside quotations (the user's own words are theirs)
//   敏感内容不引用  an evidence Event that is sensitive now is never used
import { lexiconWords, textSensitive } from "./insight-extract.js";
import { MOOD_WORDS } from "./insight-compute.js";
import { ADVICE, DIGITS, groundedSentence, INTERPRETIVE, norm, QUOTES, squash } from "./weekly-short.js";

// The proposal's banned lists (因为、导致、所以、说明你 / 焦虑症、抑郁、创伤、你是一个……的人、你应该 /
// 预示、注定、将会、未来会) plus the short report's INTERPRETIVE and ADVICE lists.
export const BANNED = Object.freeze({
  "zh-Hans": /因为|导致|所以|说明你|造成|引起|由于|因而|于是|使得|让你|使你|焦虑症|抑郁|创伤|依恋|讨好型|人格|障碍|症状|诊断|你是一个.{0,12}的人|你应该|预示|注定|将会|未来会|会变得|以后会|一定会/u,
  en: /\b(?:because|caus\w*|led to|leads? to|due to|so you|made you|makes you|this (?:shows|means)|disorder\w*|anxiety|depress\w*|trauma\w*|diagnos\w*|symptom\w*|attachment|you are an? .{0,20} person|you should|predict\w*|destined|bound to|will (?:become|be|get|keep)|going to be|in the future)\b/iu
});
export const INSIGHT_LENGTH = Object.freeze({ en: 240, "zh-Hans": 80 });
export const HEADLINE_LENGTH = Object.freeze({ en: 48, "zh-Hans": 16 });
const length = text => [...text].length;
const clipped = summary => summary.length >= 500 && !/[。！？.!?」』”"）)]$/u.test(summary.trim());

// A source as groundedSentence expects it: normalized text, the complete-clause end, allowed digits.
export function sourceEntry(summary, extraDigits = []) {
  const text = norm(summary);
  return { text, complete: clipped(summary) ? Math.max(...["。", "！", "？", ".", "!", "?"].map(mark => text.lastIndexOf(mark))) + 1 : text.length,
    digits: new Set([...(text.match(DIGITS) || []), ...extraDigits]) };
}
// Banned or interpretive wording outside quotation marks.
export const bannedOutside = (text, locale) => {
  const outside = text.replace(QUOTES, " ");
  return BANNED[locale].test(outside) || INTERPRETIVE[locale].test(outside) || ADVICE[locale].test(outside);
};

// Checks one model sentence against a set of candidates (its own, or all for the headline and question).
// `allowQuestion` is for the next-week question only. Returns the trimmed text or null.
export function checkSentence(text, candidates, input, { maxLength, allowQuestion = false } = {}) {
  const { locale } = input, value = String(text ?? "").trim(), fence = new Map(input.sourceFence.sources.map(source => [source.id, source]));
  if (!value || length(value) > maxLength) return null;
  const ids = [...new Set(candidates.flatMap(candidate => candidate.evidence.map(item => item.sourceEventId)))];
  const summaries = ids.map(id => fence.get(id)?.memory?.summary);
  if (summaries.some(summary => typeof summary !== "string" || textSensitive(summary))) return null;
  const factDigits = candidates.flatMap(candidate => norm(candidate.fact ?? "").match(DIGITS) || []);
  const sources = summaries.map(summary => sourceEntry(summary, factDigits));
  // A candidate's own word or a mood name may sit in quotation marks, as in its fact line.
  const own = new Set([...candidates.flatMap(candidate => [candidate.subject, candidate.keyword]), ...Object.values(MOOD_WORDS[locale])].filter(Boolean));
  const checked = value.replace(QUOTES, (all, ...groups) => {
    const inner = groups.slice(0, 4).find(group => group !== undefined)?.trim();
    return own.has(inner) ? inner : all;
  });
  const outside = checked.replace(QUOTES, " ");
  if (!(sources.length ? groundedSentence(checked, sources) : !/\d/u.test(checked) && !/[“「『"]/u.test(checked))) return null;
  if (BANNED[locale].test(outside) || ADVICE[locale].test(outside)) return null;
  const interpretive = allowQuestion ? new RegExp(INTERPRETIVE[locale].source.replace(/\|\[\?？\]/u, ""), INTERPRETIVE[locale].flags) : INTERPRETIVE[locale];
  if (interpretive.test(outside)) return null;
  if (allowQuestion ? !/[?？]$/u.test(value) || (outside.match(/[.!?。！？]/gu) || []).length !== 1 : (outside.match(/[.!。！]/gu) || []).length > 2) return null;
  // 实体必须存在: listed words and English capitalized words must come from these candidates' entries.
  const words = new Set(candidates.flatMap(candidate => candidate.words ?? []));
  const listed = lexiconWords(outside);
  if ([...listed.people, ...listed.places, ...listed.topics].some(word => !words.has(word))) return null;
  for (const match of outside.matchAll(/\b[A-Z][a-z]+\b/gu)) {
    const before = outside.slice(0, match.index);
    if (!before.trim() || /[.!?:]\s*$/u.test(before) || Object.values(MOOD_WORDS.en).includes(match[0])) continue;
    if (!sources.some(source => source.text.includes(match[0])) && !candidates.some(candidate => (candidate.fact ?? "").includes(match[0]))) return null;
  }
  return value;
}

// One insight from the model, checked against its own candidate. Returns the saved section or null.
export function checkInsight(item, candidate, input, model, contractVersion) {
  const { locale } = input, fence = new Map(input.sourceFence.sources.map(source => [source.id, source]));
  // 每句话附证据: the cited ids are this candidate's own Events (aliases resolved by the caller).
  const own = new Set(candidate.evidence.map(entry => entry.sourceEventId));
  if (!Array.isArray(item.evidenceIds) || !item.evidenceIds.length || item.evidenceIds.some(id => !own.has(id))) return null;
  // The quoted spans must still sit in the current Event text.
  if (candidate.spans.some(span => !squash(fence.get(span.sourceEventId)?.memory?.summary ?? "").includes(squash(span.text)))) return null;
  const text = checkSentence(item.text, [candidate], input, { maxLength: INSIGHT_LENGTH[locale] });
  if (!text) return null;
  const spans = new Map(candidate.spans.map(span => [span.id, span]));
  let items = [], evidence = candidate.evidence;
  if (candidate.type === "SMALL_GOODS") {
    const picks = Array.isArray(item.picks) ? item.picks : [];
    if (picks.length < 2 || new Set(picks).size !== picks.length || picks.some(id => !spans.has(id))) return null;
    items = picks.map(id => ({ text: spans.get(id).text, sourceEventId: spans.get(id).sourceEventId, date: spans.get(id).date }));
    const picked = new Set(items.map(entry => entry.sourceEventId));
    evidence = candidate.evidence.filter(entry => picked.has(entry.sourceEventId));
  }
  const first = candidate.spans[0];
  const quote = ["SAID_BEFORE", "OPEN_QUESTION"].includes(candidate.type) && first ? { text: first.text, sourceEventId: first.sourceEventId, date: first.date } : null;
  return { kind: "INSIGHT", claim: text, type: candidate.type, role: candidate.role, text, fact: candidate.fact ?? null, subject: candidate.subject ?? null,
    items, quote, evidence: evidence.map(({ sourceEventId, date }) => ({ sourceEventId, date })),
    evidenceRefs: [], aggregateRefs: [], contractVersion, locale, model };
}
