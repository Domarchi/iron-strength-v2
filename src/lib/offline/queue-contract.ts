import { z } from "zod";
import { workoutPayloadSchema } from "@/lib/data/save-workout";
export type WorkoutPayload = z.infer<typeof workoutPayloadSchema>;
const completedPayload = workoutPayloadSchema.refine(
  (p) => p.sets.length > 0 && Date.parse(p.finishedAt) >= Date.parse(p.startedAt),
);
const entrySchema = z
  .object({
    version: z.literal(1),
    userId: z.uuid(),
    workoutId: z.uuid(),
    createdAt: z.iso.datetime(),
    payload: completedPayload,
    error: z.string().nullable(),
  })
  .refine((e) => e.workoutId === e.payload.id);
export type QueueEntry = z.infer<typeof entrySchema>;
export function makeQueueEntry(userId: string, payload: unknown, createdAt: string): QueueEntry {
  const parsed = completedPayload.parse(payload);
  return entrySchema.parse({
    version: 1,
    userId,
    workoutId: parsed.id,
    createdAt,
    payload: parsed,
    error: null,
  });
}
export function parseQueueEntry(value: unknown, userId: string): QueueEntry | null {
  const result = entrySchema.safeParse(value);
  return result.success && result.data.userId === userId ? result.data : null;
}
