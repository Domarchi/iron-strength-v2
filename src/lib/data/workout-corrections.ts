import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types/database";
import {
  workoutCorrectionSchema,
  workoutCorrectionReceiptSchema,
  workoutCorrectionSnapshotSchema,
  type WorkoutCorrection,
} from "../mobile/workout-correction-contracts";

export async function readOwnWorkoutCorrection(
  db: SupabaseClient<Database>,
  id: string,
  ownerId: string,
) {
  const result = await db.rpc("get_own_workout_correction", { p_workout_id: id });
  if (result.error) throw result.error;
  if (result.data === null) return null;
  const snapshot = workoutCorrectionSnapshotSchema.parse(result.data);
  if (snapshot.userId !== ownerId || snapshot.workout.id !== id)
    throw Error("El resultado no corresponde a esta cuenta.");
  return snapshot;
}

export async function correctOwnWorkout(db: SupabaseClient<Database>, value: WorkoutCorrection) {
  const input = workoutCorrectionSchema.parse(value);
  const result = await db.rpc("correct_own_workout", { p_correction: input as Json });
  if (result.error) throw result.error;
  const receipt = workoutCorrectionReceiptSchema.parse(result.data);
  if (
    receipt.workoutId !== input.workoutId ||
    receipt.requestId !== input.requestId ||
    receipt.revision <= input.expectedRevision
  )
    throw Error("No se confirmó esta corrección.");
  return receipt;
}
