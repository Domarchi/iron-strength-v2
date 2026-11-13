import { bundleSchema } from "../../../src/lib/offline/training-bundle";
import { assignedContextSchema } from "../../../src/lib/workout/training-context";
import {
  workoutRemovalSnapshotSchema,
  workoutRemovalSchema,
  workoutRemovalReceiptSchema,
  type WorkoutRemoval,
} from "../../../src/lib/mobile/workout-removal-contracts";
import { trainingProgressSchema } from "../../../src/lib/mobile/training-progress-contracts";
import {
  workoutCorrectionSnapshotSchema,
  workoutCorrectionSchema,
  workoutCorrectionReceiptSchema,
  type WorkoutCorrection,
} from "../../../src/lib/mobile/workout-correction-contracts";
import {
  personalExerciseLibrarySchema,
  personalExerciseMutationSchema,
  personalExerciseResultSchema,
  type PersonalExerciseMutation,
} from "../../../src/lib/mobile/personal-exercise-contracts";
import {
  typedPersonalLibrarySchema,
  upgradePersonalLibrary,
  typedPersonalMutationSchema,
  typedPersonalMutationResultSchema,
  type TypedPersonalMutation,
} from "../../../src/lib/mobile/typed-personal-contracts";
import {
  personalWorkoutPayloadSchema,
  type PersonalWorkoutPayload,
} from "../../../src/lib/mobile/personal-workout-contracts";
import {
  recordingPayloadSchema,
  recordingSaveSchema,
  type RecordingPayload,
} from "../../../src/lib/mobile/recording-contracts";
import {
  typedRecordingPayloadSchema,
  typedRecordingSaveSchema,
  typedWorkoutSchema,
  type TypedRecordingPayload,
} from "../../../src/lib/mobile/typed-recording-contracts";
import {
  personalLibrarySchema,
  personalMutationSchema,
  personalMutationResultSchema,
  type PersonalMutation,
} from "../../../src/lib/mobile/personal-contracts";
import { parseNativeWeek } from "../../../src/lib/mobile/download-contract";
import {
  mobileCatalogSchema,
  mobileExerciseDetailSchema,
  parseExerciseHistoryCursor,
} from "../../../src/lib/mobile/exercise-contracts";
import {
  typedCatalogSchema,
  typedExerciseDetailSchema,
} from "../../../src/lib/mobile/typed-exercise-contracts";
import { z } from "zod";
import {
  mobileErrorSchema,
  mobileProfileSchema,
  type MobileProfile,
  mobileRoutineSchema,
  mobileSessionSchema,
  mobileWeekSchema,
  mobileHistorySchema,
  mobileWorkoutSchema,
  mobileProgressSchema,
  mobileAchievementsSchema,
  mobileCheckinSchema,
  mobileStudentsSchema,
  mobileMeasurementsSchema,
  mobileMeasurementResultSchema,
  type MobileMeasurementInput,
  mobileCheckinAnswersSchema,
  type MobileCheckinAnswers,
  mobileProgressDetailSchema,
  mobileSaveSchema,
  mobileInvitationSchema,
  mobileRegisteredSchema,
  mobilePasswordResetSchema,
  mobileAccountDeletedSchema,
  mobileCommentsSchema,
  mobileUnreadCommentsSchema,
  mobileCommentSentSchema,
  mobileCommentRemovedSchema,
  mobileCommentsReadSchema,
  type MobileSession,
} from "../../../src/lib/mobile/contracts";
import type { WorkoutPayload } from "../../../src/lib/workout/runner-state";
export type {
  MobileCatalogEntry,
  MobileExerciseDetail,
} from "../../../src/lib/mobile/exercise-contracts";
export type { MobileWeek, MobileRoutine, MobileProfile } from "../../../src/lib/mobile/contracts";
export type Transport = (url: string, init: RequestInit) => Promise<Response>;
export interface CredentialStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}
export type ClientSession = Omit<MobileSession, "accessToken" | "expiresAt"> & {
  accessToken: string | null;
  expiresAt: number | null;
};
export type SessionState =
  | { status: "booting" }
  | { status: "signedOut"; message?: string }
  | { status: "blocked"; message: string }
  | { status: "authenticated"; mode: "online" | "offline"; session: ClientSession };
export class MobileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
  ) {
    super(message);
  }
}
export function validateApiOrigin(value: string, allowLocal = false): string {
  const url = new URL(value);
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    /^192\.168\.\d+\.\d+$/.test(url.hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(allowLocal && local && url.protocol === "http:"))
  )
    throw Error("El servicio debe usar un origen HTTPS válido.");
  return url.origin;
}
const vault = z.discriminatedUnion("version", [
  z.object({ version: z.literal(1), refreshToken: z.string().min(1).max(1024) }).strict(),
  z
    .object({
      version: z.literal(2),
      refreshToken: z.string().min(1).max(1024),
      profile: mobileProfileSchema,
    })
    .strict(),
]);
const transientConnection = (error: unknown) =>
  error instanceof MobileError && (error.code === "network" || error.status >= 500);
const cancelled = () => new MobileError("cancelled", "La sesión cambió. Vuelve a intentar.");
const message = (error: unknown) =>
  error instanceof MobileError
    ? error.message
    : "No pudimos guardar tu sesión en este dispositivo. Reintenta.";
export class MobileClient {
  readonly origin: string;
  private state: SessionState = { status: "booting" };
  private listeners = new Set<() => void>();
  private generation = 0;
  private storageTail: Promise<void> = Promise.resolve();
  private renewal: Promise<MobileSession> | null = null;
  private dataRevision = 0;
  getDataRevision = () => this.dataRevision;
  constructor(
    origin: string,
    private readonly store: CredentialStore,
    private readonly fetcher: Transport = fetch,
    private readonly clock: () => number = Date.now,
    allowLocal = false,
  ) {
    this.origin = validateApiOrigin(origin, allowLocal);
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: SessionState) {
    this.state = state;
    for (const fn of this.listeners) fn();
  }
  connectionLost() {
    if (this.state.status !== "authenticated" || this.state.mode === "offline") return;
    this.publish({
      ...this.state,
      mode: "offline",
      session: { ...this.state.session, accessToken: null, expiresAt: null },
    });
  }
  private current(generation: number) {
    if (generation !== this.generation) throw cancelled();
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.storageTail.then(operation, operation);
    this.storageTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  private async persist(session: MobileSession, generation: number) {
    await this.serialize(async () => {
      this.current(generation);
      const encoded = JSON.stringify({
        version: 2,
        refreshToken: session.refreshToken,
        profile: session.profile,
      });
      await this.store.set(encoded);
      this.current(generation);
      if ((await this.store.get()) !== encoded)
        throw new MobileError(
          "storage",
          "No pudimos confirmar la sesión en este dispositivo. Reintenta.",
        );
      this.current(generation);
    });
  }
  private async http(path: string, body?: unknown, token?: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const send = this.fetcher;
      const response = await send(this.origin + "/api/mobile/v1/" + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "omit",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new MobileError(
          "unavailable",
          "No pudimos leer la respuesta. Reintenta.",
          response.status,
        );
      }
      if (!response.ok) {
        const parsed = mobileErrorSchema.safeParse(data);
        throw new MobileError(
          parsed.success ? parsed.data.error.code : "unavailable",
          parsed.success ? parsed.data.error.message : "No pudimos completar la solicitud.",
          response.status,
        );
      }
      return data;
    } catch (error) {
      if (error instanceof MobileError) throw error;
      throw new MobileError("network", "No pudimos conectar. Revisa tu conexión y reintenta.");
    } finally {
      clearTimeout(timer);
    }
  }
  private session(data: unknown): MobileSession {
    const result = mobileSessionSchema.safeParse(data);
    if (!result.success)
      throw new MobileError("version", "Esta respuesta necesita una versión compatible de la app.");
    return result.data;
  }
  async restore(): Promise<void> {
    const gen = ++this.generation;
    this.renewal = null;
    this.publish({ status: "booting" });
    let cached: { profile: MobileProfile; refreshToken: string } | null = null;
    let awaitingService = false;
    try {
      const raw = await this.serialize(() => this.store.get());
      this.current(gen);
      if (raw === null) {
        this.publish({ status: "signedOut" });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new MobileError(
          "storage",
          "No pudimos leer la sesión guardada. Puedes reintentar o salir de este dispositivo.",
        );
      }
      const saved = vault.safeParse(parsed);
      if (!saved.success)
        throw new MobileError(
          "version",
          "La sesión guardada necesita una versión compatible. Se conserva en este dispositivo.",
        );
      if (saved.data.version === 2)
        cached = { profile: saved.data.profile, refreshToken: saved.data.refreshToken };
      awaitingService = true;
      const response = await this.http("auth/refresh", { refreshToken: saved.data.refreshToken });
      awaitingService = false;
      const next = this.session(response);
      this.current(gen);
      if (cached && next.profile.id !== cached.profile.id)
        throw new MobileError("identity", "La cuenta de la sesión cambió. Vuelve a entrar.", 401);
      await this.persist(next, gen);
      this.current(gen);
      this.publish({ status: "authenticated", mode: "online", session: next });
    } catch (error) {
      if (gen !== this.generation) return;
      if (error instanceof MobileError && error.status === 401) await this.endSession(gen);
      else if (awaitingService && cached && transientConnection(error))
        this.publish({
          status: "authenticated",
          mode: "offline",
          session: {
            version: 1,
            profile: cached.profile,
            refreshToken: cached.refreshToken,
            accessToken: null,
            expiresAt: null,
          },
        });
      else
        this.publish({
          status: "blocked",
          message:
            awaitingService && !cached && transientConnection(error)
              ? "Conéctate una vez para activar el acceso sin conexión. Conservamos tu sesión y tus registros."
              : message(error),
        });
    }
  }
  async login(email: string, password: string): Promise<void> {
    const gen = ++this.generation;
    this.renewal = null;
    try {
      const next = this.session(
        await this.http("auth/login", { email: email.trim().toLowerCase(), password }),
      );
      this.current(gen);
      await this.persist(next, gen);
      this.current(gen);
      this.publish({ status: "authenticated", mode: "online", session: next });
    } catch (error) {
      if (gen === this.generation) this.publish({ status: "signedOut", message: message(error) });
      throw error;
    }
  }
  async logout(expectedUserId?: string): Promise<void> {
    if (
      expectedUserId &&
      (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
    )
      throw new MobileError("identity", "La cuenta cambió. No cerramos la sesión de otra cuenta.");
    const previous = this.state.status === "authenticated" ? this.state.session : null;
    const gen = ++this.generation;
    this.renewal = null;
    this.publish({ status: "booting" });
    try {
      await this.serialize(() => this.store.remove());
      this.current(gen);
      this.publish({ status: "signedOut", message: "Saliste de este dispositivo." });
    } catch (error) {
      if (gen === this.generation)
        this.publish({
          status: "blocked",
          message: "No pudimos limpiar la sesión de este dispositivo. Reintenta la salida.",
        });
      throw error;
    }
    if (previous) {
      try {
        await this.http(
          "auth/logout",
          { refreshToken: previous.refreshToken },
          previous.accessToken ?? undefined,
        );
      } catch {
        /* No se afirma revocación remota cuando falla el transporte. */
      }
    }
  }
  private async renew(previous: ClientSession, gen: number): Promise<MobileSession> {
    if (this.renewal) return this.renewal;
    const operation = (async () => {
      const next = this.session(
        await this.http("auth/refresh", { refreshToken: previous.refreshToken }),
      );
      this.current(gen);
      if (next.profile.id !== previous.profile.id)
        throw new MobileError("identity", "La cuenta de la sesión cambió. Vuelve a entrar.", 401);
      await this.persist(next, gen);
      this.current(gen);
      this.publish({ status: "authenticated", mode: "online", session: next });
      return next;
    })();
    this.renewal = operation;
    try {
      return await operation;
    } finally {
      if (this.renewal === operation) this.renewal = null;
    }
  }
  private async endSession(gen: number) {
    if (gen !== this.generation) return;
    const expired = ++this.generation;
    this.renewal = null;
    this.publish({ status: "booting" });
    try {
      await this.serialize(() => {
        this.current(expired);
        return this.store.remove();
      });
      this.current(expired);
      this.publish({ status: "signedOut", message: "Tu sesión terminó. Vuelve a entrar." });
    } catch {
      if (expired === this.generation)
        this.publish({
          status: "blocked",
          message: "No pudimos limpiar la sesión. Reintenta la salida.",
        });
    }
  }
  private bearer(session: ClientSession) {
    if (!session.accessToken)
      throw new MobileError("offline", "Vuelve a conectar para consultar el servidor.");
    return session.accessToken;
  }
  async reconnect(): Promise<void> {
    const gen = this.generation;
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    try {
      await this.renew(this.state.session, gen);
    } catch (error) {
      if (gen === this.generation && error instanceof MobileError && error.status === 401)
        await this.endSession(gen);
      throw error;
    }
  }
  private async read(path: string, body?: unknown): Promise<unknown> {
    const gen = this.generation;
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    if (this.state.mode === "offline")
      throw new MobileError(
        "offline",
        "Vuelve a conectar para consultar el servidor. Tus datos locales se conservan.",
      );
    let session = this.state.session;
    let renewing = false;
    try {
      let refreshed = false;
      if (!session.accessToken || (session.expiresAt ?? 0) * 1000 <= this.clock() + 30000) {
        renewing = true;
        session = await this.renew(session, gen);
        renewing = false;
        refreshed = true;
      }
      let data: unknown;
      try {
        data = await this.http(path, body, this.bearer(session));
      } catch (error) {
        if (!(error instanceof MobileError) || error.status !== 401 || refreshed) throw error;
        this.current(gen);
        const current = this.state;
        if (
          current.status === "authenticated" &&
          current.session.accessToken !== session.accessToken
        )
          session = current.session;
        else {
          renewing = true;
          session = await this.renew(session, gen);
          renewing = false;
        }
        data = await this.http(path, body, this.bearer(session));
      }
      this.current(gen);
      return data;
    } catch (error) {
      if (gen === this.generation && error instanceof MobileError && error.status === 401)
        await this.endSession(gen);
      else if (
        gen === this.generation &&
        this.state.status === "authenticated" &&
        error instanceof MobileError &&
        (error.code === "network" || (renewing && transientConnection(error)))
      )
        this.connectionLost();
      throw error;
    }
  }
  private async access<T>(
    path: string,
    input: unknown,
    schema: { safeParse(data: unknown): { success: true; data: T } | { success: false } },
  ): Promise<T> {
    if (this.state.status !== "signedOut")
      throw new MobileError(
        "identity",
        "Antes de usar otro acceso, debes salir desde Cuenta y resolver tus registros pendientes.",
      );
    const generation = this.generation;
    const data = await this.http(path, input);
    this.current(generation);
    const result = schema.safeParse(data);
    if (!result.success)
      throw new MobileError("version", "Esta respuesta necesita una versión compatible de la app.");
    return result.data;
  }
  async invitation(token: string) {
    return this.access("auth/invitation", { token }, mobileInvitationSchema);
  }
  async registerInvitation(input: { token: string; name: string; password: string }) {
    return this.access("auth/register", input, mobileRegisteredSchema);
  }
  async resetPassword(input: { token: string; password: string }) {
    return this.access("auth/reset-password", input, mobilePasswordResetSchema);
  }
  async deleteAccount(confirmation: string, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. No se envió la eliminación de otra cuenta.",
      );
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const id = this.state.session.profile.id;
    const result = mobileAccountDeletedSchema.parse(
      await this.read("account/delete", { confirmation }),
    );
    if (result.userId !== id)
      throw new MobileError(
        "identity",
        "El servidor no confirmó esta cuenta. Conservamos el registro local.",
      );
  }
  async trainingDownload() {
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const userId = this.state.session.profile.id;
    const parsed = bundleSchema.safeParse(await this.read("training-download"));
    if (!parsed.success)
      throw new MobileError(
        "version",
        "La descarga requiere una versión compatible. Conservamos tu copia anterior.",
      );
    if (parsed.data.userId !== userId)
      throw new MobileError(
        "identity",
        "La descarga no corresponde a tu cuenta. Conservamos tu copia anterior.",
      );
    return parsed.data;
  }
  async downloadWeek() {
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const userId = this.state.session.profile.id;
    const record = parseNativeWeek(await this.read("week/download"), userId);
    if (!record?.pack)
      throw new MobileError(
        "identity",
        "La descarga está incompleta o no corresponde a tu cuenta. Reintenta.",
      );
    return record.pack;
  }
  async week() {
    return mobileWeekSchema.parse(await this.read("week"));
  }
  private commentPath(workoutId: string) {
    if (!z.uuid().safeParse(workoutId).success)
      throw new MobileError("not_found", "Ese entrenamiento no está disponible.", 404);
    return "workouts/" + workoutId + "/comments";
  }
  private confirmedComment(workoutId: string, actual: string, id?: string, actualId?: string) {
    if (workoutId !== actual || (id !== undefined && id !== actualId))
      throw new MobileError(
        "identity",
        "El servidor no confirmó este comentario. Conservamos el intento.",
      );
  }
  async unreadComments() {
    return mobileUnreadCommentsSchema.parse(await this.read("comments/unread"));
  }
  async commentsPage(workoutId: string, cursor?: string) {
    const result = mobileCommentsSchema.parse(
      await this.read(
        this.commentPath(workoutId) + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      ),
    );
    this.confirmedComment(workoutId, result.workoutId);
    return result;
  }
  async publishComment(workoutId: string, id: string, body: string, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos el comentario para enviarlo con su cuenta original.",
      );
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("invalid_input", "El intento de comentario no es válido.");
    const result = mobileCommentSentSchema.parse(
      await this.read(this.commentPath(workoutId), { id, body }),
    );
    this.confirmedComment(workoutId, result.workoutId, id, result.id);
    return result;
  }
  async removeComment(workoutId: string, id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("invalid_input", "El comentario no es válido.");
    const result = mobileCommentRemovedSchema.parse(
      await this.read(this.commentPath(workoutId) + "/delete", { id }),
    );
    this.confirmedComment(workoutId, result.workoutId, id, result.id);
    return result;
  }
  async readComments(workoutId: string) {
    const result = mobileCommentsReadSchema.parse(
      await this.read(this.commentPath(workoutId) + "/read", {}),
    );
    this.confirmedComment(workoutId, result.workoutId);
    return result;
  }
  async assignedRoutine(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Esa rutina no está disponible.", 404);
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const owner = this.state.session.profile.id,
      generation = this.generation,
      normalized = id.toLowerCase();
    const parsed = assignedContextSchema.safeParse(
      await this.read("training-sessions/" + normalized),
    );
    this.current(generation);
    if (!parsed.success)
      throw new MobileError(
        "version",
        "La rutina recibida necesita una versión compatible de la app.",
      );
    if (parsed.data.userId !== owner || parsed.data.session.id !== normalized)
      throw new MobileError("identity", "La rutina recibida no coincide con tu cuenta. Reintenta.");
    return parsed.data;
  }
  async routine(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Esa rutina no está disponible.", 404);
    const result = mobileRoutineSchema.parse(await this.read("sessions/" + id));
    if (result.session.id !== id)
      throw new MobileError("identity", "La rutina recibida no coincide. Reintenta.");
    return result;
  }
  private async readPersonalLibrary(path: "library" | "library/export") {
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const userId = this.state.session.profile.id;
    const parsed = personalLibrarySchema.safeParse(await this.read(path));
    if (!parsed.success)
      throw new MobileError(
        "version",
        "Tus rutinas recibidas no son compatibles. Actualiza la app y reintenta.",
      );
    if (parsed.data.userId !== userId)
      throw new MobileError("identity", "Las rutinas recibidas no corresponden a tu cuenta.");
    return parsed.data;
  }
  async personalLibrary() {
    return this.readPersonalLibrary("library");
  }
  async exportPersonalLibrary() {
    return this.readPersonalLibrary("library/export");
  }
  async mutatePersonalLibrary(value: PersonalMutation, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos los cambios para su cuenta original.",
      );
    const input = personalMutationSchema.safeParse(value);
    if (!input.success)
      throw new MobileError("invalid_input", "Revisa los datos de la rutina.", 400);
    if (input.data.operation.endsWith("_reorder") && input.data.targetId !== expectedUserId)
      throw new MobileError("identity", "El orden no corresponde a tu cuenta.");
    const parsed = personalMutationResultSchema.safeParse(
      await this.read("library/mutations", input.data),
    );
    if (!parsed.success)
      throw new MobileError(
        "version",
        "No pudimos interpretar la confirmación. Conserva tus cambios y reintenta.",
      );
    const result = parsed.data;
    if (result.requestId !== input.data.requestId || result.targetId !== input.data.targetId)
      throw new MobileError(
        "identity",
        "El servidor no confirmó este intento. Conservamos tus cambios.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return result;
  }
  private async readTrainingLibrary(path: "training-library" | "training-library/export") {
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const userId = this.state.session.profile.id,
      generation = this.generation;
    let value: unknown;
    try {
      value = await this.read(path);
    } catch (error) {
      this.current(generation);
      if (!(error instanceof MobileError) || ![404, 503].includes(error.status)) throw error;
      const legacy = await this.readPersonalLibrary(
        path === "training-library" ? "library" : "library/export",
      );
      value = upgradePersonalLibrary(legacy);
    }
    this.current(generation);
    const parsed = typedPersonalLibrarySchema.safeParse(value);
    if (!parsed.success)
      throw new MobileError(
        "version",
        "Tus rutinas recibidas no son compatibles. Actualiza la app y reintenta.",
      );
    if (parsed.data.userId !== userId)
      throw new MobileError("identity", "Las rutinas recibidas no corresponden a tu cuenta.");
    return parsed.data;
  }
  async trainingLibrary() {
    return this.readTrainingLibrary("training-library");
  }
  private async readPersonalExercises(path: "personal-exercises" | "personal-exercises/export") {
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const userId = this.state.session.profile.id;
    const parsed = personalExerciseLibrarySchema.safeParse(await this.read(path));
    if (!parsed.success)
      throw new MobileError(
        "version",
        "Tus ejercicios necesitan una versión compatible. Conserva tus cambios y actualiza la app.",
      );
    if (parsed.data.userId !== userId)
      throw new MobileError("identity", "Los ejercicios recibidos no corresponden a tu cuenta.");
    return parsed.data;
  }
  async personalExercises() {
    return this.readPersonalExercises("personal-exercises");
  }
  async exportPersonalExercises() {
    return this.readPersonalExercises("personal-exercises/export");
  }
  async mutatePersonalExercise(value: PersonalExerciseMutation, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos los cambios para su cuenta original.",
      );
    const input = personalExerciseMutationSchema.safeParse(value);
    if (!input.success)
      throw new MobileError("invalid_input", "Revisa los datos del ejercicio.", 400);
    const result = personalExerciseResultSchema.safeParse(
      await this.read("personal-exercises/mutations", input.data),
    );
    if (!result.success)
      throw new MobileError(
        "version",
        "No pudimos interpretar la confirmación. Conserva tus cambios y reintenta.",
      );
    if (
      result.data.requestId !== input.data.requestId ||
      result.data.targetId !== input.data.targetId
    )
      throw new MobileError(
        "identity",
        "El servidor no confirmó este intento. Conservamos tus cambios.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return result.data;
  }
  async exportTrainingLibrary() {
    return this.readTrainingLibrary("training-library/export");
  }
  async mutateTrainingLibrary(value: TypedPersonalMutation, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos los cambios para su cuenta original.",
      );
    const input = typedPersonalMutationSchema.safeParse(value);
    if (!input.success)
      throw new MobileError("invalid_input", "Revisa los datos de la rutina.", 400);
    if (input.data.operation.endsWith("_reorder") && input.data.targetId !== expectedUserId)
      throw new MobileError("identity", "El orden no corresponde a tu cuenta.");
    const parsed = typedPersonalMutationResultSchema.safeParse(
      await this.read("training-library/mutations", input.data),
    );
    if (!parsed.success)
      throw new MobileError(
        "version",
        "No pudimos interpretar la confirmación. Conserva tus cambios y reintenta.",
      );
    const result = parsed.data;
    if (result.requestId !== input.data.requestId || result.targetId !== input.data.targetId)
      throw new MobileError(
        "identity",
        "El servidor no confirmó este intento. Conservamos tus cambios.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return result;
  }
  async exerciseCatalog() {
    const parsed = mobileCatalogSchema.safeParse(await this.read("exercises"));
    if (!parsed.success)
      throw new MobileError(
        "version",
        "La biblioteca recibida no es compatible. Actualiza la app y reintenta.",
      );
    return parsed.data;
  }
  async trainingCatalog() {
    const generation = this.generation;
    try {
      const result = typedCatalogSchema.safeParse(await this.read("training-catalog"));
      this.current(generation);
      if (!result.success)
        throw new MobileError(
          "version",
          "La biblioteca recibida necesita una versión compatible de la app.",
        );
      return result.data;
    } catch (error) {
      if (!(error instanceof MobileError) || ![404, 503].includes(error.status)) throw error;
      this.current(generation);
      const legacy = await this.exerciseCatalog();
      this.current(generation);
      return typedCatalogSchema.parse({
        version: 2,
        exercises: legacy.exercises.map((e) => ({ ...e, recordType: null })),
      });
    }
  }
  async trainingExerciseDetail(id: string, cursor?: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Ese ejercicio no está disponible.", 404);
    if (cursor !== undefined && !parseExerciseHistoryCursor(cursor))
      throw new MobileError("invalid_input", "El filtro de historial no es válido.", 400);
    const generation = this.generation,
      normalized = id.toLowerCase();
    try {
      const result = typedExerciseDetailSchema.safeParse(
        await this.read(
          "training-catalog/" +
            normalized +
            (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
        ),
      );
      this.current(generation);
      if (!result.success)
        throw new MobileError(
          "version",
          "La ficha recibida necesita una versión compatible de la app.",
        );
      if (result.data.exercise.id !== normalized)
        throw new MobileError("identity", "El ejercicio recibido no coincide. Reintenta.");
      return result.data;
    } catch (error) {
      if (!(error instanceof MobileError) || ![404, 503].includes(error.status)) throw error;
      this.current(generation);
      const legacy = await this.exerciseDetail(normalized, cursor);
      this.current(generation);
      return legacy;
    }
  }
  async exerciseDetail(id: string, cursor?: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Ese ejercicio no está disponible.", 404);
    if (cursor !== undefined && !parseExerciseHistoryCursor(cursor))
      throw new MobileError("invalid_input", "El filtro de historial no es válido.", 400);
    const parsed = mobileExerciseDetailSchema.safeParse(
      await this.read("exercises/" + id + (cursor ? "?cursor=" + encodeURIComponent(cursor) : "")),
    );
    if (!parsed.success)
      throw new MobileError(
        "version",
        "La ficha recibida no es compatible. Actualiza la app y reintenta.",
      );
    const result = parsed.data;
    if (result.exercise.id.toLowerCase() !== id.toLowerCase())
      throw new MobileError("identity", "El ejercicio recibido no coincide. Reintenta.");
    return result;
  }
  async history(cursor?: string) {
    return mobileHistorySchema.parse(
      await this.read("workouts" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : "")),
    );
  }
  async workout(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Ese entrenamiento no está disponible.", 404);
    const value = mobileWorkoutSchema.parse(await this.read("workouts/" + id));
    if (value.workout.id !== id)
      throw new MobileError("identity", "El entrenamiento recibido no coincide.");
    return value;
  }
  async progressDetail(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Ese ejercicio no está disponible.", 404);
    const value = mobileProgressDetailSchema.parse(await this.read("progress/" + id));
    if (value.exercise.exerciseId !== id)
      throw new MobileError("identity", "El ejercicio recibido no coincide. Reintenta.");
    return value;
  }
  async trainingProgress() {
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const userId = this.state.session.profile.id,
      generation = this.generation;
    const result = trainingProgressSchema.safeParse(await this.read("training-progress"));
    this.current(generation);
    if (!result.success)
      throw new MobileError(
        "version",
        "El progreso necesita una versión compatible. Actualiza la app.",
      );
    if (result.data.userId !== userId)
      throw new MobileError("identity", "El historial recibido no corresponde a tu cuenta.");
    return result.data;
  }
  async workoutCorrection(id: string, expectedUserId?: string) {
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const userId = this.state.session.profile.id,
      generation = this.generation;
    if (expectedUserId !== undefined && expectedUserId !== userId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos la corrección para su cuenta original.",
      );
    const parsedId = z
      .uuid()
      .transform((v) => v.toLowerCase())
      .safeParse(id);
    if (!parsedId.success)
      throw new MobileError("not_found", "Ese entrenamiento no está disponible.", 404);
    const snapshot = workoutCorrectionSnapshotSchema.safeParse(
      await this.read("workout-corrections/" + parsedId.data),
    );
    this.current(generation);
    if (!snapshot.success)
      throw new MobileError(
        "version",
        "El resultado necesita una versión compatible. Conservamos tus cambios.",
      );
    if (snapshot.data.userId !== userId || snapshot.data.workout.id !== parsedId.data)
      throw new MobileError(
        "identity",
        "El resultado recibido no corresponde a esta cuenta y entrenamiento.",
      );
    return snapshot.data;
  }
  async correctWorkout(value: WorkoutCorrection, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos la corrección para su cuenta original.",
      );
    const generation = this.generation,
      input = workoutCorrectionSchema.safeParse(value);
    if (!input.success)
      throw new MobileError("invalid_input", "Revisa la corrección del entrenamiento.", 400);
    const receipt = workoutCorrectionReceiptSchema.safeParse(
      await this.read("workout-corrections", input.data),
    );
    this.current(generation);
    if (!receipt.success)
      throw new MobileError(
        "version",
        "No pudimos interpretar la confirmación. Conserva tus cambios y reintenta.",
      );
    if (
      receipt.data.requestId !== input.data.requestId ||
      receipt.data.workoutId !== input.data.workoutId ||
      receipt.data.revision <= input.data.expectedRevision
    )
      throw new MobileError(
        "identity",
        "El servidor no confirmó esta corrección. Conservamos tus cambios.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return receipt.data;
  }
  async workoutRemoval(id: string, expectedUserId?: string) {
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    const userId = this.state.session.profile.id,
      generation = this.generation;
    if (expectedUserId !== undefined && expectedUserId !== userId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos la eliminación para su cuenta original.",
      );
    const parsedId = z
      .uuid()
      .transform((v) => v.toLowerCase())
      .safeParse(id);
    if (!parsedId.success)
      throw new MobileError("not_found", "Ese entrenamiento no está disponible.", 404);
    const snapshot = workoutRemovalSnapshotSchema.safeParse(
      await this.read("workout-removals/" + parsedId.data),
    );
    this.current(generation);
    if (!snapshot.success)
      throw new MobileError(
        "version",
        "El resultado necesita una versión compatible. Conservamos tus cambios.",
      );
    if (snapshot.data.userId !== userId || snapshot.data.workout.id !== parsedId.data)
      throw new MobileError(
        "identity",
        "El resultado recibido no corresponde a esta cuenta y entrenamiento.",
      );
    return snapshot.data;
  }
  async removeWorkout(value: WorkoutRemoval, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos la eliminación para su cuenta original.",
      );
    const generation = this.generation,
      input = workoutRemovalSchema.safeParse(value);
    if (!input.success)
      throw new MobileError("invalid_input", "Revisa la eliminación del entrenamiento.", 400);
    const receipt = workoutRemovalReceiptSchema.safeParse(
      await this.read("workout-removals", input.data),
    );
    this.current(generation);
    if (!receipt.success)
      throw new MobileError(
        "version",
        "No pudimos interpretar la confirmación. Conserva tus cambios y reintenta.",
      );
    if (
      receipt.data.requestId !== input.data.requestId ||
      receipt.data.workoutId !== input.data.workoutId ||
      receipt.data.revision <= input.data.expectedRevision
    )
      throw new MobileError(
        "identity",
        "El servidor no confirmó esta eliminación. Conservamos tus cambios.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return receipt.data;
  }
  async progress() {
    return mobileProgressSchema.parse(await this.read("progress"));
  }
  /** Medidas corporales propias (más recientes primero). */
  async measurements() {
    const parsed = mobileMeasurementsSchema.safeParse(await this.read("measurements"));
    if (!parsed.success)
      throw new MobileError(
        "version",
        "Tus medidas no son compatibles. Actualiza la app y reintenta.",
      );
    return parsed.data.items;
  }
  /** Guarda las medidas de un día; un registro existente exige `replace` tras confirmarlo (409 «exists»). */
  async saveMeasurement(measurement: MobileMeasurementInput, replace: boolean) {
    const parsed = mobileMeasurementResultSchema.safeParse(
      await this.read("measurements", { version: 1, measurement, replace }),
    );
    if (!parsed.success)
      throw new MobileError("version", "No pudimos confirmar tus medidas. Reintenta.");
    return parsed.data.status;
  }
  async deleteMeasurement(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Ese registro ya no existe.", 404);
    await this.read("measurements/delete", { version: 1, id });
  }
  /** Alumnos del coach con señales de atención (solo lectura; solo para el rol coach). */
  async students() {
    const parsed = mobileStudentsSchema.safeParse(await this.read("students"));
    if (!parsed.success)
      throw new MobileError(
        "version",
        "La lista de alumnos no es compatible. Actualiza la app y reintenta.",
      );
    return parsed.data;
  }
  /** Check-in semanal de la semana vigente (la semana la decide el servidor). */
  async checkin() {
    const parsed = mobileCheckinSchema.safeParse(await this.read("checkins"));
    if (!parsed.success)
      throw new MobileError(
        "version",
        "Tu check-in no es compatible. Actualiza la app y reintenta.",
      );
    return parsed.data;
  }
  /** Crea o corrige el check-in de la semana; repetir el envío no duplica. */
  async saveCheckin(answers: MobileCheckinAnswers) {
    const input = mobileCheckinAnswersSchema.safeParse(answers);
    if (!input.success)
      throw new MobileError("invalid_input", "Revisa las respuestas del check-in.", 400);
    const parsed = mobileCheckinSchema.safeParse(
      await this.read("checkins", { version: 1, answers: input.data }),
    );
    if (!parsed.success || parsed.data.answers === null)
      throw new MobileError("version", "No pudimos confirmar tu check-in. Reintenta.");
    return parsed.data;
  }
  /** Racha de semanas cumplidas y logros del propio alumno (solo lectura). */
  async achievements() {
    const parsed = mobileAchievementsSchema.safeParse(await this.read("achievements"));
    if (!parsed.success)
      throw new MobileError(
        "version",
        "Tus logros no son compatibles. Actualiza la app y reintenta.",
      );
    return parsed.data;
  }
  async savePersonalWorkout(payload: PersonalWorkoutPayload, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos el entrenamiento para su cuenta original.",
      );
    const input = personalWorkoutPayloadSchema.safeParse(payload);
    if (!input.success)
      throw new MobileError("invalid_input", "Revisa el entrenamiento antes de enviarlo.", 400);
    const parsed = mobileSaveSchema.safeParse(
      await this.read("personal-workouts", { version: 1, payload: input.data }),
    );
    if (!parsed.success)
      throw new MobileError(
        "version",
        "La confirmación no es compatible. Conservamos tu registro.",
      );
    if (parsed.data.workoutId !== input.data.id)
      throw new MobileError(
        "identity",
        "El servidor no confirmó este entrenamiento. Conservamos el registro.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return parsed.data;
  }
  async saveRecording(payload: RecordingPayload, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos el entrenamiento para su cuenta original.",
      );
    const input = recordingPayloadSchema.safeParse(payload);
    if (!input.success)
      throw new MobileError(
        "invalid_input",
        "Revisa el entrenamiento y su estructura antes de enviarlo.",
        400,
      );
    const parsed = recordingSaveSchema.safeParse(
      await this.read("recordings", { version: 2, payload: input.data }),
    );
    if (!parsed.success)
      throw new MobileError(
        "version",
        "La confirmación no es compatible. Conservamos tu registro.",
      );
    if (parsed.data.workoutId !== input.data.id)
      throw new MobileError(
        "identity",
        "El servidor no confirmó este entrenamiento. Conservamos el registro.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return parsed.data;
  }
  async typedWorkout(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Ese entrenamiento no está disponible.", 404);
    const normalized = id.toLowerCase();
    const result = typedWorkoutSchema.safeParse(await this.read("typed-recordings/" + normalized));
    if (!result.success)
      throw new MobileError("version", "Este resultado necesita una versión compatible de la app.");
    if (result.data.workout.id !== normalized)
      throw new MobileError("identity", "El entrenamiento recibido no coincide. Reintenta.");
    return result.data;
  }
  async workoutResult(id: string) {
    try {
      return await this.typedWorkout(id);
    } catch (error) {
      // Legacy results and an older server have no typed endpoint. A malformed
      // typed result, identity mismatch or expired session must never fall back.
      if (!(error instanceof MobileError) || ![404, 503].includes(error.status)) throw error;
      return this.workout(id);
    }
  }
  async saveTypedRecording(payload: TypedRecordingPayload, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos el entrenamiento para su cuenta original.",
      );
    const input = typedRecordingPayloadSchema.safeParse(payload);
    if (!input.success)
      throw new MobileError("invalid_input", "Revisa las métricas y notas antes de enviarlo.", 400);
    const result = typedRecordingSaveSchema.safeParse(
      await this.read("typed-recordings", { version: 3, payload: input.data }),
    );
    if (!result.success)
      throw new MobileError(
        "version",
        "La confirmación no es compatible. Conservamos tu registro.",
      );
    if (result.data.workoutId !== input.data.id)
      throw new MobileError(
        "identity",
        "El servidor no confirmó este entrenamiento. Conservamos el registro.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return result.data;
  }
  async saveWorkout(payload: WorkoutPayload, expectedUserId: string) {
    if (this.state.status !== "authenticated" || this.state.session.profile.id !== expectedUserId)
      throw new MobileError(
        "identity",
        "La cuenta cambió. Conservamos el entrenamiento para enviarlo con su cuenta original.",
      );
    const value = mobileSaveSchema.parse(await this.read("workouts", { version: 1, payload }));
    if (value.workoutId !== payload.id)
      throw new MobileError(
        "identity",
        "El servidor no confirmó este entrenamiento. Conservamos el registro.",
      );
    this.dataRevision++;
    this.listeners.forEach((fn) => fn());
    return value;
  }
}
