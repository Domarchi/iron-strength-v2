import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { historyProgressSource } from "../../domain/training-history";
import { buildTrainingProgress } from "../../domain/training-progress";
import { trainingRecordCount } from "../../domain/training-week-summary";
import { readVisibleTrainingHistory } from "./training-history";
/** Shared actual calculations for coach review and own web progress; one authorized snapshot. */
export async function getVisibleTrainingProgress(db: SupabaseClient<Database>, studentId: string) {
  const source = await readVisibleTrainingHistory(db, studentId);
  return source
    ? {
        student: source.student,
        today: source.today,
        progress: buildTrainingProgress(historyProgressSource(source)),
      }
    : null;
}
export async function getTrainingWorkoutRecordCount(
  db: SupabaseClient<Database>,
  studentId: string,
  workoutId: string,
) {
  const result = await getVisibleTrainingProgress(db, studentId);
  return result ? trainingRecordCount(result.progress, workoutId) : 0;
}
