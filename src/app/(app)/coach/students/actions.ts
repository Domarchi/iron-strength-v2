"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/auth/session";
import { createInvitation } from "@/lib/invitations/create";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type InviteState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "created"; email: string; link: string; expiresAt: string };

const MESSAGES = {
  invalid_email: "Ingresa un correo válido.",
  already_registered: "Ya existe una cuenta con ese correo.",
  already_invited: "Ya hay una invitación vigente para ese correo. Revócala para crear otra.",
  forbidden: "No tienes permiso para invitar alumnos.",
} as const;

export async function inviteStudentAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const coach = await requireCoach();
  const email = String(formData.get("email") ?? "");

  const result = await createInvitation({
    db: await createClient(),
    admin: createAdminClient(),
    coachId: coach.id,
    email,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  });

  if (!result.ok) return { status: "error", message: MESSAGES[result.reason] };

  revalidatePath("/coach/students");
  return {
    status: "created",
    email: email.trim().toLowerCase(),
    link: result.link,
    expiresAt: result.expiresAt.toISOString(),
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // La RLS limita el borrado a las invitaciones del propio coach.
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id).is("used_at", null);
  revalidatePath("/coach/students");
}
