import {
  recordTypeSchema,
  trainingRecordedSetSchema,
  type RecordType,
  type TrainingRecordedSet,
} from "./training-metrics";
import { workoutOriginLabel, type WorkoutSourceKind } from "./workout-title";
// Exportar el historial a CSV (RF-47, RF-67; DC-31). Formato pensado para Excel en español de Chile:
// UTF-8 con BOM, separador ";" y coma decimal. Los nombres de ejercicio los escribe el coach, así que
// todo texto libre se neutraliza contra inyección de fórmulas antes de entrar a una celda.
import type { DateString } from "./dates";

export const BOM = "﻿";
const SEPARATOR = ";";
const EOL = "\r\n";
const HEADER = [
  "Fecha",
  "Sesión",
  "Ejercicio",
  "Serie",
  "Tipo",
  "Kg",
  "Reps",
  "Ejercicio prescrito",
  "Esfuerzo (1–10)",
  "Nota del entrenamiento",
  "Origen",
  "Título",
  "Tipo de registro",
  "Duración (s)",
  "Distancia (m)",
  "Esfuerzo de serie (1–10)",
  "Nota del ejercicio",
  "Fila",
  "Entrenamiento ID",
  "Ejercicio ID",
  "Ejercicio prescrito ID",
];

export type ExportSet = {
  sourceKind?: WorkoutSourceKind;
  workoutTitle?: string | null;
  date: DateString;
  sessionLabel: string | null;
  exerciseName: string;
  prescribedExerciseName?: string | null;
  perceivedEffort?: number | null;
  workoutNote?: string | null;
  rowKind?: "set" | "exercise_note";
  recordType?: RecordType;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  setType?: TrainingRecordedSet["setType"] | null;
  setEffort?: number | null;
  exerciseNote?: string | null;
  workoutId?: string | null;
  exerciseId?: string | null;
  prescribedExerciseId?: string | null;
  setNumber: number | null;
  isWarmup: boolean;
  weightKg: number | null;
  reps: number | null;
};

// Excel y Sheets ejecutan como fórmula lo que empieza con = + - @ (o con tabulación / retorno).
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function escapeField(value: string): string {
  const safe = neutralizeFormula(value);
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const decimal = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const classLabels: Record<TrainingRecordedSet["setType"], string> = {
  working: "Trabajo",
  warmup: "Calentamiento",
  failure: "Fallo",
  drop: "Descendente",
};
function exportCells(r: ExportSet): string[] {
  const note = r.rowKind === "exercise_note";
  recordTypeSchema.parse(r.recordType ?? null);
  if (r.rowKind !== undefined && r.rowKind !== "set" && !note)
    throw Error("Tipo de fila inválido.");
  let setType: TrainingRecordedSet["setType"] | null = null;
  if (note) {
    if (
      r.setNumber !== null ||
      r.isWarmup ||
      [r.weightKg, r.reps, r.durationSeconds, r.distanceMeters, r.setType, r.setEffort].some(
        (value) => value != null,
      )
    )
      throw Error("Una nota no es una serie realizada.");
  } else {
    if (r.setNumber === null || !Number.isSafeInteger(r.setNumber) || r.setNumber < 1)
      throw Error("Serie inválida.");
    setType = r.setType ?? (r.isWarmup ? "warmup" : "working");
    if (r.isWarmup !== (setType === "warmup")) throw Error("Clase de serie incompatible.");
    trainingRecordedSetSchema.parse({
      recordType: r.recordType ?? null,
      weightKg: r.weightKg,
      reps: r.reps,
      durationSeconds: r.durationSeconds ?? null,
      distanceMeters: r.distanceMeters ?? null,
      setType,
      effort: r.setEffort ?? null,
    });
  }
  return [
    r.date,
    r.sessionLabel ?? "",
    r.exerciseName,
    r.setNumber === null ? "" : String(r.setNumber),
    setType === null ? "" : classLabels[setType],
    decimal(r.weightKg),
    decimal(r.reps),
    r.prescribedExerciseName ??
      (r.sourceKind == null || r.sourceKind === "assigned" ? r.exerciseName : ""),
    decimal(r.perceivedEffort),
    r.workoutNote ?? "",
    workoutOriginLabel(r.sourceKind),
    r.workoutTitle ?? "",
    r.recordType ?? "",
    decimal(r.durationSeconds),
    decimal(r.distanceMeters),
    decimal(r.setEffort),
    r.exerciseNote ?? "",
    note ? "Nota del ejercicio" : "Serie",
    r.workoutId ?? "",
    r.exerciseId ?? "",
    r.prescribedExerciseId ?? "",
  ];
}
export function buildHistoryCsv(rows: ExportSet[]): string {
  const lines = rows.map((row) => exportCells(row).map(escapeField).join(SEPARATOR));
  return BOM + [HEADER.join(SEPARATOR), ...lines].map((line) => line + EOL).join("");
}

export function csvFileName(studentName: string, today: DateString): string {
  const slug = studentName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `entrenamientos-${slug || "alumno"}-${today}.csv`;
}
