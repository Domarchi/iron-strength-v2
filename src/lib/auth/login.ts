// Lógica del inicio de sesión (RF-5, RF-6, RF-8), separada de la Server Action para poder
// probarla contra Supabase local. Siempre responde igual ante correo inexistente y contraseña
// incorrecta, para no revelar qué cuentas existen.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../types/database.ts";
import type { createLoginGuard } from "./rate-limit.ts";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export type LoginResult =
  | { ok: true; userId: string; role: "coach" | "student" }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "inactive" }
  | { ok: false; reason: "locked"; retryAfterSeconds: number };

export type LoginDeps = {
  // Cliente con la sesión del usuario (en la app, el de cookies). Si el login prospera, queda abierta.
  auth: SupabaseClient<Database>;
  guard: ReturnType<typeof createLoginGuard>;
};

export async function attemptLogin(
  input: unknown,
  { auth, guard }: LoginDeps,
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, password } = parsed.data;

  const lock = await guard.check(email);
  if (lock.locked)
    return { ok: false, reason: "locked", retryAfterSeconds: lock.retryAfterSeconds };

  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await guard.recordFailure(email);
    return { ok: false, reason: "invalid" };
  }

  // Un usuario desactivado no ve ni su propio perfil (RLS): sin fila, no entra (RF-8).
  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await auth.auth.signOut();
    return { ok: false, reason: "inactive" };
  }

  await guard.recordSuccess(email);
  return { ok: true, userId: data.user.id, role: profile.role };
}
