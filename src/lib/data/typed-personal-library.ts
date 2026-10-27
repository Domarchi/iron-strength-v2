import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types/database";
import {
  typedPersonalLibrarySchema,
  typedPersonalMutationSchema,
  typedPersonalMutationResultSchema,
  type TypedPersonalMutation,
} from "../mobile/typed-personal-contracts";
import { personalMutationResultSchema } from "../mobile/personal-contracts";

export async function readTrainingLibrary(db: SupabaseClient<Database>) {
  const { data, error } = await db.rpc("get_training_library");
  if (error) throw error;
  return typedPersonalLibrarySchema.parse(data);
}
export async function mutateTrainingLibrary(
  db: SupabaseClient<Database>,
  value: TypedPersonalMutation,
) {
  const input = typedPersonalMutationSchema.parse(value);
  const args = {
    p_request_id: input.requestId,
    p_operation: input.operation,
    p_target_id: input.targetId,
    p_expected_revision: input.expectedRevision,
    p_data: input.data as Json,
    p_version: input.version,
  };
  // SQL accepts NULL for collection revisions; generated RPC argument types omit nullability.
  const { data, error } = await db.rpc(
    "mutate_training_library",
    args as Database["public"]["Functions"]["mutate_training_library"]["Args"],
  );
  if (error) throw error;
  const result = personalMutationResultSchema.parse(data);
  if (result.requestId !== input.requestId || result.targetId !== input.targetId)
    throw Error("No se confirmó la operación de esta rutina.");
  return typedPersonalMutationResultSchema.parse({ ...result, version: 2 });
}
