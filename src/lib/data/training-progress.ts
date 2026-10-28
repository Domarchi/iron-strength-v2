import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { trainingProgressSourceSchema } from "../../domain/training-progress";
/** One STABLE invoker snapshot; the authenticated role supplies every permission. */
export async function readOwnTrainingProgress(db: SupabaseClient<Database>, ownerId: string) {
  const result = await db.rpc("get_own_training_progress");
  if (result.error) throw result.error;
  const snapshot = trainingProgressSourceSchema.parse(result.data);
  if (snapshot.userId !== ownerId) throw Error("El historial no pertenece a esta cuenta.");
  return snapshot;
}
