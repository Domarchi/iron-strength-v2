import { z } from "zod";
import { parseProgressWeeks, type ProgressWeeks } from "@/domain/progress-period";
import { RECORD_TYPES, type RecordType } from "@/domain/training-metrics";
import type { TrainingComparisonMetric } from "@/domain/training-progress";
import { trainingMetricsForType } from "@/domain/training-progress-view";
export const progressTypeTagSchema = z.enum(["legacy", ...RECORD_TYPES]);
export type ProgressTypeTag = z.infer<typeof progressTypeTagSchema>;
export type TrainingNavigation = {
  weeks: ProgressWeeks;
  view: "1rm" | "volumen";
  recordType?: ProgressTypeTag;
  metric?: TrainingComparisonMetric;
};
export type ProgressQuery = {
  semanas?: unknown;
  vista?: unknown;
  tipo?: unknown;
  metrica?: unknown;
};
export function navigationContext(query: ProgressQuery = {}): TrainingNavigation {
  const c: TrainingNavigation = {
    weeks: parseProgressWeeks(typeof query.semanas === "string" ? query.semanas : undefined),
    view: query.vista === "volumen" ? "volumen" : "1rm",
  };
  const tag = progressTypeTagSchema.safeParse(query.tipo);
  if (tag.success) {
    c.recordType = tag.data;
    const metric = trainingMetricsForType(tag.data === "legacy" ? null : tag.data).find(
      (m) => m === query.metrica,
    );
    if (metric) c.metric = metric;
  }
  return c;
}
export function trainingParams(context: TrainingNavigation, studentId?: string) {
  const c = navigationContext({
      semanas: String(context.weeks),
      vista: context.view,
      tipo: context.recordType,
      metrica: context.metric,
    }),
    p = new URLSearchParams();
  if (z.uuid().safeParse(studentId).success) p.set("alumno", studentId!.toLowerCase());
  if (c.weeks !== 8) p.set("semanas", String(c.weeks));
  if (c.view === "volumen") p.set("vista", "volumen");
  if (c.recordType) p.set("tipo", c.recordType);
  if (c.metric) p.set("metrica", c.metric);
  return p;
}
const id = (value: string) => z.uuid().parse(value).toLowerCase(),
  suffix = (p: URLSearchParams) => (p.size ? `?${p}` : "");
export const progressIndexHref = (c: TrainingNavigation) => `/progress${suffix(trainingParams(c))}`;
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
  const p = trainingParams(c, studentId);
  if (z.uuid().safeParse(exerciseId).success) {
    p.set("desde", "progreso");
    p.set("ejercicio", id(exerciseId!));
  } else if (studentId) p.set("desde", "ficha");
  return `/history/${id(workoutId)}${suffix(p)}`;
}
export function evidenceReturn(
  c: TrainingNavigation,
  actualStudentId: string,
  own: boolean,
  query: ProgressQuery & {
    desde?: unknown;
    ejercicio?: unknown;
    alumno?: unknown;
    returnTo?: unknown;
  },
  exercises: (string | { exerciseId: string; recordType: RecordType })[],
) {
  const exercise =
    typeof query.ejercicio === "string" && z.uuid().safeParse(query.ejercicio).success
      ? query.ejercicio.toLowerCase()
      : null;
  const validQueryType =
    query.tipo === undefined || progressTypeTagSchema.safeParse(query.tipo).success;
  if (
    validQueryType &&
    query.desde === "progreso" &&
    exercise &&
    exercises.some((row) => {
      const entry = typeof row === "string" ? { exerciseId: row, recordType: null } : row;
      return (
        entry.exerciseId.toLowerCase() === exercise &&
        (!c.recordType || (entry.recordType ?? "legacy") === c.recordType)
      );
    })
  )
    return {
      href: progressHref(exercise, c, own ? undefined : actualStudentId),
      label: "Volver al progreso",
    };
  return own
    ? { href: "/history", label: "Volver" }
    : { href: studentHref(actualStudentId, c), label: "Volver a la ficha" };
}
