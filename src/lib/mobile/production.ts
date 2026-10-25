import "server-only";
import { createMobileAccessApi } from "./access-api";
import { registerWithInvitation } from "../invitations/register";
import { hashToken } from "../invitations/token";
import { listWorkouts, getWorkoutDetail } from "../data/workouts";
import { listExerciseProgress } from "../data/progress";
import { saveWorkout } from "../data/save-workout";
import { syncAchievements } from "../data/achievements";
import { mobileHistorySchema, mobileWorkoutSchema, mobileProgressSchema } from "./contracts";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { attemptLogin } from "../auth/login";
import { createLoginGuard, supabaseStore } from "../auth/rate-limit";
import { createAdminClient } from "../supabase/admin";
import { supabasePublishableKey, supabaseUrl } from "../supabase/env";
import { getWeekView } from "../data/week";
import { getWorkoutContext } from "../data/workout-context";
import { santiagoDate } from "../../domain/dates";
import type { Database } from "../../types/database";
import { createMobileApi, type MobileApiDependencies } from "./api";
import {
  mobileProfileSchema,
  mobileRoutineSchema,
  mobileSessionSchema,
  mobileWeekSchema,
  type MobileProfile,
} from "./contracts";

type Client = SupabaseClient<Database>;
function client(token?: string): Client {
  return createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
}
function transient(error: { status?: number } | null) {
  if (error && (error.status === undefined || error.status === 0 || error.status >= 500))
    throw Error("Servicio de identidad no disponible");
}
async function profile(db: Client, user: User): Promise<MobileProfile | null> {
  const result = await db
    .from("profiles")
    .select("id,full_name,role")
    .eq("id", user.id)
    .maybeSingle();
  if (result.error) throw Error("No se pudo comprobar el perfil");
  if (!result.data) return null;
  return mobileProfileSchema.parse({
    id: user.id,
    fullName: result.data.full_name,
    email: user.email ?? "",
    role: result.data.role,
  });
}
async function session(db: Client, person: MobileProfile) {
  const result = await db.auth.getSession();
  if (result.error || !result.data.session) throw Error("Sesión no disponible");
  const s = result.data.session;
  return mobileSessionSchema.parse({
    version: 1,
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at,
    profile: person,
  });
}
export function mobileProductionDependencies(): MobileApiDependencies {
  return {
    async login(input) {
      const db = client();
      // Mismo propósito administrativo ya autorizado: control de intentos de login, nunca lecturas del alumno.
      const result = await attemptLogin(input, {
        auth: db,
        guard: createLoginGuard(supabaseStore(createAdminClient())),
      });
      if (!result.ok) return result;
      const auth = await db.auth.getUser();
      if (auth.error || !auth.data.user) throw Error("Sesión no disponible");
      const person = await profile(db, auth.data.user);
      if (!person) {
        await db.auth.signOut({ scope: "local" });
        return { ok: false, reason: "inactive" };
      }
      return { ok: true, session: await session(db, person) };
    },
    async refresh(refreshToken) {
      const db = client();
      const result = await db.auth.refreshSession({ refresh_token: refreshToken });
      transient(result.error);
      if (result.error || !result.data.user) return null;
      const person = await profile(db, result.data.user);
      if (!person) {
        await db.auth.signOut({ scope: "local" });
        return null;
      }
      return session(db, person);
    },
    async authorize(token) {
      const db = client(token);
      const result = await db.auth.getUser(token);
      transient(result.error);
      if (result.error || !result.data.user) return null;
      const person = await profile(db, result.data.user);
      if (!person) return null;
      return {
        profile: person,
        async week() {
          const view = await getWeekView(db, person.id, santiagoDate(new Date()));
          return mobileWeekSchema.parse({ ...view, version: 1 });
        },
        async history(cursor) {
          return mobileHistorySchema.parse({
            version: 1,
            ...(await listWorkouts(db, person.id, { limit: 20, cursor })),
          });
        },
        async workout(id) {
          const value = await getWorkoutDetail(db, id, person.id);
          return value?.studentId === person.id
            ? mobileWorkoutSchema.parse({ version: 1, workout: value })
            : null;
        },
        async progress() {
          return mobileProgressSchema.parse({
            version: 1,
            exercises: await listExerciseProgress(db, person.id),
          });
        },
        async save(payload) {
          const result = await saveWorkout({ db, payload });
          if (result.ok)
            await syncAchievements({ db, studentId: person.id, workoutId: payload.id }).catch(
              () => [],
            );
          return result;
        },
        async routine(id) {
          const result = await getWorkoutContext(db, person.id, id);
          return result.ok ? mobileRoutineSchema.parse({ ...result.context, version: 1 }) : null;
        },
      };
    },
    async logout(token, refreshToken) {
      const db = client();
      const restored = await db.auth.setSession({
        access_token: token,
        refresh_token: refreshToken,
      });
      transient(restored.error);
      if (restored.error) return;
      const result = await db.auth.signOut({ scope: "local" });
      if (result.error) throw Error("No se pudo confirmar salida");
    },
  };
}
export function mobileApi() {
  return createMobileApi(mobileProductionDependencies());
}

/** Reuses the existing invitation registration purpose; reset itself needs no admin client. */
export function mobileAccessDependencies(): import("./access-api").MobileAccessApiDependencies {
  return {
    async invitation(token) {
      const result = await client().rpc("validate_invitation", { p_token_hash: hashToken(token) });
      if (result.error) throw Error("No se pudo comprobar la invitación");
      const row = result.data?.[0];
      if (row?.status === "valida" && row.email) return { status: "valida", email: row.email };
      return {
        status: row?.status === "usada" || row?.status === "vencida" ? row.status : "inexistente",
        email: null,
      };
    },
    register: (input) => registerWithInvitation(createAdminClient(), input),
    async reset(input) {
      const db = client();
      const verified = await db.auth.verifyOtp({ type: "recovery", token_hash: input.token });
      transient(verified.error);
      if (verified.error || !verified.data.user) return { ok: false, reason: "invalid_link" };
      try {
        const changed = await db.auth.updateUser({ password: input.password });
        transient(changed.error);
        return changed.error ? { ok: false, reason: "password_rejected" } : { ok: true };
      } finally {
        // The recovery session is never returned or stored; only revoke its own refresh token.
        await db.auth.signOut({ scope: "local" }).catch(() => {});
      }
    },
  };
}
export function mobileAccessApi() {
  return createMobileAccessApi(mobileAccessDependencies());
}
