import { addDays } from "./dates";
export const WEEKDAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;
export function scheduledDate(
  weekStart: string,
  weekday: number | null,
  override: number | null,
): string | null {
  const day = override ?? weekday;
  return day === null ? null : addDays(weekStart, day);
}
export function scheduleState(
  status: string,
  date: string | null,
  today: string,
): "planned" | "pending" | "done" {
  return status === "done" ? "done" : date && date > today ? "planned" : "pending";
}
export function orderScheduledSessions<T extends { scheduledOn?: string | null }>(
  sessions: T[],
): T[] {
  return [...sessions].sort((a, b) =>
    (a.scheduledOn ?? "9999").localeCompare(b.scheduledOn ?? "9999"),
  );
}
