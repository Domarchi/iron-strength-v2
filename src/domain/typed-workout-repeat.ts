import { z } from "zod";
import { typedWorkoutSchema, type TypedWorkout } from "../lib/mobile/typed-recording-contracts";
import { typedCatalogSchema, type TypedCatalogEntry } from "../lib/mobile/typed-exercise-contracts";
import {
  athleteNoteSchema,
  trainingMetricsSchema,
  trainingPrescriptionSchema,
  trainingSetDetailsSchema,
} from "./training-metrics";
import { validRestSeconds, validSupersetLayout } from "./supersets";

const uuid = z.uuid(),
  rest = z.number().int().nullable().refine(validRestSeconds);
const repeatedSet = z
  .object({
    id: uuid,
    setNumber: z.number().int().min(1).max(20),
    metrics: trainingMetricsSchema,
    setType: trainingSetDetailsSchema.shape.setType,
  })
  .strict();
export const typedRepeatPlanSchema = z
  .object({
    version: z.literal(2),
    sourceWorkoutId: uuid,
    performedOn: z.iso.date(),
    title: z.string().trim().min(1).max(100),
    kind: z.literal("recorded"),
    warnings: z.array(z.enum(["unperformed", "incomplete_group", "warmups_only"])).max(3),
    exercises: z
      .array(
        z
          .object({
            sourcePosition: z.number().int().min(0).max(14),
            sourceRowId: uuid,
            exerciseId: uuid,
            name: z.string().min(1).max(100),
            isBodyweight: z.boolean(),
            prescribed: trainingPrescriptionSchema,
            note: athleteNoteSchema,
            restSeconds: rest,
            supersetId: uuid.nullable(),
            supersetRestSeconds: rest,
            sets: z.array(repeatedSet).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict()
  .refine(
    (p) =>
      new Set(p.exercises.map((e) => e.sourcePosition)).size === p.exercises.length &&
      new Set(p.exercises.map((e) => e.sourceRowId)).size === p.exercises.length &&
      new Set(p.exercises.flatMap((e) => e.sets.map((s) => s.id))).size ===
        p.exercises.reduce((n, e) => n + e.sets.length, 0) &&
      p.exercises.every(
        (e) =>
          new Set(e.sets.map((s) => s.setNumber)).size === e.sets.length &&
          e.sets.every((s) => s.metrics.recordType === e.prescribed.recordType),
      ) &&
      validSupersetLayout(p.exercises.map((e) => ({ ...e, id: String(e.sourcePosition) }))),
  );
export type TypedRepeatPlan = z.infer<typeof typedRepeatPlanSchema>;
type Failure = { ok: false; reason: "invalid" | "unavailable" | "no_sets"; message: string };
export type TypedRepeatPreparation = { ok: true; plan: TypedRepeatPlan } | Failure;

/** No routine lookup, ID allocation, clock or storage: a preview never starts a workout. */
export function prepareTypedWorkoutRepeat(
  input: TypedWorkout["workout"],
  available: TypedCatalogEntry[],
): TypedRepeatPreparation {
  const failure = (reason: Failure["reason"], message: string): Failure => ({
    ok: false,
    reason,
    message,
  });
  try {
    const source = typedWorkoutSchema.parse({ version: 3, workout: input }).workout,
      catalog = typedCatalogSchema.parse({ version: 2, exercises: available }).exercises,
      byId = new Map(catalog.map((e) => [e.id, e]));
    const performed = source.exercises.filter((e) => e.sets.length);
    if (!performed.length)
      return failure("no_sets", "Este resultado no tiene series registradas para repetir.");
    const groupCounts = new Map<string, number>();
    for (const e of performed) {
      const group = source.structure.exercises[e.position].supersetId;
      if (group) groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    }
    const warnings: TypedRepeatPlan["warnings"] = [];
    if (performed.length < source.exercises.length) warnings.push("unperformed");
    const exercises: TypedRepeatPlan["exercises"] = [];
    let dissolved = false,
      warmupsOnly = false;
    for (const e of performed) {
      const metadata = byId.get(e.exerciseId),
        stored = source.structure.exercises[e.position];
      if (!metadata || metadata.recordType !== stored.prescribed.recordType)
        return failure(
          "unavailable",
          `${e.name} no está disponible con su tipo de registro. El resultado se conserva; no se inició una copia parcial.`,
        );
      const orphan = !!stored.supersetId && groupCounts.get(stored.supersetId) === 1;
      if (orphan) dissolved = true;
      if (e.sets.every((s) => s.setType === "warmup")) warmupsOnly = true;
      exercises.push({
        sourcePosition: e.position,
        sourceRowId: stored.id,
        exerciseId: metadata.id,
        name: metadata.name,
        isBodyweight: metadata.isBodyweight,
        prescribed: stored.prescribed,
        note: stored.note,
        restSeconds: orphan ? (stored.supersetRestSeconds ?? 90) : stored.restSeconds,
        supersetId: orphan ? null : stored.supersetId,
        supersetRestSeconds: orphan ? null : stored.supersetRestSeconds,
        sets: e.sets
          .map((s) =>
            repeatedSet.parse({
              id: s.id,
              setNumber: s.setNumber,
              metrics: s.metrics,
              setType: s.setType,
            }),
          )
          .sort((a, b) => a.setNumber - b.setNumber),
      });
    }
    if (dissolved) warnings.push("incomplete_group");
    if (warmupsOnly) warnings.push("warmups_only");
    return {
      ok: true,
      plan: typedRepeatPlanSchema.parse({
        version: 2,
        sourceWorkoutId: source.id,
        performedOn: source.performedOn,
        title:
          source.title ?? source.programName ?? `Entrenamiento ${source.sessionLabel ?? "libre"}`,
        kind: "recorded",
        warnings,
        exercises,
      }),
    };
  } catch {
    return failure(
      "invalid",
      "No pudimos preparar este resultado completo. Se conserva sin cambios.",
    );
  }
}
