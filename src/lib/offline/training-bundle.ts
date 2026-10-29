// Versioned complete training download. UI/storage integration is owned by T220.
import { z } from "zod";
import { typedCatalogSchema, typedExerciseDetailSchema } from "../mobile/typed-exercise-contracts";
import { typedPersonalLibrarySchema } from "../mobile/typed-personal-contracts";
import { assignedContextSchema, assignedCanStart } from "../workout/training-context";
import { addDays, isMonday, santiagoDate } from "../../domain/dates";
import { programWeekNumber, programWeekStart } from "../../domain/program-weeks";
const uuid = z.uuid().transform((v) => v.toLowerCase());
const program = z
  .strictObject({
    id: uuid,
    name: z.string().trim().min(1).max(100),
    startDate: z.iso.date(),
    endsOn: z.iso.date(),
    weeksCount: z.number().int().min(1).max(16),
  })
  .refine(
    (p) =>
      isMonday(p.startDate) &&
      p.endsOn >= p.startDate &&
      p.endsOn <= addDays(p.startDate, p.weeksCount * 7 - 1),
  );
const week = z.strictObject({
  program,
  weekNumber: z.number().int().min(1).max(16),
  weekStart: z.iso.date(),
  weekEnd: z.iso.date(),
  sessionCount: z.number().int().min(0).max(7),
  sessions: z
    .array(
      z.strictObject({
        weekday: z.number().int().min(0).max(6).nullable(),
        context: assignedContextSchema,
      }),
    )
    .max(7),
});
type Meta = {
  name: string;
  muscleGroup: string;
  equipment: string | null;
  isBodyweight: boolean;
  progressionIncrementKg: number;
  recordType: string | null;
};
const sameMeta = (a: Meta, b: Meta) =>
  a.name === b.name &&
  a.muscleGroup === b.muscleGroup &&
  a.equipment === b.equipment &&
  a.isBodyweight === b.isBodyweight &&
  a.progressionIncrementKg === b.progressionIncrementKg &&
  a.recordType === b.recordType;
export const bundleSchema = z
  .strictObject({
    version: z.literal(1),
    userId: uuid,
    downloadedAt: z.iso.datetime({ offset: true }),
    catalog: typedCatalogSchema,
    library: typedPersonalLibrarySchema,
    week: week.nullable(),
    history: z.record(
      z.uuid().refine((k) => k === k.toLowerCase()),
      typedExerciseDetailSchema,
    ),
  })
  .superRefine((b, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      b.library.routines.length > 1000 ||
      b.library.folders.length > 1000 ||
      Object.keys(b.history).length > 20000
    )
      invalid("Descarga demasiado grande");
    if (b.library.userId !== b.userId) invalid("Biblioteca de otra cuenta");
    const required = new Set<string>();
    for (const e of b.catalog.exercises) {
      required.add(e.id);
      const h = b.history[e.id];
      if (!h || !sameMeta(e, h.exercise)) invalid("Metadatos de catálogo incompatibles");
    }
    for (const r of b.library.routines)
      for (const e of r.items) {
        required.add(e.exerciseId);
        const h = b.history[e.exerciseId];
        if (!h || !sameMeta(e, h.exercise)) invalid("Base personal incompleta");
      }
    if (b.week) {
      const w = b.week,
        today = santiagoDate(new Date(b.downloadedAt));
      if (
        w.sessionCount !== w.sessions.length ||
        new Set(w.sessions.map((s) => s.context.session.id)).size !== w.sessions.length ||
        new Set(w.sessions.map((s) => s.context.session.label)).size !== w.sessions.length
      )
        invalid("Semana incompleta");
      if (
        w.weekNumber !== programWeekNumber(w.program, today) ||
        w.weekStart !== programWeekStart(w.program, w.weekNumber) ||
        w.weekEnd !== addDays(w.weekStart, 6)
      )
        invalid("Semana de descarga incompatible");
      for (const { context: c } of w.sessions) {
        const s = c.session;
        if (
          c.userId !== b.userId ||
          s.programId !== w.program.id ||
          s.programName !== w.program.name ||
          s.startDate !== w.program.startDate ||
          s.endsOn !== w.program.endsOn ||
          s.weeksCount !== w.program.weeksCount ||
          s.weekNumber !== w.weekNumber ||
          !assignedCanStart(c, b.userId, today)
        )
          invalid("Rutina fuera de la semana/cuenta");
        for (const r of c.exercises)
          for (const e of [r, ...r.alternatives]) {
            required.add(e.exerciseId);
            const h = b.history[e.exerciseId];
            // An assigned legacy target stays null even if current metadata has an explicit type.
            if (
              !h ||
              h.exercise.name !== e.name ||
              h.exercise.isBodyweight !== e.isBodyweight ||
              (e.prescribed.recordType !== null &&
                h.exercise.recordType !== e.prescribed.recordType)
            )
              invalid("Rutina incompleta");
          }
      }
    }
    const keys = Object.keys(b.history);
    if (
      keys.length !== required.size ||
      keys.some((k) => !required.has(k) || b.history[k].exercise.id !== k)
    )
      invalid("Historial incompleto o ajeno");
  });
export type Bundle = z.infer<typeof bundleSchema>;
export function downloadedAssignedContext(
  bundle: Bundle | null,
  userId: string,
  sessionId: string,
  today: string,
) {
  if (bundle?.userId !== userId || !bundle.week) return null;
  const context = bundle.week.sessions.find((s) => s.context.session.id === sessionId)?.context;
  return context && assignedCanStart(context, userId, today) ? context : null;
}
