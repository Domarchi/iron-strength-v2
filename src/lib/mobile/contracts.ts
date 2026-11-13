import { workoutSourceKindSchema } from "./personal-workout-contracts";
import { workoutStructureSchema } from "./recording-contracts";
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
  lastWeightKg: z.number().min(0).max(500).nullable().optional(),
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
const summary = z.object({
  workingSets: z.number().int().nonnegative(),
  volumeKg: z.number().nonnegative(),
  bodyweightReps: z.number().int().nonnegative(),
  exerciseCount: z.number().int().nonnegative(),
});
const workoutOriginFields = {
  sourceKind: workoutSourceKindSchema.optional(),
  title: z.string().nullable().optional(),
  personalRoutineId: z.uuid().nullish(),
  personalRoutineRevision: z.number().int().nonnegative().nullish(),
};
const historyItem = summary.extend({
  ...workoutOriginFields,
  id: z.uuid(),
  sessionLabel: z.string().nullable(),
  startedAt: z.string(),
  performedOn: z.string(),
  durationSeconds: z.number().nonnegative(),
  perceivedEffort: z.number().nullable(),
  note: z.string().nullable(),
});
export const mobileHistorySchema = z.object({
  version: z.literal(1),
  items: z.array(historyItem).max(20),
  nextCursor: z.string().nullable(),
});
export const mobileWorkoutSchema = z.object({
  version: z.literal(1),
  workout: z.object({
    structure: workoutStructureSchema.nullish(),
    ...workoutOriginFields,
    id: z.uuid(),
    programName: z.string().nullable(),
    sessionLabel: z.string().nullable(),
    startedAt: z.string(),
    performedOn: z.string(),
    durationSeconds: z.number().nonnegative(),
    perceivedEffort: z.number().nullable(),
    note: z.string().nullable(),
    summary,
    exercises: z
      .array(
        z.object({
          position: z.number().int(),
          exerciseId: z.uuid(),
          name: z.string(),
          prescribedExerciseId: z.string().nullish(),
          prescribedExerciseName: z.string().nullish(),
          sets: z
            .array(
              z.object({
                id: z.uuid(),
                setNumber: z.number().int(),
                weightKg: z.number(),
                reps: z.number().int(),
                isWarmup: z.boolean(),
              }),
            )
            .max(100),
        }),
      )
      .max(101),
  }),
});
export const mobileProgressSchema = z.object({
  version: z.literal(1),
  exercises: z
    .array(
      z.object({
        exerciseId: z.uuid(),
        name: z.string(),
        bestWeightKg: z.number(),
        bestEstimated1RM: z.number(),
        bestReps: z.number(),
        isBodyweight: z.boolean(),
        lastDate: z.string(),
        workoutCount: z.number().int(),
      }),
    )
    .max(1000),
});
export const mobileSaveSchema = z.object({
  version: z.literal(1),
  ok: z.literal(true),
  status: z.enum(["created", "duplicate"]),
  workoutId: z.uuid(),
});
export type MobileHistory = z.infer<typeof mobileHistorySchema>;
export type MobileWorkout = z.infer<typeof mobileWorkoutSchema>;
export type MobileProgress = z.infer<typeof mobileProgressSchema>;
export const mobileErrorSchema = z.object({
  version: z.literal(1),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryAfterSeconds: z.number().optional(),
  }),
});

export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
// GoTrue GenerateTokenHash uses SHA-224: the existing recovery links contain 56 hex digits.
export const recoveryTokenSchema = z.string().regex(/^[a-f0-9]{56}$/i);
export const mobileInvitationSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["valida", "inexistente", "usada", "vencida"]),
    email: z.string().nullable(),
  })
  .refine((value) => (value.status === "valida" ? !!value.email : value.email === null));
export const mobileRegisteredSchema = z.object({
  version: z.literal(1),
  ok: z.literal(true),
  email: z.string(),
});
export const mobilePasswordResetSchema = z.object({ version: z.literal(1), ok: z.literal(true) });
export const mobileAccountDeletedSchema = z.object({
  version: z.literal(1),
  ok: z.literal(true),
  userId: z.uuid(),
});
export const mobileCommentSchema = z.object({
  id: z.uuid(),
  body: z.string().min(1).max(500),
  createdAt: z.iso.datetime({ offset: true }),
  authorKind: z.enum(["student", "coach"]),
  mine: z.boolean(),
});
export const mobileCommentsSchema = z.object({
  version: z.literal(1),
  workoutId: z.uuid(),
  items: z.array(mobileCommentSchema).max(50),
  nextCursor: z.string().max(100).nullable(),
  unreadCount: z.number().int().nonnegative(),
});
export const mobileUnreadCommentsSchema = z.object({
  version: z.literal(1),
  items: z.array(
    z.object({
      workoutId: z.uuid(),
      count: z.number().int().positive(),
      lastCommentAt: z.iso.datetime({ offset: true }),
    }),
  ),
});
export const mobileCommentSentSchema = z.object({
  version: z.literal(1),
  ok: z.literal(true),
  workoutId: z.uuid(),
  id: z.uuid(),
  status: z.enum(["created", "duplicate"]),
});
export const mobileCommentRemovedSchema = z.object({
  version: z.literal(1),
  ok: z.literal(true),
  workoutId: z.uuid(),
  id: z.uuid(),
  status: z.enum(["deleted", "absent"]),
});
export const mobileCommentsReadSchema = z.object({
  version: z.literal(1),
  ok: z.literal(true),
  workoutId: z.uuid(),
});
export type MobileComments = z.infer<typeof mobileCommentsSchema>;

export const mobileProgressDetailSchema = z.object({
  version: z.literal(1),
  today: z.iso.date(),
  exercise: mobileProgressSchema.shape.exercises.element,
  points: z.array(
    z.object({
      workoutId: z.uuid(),
      date: z.iso.date(),
      estimated1RM: z.number().finite().nonnegative(),
      volumeKg: z.number().finite().nonnegative(),
      bodyweightReps: z.number().int().nonnegative(),
    }),
  ),
});
export type MobileProgressDetail = z.infer<typeof mobileProgressDetailSchema>;

export const MOBILE_ACHIEVEMENT_KINDS = [
  "first_workout",
  "first_record",
  "workouts_10",
  "streak_4",
  "workouts_25",
  "workouts_50",
] as const;
/** Racha de semanas cumplidas y logros obtenidos del propio alumno (solo lectura). */
export const mobileAchievementsSchema = z.object({
  version: z.literal(1),
  streak: z.object({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
  }),
  workoutCount: z.number().int().nonnegative(),
  earned: z.array(
    z.object({ kind: z.enum(MOBILE_ACHIEVEMENT_KINDS), earnedAt: z.string().min(1) }),
  ),
});
export type MobileAchievements = z.infer<typeof mobileAchievementsSchema>;

const rating = z.number().int().min(1).max(5);
/** Respuestas del check-in semanal (1 a 5) y nota opcional de hasta 300 caracteres. */
export const mobileCheckinAnswersSchema = z
  .object({
    sleep: rating,
    energy: rating,
    soreness: rating,
    motivation: rating,
    note: z.string().max(300).nullable(),
  })
  .strict();
export type MobileCheckinAnswers = z.infer<typeof mobileCheckinAnswersSchema>;
export const mobileCheckinInputSchema = z
  .object({ version: z.literal(1), answers: mobileCheckinAnswersSchema })
  .strict();
/** Check-in de la semana vigente (la semana la decide el servidor); `answers` es null si aún no hay. */
export const mobileCheckinSchema = z.object({
  version: z.literal(1),
  weekStart: z.iso.date(),
  answers: mobileCheckinAnswersSchema.nullable(),
});
export type MobileCheckin = z.infer<typeof mobileCheckinSchema>;

/** Lista de alumnos del coach con señales de atención (solo lectura; sin enlaces web). */
export const mobileStudentsSchema = z.object({
  version: z.literal(1),
  students: z.array(
    z.object({
      id: z.uuid(),
      fullName: z.string().min(1),
      lastWorkoutDate: z.iso.date().nullable(),
      week: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("no_program") }),
        z.object({
          kind: z.literal("active"),
          programName: z.string(),
          planned: z.number().int().nonnegative(),
          done: z.number().int().nonnegative(),
          deload: z.boolean(),
        }),
        z.object({ kind: z.literal("scheduled") }),
        z.object({ kind: z.literal("finished") }),
      ]),
      signals: z.array(
        z.object({
          kind: z.enum(["comments", "no_program", "ending", "inactive"]),
          label: z.string(),
          detail: z.string(),
        }),
      ),
    }),
  ),
});
export type MobileStudents = z.infer<typeof mobileStudentsSchema>;
