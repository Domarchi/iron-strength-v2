"use server";

import { redirect } from "next/navigation";
import { attemptLogin } from "@/lib/auth/login";
import { createLoginGuard, supabaseStore } from "@/lib/auth/rate-limit";
import { registerWithInvitation } from "@/lib/invitations/register";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RegisterState = { error: string | null; name: string };

const MESSAGES = {
  inexistente: "Esta invitación no existe. Pídele otra a tu coach.",
  usada: "Esta invitación ya fue usada. Si eres tú, entra desde la pantalla de inicio de sesión.",
  vencida: "Esta invitación venció. Pídele otra a tu coach.",
  email_mismatch: "El correo no coincide con el de la invitación.",
  already_registered:
    "Ya existe una cuenta con este correo. Entra desde la pantalla de inicio de sesión.",
  invalid_input: "Revisa los datos: escribe tu nombre y una contraseña de al menos 8 caracteres.",
} as const;

export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "");
  const admin = createAdminClient();

  const result = await registerWithInvitation(admin, {
    token: String(formData.get("token") ?? ""),
    name,
    password: String(formData.get("password") ?? ""),
  });
  if (!result.ok) return { error: MESSAGES[result.reason], name };

  // Abre la sesión del alumno recién creado.
  const login = await attemptLogin(
    { email: result.email, password: formData.get("password") },
    { auth: await createClient(), guard: createLoginGuard(supabaseStore(admin)) },
  );
  redirect(login.ok ? "/" : "/login");
}
