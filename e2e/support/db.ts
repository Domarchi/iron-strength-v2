// Utilidades de E2E contra Supabase LOCAL: crear y limpiar datos con service role.
import { createHash } from "node:crypto";
import { E2E_EMAIL_DOMAIN, isE2EAccount } from "../../src/lib/testing/e2e-isolation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Falta ${name}. ¿Está corriendo \`npx supabase start\` y existe .env.local?`);
  return value;
}

export const COACH = {
  email: process.env.E2E_TEST_COACH_EMAIL ?? `coach@${E2E_EMAIL_DOMAIN}`,
  password:
    process.env.E2E_TEST_COACH_PASSWORD ?? process.env.E2E_COACH_PASSWORD ?? "Local-E2E-only-2026!",
  name: "Coach E2E",
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
  if (!isE2EAccount(COACH.email)) throw new Error(`El coach E2E debe usar @${E2E_EMAIL_DOMAIN}.`);
  const fixtureUsers: { id: string; email?: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    fixtureUsers.push(...data.users.filter((user) => isE2EAccount(user.email)));
    if (data.users.length < 1000) break;
  }
  for (const user of fixtureUsers) {
    const { data: files, error: listError } = await db.storage
      .from("progress-photos")
      .list(user.id, { limit: 1000 });
    if (listError) throw listError;
    if (files?.length) {
      const { error } = await db.storage
        .from("progress-photos")
        .remove(files.map((file) => `${user.id}/${file.name}`));
      if (error) throw error;
    }
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
  const emails = [
    ...fixtureUsers.map((user) => user.email!),
    COACH.email,
    `nadie@${E2E_EMAIL_DOMAIN}`,
  ];
  const hashes = emails.map((email) =>
    createHash("sha256").update(email.trim().toLowerCase()).digest("hex"),
  );
  const { error } = await db.from("login_attempts").delete().in("email_hash", hashes);
  if (error) throw error;
  // Solo fixtures: el coach y los alumnos de dev:seed conservan sus IDs y programas.
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
  const { data: existing, error } = await db
    .from("profiles")
    .select("id")
    .eq("role", "coach")
    .maybeSingle();
  if (error) throw error;
  if (existing)
    throw new Error(
      "La base contiene otro coach. Configura una instancia Supabase exclusiva en .env.e2e.local; no se borraron los datos de desarrollo.",
    );
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
