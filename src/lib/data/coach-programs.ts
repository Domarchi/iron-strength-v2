import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  recordTypeSchema,
  type RecordType,
  type TrainingPrescription,
} from "@/domain/training-metrics";
import { readStoredTrainingPrescription } from "@/domain/stored-prescription";
import type { ProgramTree } from "./programs";
import type { CoachPrescriptionRow } from "@/lib/coach/typed-prescription";
import { MOBILE_CATALOG_LIMIT } from "@/lib/mobile/exercise-contracts";

type Client = SupabaseClient<Database>;
export type CoachAlternativeRow = {
  id: string;
  exerciseId: string;
  name: string;
  archived: boolean;
  recordType: RecordType;
  prescribed: TrainingPrescription;
};
export type CoachExerciseRow = CoachPrescriptionRow & {
  name: string;
  muscleGroup: string;
  equipment: string | null;
  isBodyweight: boolean;
  incrementKg: number;
  archived: boolean;
  recordType: RecordType;
  alternatives: CoachAlternativeRow[];
  position: number;
};
export type CoachSessionRow = {
  id: string;
  revision: number;
  title: string | null;
  weekday: number | null;
  weekNumber: number;
  label: string;
  position: number;
  exercises: CoachExerciseRow[];
};
export type CoachProgramTree = Omit<ProgramTree, "sessions"> & { sessions: CoachSessionRow[] };
export type CoachCatalogExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  recordType: RecordType;
};

/** A single authenticated snapshot; stored objectives never derive from today's catalog metadata. */
export async function getCoachProgramTree(
  db: Client,
  programId: string,
): Promise<CoachProgramTree | null> {
  const { data, error } = await db
    .from("programs")
    .select(
      `
    id,coach_id,student_id,name,weeks_count,start_date,ends_on,
    program_sessions(id,revision,title,weekday,week_number,label,position,
      session_exercises(id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription,note,rest_seconds,superset_id,superset_rest_seconds,
        exercises(name,muscle_group,equipment,is_bodyweight,progression_increment_kg,archived_at,record_type),
        session_exercise_alternatives(id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription,
          exercises(name,archived_at,record_type))))
  `,
    )
    .eq("id", programId)
    .maybeSingle();
  if (error) throw Error("No se pudo cargar el programa. Reintenta sin descartar tus cambios.");
  if (!data) return null;
  try {
    return {
      id: data.id,
      coachId: data.coach_id,
      studentId: data.student_id,
      name: data.name,
      weeksCount: data.weeks_count,
      startDate: data.start_date,
      endsOn: data.ends_on,
      sessions: data.program_sessions
        .map((session) => ({
          id: session.id,
          revision: session.revision,
          title: session.title,
          weekday: session.weekday,
          weekNumber: session.week_number,
          label: session.label,
          position: session.position,
          exercises: session.session_exercises
            .map((row) => {
              const exercise = row.exercises;
              if (!exercise) throw Error("missing exercise");
              const recordType = recordTypeSchema.parse(exercise.record_type);
              const prescribed = readStoredTrainingPrescription(row);
              if (row.typed_prescription !== null && prescribed.recordType !== recordType)
                throw Error("record type mismatch");
              return {
                id: row.id,
                exerciseId: row.exercise_id,
                position: row.position,
                name: exercise.name,
                muscleGroup: exercise.muscle_group,
                equipment: exercise.equipment,
                isBodyweight: exercise.is_bodyweight,
                incrementKg: exercise.progression_increment_kg,
                archived: exercise.archived_at !== null,
                recordType,
                prescribed,
                note: row.note,
                restSeconds: row.rest_seconds,
                supersetId: row.superset_id,
                supersetRestSeconds: row.superset_rest_seconds,
                alternatives: row.session_exercise_alternatives
                  .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id))
                  .map((alternative) => {
                    if (!alternative.exercises) throw Error("missing alternative");
                    const type = recordTypeSchema.parse(alternative.exercises.record_type);
                    const target = readStoredTrainingPrescription(alternative);
                    if (alternative.typed_prescription !== null && target.recordType !== type)
                      throw Error("alternative type mismatch");
                    return {
                      id: alternative.id,
                      exerciseId: alternative.exercise_id,
                      name: alternative.exercises.name,
                      archived: alternative.exercises.archived_at !== null,
                      recordType: type,
                      prescribed: target,
                    };
                  }),
              };
            })
            .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
        }))
        .sort(
          (a, b) =>
            a.weekNumber - b.weekNumber ||
            a.label.localeCompare(b.label) ||
            a.id.localeCompare(b.id),
        ),
    };
  } catch {
    throw Error(
      "El programa contiene una prescripción no compatible. Tus cambios locales se conservan.",
    );
  }
}

/** Complete assignable catalog under RLS. A personal exercise never becomes coach-shared here. */
export async function listCoachCatalog(db: Client): Promise<CoachCatalogExercise[]> {
  const { data, error, count } = await db
    .from("exercises")
    .select("id,name,muscle_group,equipment,record_type", { count: "exact" })
    .is("personal_owner_id", null)
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
    data.length !== count ||
    new Set(data.map((row) => row.id)).size !== data.length
  )
    throw Error(
      "No se pudo completar el catálogo de planificación. Reintenta antes de agregar ejercicios.",
    );
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    equipment: row.equipment,
    recordType: recordTypeSchema.parse(row.record_type),
  }));
}
