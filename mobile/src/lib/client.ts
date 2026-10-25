import { parseNativeWeek } from "../../../src/lib/mobile/download-contract";
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
  async routine(id: string) {
    if (!z.uuid().safeParse(id).success)
      throw new MobileError("not_found", "Esa rutina no está disponible.", 404);
    const result = mobileRoutineSchema.parse(await this.read("sessions/" + id));
    if (result.session.id !== id)
      throw new MobileError("identity", "La rutina recibida no coincide. Reintenta.");
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
  async progress() {
    return mobileProgressSchema.parse(await this.read("progress"));
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
