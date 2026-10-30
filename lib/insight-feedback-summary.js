// Weekly 2.0 "不准确" summary (proposal "指标"): per insight type, how many insights the saved Weekly reports showed and
// how many owners marked INACCURATE or HIDDEN. Counts only: no text, owner ids or dates leave this function.
export function summarizeInsightFeedback(reports) {
  const byType = {};
  for (const report of reports) for (const section of Array.isArray(report?.narrativeSections) ? report.narrativeSections : []) {
    if (section?.kind !== "INSIGHT" || typeof section.type !== "string") continue;
    const row = byType[section.type] ??= { shown: 0, main: 0, template: 0, inaccurate: 0, hidden: 0 };
    row.shown++;
    if (section.role === "main") row.main++;
    if (section.template === true) row.template++;
    if (section.feedback === "INACCURATE") row.inaccurate++;
    if (section.feedback === "HIDDEN") row.hidden++;
  }
  for (const row of Object.values(byType)) row.inaccurateRate = row.shown ? Math.round(row.inaccurate / row.shown * 1000) / 1000 : 0;
  return byType;
}
