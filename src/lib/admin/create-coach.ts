// Alta única del coach (DC-1, RF-4). Se usa desde scripts/create-coach.ts, nunca desde la app.
// Recibe el cliente con service role para poder probarse contra Supabase local.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

export type CreateCoachInput = { email: string; password: string; name: string };

export async function createCoach(
  admin: SupabaseClient<Database>,
  input: CreateCoachInput,
): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Ingresa un correo válido.");
  if (input.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  if (!name) throw new Error("Ponle un nombre al coach.");

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "coach");
  if (countError) throw new Error(`No se pudo revisar si existe un coach: ${countError.message}`);
  if ((count ?? 0) > 0) throw new Error("Ya existe un coach. Solo puede haber uno.");

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`No se pudo crear el usuario: ${error?.message}`);

  const id = data.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id, role: "coach", full_name: name, coach_id: id });

  if (profileError) {
    // Compensación: sin perfil el usuario quedaría huérfano.
    await admin.auth.admin.deleteUser(id);
    throw new Error(`No se pudo crear el perfil del coach: ${profileError.message}`);
  }

  return { id };
}
