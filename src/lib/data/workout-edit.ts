// Editar y borrar entrenamientos ya guardados, hasta 7 días después de su fecha (RF-26b).
// La RLS es la barrera real (public.edit_window_start); aquí se adelanta la comprobación para
// dar un error claro y se valida con los mismos límites que al registrar (workoutSetSchema).
import type { SupabaseClient } from "@supabase/supabase-js";
import { santiagoDate, type DateString } from "../../domain/dates.ts";
import { isWorkoutEditable } from "../../domain/edit-window.ts";
import { workoutSetSchema } from "../../domain/schemas.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type EditResult =
  { ok: true } | { ok: false; reason: "not_found" | "locked" | "invalid" | "no_sets" };

export type SetEdit = { id: string; weightKg: unknown; reps: unknown; isWarmup: boolean };

async function loadWorkout(db: Client, workoutId: string) {
  const { data, error } = await db
    .from("workouts")
    .select("id, performed_on, workout_sets(id)")
    .eq("id", workoutId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el entrenamiento: ${error.message}`);
  return data;
}

export async function updateWorkoutSets(args: {
  db: Client;
  workoutId: string;
  sets: SetEdit[];
  removeSetIds?: string[];
  today?: DateString;
}): Promise<EditResult> {
  const workout = await loadWorkout(args.db, args.workoutId);
  if (!workout) return { ok: false, reason: "not_found" };
  if (!isWorkoutEditable(workout.performed_on as string, args.today ?? santiagoDate(new Date()))) {
    return { ok: false, reason: "locked" };
  }

  const ownIds = new Set(workout.workout_sets.map((s) => s.id));
  const removeIds = new Set(args.removeSetIds ?? []);
  if (![...removeIds].every((id) => ownIds.has(id))) return { ok: false, reason: "invalid" };

  const edits = [];
  for (const set of args.sets) {
    if (!ownIds.has(set.id)) return { ok: false, reason: "invalid" };
    const parsed = workoutSetSchema.safeParse({
      weightKg: set.weightKg,
      reps: set.reps,
      isWarmup: set.isWarmup,
    });
    if (!parsed.success) return { ok: false, reason: "invalid" };
    edits.push({ id: set.id, ...parsed.data });
  }

  if (ownIds.size - removeIds.size <= 0) return { ok: false, reason: "no_sets" };

  for (const edit of edits) {
    const { data, error } = await args.db
      .from("workout_sets")
      .update({ weight_kg: edit.weightKg, reps: edit.reps, is_warmup: edit.isWarmup })
      .eq("id", edit.id)
      .eq("workout_id", args.workoutId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`No se pudo actualizar la serie: ${error.message}`);
    if (!data) return { ok: false, reason: "not_found" }; // la RLS no deja editar entrenamientos ajenos
  }

  if (removeIds.size > 0) {
    const { error } = await args.db
      .from("workout_sets")
      .delete()
      .in("id", [...removeIds])
      .eq("workout_id", args.workoutId);
    if (error) throw new Error(`No se pudieron quitar las series: ${error.message}`);
  }
  return { ok: true };
}

export async function deleteWorkout(args: {
  db: Client;
  workoutId: string;
  today?: DateString;
}): Promise<EditResult> {
  const workout = await loadWorkout(args.db, args.workoutId);
  if (!workout) return { ok: false, reason: "not_found" };
  if (!isWorkoutEditable(workout.performed_on as string, args.today ?? santiagoDate(new Date()))) {
    return { ok: false, reason: "locked" };
  }

  const { data, error } = await args.db
    .from("workouts")
    .delete()
    .eq("id", args.workoutId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`No se pudo borrar el entrenamiento: ${error.message}`);
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}
