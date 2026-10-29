import { z } from "zod";
import type {
  TrainingExerciseProgress,
  TrainingComparisonMetric,
} from "@/domain/training-progress";
import type { ProgressWeeks } from "@/domain/progress-period";
import { parseProgressWeeks } from "@/domain/progress-period";
import { availableTrainingMetrics, defaultTrainingMetric } from "@/domain/training-progress-view";
import {
  progressTypeTagSchema,
  type TrainingNavigation,
  type ProgressQuery,
} from "./training-context";
export type TrainingExerciseSelection =
  | { kind: "missing" }
  | { kind: "invalid_type" }
  | { kind: "choose_type"; choices: TrainingExerciseProgress[] }
  | {
      kind: "ready";
      exercise: TrainingExerciseProgress;
      metric: TrainingComparisonMetric;
      weeks: ProgressWeeks;
      notices: string[];
    };
export function selectTrainingExercise(
  exercises: TrainingExerciseProgress[],
  exerciseId: string,
  q: ProgressQuery,
): TrainingExerciseSelection {
  if (!z.uuid().safeParse(exerciseId).success) return { kind: "missing" };
  const matching = exercises.filter((e) => e.exerciseId.toLowerCase() === exerciseId.toLowerCase());
  if (!matching.length) return { kind: "missing" };
  let e: TrainingExerciseProgress | undefined;
  if (q.tipo !== undefined) {
    const type = progressTypeTagSchema.safeParse(q.tipo);
    if (!type.success) return { kind: "invalid_type" };
    e = matching.find((e) => (e.recordType ?? "legacy") === type.data);
  } else
    e =
      matching.find((e) => e.recordType === null) ??
      (matching.length === 1 ? matching[0] : undefined);
  if (!e)
    return q.tipo === undefined ? { kind: "choose_type", choices: matching } : { kind: "missing" };
  const weeks = parseProgressWeeks(typeof q.semanas === "string" ? q.semanas : undefined),
    notices: string[] = [];
  if (
    q.semanas !== undefined &&
    !(typeof q.semanas === "string" && ["4", "8", "12"].includes(q.semanas))
  )
    notices.push("Periodo no válido. Mostramos 8 semanas.");
  const options = availableTrainingMetrics(e);
  const legacy =
    e.recordType === null
      ? q.vista === "volumen" && options.includes("externalVolumeKg")
        ? "externalVolumeKg"
        : options.includes("estimated1RM")
          ? "estimated1RM"
          : options.includes("bodyweightReps")
            ? "bodyweightReps"
            : undefined
      : undefined;
  const requested = options.find((m) => m === q.metrica),
    metric = requested ?? legacy ?? defaultTrainingMetric(e);
  if (q.metrica !== undefined && !requested)
    notices.push("Esta métrica no corresponde a este registro. Mostramos su métrica principal.");
  if (q.vista !== undefined && q.vista !== "1rm" && q.vista !== "volumen")
    notices.push("Vista no válida. Conservamos las métricas del registro.");
  return { kind: "ready", exercise: e, metric, weeks, notices };
}
export function progressSelectionNavigation(
  s: Extract<TrainingExerciseSelection, { kind: "ready" }>,
  view?: unknown,
): TrainingNavigation {
  return {
    weeks: s.weeks,
    view: view === "volumen" ? "volumen" : "1rm",
    recordType: s.exercise.recordType ?? "legacy",
    metric: s.metric,
  };
}
