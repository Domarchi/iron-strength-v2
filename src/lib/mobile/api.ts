import { z } from "zod";
import { workoutPayloadSchema } from "../workout/payload";
import type { SaveWorkoutResult } from "../data/save-workout";
import type { MobileHistory, MobileWorkout, MobileProgress } from "./contracts";
import type { MobileProfile, MobileRoutine, MobileSession, MobileWeek } from "./contracts";

type LoginOutcome =
  | { ok: true; session: MobileSession }
  | { ok: false; reason: "invalid" | "inactive" }
  | { ok: false; reason: "locked"; retryAfterSeconds: number };
export type MobileIdentity = {
  profile: MobileProfile;
  week(): Promise<MobileWeek>;
  routine(id: string): Promise<MobileRoutine | null>;
  history(cursor?: string): Promise<MobileHistory>;
  workout(id: string): Promise<MobileWorkout | null>;
  progress(): Promise<MobileProgress>;
  save(payload: z.infer<typeof workoutPayloadSchema>): Promise<SaveWorkoutResult>;
};
export type MobileApiDependencies = {
  login(input: { email: string; password: string }): Promise<LoginOutcome>;
  refresh(token: string): Promise<MobileSession | null>;
  authorize(token: string): Promise<MobileIdentity | null>;
  logout(token: string, refresh: string): Promise<void>;
};
const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(value, { status, headers: { ...HEADERS, ...headers } });
const failure = (code: string, message: string, status: number, seconds?: number) =>
  json(
    { version: 1, error: { code, message, ...(seconds ? { retryAfterSeconds: seconds } : {}) } },
    status,
    seconds ? { "Retry-After": String(seconds) } : {},
  );
const unavailable = () =>
  failure("unavailable", "No pudimos completar la solicitud. Reintenta.", 503);
const unauthorized = () => failure("unauthorized", "Vuelve a iniciar sesión.", 401);
const loginInput = z
  .object({ email: z.email().max(320), password: z.string().min(1).max(200) })
  .strict();
const saveInput = z.object({ version: z.literal(1), payload: workoutPayloadSchema }).strict();
const refreshInput = z.object({ refreshToken: z.string().min(1).max(1024) }).strict();
const tokenFrom = (request: Request) => {
  const value = request.headers.get("Authorization");
  if (!value || value.length > 16400) return null;
  return /^Bearer ([a-z0-9._~-]+)$/i.exec(value)?.[1] ?? null;
};
async function body(
  request: Request,
  maximum = 16384,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (Number(request.headers.get("Content-Length")) > maximum)
    return { ok: false, response: failure("too_large", "La solicitud es demasiado grande.", 413) };
  const reader = request.body?.getReader();
  if (!reader)
    return { ok: false, response: failure("invalid_input", "Revisa los datos enviados.", 400) };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        return {
          ok: false,
          response: failure("too_large", "La solicitud es demasiado grande.", 413),
        };
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, response: failure("invalid_input", "Revisa los datos enviados.", 400) };
  } finally {
    reader.releaseLock();
  }
}
export function createMobileApi(deps: MobileApiDependencies) {
  return {
    async login(request: Request): Promise<Response> {
      try {
        const input = await body(request);
        if (!input.ok) return input.response;
        const parsed = loginInput.safeParse(input.value);
        if (!parsed.success)
          return failure("invalid_input", "Revisa el correo y la contraseña.", 400);
        const result = await deps.login(parsed.data);
        if (result.ok) return json(result.session);
        if (result.reason === "locked")
          return failure(
            "locked",
            "Demasiados intentos. Espera antes de reintentar.",
            429,
            result.retryAfterSeconds,
          );
        if (result.reason === "inactive")
          return failure("inactive", "Tu cuenta está desactivada. Habla con tu coach.", 401);
        return failure("invalid_credentials", "Correo o contraseña incorrectos.", 401);
      } catch {
        return unavailable();
      }
    },
    async refresh(request: Request): Promise<Response> {
      try {
        const input = await body(request);
        if (!input.ok) return input.response;
        const parsed = refreshInput.safeParse(input.value);
        if (!parsed.success) return failure("invalid_input", "Revisa los datos enviados.", 400);
        const session = await deps.refresh(parsed.data.refreshToken);
        return session ? json(session) : unauthorized();
      } catch {
        return unavailable();
      }
    },
    async logout(request: Request): Promise<Response> {
      try {
        const token = tokenFrom(request);
        if (!token) return unauthorized();
        const input = await body(request);
        if (!input.ok) return input.response;
        const parsed = refreshInput.safeParse(input.value);
        if (!parsed.success) return failure("invalid_input", "Revisa los datos enviados.", 400);
        await deps.logout(token, parsed.data.refreshToken);
        return json({ version: 1, ok: true });
      } catch {
        return unavailable();
      }
    },
    async week(request: Request): Promise<Response> {
      try {
        const token = tokenFrom(request);
        if (!token) return unauthorized();
        const identity = await deps.authorize(token);
        return identity ? json(await identity.week()) : unauthorized();
      } catch {
        return unavailable();
      }
    },
    async history(request: Request): Promise<Response> {
      try {
        const token = tokenFrom(request);
        if (!token) return unauthorized();
        const identity = await deps.authorize(token);
        if (!identity) return unauthorized();
        const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
        if (cursor && !z.iso.datetime({ offset: true }).safeParse(cursor).success)
          return failure("invalid_input", "La página solicitada no es válida.", 400);
        return json(await identity.history(cursor));
      } catch {
        return unavailable();
      }
    },
    async workout(request: Request, id: string): Promise<Response> {
      try {
        const token = tokenFrom(request);
        if (!token) return unauthorized();
        const identity = await deps.authorize(token);
        if (!identity) return unauthorized();
        if (!z.uuid().safeParse(id).success)
          return failure("not_found", "Ese entrenamiento no está disponible.", 404);
        const result = await identity.workout(id);
        return result
          ? json(result)
          : failure("not_found", "Ese entrenamiento no está disponible.", 404);
      } catch {
        return unavailable();
      }
    },
    async progress(request: Request): Promise<Response> {
      try {
        const token = tokenFrom(request);
        if (!token) return unauthorized();
        const identity = await deps.authorize(token);
        return identity ? json(await identity.progress()) : unauthorized();
      } catch {
        return unavailable();
      }
    },
    async save(request: Request): Promise<Response> {
      try {
        const token = tokenFrom(request);
        if (!token) return unauthorized();
        const identity = await deps.authorize(token);
        if (!identity) return unauthorized();
        const input = await body(request, 262144);
        if (!input.ok) return input.response;
        const parsed = saveInput.safeParse(input.value);
        if (!parsed.success)
          return failure("invalid_input", "Revisa las series, el esfuerzo y la nota.", 400);
        const result = await identity.save(parsed.data.payload);
        if (!result.ok) {
          const messages: Record<string, string> = {
            alternative_unavailable:
              "La alternativa ya no está autorizada. Conservamos tu entrenamiento para revisarlo.",
            wrong_week:
              "La sesión no corresponde a la semana en que comenzaste. Conservamos tu registro.",
            no_sets: "Completa al menos una serie.",
            not_found: "La rutina ya no está disponible. Conservamos tu registro.",
            id_taken: "El identificador no corresponde a tu cuenta.",
            forbidden: "No tienes permiso para guardar esta rutina.",
            invalid: "Revisa las series antes de volver a enviar.",
          };
          return failure(result.reason, messages[result.reason], 422);
        }
        return json({ version: 1, ...result, workoutId: parsed.data.payload.id });
      } catch {
        return unavailable();
      }
    },
    async routine(request: Request, id: string): Promise<Response> {
      try {
        const token = tokenFrom(request);
        if (!token) return unauthorized();
        const identity = await deps.authorize(token);
        if (!identity) return unauthorized();
        if (!z.uuid().safeParse(id).success)
          return failure("not_found", "Esa rutina no está disponible.", 404);
        const result = await identity.routine(id);
        return result ? json(result) : failure("not_found", "Esa rutina no está disponible.", 404);
      } catch {
        return unavailable();
      }
    },
  };
}

export { body as readMobileBody, json as mobileJson, failure as mobileFailure };
