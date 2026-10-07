// Utilidades para tests de integración contra Supabase LOCAL. Nunca contra producción.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";

export type AdminClient = SupabaseClient<Database>;

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Falta ${name}. ¿Está corriendo \`npx supabase start\` y existe .env.local?`);
  return value;
}

// Barrera de seguridad: estos tests borran usuarios. Solo se permiten contra una base local.
export function assertLocalSupabase(): void {
  const url = new URL(env("NEXT_PUBLIC_SUPABASE_URL"));
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(
      `Los tests de integración solo corren contra Supabase local (url: ${url.hostname}).`,
    );
  }
}

export function adminClient(): AdminClient {
  assertLocalSupabase();
  return createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Cliente anónimo con la clave publicable, como lo vería un visitante o un usuario con sesión.
export function anonClient(): AdminClient {
  assertLocalSupabase();
  return createClient<Database>(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Borra todos los usuarios (cascada a perfiles y datos) y el estado auxiliar. Deja la base lista.
export async function resetUsers(admin: AdminClient = adminClient()): Promise<void> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  for (const user of data.users) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
  }
  await admin.from("login_attempts").delete().neq("email_hash", "");
}

// Contraseña aleatoria para usuarios de prueba (nunca se reutiliza ni se imprime).
export function randomPassword(): string {
  return `Pw-${randomUUID()}`;
}
