// Utilidades de E2E contra Supabase LOCAL: crear y limpiar datos con service role.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Falta ${name}. ¿Está corriendo \`npx supabase start\` y existe .env.local?`);
  return value;
}

export const COACH = {
  email: process.env.E2E_COACH_EMAIL ?? "coach-e2e@test.local",
  password: process.env.E2E_COACH_PASSWORD ?? "Local-E2E-only-2026!",
  name: process.env.E2E_COACH_NAME ?? "Coach E2E",
};

export function admin(): SupabaseClient<Database> {
  const url = new URL(env("NEXT_PUBLIC_SUPABASE_URL"));
  // Barrera de seguridad: estos tests borran usuarios. Solo contra una base local.
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`Los tests E2E solo corren contra Supabase local (url: ${url.hostname}).`);
  }
  return createClient<Database>(url.toString(), env("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function resetAll(db = admin()): Promise<void> {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of data?.users ?? []) await db.auth.admin.deleteUser(user.id);
  await db.from("login_attempts").delete().neq("email_hash", "");
  // Los ejercicios propios del coach se borran con él (cascada); el catálogo base queda.
}

export async function createUser(
  db: SupabaseClient<Database>,
  input: {
    role: "coach" | "student";
    name: string;
    email: string;
    password: string;
    coachId?: string;
  },
): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no se pudo crear el usuario");
  const id = data.user.id;
  const { error: profileError } = await db.from("profiles").insert({
    id,
    role: input.role,
    full_name: input.name,
    coach_id: input.role === "coach" ? id : (input.coachId ?? id),
  });
  if (profileError) throw profileError;
  return id;
}

export async function seedCoach(db = admin()): Promise<string> {
  return createUser(db, {
    role: "coach",
    name: COACH.name,
    email: COACH.email,
    password: COACH.password,
  });
}

// Programa de 2 semanas que empieza este lunes, con una sesión A de dos ejercicios.
export async function seedProgram(args: {
  coachId: string;
  studentId: string;
  db?: SupabaseClient<Database>;
}) {
  const db = args.db ?? admin();
  const { mondayOf, santiagoDate, addDays } = await import("../../src/domain/dates");
  const start = mondayOf(santiagoDate(new Date()));
  const { data: program } = await db
    .from("programs")
    .insert({
      coach_id: args.coachId,
      student_id: args.studentId,
      name: "Programa semilla",
      weeks_count: 2,
      start_date: start,
      ends_on: addDays(start, 13),
    })
    .select("id")
    .single();
  const { data: session } = await db
    .from("program_sessions")
    .insert({ program_id: program!.id, week_number: 1, label: "A" })
    .select("id")
    .single();
  const { data: exercises } = await db
    .from("exercises")
    .select("id, name")
    .in("name", ["Sentadilla", "Press de banca"])
    .is("coach_id", null);
  const byName = new Map(exercises!.map((e) => [e.name, e.id]));
  await db.from("session_exercises").insert([
    {
      program_session_id: session!.id,
      exercise_id: byName.get("Sentadilla")!,
      position: 0,
      sets: 3,
      reps_min: 8,
      reps_max: 12,
    },
    {
      program_session_id: session!.id,
      exercise_id: byName.get("Press de banca")!,
      position: 1,
      sets: 3,
      reps_min: 8,
      reps_max: 12,
    },
  ]);
  return { programId: program!.id, sessionId: session!.id, exercises: byName };
}

// Un entrenamiento ya guardado de un alumno (sin programa), de hace `daysAgo` días.
export async function seedWorkout(args: {
  studentId: string;
  exerciseId: string;
  exerciseName: string;
  daysAgo: number;
  db?: SupabaseClient<Database>;
}) {
  const db = args.db ?? admin();
  const { addDays, santiagoDate } = await import("../../src/domain/dates");
  const startedAt = new Date(
    `${addDays(santiagoDate(new Date()), -args.daysAgo)}T15:00:00Z`,
  ).toISOString();
  const id = crypto.randomUUID();
  await db.from("workouts").insert({
    id,
    student_id: args.studentId,
    started_at: startedAt,
    finished_at: new Date(Date.parse(startedAt) + 3_000_000).toISOString(),
    duration_seconds: 3000,
    created_at: startedAt,
  });
  await db.from("workout_sets").insert({
    workout_id: id,
    student_id: args.studentId,
    exercise_id: args.exerciseId,
    exercise_name: args.exerciseName,
    position: 0,
    set_number: 1,
    weight_kg: 60,
    reps: 10,
    is_warmup: false,
  });
  return id;
}
