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
