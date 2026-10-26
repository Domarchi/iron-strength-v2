import { z } from "zod";
const uuid = z.uuid().transform((value) => value.toLowerCase());
export const personalWorkoutOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("free") }).strict(),
  z
    .object({
      kind: z.literal("personal"),
      routineId: uuid,
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
const set = z
  .object({
    exerciseId: uuid,
    position: z.number().int().min(0).max(14),
    setNumber: z.number().int().min(1).max(20),
    weightKg: z
      .number()
      .min(0)
      .max(500)
      .refine((value) => Math.round(value * 100) / 100 === value),
    reps: z.number().int().min(1).max(100),
    isWarmup: z.boolean(),
  })
  .strict();
export const personalWorkoutPayloadSchema = z
  .object({
    version: z.literal(1),
    id: uuid,
    origin: personalWorkoutOriginSchema,
    title: z.string().trim().min(1).max(100),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    durationSeconds: z.number().int().min(0).max(86400),
    perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    sets: z.array(set).min(1).max(300),
  })
  .strict()
  .refine((value) => Date.parse(value.finishedAt) >= Date.parse(value.startedAt), {
    message: "Revisa las fechas del entrenamiento.",
  })
  .refine(
    (value) => {
      const slots = new Set<string>(),
        identities = new Map<number, string>();
      return value.sets.every((row) => {
        const slot = `${row.position}:${row.setNumber}`;
        if (
          slots.has(slot) ||
          (identities.has(row.position) && identities.get(row.position) !== row.exerciseId)
        )
          return false;
        slots.add(slot);
        identities.set(row.position, row.exerciseId);
        return true;
      });
    },
    { message: "Revisa las posiciones y series del entrenamiento." },
  );
export const personalWorkoutRequestSchema = z
  .object({ version: z.literal(1), payload: personalWorkoutPayloadSchema })
  .strict();
export type PersonalWorkoutPayload = z.infer<typeof personalWorkoutPayloadSchema>;

export const personalWorkoutReceiptSchema = z
  .object({ workoutId: z.uuid(), status: z.enum(["created", "duplicate", "removed"]) })
  .strict();
