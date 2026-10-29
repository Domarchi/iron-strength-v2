import { z } from "zod";
import { addDays } from "./dates";
import type { ProgressWeeks } from "./progress-period";
import { type RecordType } from "./training-metrics";
import { formatWeight, formatDistance, type WeightUnit, type DistanceUnit } from "./training-tools";
import type {
  TrainingExerciseProgress,
  TrainingProgressMark,
  TrainingComparisonMetric,
  TrainingProgressPoint,
} from "./training-progress";
export const PROGRESS_LABELS: Record<TrainingComparisonMetric, string> = {
  weightKg: "Peso",
  estimated1RM: "1RM estimado",
  reps: "Repeticiones",
  assistanceKg: "Asistencia",
  durationSeconds: "Duración",
  distanceMeters: "Distancia",
  workingSets: "Series",
  externalVolumeKg: "Volumen",
  bodyweightReps: "Repeticiones totales",
  totalDurationSeconds: "Tiempo total",
  totalDistanceMeters: "Distancia total",
};
export function trainingMetricsForType(type: RecordType): TrainingComparisonMetric[] {
  switch (type) {
    case "duration":
      return ["durationSeconds", "workingSets", "totalDurationSeconds"];
    case "weight_duration":
      return ["weightKg", "durationSeconds", "workingSets", "totalDurationSeconds"];
    case "distance_duration":
      return [
        "durationSeconds",
        "distanceMeters",
        "workingSets",
        "totalDurationSeconds",
        "totalDistanceMeters",
      ];
    case "weight_distance":
      return ["weightKg", "distanceMeters", "workingSets", "totalDistanceMeters"];
    case "assisted_bodyweight":
      return ["reps", "assistanceKg", "workingSets", "bodyweightReps"];
    case "bodyweight_reps":
      return ["reps", "workingSets", "bodyweightReps"];
    case "weighted_bodyweight":
      return ["weightKg", "reps", "workingSets", "externalVolumeKg", "bodyweightReps"];
    default:
      return [
        "weightKg",
        "estimated1RM",
        "reps",
        "workingSets",
        "externalVolumeKg",
        "bodyweightReps",
      ];
  }
}
export function availableTrainingMetrics(e: TrainingExerciseProgress): TrainingComparisonMetric[] {
  return trainingMetricsForType(e.recordType).filter((m) => {
    if (m === "bodyweightReps") return e.points.some((p) => p.totals.bodyweightReps > 0);
    if (
      m === "externalVolumeKg" &&
      e.recordType === null &&
      !e.marks.some((m) => m.metric === "weightKg" && m.value > 0)
    )
      return false;
    return (
      ["workingSets", "externalVolumeKg", "totalDurationSeconds", "totalDistanceMeters"].includes(
        m,
      ) || e.marks.some((mark) => mark.metric === m)
    );
  });
}
export function primaryTrainingMark(e: TrainingExerciseProgress): TrainingProgressMark | null {
  const metric =
    e.recordType === "assisted_bodyweight"
      ? "assistanceKg"
      : e.recordType === "duration" || e.recordType === "weight_duration"
        ? "durationSeconds"
        : e.recordType === "distance_duration"
          ? "distanceMeters"
          : e.recordType === "bodyweight_reps"
            ? "reps"
            : e.marks.some((m) => m.metric === "weightKg" && m.value > 0)
              ? "weightKg"
              : "reps";
  return e.marks.find((m) => m.metric === metric) ?? e.marks[0] ?? null;
}
export function defaultTrainingMetric(e: TrainingExerciseProgress): TrainingComparisonMetric {
  if (e.marks.some((m) => m.metric === "estimated1RM")) return "estimated1RM";
  return primaryTrainingMark(e)?.metric ?? "workingSets";
}
export function progressPointValue(
  p: TrainingProgressPoint,
  metric: TrainingComparisonMetric,
): number | null {
  switch (metric) {
    case "workingSets":
      return p.totals.workingSets;
    case "externalVolumeKg":
      return p.totals.externalVolumeKg;
    case "bodyweightReps":
      return p.totals.bodyweightReps;
    case "totalDurationSeconds":
      return p.totals.durationSeconds;
    case "totalDistanceMeters":
      return p.totals.distanceMeters;
    default:
      return p.marks.find((m) => m.metric === metric)?.value ?? null;
  }
}
const months = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
export function queryPeriod(today: string, mode: "month" | "year", offset: number) {
  z.iso.date().parse(today);
  z.number().int().min(-12000).max(12000).parse(offset);
  const year = Number(today.slice(0, 4)),
    month = Number(today.slice(5, 7)) - 1;
  const absolute = year * 12 + month + (mode === "month" ? offset : offset * 12),
    y = Math.floor(absolute / 12),
    m = absolute % 12;
  if (y < 1000 || y > 9998 || m < 0) throw Error("Periodo fuera del rango disponible.");
  if (mode === "year") return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01`,
    next = m === 11 ? `${y + 1}-01-01` : `${y}-${String(m + 2).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1), label: `${months[m]} ${y}` };
}
export function formatProgressValue(
  metric: TrainingComparisonMetric,
  value: number,
  units: { weightUnit: WeightUnit; distanceUnit: DistanceUnit } = {
    weightUnit: "kg",
    distanceUnit: "m",
  },
) {
  const n = value.toLocaleString("es-CL", { maximumFractionDigits: 2 });
  if (["weightKg", "assistanceKg", "estimated1RM", "externalVolumeKg"].includes(metric))
    return formatWeight(value, units.weightUnit);
  if (["distanceMeters", "totalDistanceMeters"].includes(metric))
    return formatDistance(value, units.distanceUnit);
  if (["durationSeconds", "totalDurationSeconds"].includes(metric)) return `${n} s`;
  if (metric === "workingSets") return `${n} ${value === 1 ? "serie" : "series"}`;
  return `${n} reps`;
}
type ReturnParams = {
  exercise?: string | string[];
  progressVersion?: string | string[];
  recordType?: string | string[];
  weeks?: string | string[];
  metric?: string | string[];
};
const types = [
  "legacy",
  "weight_reps",
  "bodyweight_reps",
  "weighted_bodyweight",
  "assisted_bodyweight",
  "duration",
  "weight_duration",
  "distance_duration",
  "weight_distance",
];
export function trainingProgressReturn(
  p: ReturnParams,
  exercises: { exerciseId: string; recordType: RecordType }[],
) {
  if (
    p.progressVersion !== "2" ||
    typeof p.exercise !== "string" ||
    !z.uuid().safeParse(p.exercise).success ||
    typeof p.recordType !== "string" ||
    !types.includes(p.recordType) ||
    typeof p.weeks !== "string" ||
    !["4", "8", "12"].includes(p.weeks) ||
    typeof p.metric !== "string"
  )
    return null;
  const kind = (p.recordType === "legacy" ? null : p.recordType) as RecordType;
  if (
    !exercises.some((e) => e.exerciseId === p.exercise && e.recordType === kind) ||
    !trainingMetricsForType(kind).includes(p.metric as TrainingComparisonMetric)
  )
    return null;
  return {
    exercise: p.exercise,
    recordType: p.recordType,
    weeks: Number(p.weeks) as ProgressWeeks,
    metric: p.metric as TrainingComparisonMetric,
  };
}
