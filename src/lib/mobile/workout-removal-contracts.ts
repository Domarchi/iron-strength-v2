import { z } from "zod";
import { workoutSourceKindSchema } from "./personal-workout-contracts";
const uuid = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().min(0).max(2147483647);
export const workoutRemovalSchema = z
  .object({ version: z.literal(1), requestId: uuid, workoutId: uuid, expectedRevision: revision })
  .strict();
export type WorkoutRemoval = z.infer<typeof workoutRemovalSchema>;
export const workoutRemovalSnapshotSchema = z
  .object({
    version: z.literal(1),
    userId: uuid,
    today: z.iso.date(),
    workout: z
      .object({
        id: uuid,
        revision,
        sourceKind: workoutSourceKindSchema,
        title: z.string().nullable(),
        sessionLabel: z.string().nullable(),
        performedOn: z.iso.date(),
        setCount: z.number().int().min(0).max(2147483647),
        commentCount: z.number().int().min(0).max(2147483647),
      })
      .strict(),
  })
  .strict();
export type WorkoutRemovalSnapshot = z.infer<typeof workoutRemovalSnapshotSchema>;
export const workoutRemovalReceiptSchema = z
  .object({
    version: z.literal(1),
    requestId: uuid,
    workoutId: uuid,
    revision: revision.min(1),
    status: z.enum(["deleted", "duplicate"]),
  })
  .strict();
export type WorkoutRemovalReceipt = z.infer<typeof workoutRemovalReceiptSchema>;
