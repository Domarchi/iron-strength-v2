import { z } from "zod";
const setSchema = z.object({
  sessionExerciseId: z.uuid().optional(),
  prescribedExerciseId: z.uuid().optional(),
  exerciseId: z.uuid(),
  exerciseName: z.string().min(1).max(100),
  position: z.number().int().min(0).max(100),
  setNumber: z.number().int().min(1).max(100),
  weightKg: z.number().min(0).max(500),
  reps: z.number().int().min(1).max(100),
  isWarmup: z.boolean(),
});

export const workoutPayloadSchema = z.object({
  id: z.uuid(),
  programId: z.uuid(),
  programSessionId: z.uuid(),
  sessionLabel: z.string().min(1).max(10),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  durationSeconds: z.number().int().min(0).max(86_400),
  sets: z.array(setSchema).max(300),
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
