// Biblioteca de ejercicios (RF-9 a RF-11, DC-12). Todas las funciones reciben el cliente con la
// sesión del usuario: la RLS decide qué ve y qué puede escribir. El catálogo base (coach_id nulo)
// es de solo lectura; el coach crea, edita y archiva solo los suyos. Nunca se borran: se archivan.
import type { SupabaseClient } from "@supabase/supabase-js";
import { exerciseInputSchema, type MUSCLE_GROUPS } from "../../domain/schemas.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["exercises"]["Row"];

export type Exercise = {
  id: string;
  coachId: string | null; // null = catálogo base
  name: string;
  muscleGroup: (typeof MUSCLE_GROUPS)[number];
  equipment: string | null;
  isBodyweight: boolean;
  progressionIncrementKg: number;
  archivedAt: string | null;
};

const COLUMNS =
  "id, coach_id, name, muscle_group, equipment, is_bodyweight, progression_increment_kg, archived_at";

function toExercise(
  row: Pick<
    Row,
    | "id"
    | "coach_id"
    | "name"
    | "muscle_group"
    | "equipment"
    | "is_bodyweight"
    | "progression_increment_kg"
    | "archived_at"
  >,
): Exercise {
  return {
    id: row.id,
    coachId: row.coach_id,
    name: row.name,
    muscleGroup: row.muscle_group as Exercise["muscleGroup"],
    equipment: row.equipment,
    isBodyweight: row.is_bodyweight,
    progressionIncrementKg: Number(row.progression_increment_kg),
    archivedAt: row.archived_at,
  };
}

// ilike trata % y _ como comodines: se escapan para buscar el texto tal cual.
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

export async function listExercises(
  db: Client,
  options: { group?: string; query?: string; includeArchived?: boolean; limit?: number } = {},
): Promise<Exercise[]> {
  let request = db
    .from("exercises")
    .select(COLUMNS)
    .order("name")
    .limit(options.limit ?? 200);
  if (options.group) request = request.eq("muscle_group", options.group);
  if (options.query?.trim())
    request = request.ilike("name", `%${escapeLike(options.query.trim())}%`);
  if (!options.includeArchived) request = request.is("archived_at", null);

  const { data, error } = await request;
  if (error) throw new Error(`No se pudieron cargar los ejercicios: ${error.message}`);
  return data.map(toExercise);
}

// Un ejercicio propio del coach (no del catálogo base).
export async function getOwnExercise(db: Client, id: string): Promise<Exercise | null> {
  const { data, error } = await db
    .from("exercises")
    .select(COLUMNS)
    .eq("id", id)
    .not("coach_id", "is", null)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el ejercicio: ${error.message}`);
  return data ? toExercise(data) : null;
}

export type WriteResult =
  { ok: true } | { ok: false; reason: "invalid" | "name_taken" | "forbidden" | "not_found" };

// ¿Existe ya un ejercicio visible (base o propio, archivado o no) con ese nombre?
async function nameExists(db: Client, name: string, exceptId?: string): Promise<boolean> {
  let request = db.from("exercises").select("id").ilike("name", escapeLike(name.trim())).limit(1);
  if (exceptId) request = request.neq("id", exceptId);
  const { data, error } = await request;
  if (error) throw new Error(`No se pudo comprobar el nombre: ${error.message}`);
  return data.length > 0;
}

export async function createExercise(args: {
  db: Client;
  coachId: string;
  input: unknown;
}): Promise<WriteResult & { id?: string }> {
  const parsed = exerciseInputSchema.safeParse(args.input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { name, muscleGroup, equipment, progressionIncrementKg } = parsed.data;

  if (await nameExists(args.db, name)) return { ok: false, reason: "name_taken" };

  const { data, error } = await args.db
    .from("exercises")
    .insert({
      coach_id: args.coachId,
      name,
      muscle_group: muscleGroup,
      equipment,
      is_bodyweight: equipment === "Peso corporal",
      progression_increment_kg: progressionIncrementKg,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, reason: "name_taken" };
    if (error.code === "42501") return { ok: false, reason: "forbidden" };
    throw new Error(`No se pudo crear el ejercicio: ${error.message}`);
  }
  return { ok: true, id: data.id };
}

export async function updateExercise(args: {
  db: Client;
  id: string;
  input: unknown;
}): Promise<WriteResult> {
  const parsed = exerciseInputSchema.safeParse(args.input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { name, muscleGroup, equipment, progressionIncrementKg } = parsed.data;

  if (await nameExists(args.db, name, args.id)) return { ok: false, reason: "name_taken" };

  const { data, error } = await args.db
    .from("exercises")
    .update({
      name,
      muscle_group: muscleGroup,
      equipment,
      is_bodyweight: equipment === "Peso corporal",
      progression_increment_kg: progressionIncrementKg,
    })
    .eq("id", args.id)
    .not("coach_id", "is", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, reason: "name_taken" };
    throw new Error(`No se pudo actualizar el ejercicio: ${error.message}`);
  }
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}

async function setArchived(db: Client, id: string, archived: boolean): Promise<WriteResult> {
  const { data, error } = await db
    .from("exercises")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .not("coach_id", "is", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`No se pudo actualizar el ejercicio: ${error.message}`);
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}

export const archiveExercise = (args: { db: Client; id: string }) =>
  setArchived(args.db, args.id, true);
export const restoreExercise = (args: { db: Client; id: string }) =>
  setArchived(args.db, args.id, false);
