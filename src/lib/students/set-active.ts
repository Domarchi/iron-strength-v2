// Activar o desactivar a un alumno (RF-8, DC-4). Lo hace el coach con su propia sesión: la RLS y
// el trigger profiles_guard deciden. Desactivar es reversible y conserva todos los datos.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

export type SetActiveResult = { ok: true } | { ok: false; reason: "not_found" | "forbidden" };

export async function setStudentActive(input: {
  db: SupabaseClient<Database>;
  studentId: string;
  active: boolean;
}): Promise<SetActiveResult> {
  const { data, error } = await input.db
    .from("profiles")
    .update({ is_active: input.active })
    .eq("id", input.studentId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") return { ok: false, reason: "forbidden" };
    throw new Error(`No se pudo actualizar al alumno: ${error.message}`);
  }
  // Sin fila: no existe o la RLS no deja verlo (un alumno ajeno).
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true };
}
