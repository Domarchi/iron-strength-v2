import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import type { TypedRecordingPayload } from "../mobile/typed-recording-contracts";
import { saveTypedWorkoutRecording } from "./typed-recordings";
import { syncAchievements } from "./achievements";
/** The caller supplies its verified identity. Optional awards cannot un-confirm the atomic save. */
export async function saveTypedWorkoutWithAchievements(
  db: SupabaseClient<Database>,
  studentId: string,
  payload: TypedRecordingPayload,
) {
  const receipt = await saveTypedWorkoutRecording(db, payload);
  if (receipt.status !== "removed")
    await syncAchievements({ db, studentId, workoutId: payload.id }).catch(() => []);
  return receipt;
}
