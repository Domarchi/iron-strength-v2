import { z } from "zod";
import {
  coherentPrescriptionSeries,
  prescribedSeriesSchema,
} from "../../domain/prescription-series";

export const mobileProfileSchema = z.object({
  id: z.uuid(),
  fullName: z.string().min(1),
  email: z.string(),
  role: z.enum(["coach", "student"]),
});
export const mobileSessionSchema = z.object({
  version: z.literal(1),
  accessToken: z.string().min(1).max(16384),
  refreshToken: z.string().min(1).max(1024),
  expiresAt: z.number().int().positive(),
  profile: mobileProfileSchema,
});
export type MobileProfile = z.infer<typeof mobileProfileSchema>;
export type MobileSession = z.infer<typeof mobileSessionSchema>;
const program = z.object({
  id: z.uuid(),
  name: z.string(),
  weeksCount: z.number().int().positive(),
  startDate: z.string(),
  endsOn: z.string(),
});
const common = { version: z.literal(1) };
export const mobileWeekSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("no_program") }),
  z.object({ ...common, kind: z.literal("scheduled"), program }),
  z.object({ ...common, kind: z.literal("finished"), program }),
  z.object({
    ...common,
    kind: z.literal("active"),
    program,
    weekNumber: z.number().int().positive(),
    weekStart: z.string(),
    weekEnd: z.string(),
    sessions: z
      .array(
        z.object({
          sessionId: z.uuid(),
          label: z.string(),
          title: z.string().nullish(),
          status: z.enum(["done", "pending", "missed", "upcoming"]),
          exerciseCount: z.number().int().nonnegative(),
          setCount: z.number().int().nonnegative().optional(),
          exerciseNames: z.array(z.string()),
          scheduledOn: z.string().nullish(),
        }),
      )
      .max(7),
  }),
]);
export type MobileWeek = z.infer<typeof mobileWeekSchema>;
const prescribed = z
  .object({
    sets: z.number().int().min(1).max(10),
    repsMin: z.number().int().min(1).max(100),
    repsMax: z.number().int().min(1).max(100),
    targetWeightKg: z.number().min(0).max(500).nullable(),
    series: prescribedSeriesSchema.nullish(),
  })
  .refine((p) => p.repsMin <= p.repsMax && coherentPrescriptionSeries(p));
const choice = z.object({
  exerciseId: z.uuid(),
  name: z.string(),
  isBodyweight: z.boolean(),
  prescribed,
});
export const mobileRoutineSchema = z.object({
  version: z.literal(1),
  session: z.object({
    id: z.uuid(),
    label: z.string(),
    title: z.string().nullish(),
    programId: z.uuid(),
    programName: z.string(),
    weekNumber: z.number().int().positive(),
    weeksCount: z.number().int().positive(),
  }),
  exercises: z
    .array(
      choice.extend({
        sessionExerciseId: z.uuid(),
        note: z.string().nullable(),
        restSeconds: z.number().int().nonnegative().nullish(),
        supersetId: z.uuid().nullish(),
        supersetRestSeconds: z.number().int().nonnegative().nullish(),
        alternatives: z.array(choice).max(3).optional(),
      }),
    )
    .max(15),
});
export type MobileRoutine = z.infer<typeof mobileRoutineSchema>;
export const mobileErrorSchema = z.object({
  version: z.literal(1),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryAfterSeconds: z.number().optional(),
  }),
});
