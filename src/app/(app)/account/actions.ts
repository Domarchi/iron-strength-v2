"use server";

import { redirect } from "next/navigation";
import { isDeleteConfirmation } from "@/domain/account";
import { requireUser } from "@/lib/auth/session";
import { deleteOwnAccount } from "@/lib/data/account";
import { createClient } from "@/lib/supabase/server";

export type DeleteAccountState = { status: "idle" } | { status: "error"; message: string };

const MESSAGES = {
  photos:
    "No se pudieron borrar tus fotos, así que no borramos tu cuenta. No se perdió nada: inténtalo de nuevo en un momento.",
  forbidden: "Esta cuenta no se puede borrar desde la app.",
  failed: "No se pudo borrar la cuenta. Inténtalo de nuevo en un momento.",
} as const;

// Borra la cuenta del alumno que la pide (RF-48). Solo alumnos (DC-4) y solo con la palabra BORRAR.
export async function deleteAccountAction(
  _previous: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser();
  if (user.role !== "student") return { status: "error", message: MESSAGES.forbidden };
  if (!isDeleteConfirmation(String(formData.get("confirmacion") ?? ""))) {
    return { status: "error", message: "Escribe BORRAR para confirmar." };
  }

  const db = await createClient();
  const result = await deleteOwnAccount(db);
  if (!result.ok) return { status: "error", message: MESSAGES[result.reason] };

  // El usuario ya no existe: se limpian las cookies de sesión y se vuelve al inicio.
  await db.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login?motivo=cuenta-borrada");
}
