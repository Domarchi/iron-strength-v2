import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../types/database";
import {
  MOBILE_CATALOG_LIMIT,
  exerciseHistoryCursorString,
  parseExerciseHistoryCursor,
  type MobileExerciseHistoryCursor,
} from "../mobile/exercise-contracts";
import {
  typedCatalogEntrySchema,
  typedCatalogSchema,
  typedExerciseHistorySchema,
} from "../mobile/typed-exercise-contracts";
import {
  trainingExerciseNotesSchema,
  typedWorkoutStructureSchema,
} from "../mobile/typed-recording-contracts";
import { storedTrainingSet } from "./stored-training-set";
import { santiagoDate } from "../../domain/dates";
type Client = SupabaseClient<Database>;
const columns = "id,name,muscle_group,equipment,is_bodyweight,progression_increment_kg,record_type";
type Row = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "id"
  | "name"
  | "muscle_group"
  | "equipment"
  | "is_bodyweight"
  | "progression_increment_kg"
  | "record_type"
>;
const entry = (r: Row) =>
  typedCatalogEntrySchema.parse({
    id: r.id,
    name: r.name,
    muscleGroup: r.muscle_group,
    equipment: r.equipment,
    isBodyweight: r.is_bodyweight,
    progressionIncrementKg: Number(r.progression_increment_kg),
    recordType: r.record_type,
  });
export async function listTypedExercises(db: Client) {
  const { data, error, count } = await db
    .from("exercises")
    .select(columns, { count: "exact" })
    .is("archived_at", null)
    .order("name")
    .order("id")
    .range(0, MOBILE_CATALOG_LIMIT - 1);
  if (
    error ||
    !data ||
    count === null ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > MOBILE_CATALOG_LIMIT ||
    data.length !== count
  )
    throw Error("No se pudo completar el catálogo de ejercicios.");
  return typedCatalogSchema.parse({ version: 2, exercises: data.map(entry) }).exercises;
}
export async function getTypedActiveExercise(db: Client, id: string) {
  const parsed = z.uuid().parse(id);
  const { data, error } = await db
    .from("exercises")
    .select(columns)
    .eq("id", parsed)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw Error("No pudimos consultar el ejercicio.");
  return data ? entry(data) : null;
}
/** Ten workouts, with every recorded row and dimensions kept exactly as stored. */
export async function listTypedExerciseHistory(
  db: Client,
  studentId: string,
  exerciseId: string,
  options: { cursor?: MobileExerciseHistoryCursor } = {},
) {
  z.object({ studentId: z.uuid(), exerciseId: z.uuid() }).parse({ studentId, exerciseId });
  if (options.cursor && !parseExerciseHistoryCursor(exerciseHistoryCursorString(options.cursor)))
    throw Error("Filtro de historial inválido.");
  let query = db
    .from("workouts")
    .select(
      "id,started_at,performed_on,session_label,source_kind,title,structure,exercise_notes,workout_sets!inner(id,exercise_id,position,set_number,weight_kg,reps,is_warmup,record_type,duration_seconds,distance_meters,set_type,effort)",
    )
    .eq("student_id", studentId)
    .eq("workout_sets.exercise_id", exerciseId)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(11);
  if (options.cursor) {
    const { startedAt, id } = options.cursor;
    query = query.or(`started_at.lt.${startedAt},and(started_at.eq.${startedAt},id.lt.${id})`);
  }
  const { data, error } = await query;
  if (error || !data) throw Error("No pudimos cargar el historial del ejercicio.");
  const page = data.slice(0, 10),
    last = page.at(-1);
  const items = page.map((w) => {
    if (
      w.structure !== null &&
      (typeof w.structure !== "object" ||
        Array.isArray(w.structure) ||
        ![1, 2].includes(Number(w.structure.version)) ||
        typeof w.structure.version !== "number")
    )
      throw Error("El historial necesita una versión compatible.");
    const source = w.structure,
      modern =
        source !== null &&
        typeof source === "object" &&
        !Array.isArray(source) &&
        source.version === 2;
    const structure = modern ? typedWorkoutStructureSchema.parse(source) : null;
    const notes = modern ? trainingExerciseNotesSchema.parse(w.exercise_notes) : null;
    if (
      structure &&
      (!notes ||
        notes.length !== structure.exercises.length ||
        notes.some((n, i) => n.sessionExerciseId !== structure.exercises[i].id))
    )
      throw Error("Las notas del entrenamiento no coinciden.");
    const exerciseNotes = structure
      ? structure.exercises.flatMap((r, position) =>
          r.exerciseId === exerciseId ? [{ position, note: notes![position].note }] : [],
        )
      : [];
    return {
      id: w.id,
      startedAt: w.started_at,
      date: w.performed_on ?? santiagoDate(new Date(w.started_at)),
      sessionLabel: w.session_label,
      sourceKind: w.source_kind,
      title: w.title,
      exerciseNotes,
      sets: w.workout_sets
        .sort((a, b) => a.position - b.position || a.set_number - b.set_number)
        .map((s) => {
          const { setType, effort, ...metrics } = storedTrainingSet(s);
          if (
            structure &&
            (structure.exercises[s.position]?.exerciseId !== s.exercise_id ||
              structure.exercises[s.position]?.prescribed.recordType !== metrics.recordType)
          )
            throw Error("La serie no coincide con el ejercicio.");
          return {
            id: s.id,
            position: s.position,
            setNumber: s.set_number,
            metrics,
            setType,
            effort,
          };
        }),
    };
  });
  return typedExerciseHistorySchema.parse({
    items,
    nextCursor:
      data.length > 10 && last
        ? exerciseHistoryCursorString({ startedAt: last.started_at, id: last.id })
        : null,
  });
}
