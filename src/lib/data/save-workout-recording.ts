import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types/database";
import {
  recordingPayloadSchema,
  recordingReceiptSchema,
  type RecordingPayload,
} from "../mobile/recording-contracts";
export async function saveWorkoutRecording(db: SupabaseClient<Database>, value: RecordingPayload) {
  const input = recordingPayloadSchema.parse(value);
  const { data, error } = await db.rpc("save_workout_recording", { p_recording: input as Json });
  if (error) throw error;
  const receipt = recordingReceiptSchema.parse(data);
  if (receipt.workoutId !== input.id) throw Error("No se confirmó este entrenamiento.");
  return receipt;
}
