// Registro de un alumno por invitación (RF-2, RF-3, DC-2, DC-5). Usa service role: es una de las
// tres únicas zonas donde se permite (plan §1). Es atómico en la práctica: la invitación se
// "reclama" con un UPDATE condicional (solo una petición gana) y cualquier fallo posterior deshace
// el reclamo y borra el usuario creado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../types/database.ts";
import { hashToken } from "./token.ts";

type Admin = SupabaseClient<Database>;

export type RegisterResult =
  | { ok: true; userId: string; email: string }
  | {
      ok: false;
      reason:
        | "inexistente"
        | "usada"
        | "vencida"
        | "email_mismatch"
        | "already_registered"
        | "invalid_input";
    };

const inputSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
  email: z.string().trim().toLowerCase().optional(),
});

type Row = Pick<
  Database["public"]["Tables"]["invitations"]["Row"],
  "id" | "coach_id" | "email" | "used_at" | "expires_at"
>;

function classify(row: Row | null, now: Date): "valida" | "inexistente" | "usada" | "vencida" {
  if (!row) return "inexistente";
  if (row.used_at) return "usada";
  if (new Date(row.expires_at) <= now) return "vencida";
  return "valida";
}

async function findInvitation(admin: Admin, tokenHash: string): Promise<Row | null> {
  const { data, error } = await admin
    .from("invitations")
    .select("id, coach_id, email, used_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la invitación: ${error.message}`);
  return data;
}

export async function registerWithInvitation(
  admin: Admin,
  input: { token: string; name: string; password: string; email?: string },
): Promise<RegisterResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    // Sin token no hay invitación que mirar; con otros datos malos, no se consume nada.
    return { ok: false, reason: input.token ? "invalid_input" : "inexistente" };
  }
  const { token, name, password, email } = parsed.data;

  const invitation = await findInvitation(admin, hashToken(token));
  const state = classify(invitation, new Date());
  if (state !== "valida" || !invitation) {
    return { ok: false, reason: state === "valida" ? "inexistente" : state };
  }
  if (email && email !== invitation.email) return { ok: false, reason: "email_mismatch" };

  // Reclamo atómico: solo una petición logra pasar used_at de nulo a una fecha.
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("invitations")
    .update({ used_at: nowIso })
    .eq("id", invitation.id)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`No se pudo reclamar la invitación: ${claimError.message}`);
  if (!claimed) return { ok: false, reason: "usada" };

  const release = async () => {
    await admin
      .from("invitations")
      .update({ used_at: null, used_by: null })
      .eq("id", invitation.id);
  };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    await release();
    const exists = /already|registered|exists/i.test(createError?.message ?? "");
    if (exists) return { ok: false, reason: "already_registered" };
    throw new Error(`No se pudo crear el usuario: ${createError?.message}`);
  }

  const userId = created.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: userId, role: "student", full_name: name, coach_id: invitation.coach_id });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    await release();
    throw new Error(`No se pudo crear el perfil: ${profileError.message}`);
  }

  await admin.from("invitations").update({ used_by: userId }).eq("id", invitation.id);
  return { ok: true, userId, email: invitation.email };
}
