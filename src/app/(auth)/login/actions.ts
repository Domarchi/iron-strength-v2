"use server";

import { redirect } from "next/navigation";
import { attemptLogin, type LoginResult } from "@/lib/auth/login";
import { createLoginGuard, supabaseStore } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; email: string };

function messageFor(result: Extract<LoginResult, { ok: false }>): string {
  switch (result.reason) {
    case "locked": {
      const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
      return `Demasiados intentos fallidos. Prueba de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
    }
    case "inactive":
      return "Tu cuenta está desactivada. Habla con tu coach.";
    default:
      return "Correo o contraseña incorrectos.";
  }
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const result = await attemptLogin(
    { email, password: formData.get("password") },
    {
      auth: await createClient(),
      guard: createLoginGuard(supabaseStore(createAdminClient())),
    },
  );

  if (!result.ok) return { error: messageFor(result), email };
  redirect("/");
}
