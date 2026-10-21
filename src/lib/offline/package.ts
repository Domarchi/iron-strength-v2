import { z } from "zod";
import { prescribedSeriesSchema, coherentPrescriptionSeries } from "@/domain/prescription-series";
import { addDays, isMonday } from "@/domain/dates";
import { programWeekNumber, programWeekStart } from "@/domain/program-weeks";
import type { ContextExercise, WorkoutContext } from "@/lib/data/workout-context";
import type { ExerciseHistoryPage } from "@/lib/data/exercise-history";
const uuid = z.uuid();
const date = z.iso.date();
const instant = z.iso.datetime({ offset: true });
const rest = z.union([z.literal(0), z.number().int().min(15).max(600)]).nullish();
const performance = z.object({
  weightKg: z.number().min(0).max(500),
  reps: z.number().int().min(1).max(100),
  isWarmup: z.boolean(),
});
const baseExercise = z.object({
  sessionExerciseId: uuid,
  exerciseId: uuid,
  name: z.string().min(1),
  isBodyweight: z.boolean(),
  prescribed: z
    .object({
      sets: z.number().int().min(1).max(10),
      repsMin: z.number().int().min(1).max(100),
      repsMax: z.number().int().min(1).max(100),
      targetWeightKg: z.number().min(0).max(500).nullable(),
      series: prescribedSeriesSchema.nullable().optional(),
    })
    .refine((p) => p.repsMin <= p.repsMax && coherentPrescriptionSeries(p)),
  lastWeightKg: z.number().min(0).max(500).nullable(),
  note: z.string().nullable(),
  muscleGroup: z.string().optional(),
  equipment: z.string().nullish(),
  restSeconds: rest,
  supersetId: uuid.nullish(),
  supersetRestSeconds: rest,
  last: z.object({ date, sets: z.array(performance) }).nullable(),
  suggestion: z
    .object({
      kind: z.enum(["increase", "keep"]),
      weightKg: z.number().nonnegative(),
      reps: z.number().int().positive(),
    })
    .nullable(),
});
const exercise: z.ZodType<ContextExercise> = baseExercise.extend({
  alternatives: z.array(baseExercise).max(3).optional(),
});
const context: z.ZodType<WorkoutContext> = z.object({
  session: z.object({
    id: uuid,
    label: z.string().regex(/^[A-G]$/),
    title: z.string().max(80).nullish(),
    programId: uuid,
    programName: z.string(),
    weekNumber: z.number().int().min(1).max(16),
    weeksCount: z.number().int().min(1).max(16),
  }),
  exercises: z.array(exercise).max(15),
});
const historyPage: z.ZodType<ExerciseHistoryPage> = z.object({
  items: z
    .array(
      z.object({
        id: uuid,
        startedAt: instant,
        date,
        sessionLabel: z.string().nullable(),
        sets: z.array(
          performance.extend({
            id: uuid,
            position: z.number().int().nonnegative(),
            setNumber: z.number().int().positive(),
          }),
        ),
      }),
    )
    .max(10),
  nextCursor: z.object({ startedAt: instant, id: uuid }).nullable(),
});
const weekPackageSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    userId: uuid,
    downloadedAt: instant,
    program: z.object({
      id: uuid,
      name: z.string(),
      startDate: date,
      endsOn: date,
      weeksCount: z.number().int().min(1).max(16),
    }),
    weekNumber: z.number().int().min(1).max(16),
    weekStart: date,
    weekEnd: date,
    sessions: z
      .array(
        z.object({
          revision: z.number().int().nonnegative(),
          weekday: z.number().int().min(0).max(6).nullable(),
          context,
        }),
      )
      .max(7),
    history: z.record(uuid, historyPage),
  })
  .refine((p) => {
    if (
      !isMonday(p.weekStart) ||
      p.weekStart !== programWeekStart(p.program, p.weekNumber) ||
      p.weekEnd !== addDays(p.weekStart, 6) ||
      p.weekNumber > p.program.weeksCount
    )
      return false;
    const ids = new Set<string>(),
      exercises = new Set<string>();
    for (const { context: c } of p.sessions) {
      if (
        ids.has(c.session.id) ||
        c.session.programId !== p.program.id ||
        c.session.weekNumber !== p.weekNumber ||
        c.session.weeksCount !== p.program.weeksCount
      )
        return false;
      ids.add(c.session.id);
      const rows = new Set<string>();
      for (const e of c.exercises) {
        if (rows.has(e.sessionExerciseId)) return false;
        rows.add(e.sessionExerciseId);
        const choices = [e, ...(e.alternatives ?? [])];
        if (p.version === 1 && choices.some((c) => c.prescribed.series !== undefined)) return false;
        if (
          new Set(choices.map((a) => a.exerciseId)).size !== choices.length ||
          choices.some((a) => a.sessionExerciseId !== e.sessionExerciseId)
        )
          return false;
        choices.forEach((a) => exercises.add(a.exerciseId));
      }
    }
    return (
      Object.keys(p.history).length === exercises.size &&
      [...exercises].every((id) => p.history[id] !== undefined)
    );
  });
export type WeekPackage = z.infer<typeof weekPackageSchema>;
export function parseWeekPackage(value: unknown, userId: string): WeekPackage | null {
  const parsed = weekPackageSchema.safeParse(value);
  return parsed.success && parsed.data.userId === userId ? parsed.data : null;
}
export function canStartDownloadedSession(
  pack: WeekPackage,
  sessionId: string,
  today: string,
): boolean {
  return (
    programWeekNumber(pack.program, today) === pack.weekNumber &&
    today >= pack.weekStart &&
    today <= pack.weekEnd &&
    pack.sessions.some((s) => s.context.session.id === sessionId)
  );
}
