import { describe, expect, it, vi } from "vitest";
import { createMobileApi, type MobileApiDependencies } from "./api";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ana",
  email: "ana@example.test",
  role: "student" as const,
};
const session = {
  version: 1 as const,
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: 2_000_000_000,
  profile: user,
};
function setup() {
  const week = vi.fn(async () => ({ version: 1 as const, kind: "no_program" as const }));
  const routine = vi.fn(async () => null);
  const history = vi.fn(async () => ({ version: 1 as const, items: [], nextCursor: null }));
  const workout = vi.fn(async () => null);
  const progress = vi.fn(async () => ({ version: 1 as const, exercises: [] }));
  const save = vi.fn(async () => ({ ok: true as const, status: "created" as const }));
  const deps: MobileApiDependencies = {
    login: vi.fn(async () => ({ ok: true as const, session })),
    refresh: vi.fn(async () => session),
    authorize: vi.fn(async (token) =>
      token === "valid" ? { profile: user, week, routine, history, workout, progress, save } : null,
    ),
    logout: vi.fn(async () => undefined),
  };
  return { api: createMobileApi(deps), deps, week, routine, history, workout, progress, save };
}
const request = (body: unknown, path = "auth/login") =>
  new Request("https://iron-strength-seven.vercel.app/api/mobile/v1/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("API móvil: identidad y privacidad", () => {
  it("login conserva tokens en JSON privado, sin cookies ni caché", async () => {
    const { api } = setup();
    const response = await api.login(request({ email: user.email, password: "correcta" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(await response.json()).toEqual(session);
  });
  it("credencial inválida y usuario inexistente comparten respuesta; bloqueo tiene Retry-After", async () => {
    const { api, deps } = setup();
    vi.mocked(deps.login)
      .mockResolvedValueOnce({ ok: false, reason: "invalid" })
      .mockResolvedValueOnce({ ok: false, reason: "locked", retryAfterSeconds: 90 });
    const invalid = await api.login(request({ email: user.email, password: "x" }));
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toMatchObject({
      version: 1,
      error: { code: "invalid_credentials" },
    });
    const locked = await api.login(request({ email: user.email, password: "x" }));
    expect(locked.status).toBe(429);
    expect(locked.headers.get("Retry-After")).toBe("90");
  });
  it("rechaza cuerpo demasiado grande y JSON inválido antes de autenticar", async () => {
    const { api, deps } = setup();
    expect((await api.login(request({ password: "x".repeat(17000) }))).status).toBe(413);
    expect(
      (await api.login(new Request("https://example.test", { method: "POST", body: "{" }))).status,
    ).toBe(400);
    expect(deps.login).not.toHaveBeenCalled();
  });
  it("rechaza sin bearer y token inválido, sin leer datos", async () => {
    const { api, week } = setup();
    for (const token of [null, "bad"]) {
      const r = await api.week(
        new Request("https://example.test", {
          headers: token ? { Authorization: "Bearer " + token } : {},
        }),
      );
      expect(r.status).toBe(401);
      expect(r.headers.get("Cache-Control")).toContain("no-store");
    }
    expect(week).not.toHaveBeenCalled();
  });
  it("la identidad no procede de alumno/query; una sesión ajena no revela contexto", async () => {
    const { api, week, routine } = setup();
    const headers = { Authorization: "Bearer valid" };
    const r = await api.week(new Request("https://example.test?alumno=otro", { headers }));
    expect(r.status).toBe(200);
    expect(week).toHaveBeenCalledWith();
    const missing = await api.routine(
      new Request("https://example.test", { headers }),
      "22222222-2222-4222-8222-222222222222",
    );
    expect(missing.status).toBe(404);
    expect(routine).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });
  it("un fallo interno es genérico y no expone detalles", async () => {
    const { api, deps } = setup();
    vi.mocked(deps.authorize).mockRejectedValue(Error("secret-private-host"));
    const r = await api.week(
      new Request("https://example.test", { headers: { Authorization: "Bearer valid" } }),
    );
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("secret-private-host");
  });
});

it("historial, detalle y progreso exigen bearer y no toman alumno del query", async () => {
  const x = setup();
  const req = new Request("https://example.test?studentId=other", {
    headers: { Authorization: "Bearer valid" },
  });
  expect((await x.api.history(req)).status).toBe(200);
  expect(x.history).toHaveBeenCalledWith(undefined);
  expect((await x.api.progress(req)).status).toBe(200);
  expect(x.progress).toHaveBeenCalledWith();
  expect((await x.api.workout(req, "22222222-2222-4222-8222-222222222222")).status).toBe(404);
  for (const call of [
    () => x.api.history(new Request("https://example.test")),
    () => x.api.progress(new Request("https://example.test")),
    () => x.api.workout(new Request("https://example.test"), user.id),
  ])
    expect((await call()).status).toBe(401);
});
it("rechaza cursor inválido antes de consultar historial", async () => {
  const x = setup();
  expect(
    (
      await x.api.history(
        new Request("https://example.test?cursor=no-date", {
          headers: { Authorization: "Bearer valid" },
        }),
      )
    ).status,
  ).toBe(400);
  expect(x.history).not.toHaveBeenCalled();
});
it("guardado usa identidad autenticada, valida contenido y confirma ID estable", async () => {
  const x = setup();
  const payload = {
    id: user.id,
    programId: user.id,
    programSessionId: user.id,
    sessionLabel: "A",
    startedAt: "2026-10-24T15:00:00Z",
    finishedAt: "2026-10-24T16:00:00Z",
    durationSeconds: 3600,
    sets: [
      {
        exerciseId: user.id,
        exerciseName: "Sentadilla",
        position: 0,
        setNumber: 1,
        weightKg: 20,
        reps: 8,
        isWarmup: false,
      },
    ],
  };
  const authPost = (v: unknown) =>
    new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
      body: JSON.stringify(v),
    });
  const r = await x.api.save(authPost({ version: 1, payload }));
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ ok: true, status: "created", workoutId: user.id });
  expect(x.save).toHaveBeenCalledWith(payload);
  expect((await x.api.save(authPost({ version: 1, payload, userId: "other" }))).status).toBe(400);
  expect(
    (
      await x.api.save(
        authPost({
          version: 1,
          payload: { ...payload, sets: [{ ...payload.sets[0], weightKg: 501 }] },
        }),
      )
    ).status,
  ).toBe(400);
  expect(x.save).toHaveBeenCalledTimes(1);
});
it("el registro admite 300 series por encima de 16 KiB y rechaza más de 256 KiB", async () => {
  const x = setup();
  const payload = {
    id: user.id,
    programId: user.id,
    programSessionId: user.id,
    sessionLabel: "A",
    startedAt: "2026-10-24T15:00:00Z",
    finishedAt: "2026-10-24T16:00:00Z",
    durationSeconds: 3600,
    sets: Array.from({ length: 300 }, (_, i) => ({
      sessionExerciseId: user.id,
      prescribedExerciseId: user.id,
      exerciseId: user.id,
      exerciseName: "Sentadilla",
      position: Math.floor(i / 20),
      setNumber: (i % 20) + 1,
      weightKg: 20,
      reps: 8,
      isWarmup: false,
    })),
  };
  const send = (body: unknown) =>
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer valid", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeGreaterThan(16384);
  expect((await x.api.save(send({ version: 1, payload }))).status).toBe(200);
  expect(
    (await x.api.save(send({ version: 1, payload: { ...payload, note: "x".repeat(270000) } })))
      .status,
  ).toBe(413);
  expect(x.save).toHaveBeenCalledTimes(1);
});
it("la paginación acepta el timestamp con zona que devuelve Postgres", async () => {
  const x = setup(),
    cursor = "2026-10-24T15:00:00+00:00";
  expect(
    (
      await x.api.history(
        new Request("https://example.test?cursor=" + encodeURIComponent(cursor), {
          headers: { Authorization: "Bearer valid" },
        }),
      )
    ).status,
  ).toBe(200);
  expect(x.history).toHaveBeenCalledWith(cursor);
});
