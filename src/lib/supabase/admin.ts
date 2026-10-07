import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

// Cliente con service role: IGNORA la RLS. Solo para los tres usos previstos en el plan:
// registro por invitación, enlace de restablecimiento (coach) y control de intentos de login.
// Nunca importarlo desde un Client Component ni exponer su resultado sin filtrar.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Falta la variable de entorno SUPABASE_SECRET_KEY");

  return createClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
