import { z } from "zod";
import { parseProgressWeeks, type ProgressWeeks } from "@/domain/progress-period";
export type TrainingNavigation = { weeks: ProgressWeeks; view: "1rm" | "volumen" };
export function navigationContext(
  query: { semanas?: unknown; vista?: unknown } = {},
): TrainingNavigation {
  return {
    weeks: parseProgressWeeks(typeof query.semanas === "string" ? query.semanas : undefined),
    view: query.vista === "volumen" ? "volumen" : "1rm",
  };
}
export function trainingParams(context: TrainingNavigation, studentId?: string) {
  const params = new URLSearchParams();
  if (z.uuid().safeParse(studentId).success) params.set("alumno", studentId!);
  if (context.weeks !== 8) params.set("semanas", String(context.weeks));
  if (context.view === "volumen") params.set("vista", "volumen");
  return params;
}
const id = (value: string) => z.uuid().parse(value);
const suffix = (params: URLSearchParams) => (params.size ? `?${params}` : "");
export const studentHref = (studentId: string, c: TrainingNavigation) =>
  `/coach/students/${id(studentId)}${suffix(trainingParams(c))}`;
export const progressHref = (exerciseId: string, c: TrainingNavigation, studentId?: string) =>
  `/progress/${id(exerciseId)}${suffix(trainingParams(c, studentId))}`;
export const programHref = (programId: string, c: TrainingNavigation, studentId?: string) =>
  `/coach/programs/${id(programId)}${suffix(trainingParams(c, studentId))}`;
export const adaptHref = (c: TrainingNavigation, studentId?: string) =>
  `/coach/programs/adapt${suffix(trainingParams(c, studentId))}`;
export function workoutHref(
  workoutId: string,
  c: TrainingNavigation,
  studentId?: string,
  exerciseId?: string,
) {
  const params = trainingParams(c, studentId);
  if (z.uuid().safeParse(exerciseId).success) {
    params.set("desde", "progreso");
    params.set("ejercicio", exerciseId!);
  } else if (studentId) params.set("desde", "ficha");
  return `/history/${id(workoutId)}${suffix(params)}`;
}
export function evidenceReturn(
  c: TrainingNavigation,
  actualStudentId: string,
  own: boolean,
  query: { desde?: unknown; ejercicio?: unknown; alumno?: unknown; returnTo?: unknown },
  exerciseIds: string[],
) {
  if (
    query.desde === "progreso" &&
    typeof query.ejercicio === "string" &&
    z.uuid().safeParse(query.ejercicio).success &&
    exerciseIds.includes(query.ejercicio)
  )
    return {
      href: progressHref(query.ejercicio, c, own ? undefined : actualStudentId),
      label: "Volver al progreso",
    };
  return own
    ? { href: "/history", label: "Volver" }
    : { href: studentHref(actualStudentId, c), label: "Volver a la ficha" };
}
