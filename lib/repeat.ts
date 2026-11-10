export const REPEAT_LABELS = {
  day: "Every Day",
  week: "Every Week",
  biweek: "Every 2 Weeks",
  month: "Every Month",
  year: "Every Year",
} as const;
export type RepeatEvery = keyof typeof REPEAT_LABELS;
export type Repeat = { every: RepeatEvery; until: string };
export const MAX_REPEAT_ITEMS = 100;

const DAY_MS = 86400000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function shiftDate(date: string, days: number) {
  return toKey(toMs(date) + days * DAY_MS);
}
export function daysBetween(from: string, to: string) {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/**
 * Start dates of every occurrence from `start` through `until` (inclusive).
 * Months and years that lack the start day (the 31st, Feb 29) are skipped.
 * Stops one past MAX_REPEAT_ITEMS so callers can detect an oversized series.
 */
export function repeatDates(start: string, every: RepeatEvery, until: string) {
  const dates: string[] = [];
  const [year, month, day] = start.split("-").map(Number);
  for (let step = 0; dates.length <= MAX_REPEAT_ITEMS; step++) {
    let date: string;
    if (every === "month" || every === "year") {
      const first = new Date(
        Date.UTC(
          year + (every === "year" ? step : 0),
          month - 1 + (every === "month" ? step : 0),
          1,
        ),
      );
      if (toKey(first.getTime()) > until) break;
      const candidate = new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day),
      );
      if (candidate.getUTCMonth() !== first.getUTCMonth()) continue;
      date = toKey(candidate.getTime());
    } else {
      date = shiftDate(
        start,
        step * (every === "day" ? 1 : every === "week" ? 7 : 14),
      );
    }
    if (date > until) break;
    dates.push(date);
  }
  return dates;
}
