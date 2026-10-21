import { z } from "zod";
import { addDays, mondayOf } from "@/domain/dates";
import type { ProgramTree } from "@/lib/data/programs";
const sessionVersion = z
  .object({ id: z.uuid(), revision: z.number().int().nonnegative() })
  .strict();
const sessionVersions = z
  .array(sessionVersion)
  .max(7)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length);
export const copyWeeksInputSchema = z
  .object({
    sourceWeek: z.number().int().min(1).max(16),
    sourceSessions: sessionVersions,
    targets: z
      .array(
        z
          .object({
            week: z.number().int().min(1).max(16),
            replace: z.boolean(),
            sessions: sessionVersions,
          })
          .strict(),
      )
      .min(1)
      .max(15),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.targets.map((t) => t.week)).size === input.targets.length &&
      input.targets.every((t) => t.week !== input.sourceWeek),
  );
export type CopyWeeksInput = z.infer<typeof copyWeeksInputSchema>;
export const programSnapshotSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    weeksCount: z.number().int().min(1).max(16),
    studentId: z.uuid().nullable(),
    startDate: z.iso.date().nullable(),
    endsOn: z.iso.date().nullable(),
    sessions: z
      .array(sessionVersion.extend({ weekNumber: z.number().int().min(1).max(16) }).strict())
      .max(112),
  })
  .strict();
export const existingProgramSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    startDate: z.iso.date(),
    endsOn: z.iso.date(),
    workouts: z.number().int().nonnegative(),
  })
  .strict();
export type ExistingProgram = z.infer<typeof existingProgramSchema>;
export const assignmentInputSchema = z
  .object({
    studentId: z.uuid(),
    startDate: z.iso.date(),
    source: programSnapshotSchema,
    existing: z.array(existingProgramSchema),
  })
  .strict();
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export function programSnapshot(tree: ProgramTree): z.infer<typeof programSnapshotSchema> {
  return {
    id: tree.id,
    name: tree.name,
    weeksCount: tree.weeksCount,
    studentId: tree.studentId,
    startDate: tree.startDate,
    endsOn: tree.endsOn,
    sessions: tree.sessions
      .map((s) => ({ id: s.id, revision: s.revision, weekNumber: s.weekNumber }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
export function makeCopyInput(
  tree: ProgramTree,
  sourceWeek: number,
  targets: { week: number; replace: boolean }[],
): CopyWeeksInput {
  const snapshot = (week: number) =>
    tree.sessions
      .filter((s) => s.weekNumber === week)
      .map((s) => ({ id: s.id, revision: s.revision }))
      .sort((a, b) => a.id.localeCompare(b.id));
  return {
    sourceWeek,
    sourceSessions: snapshot(sourceWeek),
    targets: targets.map((t) => ({ ...t, sessions: snapshot(t.week) })),
  };
}
export function assignmentWindow(
  date: string,
  weeksCount: number,
  today: string,
): { startDate: string; endsOn: string } | null {
  if (
    !z.iso.date().safeParse(date).success ||
    !Number.isInteger(weeksCount) ||
    weeksCount < 1 ||
    weeksCount > 16
  )
    return null;
  const startDate = mondayOf(date);
  if (startDate < mondayOf(today)) return null;
  return { startDate, endsOn: addDays(startDate, weeksCount * 7 - 1) };
}
export function assignmentImpacts(
  existing: ExistingProgram[],
  range: { startDate: string; endsOn: string },
) {
  return existing
    .filter((p) => p.startDate <= range.endsOn && p.endsOn >= range.startDate)
    .map((p) =>
      p.startDate >= range.startDate
        ? { ...p, kind: "replace" as const, blocked: p.workouts > 0 }
        : { ...p, kind: "shorten" as const, endsOn: addDays(range.startDate, -1), blocked: false },
    );
}
export function weekPlanningSummary(tree: ProgramTree, week: number) {
  const sessions = tree.sessions.filter((s) => s.weekNumber === week);
  return {
    sessions: sessions.length,
    exercises: sessions.reduce((n, s) => n + s.exercises.length, 0),
    sets: sessions.reduce((n, s) => n + s.exercises.reduce((v, e) => v + e.sets, 0), 0),
    titles: sessions.map((s) => `${s.label}${s.title ? ` · ${s.title}` : ""}`),
  };
}
