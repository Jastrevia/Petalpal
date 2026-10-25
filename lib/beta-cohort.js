// Beta testers keep a "Beta" badge after the beta ends. Everyone whose account was created
// before BETA_COHORT_ENDS_AT (an ISO instant) is a beta tester; while it is unset the beta is
// still running, so every account is. An unreadable value marks no one rather than everyone.
export function isBetaTester(createdAt, env = process.env) {
  const end = env.BETA_COHORT_ENDS_AT?.trim();
  if (!end) return true;
  const endsAt = Date.parse(end);
  const created = new Date(createdAt).getTime();
  return Number.isFinite(endsAt) && Number.isFinite(created) && created < endsAt;
}
