// Complete, minimal evidence for the existing compliance rules; no REST page truncation.
import { z } from "zod";
import { sessionStatuses, weekCompliance } from "./completion";
import { constancyCalendar, type ConstancyWeek } from "./constancy";
import { addDays, type DateString } from "./dates";
import { programWeekStart } from "./program-weeks";
import { streaks, weekOutcome, type WeekOutcome } from "./streak";

const id = z.uuid().transform((value) => value.toLowerCase());
const programSchema = z.strictObject({
  id,
  weeksCount: z.number().int().min(1).max(16),
  startDate: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
});
const sessionSchema = z.strictObject({
  id,
  programId: id,
  weekNumber: z.number().int().min(1).max(16),
  label: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
});
const workoutSchema = z.strictObject({
  id,
  programId: id,
  programSessionId: id.nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  setCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const constancySourceSchema = z
  .strictObject({
    version: z.literal(1),
    studentId: id,
    programs: z.array(programSchema).max(10000),
    sessions: z.array(sessionSchema).max(100000),
    workouts: z.array(workoutSchema).max(10000),
  })
  .superRefine((source, ctx) => {
    const programs = new Map(source.programs.map((p) => [p.id, p]));
    const sessions = new Map(source.sessions.map((s) => [s.id, s]));
    const slots = new Set(source.sessions.map((s) => `${s.programId}/${s.weekNumber}/${s.label}`));
    if (
      programs.size !== source.programs.length ||
      sessions.size !== source.sessions.length ||
      slots.size !== source.sessions.length ||
      new Set(source.workouts.map((w) => w.id)).size !== source.workouts.length
    )
      ctx.addIssue({ code: "custom", message: "Identidades duplicadas" });
    for (const s of source.sessions) {
      const program = programs.get(s.programId);
      if (!program || s.weekNumber > program.weeksCount)
        ctx.addIssue({ code: "custom", message: "Sesión fuera del programa" });
    }
    for (const w of source.workouts) {
      const session = w.programSessionId ? sessions.get(w.programSessionId) : null;
      if (
        !programs.has(w.programId) ||
        (w.programSessionId !== null && (!session || session.programId !== w.programId))
      )
        ctx.addIssue({ code: "custom", message: "Entrenamiento fuera del programa" });
    }
  });

export type ConstancySource = z.infer<typeof constancySourceSchema>;
export type ConstancySummary = { current: number; longest: number; calendar: ConstancyWeek[] };

export function constancySummary(
  source: ConstancySource | null,
  today: DateString,
  calendarWeeks = 12,
): ConstancySummary {
  const outcomes: (WeekOutcome & { planned: number; done: number })[] = [];
  const sessionsByProgram = new Map<string, ConstancySource["sessions"]>();
  const workoutsByProgram = new Map<string, ConstancySource["workouts"]>();
  for (const s of source?.sessions ?? []) {
    const rows = sessionsByProgram.get(s.programId) ?? [];
    rows.push(s);
    sessionsByProgram.set(s.programId, rows);
  }
  for (const w of source?.workouts ?? []) {
    const rows = workoutsByProgram.get(w.programId) ?? [];
    rows.push(w);
    workoutsByProgram.set(w.programId, rows);
  }
  for (const p of source?.programs ?? []) {
    // Historical templates and fully cancelled programs keep their existing meaning.
    if (!p.startDate || !p.endsOn) continue;
    const program = { startDate: p.startDate, endsOn: p.endsOn, weeksCount: p.weeksCount };
    const sessions = sessionsByProgram.get(p.id) ?? [];
    const workouts = workoutsByProgram.get(p.id) ?? [];
    for (let week = 1; week <= program.weeksCount; week++) {
      const weekStart = programWeekStart(program, week);
      if (weekStart > today || weekStart > program.endsOn) break;
      const compliance = weekCompliance(
        sessionStatuses({ program, sessions, workouts, weekNumber: week, today }),
      );
      outcomes.push({
        weekStart,
        outcome: weekOutcome(compliance, today > addDays(weekStart, 6)),
        planned: compliance.planned,
        done: compliance.done,
      });
    }
  }
  return { ...streaks(outcomes), calendar: constancyCalendar(outcomes, today, calendarWeeks) };
}
