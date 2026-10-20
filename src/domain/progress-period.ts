import { addDays } from "./dates";
import type { ProgressPoint } from "./volume";
export type ProgressWeeks = 4 | 8 | 12;
export type ProgressMetric = "1rm" | "volume" | "reps";
export function parseProgressWeeks(value?: string): ProgressWeeks {
  return value === "4" ? 4 : value === "12" ? 12 : 8;
}
export function progressPeriods(today: string, weeks: ProgressWeeks) {
  const days = weeks * 7;
  return {
    currentStart: addDays(today, 1 - days),
    currentEnd: today,
    previousStart: addDays(today, 1 - days * 2),
    previousEnd: addDays(today, -days),
    days,
  };
}
export function compareProgressPeriods(
  points: ProgressPoint[],
  today: string,
  weeks: ProgressWeeks,
  metric: ProgressMetric,
) {
  const periods = progressPeriods(today, weeks);
  const current = points.filter(
    (p) => p.date >= periods.currentStart && p.date <= periods.currentEnd,
  );
  const previous = points.filter(
    (p) => p.date >= periods.previousStart && p.date <= periods.previousEnd,
  );
  const value = (rows: ProgressPoint[]) =>
    !rows.length
      ? null
      : metric === "1rm"
        ? Math.max(...rows.map((p) => p.estimated1RM))
        : rows.reduce((sum, p) => sum + (metric === "volume" ? p.volumeKg : p.bodyweightReps), 0);
  const currentValue = value(current),
    previousValue = value(previous);
  return {
    ...periods,
    current,
    previous,
    currentValue,
    previousValue,
    changePercent:
      currentValue !== null && previousValue !== null && previousValue > 0
        ? ((currentValue - previousValue) / previousValue) * 100
        : null,
  };
}
