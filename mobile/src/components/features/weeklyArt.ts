// Weekly 2.0 paintings (FLUX.2 klein, vintage botanical watercolour after assets/reflection/botanical.png; the paper is
// lifted out so they sit on the book's own page). Decorative only: every word and button stays in React Native.
export const WEEKLY_ART = {
  bud: require('@/assets/reflection/weekly/bud.webp'),
  ground: require('@/assets/reflection/weekly/ground.webp'),
  oneMore: require('@/assets/reflection/weekly/one-more.webp'),
  question: require('@/assets/reflection/weekly/question.webp'),
} as const;
// One small painting per insight type.
export const INSIGHT_ART: Record<string, number> = {
  SAID_BEFORE: require('@/assets/reflection/weekly/said-before.webp'),
  HIDDEN_LINK: require('@/assets/reflection/weekly/hidden-link.webp'),
  SMALL_GOODS: require('@/assets/reflection/weekly/small-goods.webp'),
  OPEN_QUESTION: require('@/assets/reflection/weekly/open-question.webp'),
  TREND: require('@/assets/reflection/weekly/trend.webp'),
};
// Width / height of each picture, so a fixed height never stretches it.
export const ART_RATIO: Record<string, number> = { bud: 335 / 450, ground: 1050 / 600, oneMore: 163 / 216, question: 202 / 216,
  SAID_BEFORE: 212 / 216, HIDDEN_LINK: 174 / 216, SMALL_GOODS: 185 / 216, OPEN_QUESTION: 119 / 216, TREND: 171 / 216 };
