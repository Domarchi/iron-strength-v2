// Racha y calendario de constancia de un alumno (RF-29, DC-11). Recorre sus programas semana a
// semana con las reglas del dominio (cumplimiento, descarga, semanas sin programa) y devuelve la
// racha actual, la más larga y las últimas semanas para pintar el calendario.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionStatuses, weekCompliance, type WorkoutSummary } from "../../domain/completion.ts";
import { constancyCalendar, type ConstancyWeek } from "../../domain/constancy.ts";
import { addDays, type DateString } from "../../domain/dates.ts";
import { programWeekStart, type ProgramRange } from "../../domain/program-weeks.ts";
import { streaks, weekOutcome, type WeekOutcome } from "../../domain/streak.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type StreakSummary = { current: number; longest: number; calendar: ConstancyWeek[] };

export async function getStreakSummary(
  db: Client,
  studentId: string,
  today: DateString,
  calendarWeeks = 12,
): Promise<StreakSummary> {
  const [programsResult, sessionsResult, workoutsResult] = await Promise.all([
    db.from("programs").select("id, weeks_count, start_date, ends_on").eq("student_id", studentId),
    db
      .from("program_sessions")
      .select("id, program_id, week_number, label, programs!inner(student_id)")
      .eq("programs.student_id", studentId),
    db
      .from("workouts")
      .select("id, program_id, program_session_id, started_at, workout_sets(count)")
      .eq("student_id", studentId)
      .not("program_id", "is", null),
  ]);
  for (const result of [programsResult, sessionsResult, workoutsResult]) {
    if (result.error) throw new Error(`No se pudo calcular la racha: ${result.error.message}`);
  }

  const outcomes: (WeekOutcome & { planned: number; done: number })[] = [];

  for (const p of programsResult.data!) {
    if (!p.start_date || !p.ends_on) continue;
    const program: ProgramRange = {
      startDate: p.start_date,
      endsOn: p.ends_on,
      weeksCount: p.weeks_count,
    };
    const sessions = sessionsResult
      .data!.filter((s) => s.program_id === p.id)
      .map((s) => ({ id: s.id, weekNumber: s.week_number, label: s.label }));
    const workouts: WorkoutSummary[] = workoutsResult
      .data!.filter((w) => w.program_id === p.id)
      .map((w) => ({
        id: w.id,
        programSessionId: w.program_session_id,
        startedAt: w.started_at,
        setCount: w.workout_sets[0]?.count ?? 0,
      }));

    for (let week = 1; week <= program.weeksCount; week++) {
      const weekStart = programWeekStart(program, week);
      if (weekStart > today || weekStart > program.endsOn) break; // semanas futuras o fuera del recorte
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

  const { current, longest } = streaks(outcomes);
  return { current, longest, calendar: constancyCalendar(outcomes, today, calendarWeeks) };
}
