import { createTrainingDownloadApi } from "./training-download-api";
import { readTrainingDownload } from "../data/training-download";
import { createAssignedTrainingApi } from "./assigned-training-api";
import { getAssignedTrainingContext } from "../data/assigned-training-context";
import { createWorkoutRemovalApi } from "./workout-removal-api";
import { readOwnWorkoutRemoval, removeOwnWorkout } from "../data/workout-removals";
import { createTrainingProgressApi } from "./training-progress-api";
import { createWorkoutCorrectionApi } from "./workout-correction-api";
import { correctOwnWorkout, readOwnWorkoutCorrection } from "../data/workout-corrections";
import { readOwnTrainingProgress } from "../data/training-progress";
import { createTypedPersonalApi } from "./typed-personal-api";
import { readTrainingLibrary, mutateTrainingLibrary } from "../data/typed-personal-library";
import { createTypedExerciseApi } from "./typed-exercise-api";
import { createPersonalExerciseApi } from "./personal-exercise-api";
import { readPersonalExercises, mutatePersonalExercise } from "../data/personal-exercises";
import {
  getTypedActiveExercise,
  listTypedExerciseHistory,
  listTypedExercises,
} from "../data/typed-exercises";
import { createPersonalWorkoutApi } from "./personal-workout-api";
import { createRecordingApi } from "./recording-api";
import { createTypedRecordingApi } from "./typed-recording-api";
import { getTypedWorkoutDetail } from "../data/typed-recordings";
import { saveTypedWorkoutWithAchievements } from "../data/typed-recording-achievements";
import { saveWorkoutRecording } from "../data/save-workout-recording";
import { savePersonalWorkout } from "../data/save-personal-workout";
import { createMobilePersonalApi } from "./personal-api";
import { readPersonalLibrary, mutatePersonalLibrary } from "../data/personal-library";
import { createMobileProgressApi } from "./progress-api";
import { createMobileExerciseApi } from "./exercise-api";
import { listMobileExercises } from "../data/exercises";
import { listExerciseHistory } from "../data/exercise-history";
import { exerciseHistoryCursorString } from "./exercise-contracts";
import "server-only";
import { createMobileDownloadApi } from "./download-api";
import { downloadCurrentWeek } from "../data/offline-week";
import { createMobileAccessApi } from "./access-api";
import { registerWithInvitation } from "../invitations/register";
import { hashToken } from "../invitations/token";
import { deleteOwnAccount } from "../data/account";
import { createMobileAccountApi } from "./account-api";
import { createMobileCommentsApi } from "./comments-api";
import {
  listOwnComments,
  publishOwnComment,
  removeOwnComment,
  ownsMobileWorkout,
} from "../data/mobile-comments";
import { listUnread, markCommentsRead } from "../data/unread";
import { listWorkouts, getWorkoutDetail } from "../data/workouts";
import { getExerciseProgressDetail, listExerciseProgress } from "../data/progress";
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
export function mobileAccountApi() {
  return createMobileAccountApi({
    authorize: mobileProductionDependencies().authorize,
    remove: (token) => deleteOwnAccount(client(token)),
  });
}
export function mobileCommentsApi() {
  return createMobileCommentsApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token),
        id = identity.profile.id;
      return {
        unread: async () =>
          (await listUnread(db))
            .filter((row) => row.studentId === id)
            .map((row) => ({
              workoutId: row.workoutId,
              count: row.count,
              lastCommentAt: row.lastCommentAt,
            })),
        list: (workoutId, cursor) => listOwnComments(db, id, workoutId, cursor),
        publish: (workoutId, input) => publishOwnComment(db, id, workoutId, input),
        remove: (workoutId, commentId) => removeOwnComment(db, id, workoutId, commentId),
        markRead: async (workoutId) =>
          (await ownsMobileWorkout(db, id, workoutId))
            ? (await markCommentsRead(db, workoutId)).ok
            : null,
      };
    },
  });
}

export function mobileProgressApi() {
  return createMobileProgressApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        detail: async (exerciseId) => {
          const value = await getExerciseProgressDetail(db, identity.profile.id, exerciseId);
          return value ? { version: 1 as const, today: santiagoDate(new Date()), ...value } : null;
        },
      };
    },
  });
}

export function mobileDownloadApi() {
  return createMobileDownloadApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        userId: identity.profile.id,
        download: () => downloadCurrentWeek(db, identity.profile.id),
      };
    },
  });
}

export function mobileExerciseApi() {
  return createMobileExerciseApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        catalog: () => listMobileExercises(db),
        detail: async (id, cursor) => {
          const exercise = await getTypedActiveExercise(db, id);
          if (!exercise || exercise.recordType !== null) return null;
          const history = await listExerciseHistory(db, identity.profile.id, id, { cursor });
          return {
            exercise,
            history: {
              items: history.items,
              nextCursor: history.nextCursor
                ? exerciseHistoryCursorString(history.nextCursor)
                : null,
            },
          };
        },
      };
    },
  });
}

export function mobilePersonalApi() {
  return createMobilePersonalApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        userId: identity.profile.id,
        read: () => readPersonalLibrary(db),
        mutate: (input) => mutatePersonalLibrary(db, input),
      };
    },
  });
}

export function mobileTrainingLibraryApi() {
  return createTypedPersonalApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        userId: identity.profile.id,
        read: () => readTrainingLibrary(db),
        mutate: (input) => mutateTrainingLibrary(db, input),
      };
    },
  });
}

export function mobilePersonalWorkoutApi() {
  return createPersonalWorkoutApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        save: async (payload) => {
          const receipt = await savePersonalWorkout(db, payload);
          if (receipt.status !== "removed")
            await syncAchievements({
              db,
              studentId: identity.profile.id,
              workoutId: payload.id,
            }).catch(() => []);
          return receipt;
        },
      };
    },
  });
}

export function mobileRecordingApi() {
  return createRecordingApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        save: async (payload) => {
          const receipt = await saveWorkoutRecording(db, payload);
          if (receipt.status !== "removed")
            await syncAchievements({
              db,
              studentId: identity.profile.id,
              workoutId: payload.id,
            }).catch(() => []);
          return receipt;
        },
      };
    },
  });
}

export function mobileTypedRecordingApi() {
  return createTypedRecordingApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        save: (payload) => saveTypedWorkoutWithAchievements(db, identity.profile.id, payload),
        read: (id) => getTypedWorkoutDetail(db, id, identity.profile.id),
      };
    },
  });
}

export function mobileTypedExerciseApi() {
  return createTypedExerciseApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        catalog: () => listTypedExercises(db),
        detail: async (id, cursor) => {
          const exercise = await getTypedActiveExercise(db, id);
          if (!exercise) return null;
          return {
            exercise,
            history: await listTypedExerciseHistory(db, identity.profile.id, id, { cursor }),
          };
        },
      };
    },
  });
}

export function mobilePersonalExerciseApi() {
  return createPersonalExerciseApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        userId: identity.profile.id,
        read: () => readPersonalExercises(db),
        mutate: (input) => mutatePersonalExercise(db, input),
      };
    },
  });
}

export function mobileTrainingProgressApi() {
  return createTrainingProgressApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        userId: identity.profile.id,
        read: () => readOwnTrainingProgress(db, identity.profile.id),
      };
    },
  });
}

export function mobileWorkoutCorrectionApi() {
  return createWorkoutCorrectionApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        userId: identity.profile.id,
        read: (id) => readOwnWorkoutCorrection(db, id, identity.profile.id),
        correct: (input) => correctOwnWorkout(db, input),
      };
    },
  });
}

export function mobileWorkoutRemovalApi() {
  return createWorkoutRemovalApi({
    authorize: async (token) => {
      const identity = await mobileProductionDependencies().authorize(token);
      if (!identity) return null;
      const db = client(token);
      return {
        userId: identity.profile.id,
        read: (id) => readOwnWorkoutRemoval(db, id, identity.profile.id),
        remove: (input) => removeOwnWorkout(db, input),
      };
    },
  });
}

export function mobileAssignedTrainingApi() {
  return createAssignedTrainingApi({
    authorize: async (token) => {
      const actor = await mobileProductionDependencies().authorize(token);
      if (!actor) return null;
      const db = client(token),
        userId = actor.profile.id;
      return { userId, read: (id) => getAssignedTrainingContext(db, userId, id) };
    },
  });
}

export function mobileTrainingDownloadApi() {
  return createTrainingDownloadApi({
    authorize: async (token) => {
      const actor = await mobileProductionDependencies().authorize(token);
      if (!actor) return null;
      const db = client(token),
        userId = actor.profile.id;
      return { userId, read: () => readTrainingDownload(db, userId) };
    },
  });
}
