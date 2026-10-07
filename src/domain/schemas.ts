// Esquemas de validación compartidos por formularios, server actions y tests (DC-13, DC-15, DC-18).
// La base de datos repite estos límites como restricciones: aquí se dan mensajes útiles; allá se
// garantiza que ningún cliente los salte.
import { z } from "zod";
import { santiagoDate } from "./dates";

export const LIMITS = {
  weeksMin: 1,
  weeksMax: 16,
  setsMin: 1,
  setsMax: 10,
  repsMin: 1,
  repsMax: 100,
  weightMinKg: 0,
  weightMaxKg: 500,
  exercisesPerSession: 15,
  sessionsPerWeek: 7,
  nameMax: 100,
  noteMax: 500,
  commentMax: 500,
  photosPerDay: 3,
  photoMaxBytes: 1_048_576,
  bodyWeightMinKg: 20,
  bodyWeightMaxKg: 300,
  girthMinCm: 10,
  girthMaxCm: 250,
  incrementMaxKg: 20,
} as const;

export const MUSCLE_GROUPS = [
  "Pecho",
  "Espalda",
  "Hombros",
  "Brazos",
  "Piernas",
  "Core",
  "Cardio",
] as const;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/webp"] as const;
export const PHOTO_TAGS = ["frente", "lado", "espalda"] as const;

// Los formularios mandan texto: "" = sin dato, y se acepta la coma decimal ("80,5").
function fromForm(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text === "") return undefined;
  return Number(text.replace(",", "."));
}

const hasAtMostDecimals = (decimals: number) => (n: number) => {
  const factor = 10 ** decimals;
  return Math.abs(n * factor - Math.round(n * factor)) < 1e-9;
};

const text = (max: number) => z.string().trim().min(1).max(max);

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .max(max)
      .nullish()
      .transform((v) => v ?? null),
  );

const integer = (min: number, max: number) =>
  z.preprocess(fromForm, z.number().int().min(min).max(max));

const weight = (min: number, max: number, decimals: number) =>
  z.preprocess(
    fromForm,
    z
      .number()
      .min(min)
      .max(max)
      .refine(hasAtMostDecimals(decimals), `Máximo ${decimals} decimales`),
  );

const optionalWeight = (min: number, max: number, decimals: number) =>
  z.preprocess(
    fromForm,
    z
      .number()
      .min(min)
      .max(max)
      .refine(hasAtMostDecimals(decimals), `Máximo ${decimals} decimales`)
      .nullish()
      .transform((v) => v ?? null),
  );

// Programas -------------------------------------------------------------------------------------
export const programInputSchema = z.object({
  name: text(LIMITS.nameMax),
  weeksCount: integer(LIMITS.weeksMin, LIMITS.weeksMax),
});

export const sessionLabelSchema = z.string().regex(/^[A-G]$/, "La sesión va de la A a la G");

export const sessionExerciseSchema = z
  .object({
    exerciseId: z.uuid(),
    sets: integer(LIMITS.setsMin, LIMITS.setsMax),
    repsMin: integer(LIMITS.repsMin, LIMITS.repsMax),
    repsMax: integer(LIMITS.repsMin, LIMITS.repsMax),
    targetWeightKg: optionalWeight(LIMITS.weightMinKg, LIMITS.weightMaxKg, 2),
    note: optionalText(LIMITS.noteMax),
  })
  .refine((v) => v.repsMin <= v.repsMax, {
    message: "El mínimo de repeticiones no puede superar al máximo",
    path: ["repsMax"],
  });

// Ejercicios ------------------------------------------------------------------------------------
export const exerciseInputSchema = z.object({
  name: text(LIMITS.nameMax),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  equipment: optionalText(50),
  progressionIncrementKg: z.preprocess(
    fromForm,
    z.number().gt(0).max(LIMITS.incrementMaxKg).default(2.5),
  ),
});

// Entrenamientos --------------------------------------------------------------------------------
// Solo series completadas (RF-23): las repeticiones son siempre ≥ 1. Peso 0 = peso corporal.
export const workoutSetSchema = z.object({
  weightKg: weight(LIMITS.weightMinKg, LIMITS.weightMaxKg, 2),
  reps: integer(LIMITS.repsMin, LIMITS.repsMax),
  isWarmup: z.boolean(),
});

export const commentSchema = z.object({ body: text(LIMITS.commentMax) });

// Medidas corporales (DC-15) ----------------------------------------------------------------------
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    return (
      parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
    );
  }, "Fecha inválida");

export const measurementSchema = z
  .object({
    measuredOn: calendarDate.refine(
      (value) => value <= santiagoDate(new Date()),
      "La fecha no puede estar en el futuro",
    ),
    weightKg: optionalWeight(LIMITS.bodyWeightMinKg, LIMITS.bodyWeightMaxKg, 2),
    waistCm: optionalWeight(LIMITS.girthMinCm, LIMITS.girthMaxCm, 1),
    chestCm: optionalWeight(LIMITS.girthMinCm, LIMITS.girthMaxCm, 1),
    armCm: optionalWeight(LIMITS.girthMinCm, LIMITS.girthMaxCm, 1),
  })
  .refine((v) => [v.weightKg, v.waistCm, v.chestCm, v.armCm].some((x) => x !== null), {
    message: "Ingresa al menos una medida",
    path: ["weightKg"],
  });

// Fotos (DC-18) -----------------------------------------------------------------------------------
export const photoFileSchema = z.object({
  type: z.enum(PHOTO_MIME_TYPES),
  size: z.number().int().min(1).max(LIMITS.photoMaxBytes),
});

export type SessionExerciseInput = z.infer<typeof sessionExerciseSchema>;
export type WorkoutSetInput = z.infer<typeof workoutSetSchema>;
export type MeasurementInput = z.infer<typeof measurementSchema>;
