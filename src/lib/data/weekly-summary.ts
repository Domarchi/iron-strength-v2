// Weekly totals use one typed, RLS-visible snapshot. Program compliance remains independent.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, mondayOf, type DateString } from "../../domain/dates.ts";
import { summarizeTrainingWeek } from "../../domain/training-week-summary";
import { trendVsPrevious } from "../../domain/volume.ts";
import type { Database } from "../../types/database.ts";
import { getWeekView } from "./week";
import { getVisibleTrainingProgress } from "./training-review";

type Client = SupabaseClient<Database>;
export type WeekCard = ReturnType<typeof summarizeTrainingWeek> & {
  isCurrent: boolean;
  sessions: { planned: number; done: number } | null;
  volumeTrend: number | null;
};
export type WeeklySummary = { previous: WeekCard; current: WeekCard };

async function sessionsOf(
  db: Client,
  studentId: string,
  dayInWeek: DateString,
): Promise<WeekCard["sessions"]> {
  const view = await getWeekView(db, studentId, dayInWeek);
  if (view.kind !== "active" || view.compliance.deload) return null;
  return { planned: view.compliance.planned, done: view.compliance.done };
}

export async function getWeeklySummary(
  db: Client,
  studentId: string,
  today: DateString,
): Promise<WeeklySummary> {
  const currentStart = mondayOf(today);
  const previousStart = addDays(currentStart, -7);
  const beforeStart = addDays(currentStart, -14);

  const [review, currentSessions, previousSessions] = await Promise.all([
    getVisibleTrainingProgress(db, studentId),
    sessionsOf(db, studentId, today),
    sessionsOf(db, studentId, addDays(currentStart, -1)),
  ]);

  const progress = review?.progress ?? { activity: [], exercises: [] };
  const before = summarizeTrainingWeek(progress, beforeStart, today);
  const previous = summarizeTrainingWeek(progress, previousStart, today);
  const current = summarizeTrainingWeek(progress, currentStart, today);

  return {
    previous: {
      ...previous,
      isCurrent: false,
      sessions: previousSessions,
      volumeTrend: trendVsPrevious(previous.volumeKg, before.volumeKg),
    },
    current: {
      ...current,
      isCurrent: true,
      sessions: currentSessions,
      volumeTrend: trendVsPrevious(current.volumeKg, previous.volumeKg),
    },
  };
}
