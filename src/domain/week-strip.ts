// Tira de la semana de "Mi semana" (RF-61, RF-62): lunes a domingo con el día de hoy, los días
// entrenados y cuál es la próxima sesión pendiente. Todo en fechas de America/Santiago.
import { weekDates, type DateString } from "./dates.ts";

const LABELS = ["L", "M", "X", "J", "V", "S", "D"] as const;

export type StripDay = {
  date: DateString;
  label: (typeof LABELS)[number];
  dayNumber: number;
  isToday: boolean;
  isFuture: boolean;
  trained: boolean;
};

export function buildWeekStrip(
  monday: DateString,
  today: DateString,
  trainedDates: DateString[],
): StripDay[] {
  const trained = new Set(trainedDates);
  return weekDates(monday).map((date, i) => ({
    date,
    label: LABELS[i],
    dayNumber: Number(date.slice(8, 10)),
    isToday: date === today,
    isFuture: date > today,
    trained: trained.has(date),
  }));
}

// La primera sesión que se puede hacer ahora y aún no se hizo.
export function nextPendingSession<T extends { status: string }>(sessions: T[]): T | null {
  return sessions.find((s) => s.status === "pending") ?? null;
}
