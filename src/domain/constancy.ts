// Calendario de constancia (RF-29): las últimas N semanas, de la más antigua a la actual, con el
// resultado de cada una. Las semanas sin programa se muestran como "none" (ni suman ni rompen).
import { addDays, mondayOf, type DateString } from "./dates";
import type { WeekOutcome } from "./streak";

export type ConstancyWeek = {
  weekStart: DateString;
  outcome: WeekOutcome["outcome"] | "none";
  planned?: number;
  done?: number;
  current: boolean;
};

export function constancyCalendar(
  outcomes: (WeekOutcome & { planned?: number; done?: number })[],
  today: DateString,
  weeks = 12,
): ConstancyWeek[] {
  const currentMonday = mondayOf(today);
  const byWeek = new Map(outcomes.map((o) => [o.weekStart, o]));

  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(currentMonday, -7 * (weeks - 1 - i));
    const found = byWeek.get(weekStart);
    return {
      weekStart,
      outcome: found?.outcome ?? "none",
      planned: found?.planned,
      done: found?.done,
      current: weekStart === currentMonday,
    };
  });
}
