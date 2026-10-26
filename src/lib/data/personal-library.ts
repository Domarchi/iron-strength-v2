import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types/database";
import {
  personalLibrarySchema,
  personalMutationSchema,
  personalMutationResultSchema,
  type PersonalMutation,
} from "../mobile/personal-contracts";

// Both RPCs use the caller's authenticated client; no administrative fallback.
export async function readPersonalLibrary(db: SupabaseClient<Database>) {
  const { data, error } = await db.rpc("get_personal_library");
  if (error) throw error;
  return personalLibrarySchema.parse(data);
}
export async function mutatePersonalLibrary(db: SupabaseClient<Database>, value: PersonalMutation) {
  const input = personalMutationSchema.parse(value);
  const args = {
    p_request_id: input.requestId,
    p_operation: input.operation,
    p_target_id: input.targetId,
    p_expected_revision: input.expectedRevision,
    p_data: input.data as Json,
  };
  // Postgres accepts NULL here for collection reorders. Supabase's generated
  // argument type omits SQL parameter nullability; keep the generated file intact.
  const { data, error } = await db.rpc(
    "mutate_personal_library",
    args as Database["public"]["Functions"]["mutate_personal_library"]["Args"],
  );
  if (error) throw error;
  const result = personalMutationResultSchema.parse(data);
  if (result.requestId !== input.requestId || result.targetId !== input.targetId)
    throw new Error("No se confirmó la operación de esta rutina.");
  return result;
}
