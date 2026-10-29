import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { getWorkoutDetail } from "./workouts";
import { getTypedWorkoutDetail } from "./typed-recordings";

/** Choose by the stored format under RLS; a new result never enters a scalar reader. */
export async function getWorkoutResult(db: SupabaseClient<Database>, value: string) {
  const id = z.uuid().parse(value).toLowerCase();
  const { data, error } = await db
    .from("workouts")
    .select("student_id,structure")
    .eq("id", id)
    .maybeSingle();
  if (error?.code === "42501") return null;
  if (error) throw Error("No pudimos cargar el entrenamiento.");
  if (!data) return null;
  const structure = data.structure;
  const version =
    structure && typeof structure === "object" && !Array.isArray(structure)
      ? structure.version
      : null;
  if (version === 2) {
    const result = await getTypedWorkoutDetail(db, id, data.student_id);
    return result
      ? { kind: "typed" as const, studentId: data.student_id, workout: result.workout }
      : null;
  }
  if (structure !== null && version !== 1)
    throw Error("Este resultado requiere una versión compatible de la app.");
  const workout = await getWorkoutDetail(db, id, data.student_id);
  return workout ? { kind: "legacy" as const, studentId: data.student_id, workout } : null;
}
