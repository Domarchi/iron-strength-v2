// Límite de intentos de login por correo (RF-6): 5 fallos en 15 minutos bloquean 15 minutos.
// La lógica es pura (reloj y almacenamiento inyectables). El almacenamiento real es la tabla
// login_attempts, accesible solo con service role (T10).
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.ts";

export const MAX_FAILED_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;

export type AttemptState = {
  failedCount: number;
  windowStartedAt: number;
  lockedUntil: number | null;
};

export interface LoginAttemptStore {
  get(emailHash: string): Promise<AttemptState | null>;
  recordFailure(emailHash: string, now: number): Promise<void>;
  clear(emailHash: string): Promise<void>;
}

export type LockStatus = { locked: boolean; retryAfterSeconds: number };

// El correo nunca se guarda en claro: solo su hash normalizado.
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function createLoginGuard(store: LoginAttemptStore, clock: () => number = Date.now) {
  return {
    async check(email: string): Promise<LockStatus> {
      const state = await store.get(hashEmail(email));
      const now = clock();
      if (state?.lockedUntil && state.lockedUntil > now) {
        return { locked: true, retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000) };
      }
      return { locked: false, retryAfterSeconds: 0 };
    },

    async recordFailure(email: string): Promise<void> {
      await store.recordFailure(hashEmail(email), clock());
    },

    async recordSuccess(email: string): Promise<void> {
      await store.clear(hashEmail(email));
    },
  };
}

export function memoryStore(): LoginAttemptStore {
  const data = new Map<string, AttemptState>();
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async recordFailure(key, now) {
      // Sin await entre leer y escribir: atómico dentro de este almacenamiento de pruebas.
      const previous = data.get(key);
      if (previous?.lockedUntil != null && previous.lockedUntil > now) return;
      const fresh =
        !previous || previous.lockedUntil != null || now - previous.windowStartedAt >= WINDOW_MS;
      const failedCount = fresh ? 1 : previous.failedCount + 1;
      data.set(key, {
        failedCount,
        windowStartedAt: fresh ? now : previous.windowStartedAt,
        lockedUntil: failedCount >= MAX_FAILED_ATTEMPTS ? now + LOCK_MS : null,
      });
    },
    async clear(key) {
      data.delete(key);
    },
  };
}

// Almacenamiento real: tabla login_attempts con service role.
export function supabaseStore(admin: SupabaseClient<Database>): LoginAttemptStore {
  return {
    async get(emailHash) {
      const { data, error } = await admin
        .from("login_attempts")
        .select("failed_count, window_started_at, locked_until")
        .eq("email_hash", emailHash)
        .maybeSingle();
      if (error) throw new Error(`No se pudo leer login_attempts: ${error.message}`);
      if (!data) return null;
      return {
        failedCount: data.failed_count,
        windowStartedAt: Date.parse(data.window_started_at),
        lockedUntil: data.locked_until ? Date.parse(data.locked_until) : null,
      };
    },
    async recordFailure(emailHash) {
      // El reloj y la exclusión entre instancias viven en Postgres, no en este proceso.
      const { error } = await admin.rpc("record_login_failure", { p_email_hash: emailHash });
      if (error) throw new Error(`No se pudo guardar login_attempts: ${error.message}`);
    },
    async clear(emailHash) {
      const { error } = await admin.from("login_attempts").delete().eq("email_hash", emailHash);
      if (error) throw new Error(`No se pudo limpiar login_attempts: ${error.message}`);
    },
  };
}
