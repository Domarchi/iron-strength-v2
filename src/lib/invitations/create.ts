// Creación de invitaciones (RF-1, DC-2). La hace el coach con su propia sesión (la RLS aplica);
// solo la comprobación "¿ya hay una cuenta con este correo?" usa service role.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../types/database.ts";
import { generateToken, hashToken, INVITATION_TTL_DAYS } from "./token.ts";

type Client = SupabaseClient<Database>;

export type CreateInvitationResult =
  | { ok: true; link: string; expiresAt: Date }
  | { ok: false; reason: "invalid_email" | "already_registered" | "already_invited" | "forbidden" };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export async function createInvitation(input: {
  db: Client; // sesión del coach
  admin: Client; // service role, solo para auth_email_exists
  coachId: string;
  email: string;
  siteUrl: string;
  now?: Date;
}): Promise<CreateInvitationResult> {
  const { db, admin, coachId, siteUrl } = input;
  const now = input.now ?? new Date();

  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) return { ok: false, reason: "invalid_email" };
  const email = parsed.data;

  const { data: registered, error: existsError } = await admin.rpc("auth_email_exists", {
    p_email: email,
  });
  if (existsError) throw new Error(`No se pudo comprobar el correo: ${existsError.message}`);
  if (registered) return { ok: false, reason: "already_registered" };

  // Las invitaciones vencidas sin usar estorban al índice de "una abierta por correo": se limpian.
  await db
    .from("invitations")
    .delete()
    .eq("email", email)
    .is("used_at", null)
    .lte("expires_at", now.toISOString());

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 3600_000);

  const { error } = await db.from("invitations").insert({
    coach_id: coachId,
    email,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    if (error.code === "23505") return { ok: false, reason: "already_invited" };
    if (error.code === "42501") return { ok: false, reason: "forbidden" };
    throw new Error(`No se pudo crear la invitación: ${error.message}`);
  }

  return { ok: true, link: `${siteUrl.replace(/\/$/, "")}/invite/${token}`, expiresAt };
}
