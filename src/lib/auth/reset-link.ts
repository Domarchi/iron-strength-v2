// Enlace de restablecimiento de contraseña generado por el coach (RF-7). No se envía ningún
// correo (DC-3): el coach copia el enlace y se lo entrega al alumno. Uso de service role
// permitido (plan §1): generar el enlace de recuperación.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

type Client = SupabaseClient<Database>;

export type ResetLinkResult =
  { ok: true; link: string } | { ok: false; reason: "not_found" | "not_student" };

export async function createResetLink(input: {
  db: Client; // sesión del coach: la RLS decide qué alumnos puede ver
  admin: Client;
  studentId: string;
  siteUrl: string;
}): Promise<ResetLinkResult> {
  const { db, admin, studentId, siteUrl } = input;

  // Quien llama debe ser el coach activo de ese usuario. No basta con que la RLS le deje ver el
  // perfil: un alumno ve el suyo, y no debe poder generarse un enlace de restablecimiento.
  const { data: isCoachOf, error: authzError } = await db.rpc("is_coach_of", {
    student: studentId,
  });
  if (authzError) throw new Error(`No se pudo comprobar el permiso: ${authzError.message}`);
  if (!isCoachOf) return { ok: false, reason: "not_found" };

  const { data: profile, error } = await db
    .from("profiles")
    .select("id, role")
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
  if (!profile) return { ok: false, reason: "not_found" };
  if (profile.role !== "student") return { ok: false, reason: "not_student" };

  const { data: user, error: userError } = await admin.auth.admin.getUserById(studentId);
  if (userError || !user.user?.email) return { ok: false, reason: "not_found" };

  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: user.user.email,
  });
  if (linkError || !data.properties?.hashed_token) {
    throw new Error(`No se pudo generar el enlace: ${linkError?.message}`);
  }

  return { ok: true, link: `${siteUrl.replace(/\/$/, "")}/reset/${data.properties.hashed_token}` };
}
