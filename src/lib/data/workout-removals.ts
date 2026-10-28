import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types/database";
import {
  workoutRemovalSchema,
  workoutRemovalSnapshotSchema,
  workoutRemovalReceiptSchema,
  type WorkoutRemoval,
} from "../mobile/workout-removal-contracts";
const uuid = z.uuid().transform((value) => value.toLowerCase());
export async function readOwnWorkoutRemoval(
  db: SupabaseClient<Database>,
  id: string,
  ownerId: string,
) {
  const wid = uuid.parse(id),
    owner = uuid.parse(ownerId);
  const result = await db.rpc("get_own_workout_removal", { p_workout_id: wid });
  if (result.error) throw result.error;
  if (result.data === null) return null;
  const snapshot = workoutRemovalSnapshotSchema.parse(result.data);
  if (snapshot.userId !== owner || snapshot.workout.id !== wid)
    throw Error("El resultado no corresponde a esta cuenta.");
  return snapshot;
}
export async function removeOwnWorkout(db: SupabaseClient<Database>, value: WorkoutRemoval) {
  const input = workoutRemovalSchema.parse(value),
    result = await db.rpc("remove_own_workout", { p_removal: input as Json });
  if (result.error) throw result.error;
  const receipt = workoutRemovalReceiptSchema.parse(result.data);
  if (
    receipt.workoutId !== input.workoutId ||
    receipt.requestId !== input.requestId ||
    receipt.revision <= input.expectedRevision
  )
    throw Error("No se confirmó esta eliminación.");
  return receipt;
}
