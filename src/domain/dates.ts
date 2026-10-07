// Fechas y semanas del dominio. Todo el sistema razona en America/Santiago (spec, "Idioma"):
// los instantes (Date) se convierten a una fecha de calendario "YYYY-MM-DD" y el resto de la
// aritmética trabaja con esas cadenas, sin zonas horarias de por medio. Semana = lunes a domingo.

export const TIME_ZONE = "America/Santiago";

export type DateString = string; // YYYY-MM-DD

const santiagoParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Fecha de calendario de un instante, en hora de Santiago.
export function santiagoDate(instant: Date): DateString {
  const parts = Object.fromEntries(
    santiagoParts.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toUtcMs(date: DateString): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): DateString {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_MS = 24 * 3600_000;

export function addDays(date: DateString, days: number): DateString {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

export function daysBetween(from: DateString, to: DateString): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

// 0 = lunes ... 6 = domingo
function isoWeekday(date: DateString): number {
  return (new Date(toUtcMs(date)).getUTCDay() + 6) % 7;
}

export function isMonday(date: DateString): boolean {
  return isoWeekday(date) === 0;
}

export function mondayOf(date: DateString): DateString {
  return addDays(date, -isoWeekday(date));
}

export function weekDates(monday: DateString): DateString[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// Lunes de la semana (en Santiago) a la que pertenece un instante.
export function weekStartOf(instant: Date): DateString {
  return mondayOf(santiagoDate(instant));
}

// Inicio sugerido de un programa: hoy si es lunes; si no, el lunes siguiente.
export function defaultStartDate(today: DateString): DateString {
  return isMonday(today) ? today : addDays(mondayOf(today), 7);
}
