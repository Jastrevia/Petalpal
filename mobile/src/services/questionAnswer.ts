// 回答问题 (Weekly 2.0 闭环): "写一条来回答" remembers which report's question the next Event answers. In memory only and
// short-lived; the Events panel shows it and can drop it, and saving an Event links them (POST …/answer).
type Pending = { reportId: string; question: string; at: number };
const TTL = 30 * 60_000;
let pending: Pending | null = null;
export function startAnswer(reportId: string, question: string) { pending = { reportId, question, at: Date.now() }; }
export function pendingAnswer(now = Date.now()) {
  if (pending && now - pending.at > TTL) pending = null;
  return pending;
}
export function clearAnswer() { pending = null; }
export function takeAnswer(now = Date.now()) { const current = pendingAnswer(now); pending = null; return current; }
