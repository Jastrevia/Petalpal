// Only fields consumed by mobile placement/history adapters. Secondary labels
// are displayed by history; confidence, intensity, evidence and text are not.
const FLOWER_FIELDS = ["id", "name", "speciesCode", "mood", "img", "createdAt", "meaning",
  "supportCount", "colorAccent", "visualEffect", "variant", "rarity", "growthState", "season",
  "sourceEventId", "dailyCheckInId", "worldX", "worldY", "regionId"];
export const historyFlowerSelect = {
  ...Object.fromEntries(FLOWER_FIELDS.map(key => [key, true])),
  sourceEvent: { select: { secondaryEmotions: true } },
  dailyCheckIn: { select: { emotionResult: { select: { secondaryEmotions: true } } } }
};
const labels = value => Array.isArray(value) ? value.filter(label => typeof label === "string") : [];
export function historyFlowerMetadata(flower) {
  const result = Object.fromEntries(FLOWER_FIELDS.map(key => [key, flower[key]]));
  if (flower.sourceEventId) result.sourceEvent = { secondaryEmotions: labels(flower.sourceEvent?.secondaryEmotions) };
  if (flower.dailyCheckInId) result.dailyCheckIn = { emotionResult: { secondaryEmotions: labels(flower.dailyCheckIn?.emotionResult?.secondaryEmotions) } };
  return result;
}
export function sessionMetadata({ user, fairyState, todayCheckIn, dailyGrowLimitEnabled }) {
  return {
    user: Object.fromEntries(["id", "name", "email", "avatar", "timezone", "preferredLocale", "betaTester"].map(k => [k, user[k]])),
    fairyState: fairyState ? Object.fromEntries(["onboardingStep", "onboardingCompleted", "lastEvent", "unlockedFeatures"].map(k => [k, fairyState[k]])) : null,
    todayCheckIn: todayCheckIn ? { id: todayCheckIn.id, localDate: todayCheckIn.localDate } : null,
    hasCheckedInToday: Boolean(todayCheckIn), dailyGrowLimitEnabled,
    garden: { owner: { id: user.id } }
  };
}
