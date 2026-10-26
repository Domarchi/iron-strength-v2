import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types/database";
import {
  personalWorkoutPayloadSchema,
  personalWorkoutReceiptSchema,
  type PersonalWorkoutPayload,
} from "../mobile/personal-workout-contracts";
export async function savePersonalWorkout(
  db: SupabaseClient<Database>,
  value: PersonalWorkoutPayload,
) {
  const input = personalWorkoutPayloadSchema.parse(value);
  const { data, error } = await db.rpc("save_personal_workout", { p_workout: input as Json });
  if (error) throw error;
  const receipt = personalWorkoutReceiptSchema.parse(data);
  if (receipt.workoutId !== input.id) throw Error("No se confirmó este entrenamiento.");
  return receipt;
}
