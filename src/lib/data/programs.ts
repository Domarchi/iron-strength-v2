// Programas, sesiones y prescripciones (RF-12 a RF-18, DC-10, DC-13). Todas las funciones reciben
// el cliente con la sesión del usuario: la RLS decide quién puede leer y escribir. Además se aplica
// la regla de RF-17: en un programa ya asignado solo se editan semanas posteriores a la en curso.
import { z } from "zod";
import type { AlternativeRow } from "@/lib/coach/routine-alternatives";
import type { SupabaseClient } from "@supabase/supabase-js";
import { santiagoDate, type DateString } from "../../domain/dates.ts";
import { isWeekEditable, type ProgramRange } from "../../domain/program-weeks.ts";
import {
  prescriptionMutationSchema,
  programInputSchema,
  sessionExerciseSchema,
} from "../../domain/schemas.ts";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

const SESSION_LABELS = ["A", "B", "C", "D", "E", "F", "G"] as const;

// Tipos expuestos -----------------------------------------------------------------------------
export type ProgramSummary = {
  id: string;
  name: string;
  weeksCount: number;
  studentId: string | null; // null = plantilla
  startDate: string | null;
  endsOn: string | null;
  sessionCount: number;
};

export type SessionExerciseRow = {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  isBodyweight: boolean;
  incrementKg: number;
  archived: boolean;
  alternatives?: AlternativeRow[];
  restSeconds?: number | null;
  supersetId?: string | null;
  supersetRestSeconds?: number | null;
  position: number;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg: number | null;
  note: string | null;
};

export type SessionRow = {
  id: string;
  revision: number;
  title?: string | null;
  weekday?: number | null;
  weekNumber: number;
  label: string;
  position: number;
  exercises: SessionExerciseRow[];
};

export type ProgramTree = {
  id: string;
  coachId: string;
  studentId: string | null;
  name: string;
  weeksCount: number;
  startDate: string | null;
  endsOn: string | null;
  sessions: SessionRow[];
};

export type Failure = "not_found" | "invalid" | "limit" | "week_locked" | "forbidden" | "conflict";
export type Result<T = object> = ({ ok: true } & T) | { ok: false; reason: Failure };

const todayDefault = () => santiagoDate(new Date());

function failureFromError(error: { code?: string; message: string }): Failure {
  if (error.code === "42501") return "forbidden";
  if (error.code === "23514") {
    // Triggers de la base: la semana excede el programa → inválido; 15 ejercicios por sesión → límite.
    return /week_number/i.test(error.message) ? "invalid" : "limit";
  }
  if (error.code === "23503") return "invalid";
  if (error.code === "23505") return "limit";
  throw new Error(error.message);
}

// Lectura ----------------------------------------------------------------------------------------
export type TemplateSummary = ProgramSummary & {
  exerciseCount: number;
  totalSets: number;
  sessions: {
    title: string | null;
    label: string;
    weekNumber: number;
    exercises: { name: string; sets: number }[];
  }[];
};
export async function listTemplates(db: Client): Promise<TemplateSummary[]> {
  return readProgramBases(db, true);
}
export async function listProgramBases(db: Client): Promise<TemplateSummary[]> {
  return readProgramBases(db, false);
}
async function readProgramBases(db: Client, templatesOnly: boolean): Promise<TemplateSummary[]> {
  const query = db
    .from("programs")
    .select(
      "id,name,weeks_count,student_id,start_date,ends_on,program_sessions(title,label,week_number,session_exercises(sets,exercises(name)))",
    );
  if (templatesOnly) query.is("student_id", null);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las plantillas: ${error.message}`);
  return data.map((p) => {
    const sessions = p.program_sessions.map((s) => ({
      title: s.title,
      label: s.label,
      weekNumber: s.week_number,
      exercises: s.session_exercises.map((e) => ({ name: e.exercises!.name, sets: e.sets })),
    }));
    return {
      id: p.id,
      name: p.name,
      weeksCount: p.weeks_count,
      studentId: p.student_id,
      startDate: p.start_date,
      endsOn: p.ends_on,
      sessionCount: sessions.length,
      exerciseCount: sessions.reduce((n, s) => n + s.exercises.length, 0),
      totalSets: sessions.reduce(
        (n, s) => n + s.exercises.reduce((count, e) => count + e.sets, 0),
        0,
      ),
      sessions,
    };
  });
}
export async function duplicateProgram(args: {
  db: Client;
  sourceId: string;
  copyId: string;
  name: string;
}): Promise<Result<{ id: string }>> {
  if (
    !z
      .object({ sourceId: z.uuid(), copyId: z.uuid(), name: z.string().trim().min(1).max(100) })
      .safeParse(args).success
  )
    return { ok: false, reason: "invalid" };
  const { data, error } = await args.db.rpc("duplicate_program", {
    p_source_id: args.sourceId,
    p_copy_id: args.copyId,
    p_name: args.name,
  });
  if (!error) return { ok: true, id: data };
  if (error.code === "P0002") return { ok: false, reason: "not_found" };
  if (["22023", "23505", "23514"].includes(error.code)) return { ok: false, reason: "invalid" };
  return { ok: false, reason: failureFromError(error) };
}

export async function listAssignedPrograms(
  db: Client,
  studentId: string,
): Promise<ProgramSummary[]> {
  const { data, error } = await db
    .from("programs")
    .select("id, name, weeks_count, student_id, start_date, ends_on, program_sessions(count)")
    .eq("student_id", studentId)
    .order("start_date", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los programas: ${error.message}`);
  return data.map(toSummary);
}

function toSummary(row: {
  id: string;
  name: string;
  weeks_count: number;
  student_id: string | null;
  start_date: string | null;
  ends_on: string | null;
  program_sessions: { count: number }[];
}): ProgramSummary {
  return {
    id: row.id,
    name: row.name,
    weeksCount: row.weeks_count,
    studentId: row.student_id,
    startDate: row.start_date,
    endsOn: row.ends_on,
    sessionCount: row.program_sessions[0]?.count ?? 0,
  };
}

export async function getProgramTree(db: Client, programId: string): Promise<ProgramTree | null> {
  const { data, error } = await db
    .from("programs")
    .select(
      `id, coach_id, student_id, name, weeks_count, start_date, ends_on,
       program_sessions (
         id, week_number, label, position, revision, title, weekday,
         session_exercises (
           id, exercise_id, position, sets, reps_min, reps_max, target_weight_kg, note, rest_seconds, superset_id, superset_rest_seconds,
           exercises ( name, muscle_group, equipment, is_bodyweight, progression_increment_kg, archived_at ),
           session_exercise_alternatives(id,exercise_id,position,sets,reps_min,reps_max,target_weight_kg,exercises(name,archived_at))
         )
       )`,
    )
    .eq("id", programId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el programa: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    coachId: data.coach_id,
    studentId: data.student_id,
    name: data.name,
    weeksCount: data.weeks_count,
    startDate: data.start_date,
    endsOn: data.ends_on,
    sessions: data.program_sessions
      .map((s) => ({
        id: s.id,
        weekNumber: s.week_number,
        revision: s.revision,
        label: s.label,
        title: s.title,
        weekday: s.weekday,
        position: s.position,
        exercises: s.session_exercises
          .map((e) => {
            const ex = e.exercises as unknown as {
              name: string;
              muscle_group: string;
              equipment: string | null;
              is_bodyweight: boolean;
              progression_increment_kg: number;
              archived_at: string | null;
            };
            return {
              id: e.id,
              alternatives: e.session_exercise_alternatives
                .sort((a, b) => a.position - b.position)
                .map((a) => ({
                  id: a.id,
                  exerciseId: a.exercise_id,
                  name: a.exercises.name,
                  archived: a.exercises.archived_at !== null,
                  sets: a.sets,
                  repsMin: a.reps_min,
                  repsMax: a.reps_max,
                  targetWeightKg: a.target_weight_kg === null ? null : Number(a.target_weight_kg),
                })),
              restSeconds: e.rest_seconds,
              supersetId: e.superset_id,
              supersetRestSeconds: e.superset_rest_seconds,
              exerciseId: e.exercise_id,
              name: ex.name,
              muscleGroup: ex.muscle_group,
              equipment: ex.equipment,
              isBodyweight: ex.is_bodyweight,
              incrementKg: Number(ex.progression_increment_kg),
              archived: ex.archived_at !== null,
              position: e.position,
              sets: e.sets,
              repsMin: e.reps_min,
              repsMax: e.reps_max,
              targetWeightKg: e.target_weight_kg === null ? null : Number(e.target_weight_kg),
              note: e.note,
            };
          })
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.weekNumber - b.weekNumber || a.label.localeCompare(b.label)),
  };
}

// Contexto de edición: a qué programa y semana pertenece lo que se quiere tocar ----------------------
type Context = { programId: string; weekNumber: number | null; range: ProgramRange | null };

type ProgramFields = {
  id: string;
  student_id: string | null;
  start_date: string | null;
  ends_on: string | null;
  weeks_count: number;
};

function rangeOf(program: ProgramFields): ProgramRange | null {
  if (!program.student_id || !program.start_date || !program.ends_on) return null; // plantilla
  return {
    startDate: program.start_date,
    endsOn: program.ends_on,
    weeksCount: program.weeks_count,
  };
}

async function contextForProgram(
  db: Client,
  programId: string,
  weekNumber: number | null,
): Promise<Context | null> {
  const { data, error } = await db
    .from("programs")
    .select("id, student_id, start_date, ends_on, weeks_count")
    .eq("id", programId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { programId: data.id, weekNumber, range: rangeOf(data) } : null;
}

async function contextForSession(db: Client, sessionId: string): Promise<Context | null> {
  const { data, error } = await db
    .from("program_sessions")
    .select("program_id, week_number")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? contextForProgram(db, data.program_id, data.week_number) : null;
}

async function contextForSessionExercise(db: Client, id: string): Promise<Context | null> {
  const { data, error } = await db
    .from("session_exercises")
    .select("program_session_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? contextForSession(db, data.program_session_id) : null;
}

function editable(context: Context, today: DateString): boolean {
  return context.weekNumber !== null && isWeekEditable(context.range, context.weekNumber, today);
}

// Plantillas -------------------------------------------------------------------------------------
export async function createTemplate(args: {
  db: Client;
  coachId: string;
  input: unknown;
}): Promise<Result<{ id: string }>> {
  const parsed = programInputSchema.safeParse(args.input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const { data, error } = await args.db
    .from("programs")
    .insert({ coach_id: args.coachId, name: parsed.data.name, weeks_count: parsed.data.weeksCount })
    .select("id")
    .single();
  if (error) return { ok: false, reason: failureFromError(error) };
  return { ok: true, id: data.id };
}

export async function deleteTemplate(args: { db: Client; id: string }): Promise<Result> {
  const { data, error } = await args.db
    .from("programs")
    .delete()
    .eq("id", args.id)
    .is("student_id", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: failureFromError(error) };
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}

// Sesiones ---------------------------------------------------------------------------------------
export async function addSession(args: {
  db: Client;
  programId: string;
  weekNumber: number;
  today?: DateString;
}): Promise<Result<{ id: string; label: string }>> {
  const { db, programId, weekNumber } = args;
  if (!Number.isInteger(weekNumber) || weekNumber < 1) return { ok: false, reason: "invalid" };

  const context = await contextForProgram(db, programId, weekNumber);
  if (!context) return { ok: false, reason: "not_found" };
  if (!editable(context, args.today ?? todayDefault())) {
    // Una semana fuera del programa es "inválida"; una dentro pero bloqueada es "week_locked".
    const { data } = await db.from("programs").select("weeks_count").eq("id", programId).single();
    return { ok: false, reason: data && weekNumber > data.weeks_count ? "invalid" : "week_locked" };
  }

  const { data: existing, error: listError } = await db
    .from("program_sessions")
    .select("label")
    .eq("program_id", programId)
    .eq("week_number", weekNumber);
  if (listError) throw new Error(listError.message);

  const used = new Set(existing.map((s) => s.label));
  const label = SESSION_LABELS.find((l) => !used.has(l));
  if (!label) return { ok: false, reason: "limit" };

  const { data, error } = await db
    .from("program_sessions")
    .insert({ program_id: programId, week_number: weekNumber, label, position: existing.length })
    .select("id")
    .single();
  if (error) return { ok: false, reason: failureFromError(error) };
  return { ok: true, id: data.id, label };
}

export async function removeSession(args: {
  db: Client;
  sessionId: string;
  today?: DateString;
}): Promise<Result> {
  const context = await contextForSession(args.db, args.sessionId);
  if (!context) return { ok: false, reason: "not_found" };
  if (!editable(context, args.today ?? todayDefault())) return { ok: false, reason: "week_locked" };

  const { data, error } = await args.db
    .from("program_sessions")
    .delete()
    .eq("id", args.sessionId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: failureFromError(error) };
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}

// Ejercicios de una sesión ---------------------------------------------------------------------------
async function exerciseIsUsable(db: Client, exerciseId: string): Promise<boolean> {
  const { data } = await db
    .from("exercises")
    .select("id, archived_at")
    .eq("id", exerciseId)
    .maybeSingle();
  return Boolean(data && data.archived_at === null);
}

export async function addSessionExercise(args: {
  db: Client;
  sessionId: string;
  input: unknown;
  today?: DateString;
}): Promise<Result<{ id: string }>> {
  const parsed = sessionExerciseSchema.safeParse(args.input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const context = await contextForSession(args.db, args.sessionId);
  if (!context) return { ok: false, reason: "not_found" };
  if (!editable(context, args.today ?? todayDefault())) return { ok: false, reason: "week_locked" };
  if (!(await exerciseIsUsable(args.db, parsed.data.exerciseId)))
    return { ok: false, reason: "invalid" };

  const { data: last } = await args.db
    .from("session_exercises")
    .select("position")
    .eq("program_session_id", args.sessionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await args.db
    .from("session_exercises")
    .insert({
      program_session_id: args.sessionId,
      exercise_id: parsed.data.exerciseId,
      position: (last?.position ?? -1) + 1,
      sets: parsed.data.sets,
      reps_min: parsed.data.repsMin,
      reps_max: parsed.data.repsMax,
      target_weight_kg: parsed.data.targetWeightKg,
      note: parsed.data.note,
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: failureFromError(error) };
  return { ok: true, id: data.id };
}

export async function updateSessionExercise(args: {
  db: Client;
  id: string;
  input: unknown;
  today?: DateString;
}): Promise<Result> {
  const parsed = sessionExerciseSchema.safeParse(args.input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const context = await contextForSessionExercise(args.db, args.id);
  if (!context) return { ok: false, reason: "not_found" };
  if (!editable(context, args.today ?? todayDefault())) return { ok: false, reason: "week_locked" };

  const { data, error } = await args.db
    .from("session_exercises")
    .update({
      sets: parsed.data.sets,
      reps_min: parsed.data.repsMin,
      reps_max: parsed.data.repsMax,
      target_weight_kg: parsed.data.targetWeightKg,
      note: parsed.data.note,
    })
    .eq("id", args.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: failureFromError(error) };
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}

export async function removeSessionExercise(args: {
  db: Client;
  id: string;
  today?: DateString;
}): Promise<Result> {
  const context = await contextForSessionExercise(args.db, args.id);
  if (!context) return { ok: false, reason: "not_found" };
  if (!editable(context, args.today ?? todayDefault())) return { ok: false, reason: "week_locked" };

  const { data, error } = await args.db
    .from("session_exercises")
    .delete()
    .eq("id", args.id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: failureFromError(error) };
  return data ? { ok: true } : { ok: false, reason: "not_found" };
}

type MutationArgs = {
  db: Client;
  sessionId: string;
  expectedRevision: number;
  requestId: string;
};
async function mutateSession(
  args: MutationArgs & { rows?: unknown; orderedIds?: string[]; title?: string; weekday?: number },
): Promise<Result<{ revision: number }>> {
  if (
    !z.uuid().safeParse(args.requestId).success ||
    !Number.isInteger(args.expectedRevision) ||
    args.expectedRevision < 0
  )
    return { ok: false, reason: "invalid" };
  const { data, error } = await args.db.rpc("mutate_routine_session", {
    p_session_id: args.sessionId,
    p_expected_revision: args.expectedRevision,
    p_request_id: args.requestId,
    ...(args.title !== undefined ? { p_title: args.title } : {}),
    ...(args.weekday !== undefined ? { p_weekday: args.weekday } : {}),
    ...(args.rows
      ? { p_rows: args.rows as Database["public"]["Tables"]["routine_mutations"]["Row"]["payload"] }
      : {}),
    ...(args.orderedIds ? { p_ordered_ids: args.orderedIds } : {}),
  });
  if (!error) return { ok: true, revision: data };
  if (error.code === "40001") return { ok: false, reason: "conflict" };
  if (error.code === "55000") return { ok: false, reason: "week_locked" };
  if (error.code === "P0002") return { ok: false, reason: "not_found" };
  if (["22023", "23514", "22P02", "23502", "22003"].includes(error.code))
    return { ok: false, reason: "invalid" };
  return { ok: false, reason: failureFromError(error) };
}
export async function saveSessionPrescriptions(
  args: MutationArgs & { rows: unknown; title?: string; weekday?: number },
): Promise<Result<{ revision: number }>> {
  const parsed = z
    .array(prescriptionMutationSchema.extend({ id: z.uuid() }))
    .min(args.title !== undefined || args.weekday !== undefined ? 0 : 1)
    .max(15)
    .safeParse(args.rows);
  if (!parsed.success || new Set(parsed.data.map((row) => row.id)).size !== parsed.data.length)
    return { ok: false, reason: "invalid" };
  if (args.title !== undefined && !z.string().trim().max(80).safeParse(args.title).success)
    return { ok: false, reason: "invalid" };
  if (
    args.weekday !== undefined &&
    !z.number().int().min(-1).max(6).safeParse(args.weekday).success
  )
    return { ok: false, reason: "invalid" };
  return mutateSession({ ...args, rows: parsed.data });
}
export async function reorderSessionExercises(args: {
  db: Client;
  sessionId: string;
  orderedIds: string[];
  today?: DateString;
  expectedRevision?: number;
  requestId?: string;
}): Promise<Result<{ revision: number }>> {
  if (
    !args.orderedIds.length ||
    args.orderedIds.length > 15 ||
    new Set(args.orderedIds).size !== args.orderedIds.length
  )
    return { ok: false, reason: "invalid" };
  let revision = args.expectedRevision;
  if (revision === undefined) {
    const { data, error } = await args.db
      .from("program_sessions")
      .select("revision")
      .eq("id", args.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, reason: "not_found" };
    revision = data.revision;
  }
  return mutateSession({
    ...args,
    expectedRevision: revision,
    requestId: args.requestId ?? crypto.randomUUID(),
  });
}

// Copiar semana --------------------------------------------------------------------------------------
export async function duplicateRoutineItem(args: {
  db: Client;
  sessionId: string;
  copyId: string;
  exerciseId?: string;
}): Promise<Result<{ id: string }>> {
  const { data, error } = await args.db.rpc("duplicate_routine_item", {
    p_session_id: args.sessionId,
    p_copy_id: args.copyId,
    ...(args.exerciseId ? { p_exercise_id: args.exerciseId } : {}),
  });
  if (error) {
    if (error.code === "P0002") return { ok: false, reason: "not_found" };
    if (error.code === "55000") return { ok: false, reason: "week_locked" };
    if (error.code === "22023") return { ok: false, reason: "invalid" };
    return { ok: false, reason: failureFromError(error) };
  }
  return { ok: true, id: data };
}

export async function copyWeek(args: {
  db: Client;
  programId: string;
  fromWeek: number;
  toWeek: number;
  replace?: boolean;
  today?: DateString;
}): Promise<Result<{ sessions: number }> | { ok: false; reason: "destination_not_empty" }> {
  const context = await contextForProgram(args.db, args.programId, args.toWeek);
  if (!context) return { ok: false, reason: "not_found" };
  if (!editable(context, args.today ?? todayDefault())) {
    const { data } = await args.db
      .from("programs")
      .select("weeks_count")
      .eq("id", args.programId)
      .single();
    const outOfRange = !data || args.toWeek < 1 || args.toWeek > data.weeks_count;
    return { ok: false, reason: outOfRange ? "invalid" : "week_locked" };
  }

  const { data, error } = await args.db.rpc("copy_program_week", {
    p_program_id: args.programId,
    p_from: args.fromWeek,
    p_to: args.toWeek,
    p_replace: args.replace ?? false,
  });
  if (error) {
    if (error.code === "P0001") return { ok: false, reason: "destination_not_empty" };
    if (error.code === "P0002") return { ok: false, reason: "not_found" };
    if (error.code === "22023") return { ok: false, reason: "invalid" };
    return { ok: false, reason: failureFromError(error) };
  }
  return { ok: true, sessions: data };
}

// Asignar ------------------------------------------------------------------------------------------------
export type AssignFailure = Failure | "past_date" | "inactive_student" | "has_workouts";

export async function assignProgram(args: {
  db: Client;
  templateId: string;
  studentId: string;
  startDate: DateString;
}): Promise<{ ok: true; programId: string } | { ok: false; reason: AssignFailure }> {
  const { data, error } = await args.db.rpc("assign_program", {
    p_template_id: args.templateId,
    p_student_id: args.studentId,
    p_start_date: args.startDate,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, reason: "forbidden" };
    if (error.code === "P0002") return { ok: false, reason: "not_found" };
    if (error.code === "P0001") return { ok: false, reason: "has_workouts" };
    if (error.code === "22023") {
      return {
        ok: false,
        reason: /anterior/i.test(error.message) ? "past_date" : "inactive_student",
      };
    }
    throw new Error(`No se pudo asignar el programa: ${error.message}`);
  }
  return { ok: true, programId: data };
}
