import { addDays, daysBetween, mondayOf } from "./dates";
import type { UnreadRow } from "./unread";
import type { StudentOverview } from "@/lib/data/students";
export type CoachSignal = {
  kind: "comments" | "no_program" | "ending" | "inactive";
  label: string;
  detail: string;
  href: string;
};
export function coachSignals(
  student: StudentOverview,
  today: string,
  unread: UnreadRow[],
): CoachSignal[] {
  if (!student.isActive) return [];
  const signals: CoachSignal[] = [];
  const pending = unread
    .filter((r) => r.studentId === student.id && r.count > 0)
    .sort((a, b) => b.lastCommentAt.localeCompare(a.lastCommentAt));
  const count = pending.reduce((sum, r) => sum + r.count, 0);
  if (count)
    signals.push({
      kind: "comments",
      label: `${count} ${count === 1 ? "comentario pendiente" : "comentarios pendientes"}`,
      detail: "Abre el entrenamiento para revisar y responder.",
      href: `/history/${pending[0].workoutId}`,
    });
  const week = student.week;
  if (week.kind === "no_program" || week.kind === "finished")
    signals.push({
      kind: "no_program",
      label: "Sin programa vigente",
      detail: "No tiene un programa activo ni uno próximo.",
      href: `/coach/students/${student.id}`,
    });
  if (week.kind !== "active") return signals;
  if (week.endsOn && week.endsOn >= today && week.endsOn <= addDays(mondayOf(today), 6))
    signals.push({
      kind: "ending",
      label: "Termina esta semana",
      detail: `${week.programName} · termina el ${week.endsOn}.`,
      href: `/coach/programs/${week.programId}`,
    });
  if (week.startDate && !week.deload && week.planned > 0) {
    const since =
      student.lastWorkoutDate && student.lastWorkoutDate > week.startDate
        ? student.lastWorkoutDate
        : week.startDate;
    const days = daysBetween(since, today);
    if (days >= 7)
      signals.push({
        kind: "inactive",
        label: `${days} días sin entrenar`,
        detail: student.lastWorkoutDate
          ? `Último entrenamiento con series: ${student.lastWorkoutDate}.`
          : `Sin entrenamientos desde el inicio del programa (${week.startDate}).`,
        href: student.lastWorkoutId
          ? `/history/${student.lastWorkoutId}`
          : `/coach/students/${student.id}`,
      });
  }
  return signals;
}
