import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { addDays, mondayOf, santiagoDate } from "../../domain/dates";
import { readStoredTrainingPrescription } from "../../domain/stored-prescription";
import {
  trainingMetricsSchema,
  type TrainingMetrics,
  type TrainingRecordedSet,
  type RecordType,
} from "../../domain/training-metrics";
import { storedTrainingSet } from "./stored-training-set";
import {
  assignedContextSchema,
  assignedCanStart,
  type AssignedTrainingContext,
} from "../workout/training-context";
type Client = SupabaseClient<Database>;
export type AssignedTrainingContextResult =
  | { ok: true; context: AssignedTrainingContext; canStart: boolean }
  | { ok: false; reason: "not_found" | "not_current_week" };
/** Read-only. Session, revision, programme and targets come from one authenticated snapshot. */
export async function getAssignedTrainingContext(
  db: Client,
  userId: string,
  sessionId: string,
  today = santiagoDate(new Date()),
  allowRecovery = false,
): Promise<AssignedTrainingContextResult> {
  if (!z.uuid().safeParse(userId).success || !z.uuid().safeParse(sessionId).success)
    return { ok: false, reason: "not_found" };
  z.iso.date().parse(today);
  const identity = await db.auth.getUser();
  if (identity.error || identity.data.user?.id !== userId)
    return { ok: false, reason: "not_found" };
  const profile = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (profile.error) throw Error("No se pudo verificar tu acceso.");
  if (!profile.data) return { ok: false, reason: "not_found" };
  const { data: session, error } = await db
    .from("program_sessions")
    .select(
      `id,revision,label,title,week_number,program_id,
    programs(name,start_date,ends_on,weeks_count,student_id),
    session_exercises(id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription,note,rest_seconds,superset_id,superset_rest_seconds,
      exercises(name,is_bodyweight,record_type),
      session_exercise_alternatives(id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription,
        exercises(name,is_bodyweight,record_type)))`,
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw Error("No se pudo cargar la rutina completa.");
  const program = session?.programs;
  if (
    !session ||
    !program ||
    program.student_id !== userId ||
    !program.start_date ||
    !program.ends_on
  )
    return { ok: false, reason: "not_found" };
  function choice(r: {
    exercise_id: string;
    sets: number;
    reps_min: number | null;
    reps_max: number | null;
    target_weight_kg: number | null;
    prescription_sets: unknown;
    typed_prescription: unknown;
    exercises: { name: string; is_bodyweight: boolean; record_type: string | null } | null;
  }) {
    if (!r.exercises) throw Error("No se pudo completar el ejercicio de la rutina.");
    const prescribed = readStoredTrainingPrescription(r);
    if (r.typed_prescription !== null && prescribed.recordType !== r.exercises.record_type)
      throw Error("La prescripción no coincide con el tipo de ejercicio.");
    return {
      exerciseId: r.exercise_id,
      name: r.exercises.name,
      isBodyweight: r.exercises.is_bodyweight,
      prescribed,
      lastMetrics: null,
    };
  }
  let context = assignedContextSchema.parse({
    version: 5,
    previousSets: [],
    userId,
    origin: { kind: "assigned", programId: session.program_id, programSessionId: session.id },
    title: session.title,
    sessionLabel: session.label,
    session: {
      id: session.id,
      label: session.label,
      title: session.title,
      programId: session.program_id,
      programName: program.name,
      weekNumber: session.week_number,
      weeksCount: program.weeks_count,
      revision: session.revision,
      startDate: program.start_date,
      endsOn: program.ends_on,
    },
    exercises: session.session_exercises
      .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((r) => ({
        ...choice(r),
        sessionExerciseId: r.id,
        note: r.note,
        restSeconds: r.rest_seconds,
        supersetId: r.superset_id,
        supersetRestSeconds: r.superset_rest_seconds,
        alternatives: r.session_exercise_alternatives
          .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id))
          .map(choice),
      })),
  });
  const canStart = assignedCanStart(context, userId, today),
    weekStart = addDays(program.start_date, (session.week_number - 1) * 7);
  if (!canStart && !(allowRecovery && weekStart < mondayOf(today)))
    return { ok: false, reason: "not_current_week" };
  if (!context.exercises.length) return { ok: true, canStart, context };
  const wanted = new Set(
    context.exercises.flatMap((r) => [r, ...r.alternatives]).map((r) => r.exerciseId),
  );
  const history = await db
    .from("workouts")
    .select(
      "id,started_at,workout_sets(exercise_id,position,set_number,weight_kg,reps,is_warmup,record_type,duration_seconds,distance_meters,set_type,effort)",
    )
    .eq("student_id", userId)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(60);
  if (history.error || !history.data)
    throw Error("No se pudo cargar tu referencia de entrenamiento.");
  const previous = new Map<string, TrainingMetrics>();
  const performances = new Map<
    string,
    { exerciseId: string; recordType: RecordType; sets: TrainingRecordedSet[] }
  >();
  const requested = new Set(
    context.exercises
      .flatMap((r) => [r, ...r.alternatives])
      .map((r) => JSON.stringify([r.exerciseId, r.prescribed.recordType])),
  );
  for (const workout of history.data) {
    const groups = new Map<
      string,
      { exerciseId: string; recordType: RecordType; sets: TrainingRecordedSet[] }
    >();
    for (const raw of workout.workout_sets.toSorted(
      (a, b) => a.position - b.position || a.set_number - b.set_number,
    )) {
      if (!wanted.has(raw.exercise_id)) continue;
      const stored = storedTrainingSet(raw),
        key = JSON.stringify([raw.exercise_id, stored.recordType]);
      if (!requested.has(key)) continue;
      const entry = groups.get(key) ?? {
        exerciseId: raw.exercise_id,
        recordType: stored.recordType,
        sets: [],
      };
      entry.sets.push(stored);
      groups.set(key, entry);
    }
    for (const [key, entry] of groups) {
      const last = entry.sets.findLast((s) => s.setType !== "warmup");
      if (!last || performances.has(key)) continue;
      performances.set(key, entry);
      previous.set(
        key,
        trainingMetricsSchema.parse({
          recordType: last.recordType,
          weightKg: last.weightKg,
          reps: last.reps,
          durationSeconds: last.durationSeconds,
          distanceMeters: last.distanceMeters,
        }),
      );
    }
  }
  const withHistory = (
    r: AssignedTrainingContext["exercises"][number]["alternatives"][number],
  ) => ({
    ...r,
    lastMetrics: previous.get(JSON.stringify([r.exerciseId, r.prescribed.recordType])) ?? null,
  });
  context = assignedContextSchema.parse({
    ...context,
    previousSets: [...performances.values()],
    exercises: context.exercises.map((r) => ({
      ...withHistory(r),
      alternatives: r.alternatives.map(withHistory),
    })),
  });
  return { ok: true, canStart, context };
}
