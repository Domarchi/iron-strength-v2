import { z } from "zod";
import {
  mobileErrorSchema,
  mobileRoutineSchema,
  mobileSessionSchema,
  mobileWeekSchema,
  mobileHistorySchema,
  mobileWorkoutSchema,
  mobileProgressSchema,
  mobileSaveSchema,
  mobileInvitationSchema,
  mobileRegisteredSchema,
  mobilePasswordResetSchema,
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
export type SessionState =
  | { status: "booting" }
  | { status: "signedOut"; message?: string }
  | { status: "blocked"; message: string }
  | { status: "authenticated"; session: MobileSession };
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
const vault = z
  .object({ version: z.literal(1), refreshToken: z.string().min(1).max(1024) })
  .strict();
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
      await this.store.set(JSON.stringify({ version: 1, refreshToken: session.refreshToken }));
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
      const next = this.session(
        await this.http("auth/refresh", { refreshToken: saved.data.refreshToken }),
      );
      this.current(gen);
      await this.persist(next, gen);
      this.current(gen);
      this.publish({ status: "authenticated", session: next });
    } catch (error) {
      if (gen !== this.generation) return;
      if (error instanceof MobileError && error.status === 401) {
        try {
          await this.serialize(() => this.store.remove());
          this.current(gen);
          this.publish({ status: "signedOut", message: "Tu sesión terminó. Vuelve a entrar." });
        } catch {
          if (gen === this.generation)
            this.publish({
              status: "blocked",
              message: "No pudimos limpiar la sesión. Reintenta la salida.",
            });
        }
      } else this.publish({ status: "blocked", message: message(error) });
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
      this.publish({ status: "authenticated", session: next });
    } catch (error) {
      if (gen === this.generation) this.publish({ status: "signedOut", message: message(error) });
      throw error;
    }
  }
  async logout(): Promise<void> {
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
          previous.accessToken,
        );
      } catch {
        /* No se afirma revocación remota cuando falla el transporte. */
      }
    }
  }
  private async renew(previous: MobileSession, gen: number): Promise<MobileSession> {
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
      this.publish({ status: "authenticated", session: next });
      return next;
    })();
    this.renewal = operation;
    try {
      return await operation;
    } finally {
      if (this.renewal === operation) this.renewal = null;
    }
  }
  private async read(path: string, body?: unknown): Promise<unknown> {
    const gen = this.generation;
    if (this.state.status !== "authenticated")
      throw new MobileError("unauthorized", "Vuelve a iniciar sesión.", 401);
    let session = this.state.session;
    try {
      let refreshed = false;
      if (session.expiresAt * 1000 <= this.clock() + 30000) {
        session = await this.renew(session, gen);
        refreshed = true;
      }
      let data: unknown;
      try {
        data = await this.http(path, body, session.accessToken);
      } catch (error) {
        if (!(error instanceof MobileError) || error.status !== 401 || refreshed) throw error;
        this.current(gen);
        const current = this.state;
        session =
          current.status === "authenticated" && current.session.accessToken !== session.accessToken
            ? current.session
            : await this.renew(session, gen);
        data = await this.http(path, body, session.accessToken);
      }
      this.current(gen);
      return data;
    } catch (error) {
      if (gen === this.generation && error instanceof MobileError && error.status === 401) {
        const expired = ++this.generation;
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
  async week() {
    return mobileWeekSchema.parse(await this.read("week"));
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
  async progress() {
    return mobileProgressSchema.parse(await this.read("progress"));
  }
  async saveWorkout(payload: WorkoutPayload) {
    const value = mobileSaveSchema.parse(await this.read("workouts", { version: 1, payload }));
    if (value.workoutId !== payload.id)
      throw new MobileError(
        "identity",
        "El servidor no confirmó este entrenamiento. Conservamos el registro.",
      );
    return value;
  }
}
