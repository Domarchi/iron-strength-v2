// "Mi semana" (RF-19, RF-25): el programa vigente del alumno, las sesiones de la semana en curso
// con su estado (hecha, pendiente) y el cumplimiento. La RLS limita todo a lo que el que llama puede ver.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyWorkouts,
  sessionStatuses,
  weekCompliance,
  type SessionStatusEntry,
  type WeekCompliance,
  type WorkoutSummary,
} from "../../domain/completion.ts";
import { addDays, santiagoDate, type DateString } from "../../domain/dates.ts";
import {
  pickCurrentProgram,
  programWeekNumber,
  programWeekStart,
  type ProgramRange,
} from "../../domain/program-weeks.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type CurrentProgram = ProgramRange & { id: string; name: string };

export type WeekSession = SessionStatusEntry & {
  title?: string | null;
  exerciseCount: number;
  exerciseNames: string[];
};

export type WeekView =
  | { kind: "no_program" }
  | { kind: "scheduled"; program: CurrentProgram }
  | { kind: "finished"; program: CurrentProgram }
  | {
      kind: "active";
      program: CurrentProgram;
      weekNumber: number;
      weekStart: DateString;
      weekEnd: DateString;
      sessions: WeekSession[];
      compliance: WeekCompliance;
      allDone: boolean;
      extraCount: number;
      trainedDates: DateString[]; // días (Santiago) con al menos un entrenamiento esta semana
    };

export async function getWeekView(
  db: Client,
  studentId: string,
  today: DateString,
): Promise<WeekView> {
  const { data: programs, error } = await db
    .from("programs")
    .select("id, name, weeks_count, start_date, ends_on")
    .eq("student_id", studentId);
  if (error) throw new Error(`No se pudieron cargar los programas: ${error.message}`);

  const candidates: CurrentProgram[] = programs.flatMap((p) =>
    p.start_date && p.ends_on
      ? [
          {
            id: p.id,
            name: p.name,
            weeksCount: p.weeks_count,
            startDate: p.start_date,
            endsOn: p.ends_on,
          },
        ]
      : [],
  );

  const current = pickCurrentProgram(candidates, today);
  if (!current) return { kind: "no_program" };
  if (current.state === "scheduled") return { kind: "scheduled", program: current.program };
  if (current.state === "finished") return { kind: "finished", program: current.program };

  const program = current.program;
  const weekNumber = programWeekNumber(program, today);
  if (weekNumber === null) return { kind: "finished", program };

  const [sessionsResult, workoutsResult] = await Promise.all([
    db
      .from("program_sessions")
      .select("id, week_number, label, title, session_exercises(position, exercises(name))")
      .eq("program_id", program.id),
    db
      .from("workouts")
      .select("id, program_session_id, started_at, workout_sets(count)")
      .eq("program_id", program.id)
      .eq("student_id", studentId),
  ]);
  if (sessionsResult.error)
    throw new Error(`No se pudieron cargar las sesiones: ${sessionsResult.error.message}`);
  if (workoutsResult.error)
    throw new Error(`No se pudieron cargar los entrenamientos: ${workoutsResult.error.message}`);

  const planned = sessionsResult.data.map((s) => ({
    id: s.id,
    weekNumber: s.week_number,
    label: s.label,
  }));
  const exerciseNames = new Map(
    sessionsResult.data.map((s) => [
      s.id,
      [...s.session_exercises]
        .sort((a, b) => a.position - b.position)
        .map((e) => (e.exercises as unknown as { name: string } | null)?.name ?? "Ejercicio"),
    ]),
  );
  const workouts: WorkoutSummary[] = workoutsResult.data.map((w) => ({
    id: w.id,
    programSessionId: w.program_session_id,
    startedAt: w.started_at,
    setCount: w.workout_sets[0]?.count ?? 0,
  }));

  const statuses = sessionStatuses({ program, sessions: planned, workouts, weekNumber, today });
  const weekStart = programWeekStart(program, weekNumber);
  const classification = classifyWorkouts(workouts);
  const weekSessionIds = new Set(
    planned.filter((s) => s.weekNumber === weekNumber).map((s) => s.id),
  );
  const extraCount = workouts.filter(
    (w) =>
      classification.get(w.id) === "extra" &&
      w.setCount >= 1 &&
      w.programSessionId &&
      weekSessionIds.has(w.programSessionId),
  ).length;
  const compliance = weekCompliance(statuses);
  const lastDay = addDays(weekStart, 6);
  const trainedDates = [
    ...new Set(
      workouts
        .filter((w) => w.setCount >= 1)
        .map((w) => santiagoDate(new Date(w.startedAt)))
        .filter((d) => d >= weekStart && d <= lastDay),
    ),
  ].sort();

  return {
    kind: "active",
    program,
    weekNumber,
    weekStart,
    weekEnd: addDays(weekStart, 6),
    sessions: statuses.map((s) => {
      const names = exerciseNames.get(s.sessionId) ?? [];
      return {
        ...s,
        title: sessionsResult.data.find((row) => row.id === s.sessionId)?.title ?? null,
        exerciseCount: names.length,
        exerciseNames: names,
      };
    }),
    compliance,
    allDone: compliance.complete,
    extraCount,
    trainedDates,
  };
}
