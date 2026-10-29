// RF-29, DC-11: preserve compliance rules using one complete, authenticated source.
import type { SupabaseClient } from "@supabase/supabase-js";
import { constancySummary, type ConstancySummary } from "../../domain/constancy-source";
import type { DateString } from "../../domain/dates";
import type { Database } from "../../types/database";
import { readVisibleConstancy } from "./constancy-source";

export type StreakSummary = ConstancySummary;

export async function getStreakSummary(
  db: SupabaseClient<Database>,
  studentId: string,
  today: DateString,
  calendarWeeks = 12,
): Promise<StreakSummary> {
  return constancySummary(await readVisibleConstancy(db, studentId), today, calendarWeeks);
}
