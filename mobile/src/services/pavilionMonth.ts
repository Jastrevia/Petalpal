import type { ReportType, SavedReport } from './reflections';

export function pavilionMonth(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string' || !/^(?:[1-9]|1[0-2])$/.test(value)) return null;
  return Number(value);
}

/** A month entrance must never fall back to a different month's report. */
export function pavilionPages(reports: readonly SavedReport[], type: ReportType, month: number | null): SavedReport[] {
  return reports.filter(report=>report.type===type && (type!=='monthly' || month===null ||
    /^\d{4}-\d{2}$/.test(report.periodKey) && Number(report.periodKey.slice(5,7))===month))
    .sort((a,b)=>a.periodKey.localeCompare(b.periodKey));
}

/** Whether a month entrance opens its book now: a month was asked for, the shared book assets it opens with are ready,
 *  and that month has not already been opened by this navigation (`opened`: the month last auto-opened, or null). */
export function pavilionAutoOpen(month: number | null, assetsReady: boolean, opened: number | null): boolean {
  return month !== null && assetsReady && opened !== month;
}
