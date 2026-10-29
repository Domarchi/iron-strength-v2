import { z } from "zod";
import { mobileWorkoutSchema, type MobileWorkout } from "../lib/mobile/contracts";
import { mobileCatalogSchema, type MobileCatalogEntry } from "../lib/mobile/exercise-contracts";
import { workoutStructureSchema } from "../lib/mobile/recording-contracts";
import { seriesSummary, isUniformPrescription } from "./prescription-series";
import { validRestSeconds, validSupersetLayout } from "./supersets";

const rest = z.number().int().nullable().refine(validRestSeconds);
const setSchema = z
  .object({
    id: z.uuid(),
    setNumber: z.number().int().min(1).max(100),
    weightKg: z
      .number()
      .min(0)
      .max(500)
      .refine((n) => Math.round(n * 100) / 100 === n),
    reps: z.number().int().min(1).max(100),
    isWarmup: z.boolean(),
  })
  .strict();
const rowSchema = z
  .object({
    sourcePosition: z.number().int().min(0).max(100),
    sourceRowId: z.uuid().nullable(),
    exerciseId: z.uuid(),
    name: z.string().min(1).max(100),
    isBodyweight: z.boolean(),
    prescribed: workoutStructureSchema.shape.exercises.element.shape.prescribed,
    note: z.string().max(500).nullable(),
    restSeconds: rest,
    supersetId: z.uuid().nullable(),
    supersetRestSeconds: rest,
    sets: z.array(setSchema).min(1).max(20),
  })
  .strict();
export const repeatPlanSchema = z
  .object({
    sourceWorkoutId: z.uuid(),
    performedOn: z.iso.date(),
    title: z.string().trim().min(1).max(100),
    kind: z.enum(["recorded", "derived"]),
    warnings: z.array(z.enum(["legacy", "unperformed", "incomplete_group", "warmups_only"])).max(4),
    exercises: z.array(rowSchema).min(1).max(15),
  })
  .strict()
  .refine(
    (p) =>
      new Set(p.exercises.map((e) => e.sourcePosition)).size === p.exercises.length &&
      new Set(p.exercises.flatMap((e) => e.sets.map((s) => s.id))).size ===
        p.exercises.reduce((n, e) => n + e.sets.length, 0) &&
      p.exercises.every((e) => new Set(e.sets.map((s) => s.setNumber)).size === e.sets.length) &&
      validSupersetLayout(p.exercises.map((e) => ({ ...e, id: String(e.sourcePosition) }))),
  );
export type RepeatPlan = z.infer<typeof repeatPlanSchema>;
type Failure = {
  ok: false;
  reason: "invalid" | "limit" | "unavailable" | "no_sets";
  message: string;
};
export type RepeatPreparation = { ok: true; plan: RepeatPlan } | Failure;
const failure = (reason: Failure["reason"], message: string): Failure => ({
  ok: false,
  reason,
  message,
});

/** Uses the recorded result only. Current routine/program prescriptions are not an input. */
export function prepareWorkoutRepeat(
  input: MobileWorkout["workout"],
  available: MobileCatalogEntry[],
  defaultRestSeconds = 90,
): RepeatPreparation {
  const invalid = () =>
    failure("invalid", "No pudimos preparar este resultado completo. Se conserva sin cambios.");
  try {
    if (!validRestSeconds(defaultRestSeconds)) return invalid();
    const source = mobileWorkoutSchema.parse({ version: 1, workout: input }).workout;
    const catalog = mobileCatalogSchema.parse({ version: 1, exercises: available }).exercises;
    const byId = new Map(catalog.map((e) => [e.id.toLowerCase(), e]));
    if (new Set(source.exercises.map((e) => e.position)).size !== source.exercises.length)
      return invalid();
    const performed = source.exercises
      .filter((e) => e.sets.length)
      .sort((a, b) => a.position - b.position);
    if (!performed.length)
      return failure("no_sets", "Este resultado no tiene series registradas para repetir.");
    if (
      performed.length > 15 ||
      performed.some((e) => e.sets.length > 20) ||
      performed.reduce((n, e) => n + e.sets.length, 0) > 300
    )
      return failure(
        "limit",
        "El resultado supera el límite de 15 ejercicios o 20 series por ejercicio. No se recortó ninguna serie.",
      );
    const structure = source.structure;
    const groupCounts = new Map<string, number>();
    if (structure)
      for (const e of performed) {
        const row = structure.exercises[e.position];
        if (!row || row.exerciseId.toLowerCase() !== e.exerciseId.toLowerCase()) return invalid();
        if (row.supersetId)
          groupCounts.set(row.supersetId, (groupCounts.get(row.supersetId) ?? 0) + 1);
      }
    const warnings: RepeatPlan["warnings"] = structure ? [] : ["legacy"];
    if ((structure?.exercises.length ?? source.exercises.length) > performed.length)
      warnings.push("unperformed");
    let dissolved = false,
      warmupsOnly = false;
    const exercises: RepeatPlan["exercises"] = [];
    for (const e of performed) {
      const metadata = byId.get(e.exerciseId.toLowerCase());
      if (!metadata)
        return failure(
          "unavailable",
          `${e.name} no está disponible en tu catálogo. El resultado se conserva; no se inició una copia parcial.`,
        );
      const sets = e.sets.map((s) => setSchema.parse(s)).sort((a, b) => a.setNumber - b.setNumber);
      if (new Set(sets.map((s) => s.setNumber)).size !== sets.length) return invalid();
      const stored = structure?.exercises[e.position];
      const working = sets.filter((s) => !s.isWarmup);
      if (!working.length) warmupsOnly = true;
      if (!stored && working.length > 10)
        return failure(
          "limit",
          `${e.name} tiene más de 10 series de trabajo sin objetivos registrados. No podemos preparar sus objetivos automáticamente sin recortarlos.`,
        );
      let prescribed = stored?.prescribed;
      if (!prescribed) {
        const targets = (working.length ? working : sets.slice(0, 1)).map((s) => ({
          repsMin: s.reps,
          repsMax: s.reps,
          targetWeightKg: s.weightKg,
        }));
        const derived = { ...seriesSummary(targets), series: targets };
        prescribed = { ...derived, series: isUniformPrescription(derived) ? null : targets };
      }
      const orphan = !!stored?.supersetId && groupCounts.get(stored.supersetId) === 1;
      if (orphan) dissolved = true;
      exercises.push({
        sourcePosition: e.position,
        sourceRowId: stored?.id ?? null,
        exerciseId: metadata.id,
        name: metadata.name,
        isBodyweight: metadata.isBodyweight,
        prescribed,
        note: stored?.note ?? null,
        restSeconds: stored
          ? orphan
            ? (stored.supersetRestSeconds ?? defaultRestSeconds)
            : stored.restSeconds
          : defaultRestSeconds,
        supersetId: orphan ? null : (stored?.supersetId ?? null),
        supersetRestSeconds: orphan ? null : (stored?.supersetRestSeconds ?? null),
        sets,
      });
    }
    if (dissolved) warnings.push("incomplete_group");
    if (warmupsOnly) warnings.push("warmups_only");
    const plan = repeatPlanSchema.parse({
      sourceWorkoutId: source.id,
      performedOn: source.performedOn,
      title:
        source.title ?? source.programName ?? `Entrenamiento ${source.sessionLabel ?? "libre"}`,
      kind: structure ? "recorded" : "derived",
      warnings,
      exercises,
    });
    return { ok: true, plan };
  } catch {
    return invalid();
  }
}
