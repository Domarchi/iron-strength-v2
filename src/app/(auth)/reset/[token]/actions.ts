"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error: string | null };

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

// Verifica el enlace de recuperación (un solo uso) y fija la contraseña nueva.
export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: parsed.data.token,
  });
  if (verifyError) {
    return { error: "El enlace venció o ya fue usado. Pídele otro a tu coach." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) {
    return { error: "No se pudo cambiar la contraseña. Prueba con otra o pide un enlace nuevo." };
  }

  // Cierra la sesión temporal de recuperación: el alumno entra con su contraseña nueva.
  await supabase.auth.signOut();
  redirect("/login?motivo=clave");
}
