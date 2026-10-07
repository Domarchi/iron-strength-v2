// Semanas de un programa asignado (RF-13, RF-16, RF-18, DC-10). La semana 1 empieza siempre un
// lunes; `endsOn` puede ser anterior al fin natural si un programa nuevo recortó este.
import { addDays, daysBetween, type DateString } from "./dates";

export type ProgramRange = {
  startDate: DateString; // lunes
  endsOn: DateString; // domingo (o antes, si lo recortaron)
  weeksCount: number;
};

export type ProgramState = "scheduled" | "active" | "finished";

// Número de semana (1..weeksCount) que corresponde a una fecha, o null si cae fuera del programa.
export function programWeekNumber(program: ProgramRange, date: DateString): number | null {
  if (date < program.startDate || date > program.endsOn) return null;
  const week = Math.floor(daysBetween(program.startDate, date) / 7) + 1;
  return week <= program.weeksCount ? week : null;
}

// Lunes en que empieza la semana n del programa.
export function programWeekStart(program: ProgramRange, week: number): DateString {
  return addDays(program.startDate, (week - 1) * 7);
}

export function programState(program: ProgramRange, today: DateString): ProgramState {
  if (today < program.startDate) return "scheduled";
  if (today > program.endsOn) return "finished";
  return "active";
}

// El programa que corresponde mostrar hoy: el activo; si no hay, el próximo programado; si no, el
// último terminado. Los programas de un alumno no se solapan (restricción en la base).
export function pickCurrentProgram<T extends ProgramRange>(
  programs: T[],
  today: DateString,
): { program: T; state: ProgramState } | null {
  const sorted = [...programs].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const active = sorted.find((p) => programState(p, today) === "active");
  if (active) return { program: active, state: "active" };

  const scheduled = sorted.find((p) => programState(p, today) === "scheduled");
  if (scheduled) return { program: scheduled, state: "scheduled" };

  const finished = sorted.at(-1);
  return finished ? { program: finished, state: "finished" } : null;
}
