import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types/database";
import {
  personalExerciseLibrarySchema,
  personalExerciseMutationSchema,
  personalExerciseResultSchema,
  type PersonalExerciseMutation,
} from "../mobile/personal-exercise-contracts";
export async function readPersonalExercises(db: SupabaseClient<Database>) {
  const { data, error } = await db.rpc("get_personal_exercises");
  if (error) throw error;
  return personalExerciseLibrarySchema.parse(data);
}
export async function mutatePersonalExercise(
  db: SupabaseClient<Database>,
  value: PersonalExerciseMutation,
) {
  const input = personalExerciseMutationSchema.parse(value);
  const { data, error } = await db.rpc("mutate_personal_exercise", {
    p_request_id: input.requestId,
    p_target_id: input.targetId,
    p_expected_revision: input.expectedRevision,
    p_operation: input.operation,
    p_data: input.data as Json,
  });
  if (error) throw error;
  const parsed = personalExerciseResultSchema.parse(data);
  if (parsed.requestId !== input.requestId || parsed.targetId !== input.targetId)
    throw Error("No se confirmó la operación de este ejercicio.");
  return parsed;
}
