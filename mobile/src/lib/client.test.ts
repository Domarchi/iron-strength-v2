import { weekDownloadFixture } from "../../../src/test/fixtures/week-download";
import { recordingFixture } from "../../../src/test/fixtures/workout-recording";
import { recordingPayloadSchema } from "../../../src/lib/mobile/recording-contracts";
import { describe, it, expect, vi } from "vitest";
import { MobileClient, validateApiOrigin, type Transport, type CredentialStore } from "./client";
const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ana",
  email: "ana@example.test",
  role: "student",
};
const session = {
  version: 1,
  accessToken: "access-a",
  refreshToken: "refresh-a",
  expiresAt: 2000000000,
  profile,
};
function setup(fetcher: Transport) {
  let value: string | null = null;
  const store: CredentialStore = {
    get: vi.fn(async () => value),
    set: vi.fn(async (v) => {
      value = v;
    }),
    remove: vi.fn(async () => {
      value = null;
    }),
  };
  return {
    client: new MobileClient(
      "https://iron-strength-seven.vercel.app",
      store,
      fetcher,
      () => 1000000,
    ),
    store,
    value: () => value,
    seed: (s: string) => {
      value = s;
    },
  };
}
describe("sesión móvil segura", () => {
  it("cierre con estructura envía el documento completo y exige confirmación versión2 de esa cuenta e ID", async () => {
    const input = recordingPayloadSchema.parse(recordingFixture()),
      reply = { version: 2, ok: true, status: "created", workoutId: input.id };
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(reply))
      .mockResolvedValueOnce(Response.json({ ...reply, version: 1 }))
      .mockResolvedValueOnce(Response.json({ ...reply, workoutId: profile.id }));
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    await expect(x.client.saveRecording(input, input.id)).rejects.toMatchObject({
      code: "identity",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await x.client.saveRecording(input, profile.id)).toEqual(reply);
    expect(fetcher.mock.calls[1][0]).toContain("/api/mobile/v1/recordings");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]!.body))).toEqual({
      version: 2,
      payload: input,
    });
    await expect(x.client.saveRecording(input, profile.id)).rejects.toMatchObject({
      code: "version",
    });
    await expect(x.client.saveRecording(input, profile.id)).rejects.toMatchObject({
      code: "identity",
    });
  });
  it("registro libre valida cuenta y confirmación del ID sin inventar programa", async () => {
    const workoutId = "22222222-2222-4222-8222-222222222222";
    const input = {
      version: 1 as const,
      id: workoutId,
      origin: { kind: "free" as const },
      title: "Libre",
      startedAt: "2026-10-26T12:00:00Z",
      finishedAt: "2026-10-26T12:30:00Z",
      durationSeconds: 1800,
      sets: [
        {
          exerciseId: workoutId,
          position: 0,
          setNumber: 1,
          weightKg: 30,
          reps: 8,
          isWarmup: false,
        },
      ],
    };
    const reply = { version: 1, ok: true, workoutId, status: "created" };
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(reply))
      .mockResolvedValueOnce(Response.json({ ...reply, workoutId: profile.id }))
      .mockResolvedValueOnce(Response.json({ ...reply, version: 99 }));
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    await expect(x.client.savePersonalWorkout(input, workoutId)).rejects.toMatchObject({
      code: "identity",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await x.client.savePersonalWorkout(input, profile.id)).toEqual(reply);
    expect(fetcher.mock.calls[1][0]).toContain("/api/mobile/v1/personal-workouts");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]!.body))).toEqual({
      version: 1,
      payload: input,
    });
    await expect(x.client.savePersonalWorkout(input, profile.id)).rejects.toMatchObject({
      code: "identity",
    });
    await expect(x.client.savePersonalWorkout(input, profile.id)).rejects.toMatchObject({
      code: "version",
    });
  });
  it("biblioteca personal valida cuenta, versión y recibo estable antes de confirmar", async () => {
    const requestId = "22222222-2222-4222-8222-222222222222";
    const targetId = "33333333-3333-4333-8333-333333333333";
    const library = { version: 1, userId: profile.id, folders: [], routines: [] };
    const input = {
      version: 1 as const,
      requestId,
      targetId,
      expectedRevision: 0 as const,
      operation: "folder_create" as const,
      data: { name: "Fuerza" },
    };
    const receipt = { requestId, targetId, revision: 1, status: "created", duplicate: false };
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(library))
      .mockResolvedValueOnce(Response.json({ ...library, userId: targetId }))
      .mockResolvedValueOnce(Response.json(receipt))
      .mockResolvedValueOnce(Response.json({ ...receipt, requestId: targetId }))
      .mockResolvedValueOnce(Response.json({ ...library, version: 2 }));
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    expect(await x.client.personalLibrary()).toEqual(library);
    await expect(x.client.personalLibrary()).rejects.toMatchObject({ code: "identity" });
    const before = fetcher.mock.calls.length;
    await expect(x.client.mutatePersonalLibrary(input, targetId)).rejects.toMatchObject({
      code: "identity",
    });
    expect(fetcher).toHaveBeenCalledTimes(before);
    expect(await x.client.mutatePersonalLibrary(input, profile.id)).toEqual(receipt);
    expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1].body))).toEqual(input);
    await expect(x.client.mutatePersonalLibrary(input, profile.id)).rejects.toMatchObject({
      code: "identity",
    });
    await expect(x.client.exportPersonalLibrary()).rejects.toMatchObject({ code: "version" });
  });

  it("biblioteca tipada2 valida cuenta, versión y recibo estable antes de confirmar", async () => {
    const requestId = "22222222-2222-4222-8222-222222222222";
    const targetId = "33333333-3333-4333-8333-333333333333";
    const library = { version: 2, userId: profile.id, folders: [], routines: [] };
    const input = {
      version: 2 as const,
      requestId,
      targetId,
      expectedRevision: 0 as const,
      operation: "folder_create" as const,
      data: { name: "Fuerza" },
    };
    const receipt = {
      version: 2,
      requestId,
      targetId,
      revision: 1,
      status: "created",
      duplicate: false,
    };
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json(library))
      .mockResolvedValueOnce(Response.json({ ...library, userId: targetId }))
      .mockResolvedValueOnce(Response.json(receipt))
      .mockResolvedValueOnce(Response.json({ ...receipt, requestId: targetId }))
      .mockResolvedValueOnce(Response.json({ ...library, version: 1 }));
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    expect(await x.client.trainingLibrary()).toEqual(library);
    await expect(x.client.trainingLibrary()).rejects.toMatchObject({ code: "identity" });
    const before = fetcher.mock.calls.length;
    await expect(x.client.mutateTrainingLibrary(input, targetId)).rejects.toMatchObject({
      code: "identity",
    });
    expect(fetcher).toHaveBeenCalledTimes(before);
    expect(await x.client.mutateTrainingLibrary(input, profile.id)).toEqual(receipt);
    expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1].body))).toEqual(input);
    await expect(x.client.mutateTrainingLibrary(input, profile.id)).rejects.toMatchObject({
      code: "identity",
    });
    await expect(x.client.exportTrainingLibrary()).rejects.toMatchObject({ code: "version" });
  });

  it("descarga recibe solo el paquete completo de la identidad actual", async () => {
    const pack = weekDownloadFixture(profile.id),
      fetcher = vi
        .fn<Transport>()
        .mockResolvedValueOnce(Response.json(session))
        .mockResolvedValueOnce(Response.json({ version: 1, userId: profile.id, pack }))
        .mockResolvedValueOnce(
          Response.json({
            version: 1,
            userId: profile.id,
            pack: { ...pack, userId: "22222222-2222-4222-8222-222222222222" },
          }),
        );
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    expect(
      (await x.client.downloadWeek()).sessions[0].context.exercises[0].prescribed.series,
    ).toHaveLength(2);
    await expect(x.client.downloadWeek()).rejects.toMatchObject({ code: "identity" });
  });
  it("progreso valida ID antes de enviar y comprueba identidad de la respuesta", async () => {
    const exercise = {
      exerciseId: profile.id,
      name: "Sentadilla",
      bestWeightKg: 50,
      bestEstimated1RM: 60,
      bestReps: 10,
      isBodyweight: false,
      lastDate: "2026-10-24",
      workoutCount: 1,
    };
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(
        Response.json({ version: 1, today: "2026-10-24", exercise, points: [] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          version: 1,
          today: "2026-10-24",
          exercise: { ...exercise, exerciseId: "22222222-2222-4222-8222-222222222222" },
          points: [],
        }),
      );
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    await expect(x.client.progressDetail("../../other")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await x.client.progressDetail(profile.id)).exercise.exerciseId).toBe(profile.id);
    await expect(x.client.progressDetail(profile.id)).rejects.toMatchObject({ code: "identity" });
    expect(fetcher.mock.calls[1][1].credentials).toBe("omit");
  });
  it("comentarios conservan ID/entrenamiento en respuesta y nunca aceptan confirmación de otro intento", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(
        Response.json({
          version: 1,
          workoutId: profile.id,
          items: [],
          nextCursor: null,
          unreadCount: 1,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          version: 1,
          workoutId: profile.id,
          id: profile.id,
          ok: true,
          status: "created",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ version: 1, workoutId: profile.id, id, ok: true, status: "duplicate" }),
      );
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    expect((await x.client.commentsPage(profile.id)).unreadCount).toBe(1);
    await expect(
      x.client.publishComment(profile.id, id, "Mensaje", profile.id),
    ).rejects.toMatchObject({
      code: "identity",
    });
    await x.client.publishComment(profile.id, id, "Mensaje", profile.id);
    expect(JSON.parse(String(fetcher.mock.calls[3][1].body))).toEqual({ id, body: "Mensaje" });
    expect(fetcher.mock.calls[3][0]).toContain(`/workouts/${profile.id}/comments`);
    expect(x.client.getSnapshot().status).toBe("authenticated");
  });
  it("borrar cuenta exige respuesta de la misma identidad; confirmar no limpia la sesión prematuramente", async () => {
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(
        Response.json({ version: 1, ok: true, userId: "22222222-2222-4222-8222-222222222222" }),
      )
      .mockResolvedValueOnce(Response.json({ version: 1, ok: true, userId: profile.id }));
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    await expect(x.client.deleteAccount("BORRAR", profile.id)).rejects.toMatchObject({
      code: "identity",
    });
    expect(x.client.getSnapshot().status).toBe("authenticated");
    await x.client.deleteAccount("BORRAR", profile.id);
    expect(x.store.remove).not.toHaveBeenCalled();
    expect(x.client.getSnapshot().status).toBe("authenticated");
    expect(fetcher.mock.calls[2][1].headers).toMatchObject({ Authorization: "Bearer access-a" });
    expect(JSON.parse(String(fetcher.mock.calls[2][1].body))).toEqual({ confirmation: "BORRAR" });
  });
  it("solo permite HTTPS o desarrollo local explícito", () => {
    expect(() => validateApiOrigin("http://evil.example")).toThrow();
    expect(() => validateApiOrigin("https://user:pass@example.test")).toThrow();
    expect(() => validateApiOrigin("http://127.0.0.1:3000")).toThrow();
    expect(validateApiOrigin("http://127.0.0.1:3000", true)).toBe("http://127.0.0.1:3000");
  });
  it("guarda credencial y perfil verificado, sin access token, y recupera verificando el servidor", async () => {
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(
        Response.json({ ...session, accessToken: "new-access", refreshToken: "rotated" }),
      );
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    expect(x.value()).not.toContain("access-a");
    expect(JSON.parse(x.value()!).profile).toEqual(profile);
    expect(x.client.getSnapshot().status).toBe("authenticated");
    await x.client.restore();
    expect(x.value()).toContain("rotated");
    expect(fetcher.mock.calls[1][0]).toContain("auth/refresh");
  });
  it("fallo de red al recuperar conserva la credencial; rechazo 401 la retira", async () => {
    const fetcher = vi
      .fn<Transport>()
      .mockRejectedValueOnce(TypeError("network"))
      .mockResolvedValueOnce(
        Response.json(
          { version: 1, error: { code: "unauthorized", message: "Vuelve a entrar" } },
          { status: 401 },
        ),
      );
    const x = setup(fetcher);
    x.seed(JSON.stringify({ version: 1, refreshToken: "saved" }));
    await x.client.restore();
    expect(x.value()).toContain("saved");
    expect(x.client.getSnapshot().status).toBe("blocked");
    await x.client.restore();
    expect(x.value()).toBeNull();
    expect(x.client.getSnapshot().status).toBe("signedOut");
  });
  it("no anuncia persistencia si el almacén falla", async () => {
    const x = setup(vi.fn<Transport>().mockResolvedValue(Response.json(session)));
    vi.mocked(x.store.set).mockRejectedValue(Error("quota"));
    await expect(x.client.login(profile.email, "clave")).rejects.toThrow();
    expect(x.client.getSnapshot().status).not.toBe("authenticated");
  });
  it("una respuesta tardía después de salir no reabre la cuenta ni escribe su token", async () => {
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn<Transport>().mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const x = setup(fetcher);
    const login = x.client.login(profile.email, "clave");
    await x.client.logout();
    resolve(Response.json(session));
    await expect(login).rejects.toThrow();
    expect(x.value()).toBeNull();
    expect(x.client.getSnapshot().status).toBe("signedOut");
  });
  it("no interpreta versiones futuras del almacén", async () => {
    const fetcher = vi.fn<Transport>();
    const x = setup(fetcher);
    x.seed(JSON.stringify({ version: 99, refreshToken: "preserve" }));
    await x.client.restore();
    expect(x.value()).toContain("preserve");
    expect(fetcher).not.toHaveBeenCalled();
    expect(x.client.getSnapshot().status).toBe("blocked");
  });
  it("la lectura usa bearer, ignora cookies y no escribe entrenamientos", async () => {
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(Response.json({ version: 1, kind: "no_program" }));
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    expect(await x.client.week()).toEqual({ version: 1, kind: "no_program" });
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "GET",
      credentials: "omit",
      headers: expect.objectContaining({ Authorization: "Bearer access-a" }),
    });
    expect(fetcher.mock.calls[1][0]).toContain("/week");
  });
  it("renueva una sola vez para lecturas concurrentes y conserva la identidad", async () => {
    let resolve!: (r: Response) => void;
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json({ ...session, expiresAt: 1 }))
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockImplementation(async () => Response.json({ version: 1, kind: "no_program" }));
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    const a = x.client.week(),
      b = x.client.week();
    resolve(Response.json({ ...session, accessToken: "renewed", refreshToken: "rotated" }));
    await Promise.all([a, b]);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("auth/refresh"))).toHaveLength(1);
    expect(
      fetcher.mock.calls
        .slice(2)
        .every(([, init]) => new Headers(init.headers).get("Authorization") === "Bearer renewed"),
    ).toBe(true);
  });
  it("un 401 de una lectura lenta reutiliza el token ya renovado", async () => {
    let rejectSlow!: (r: Response) => void;
    const unauthorized = () =>
      Response.json(
        { version: 1, error: { code: "unauthorized", message: "Vuelve a entrar" } },
        { status: 401 },
      );
    let reads = 0,
      renewals = 0;
    const fetcher = vi.fn<Transport>().mockImplementation(async (url) => {
      if (url.endsWith("auth/login")) return Response.json(session);
      if (url.endsWith("auth/refresh")) {
        renewals++;
        return Response.json({ ...session, accessToken: "renewed" });
      }
      reads++;
      if (reads === 1)
        return new Promise((r) => {
          rejectSlow = r;
        });
      if (reads === 2) return unauthorized();
      return Response.json({ version: 1, kind: "no_program" });
    });
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    const slow = x.client.week();
    await x.client.week();
    rejectSlow(unauthorized());
    await slow;
    expect(renewals).toBe(1);
  });
  it("una limpieza de sesión vencida no pisa una entrada posterior", async () => {
    let complete!: () => void;
    const fetcher = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json(session))
      .mockResolvedValueOnce(
        Response.json(
          { version: 1, error: { code: "unauthorized", message: "Vuelve a entrar" } },
          { status: 401 },
        ),
      );
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    // Provocar el rechazo final de la renovación con el mismo estado de API.
    fetcher.mockResolvedValueOnce(
      Response.json(
        { version: 1, error: { code: "unauthorized", message: "Vuelve a entrar" } },
        { status: 401 },
      ),
    );
    vi.mocked(x.store.remove).mockImplementationOnce(
      () =>
        new Promise((r) => {
          complete = r;
        }),
    );
    const reading = x.client.week();
    const rejected = expect(reading).rejects.toThrow();
    await vi.waitFor(() => expect(x.store.remove).toHaveBeenCalled());
    fetcher.mockResolvedValueOnce(
      Response.json({ ...session, profile: { ...profile, fullName: "Nueva entrada" } }),
    );
    const next = x.client.login(profile.email, "clave");
    complete();
    await Promise.all([next, rejected]);
    expect(x.client.getSnapshot()).toMatchObject({
      status: "authenticated",
      session: { profile: { fullName: "Nueva entrada" } },
    });
  });
  it("invoca el transporte como función para respetar la API fetch del navegador", async () => {
    const fetcher: Transport = async function (this: unknown) {
      expect(this).toBeUndefined();
      return Response.json(session);
    };
    const x = setup(fetcher);
    await x.client.login(profile.email, "clave");
    expect(x.client.getSnapshot().status).toBe("authenticated");
  });
});

it("acceso por enlace nunca persiste token/contraseña ni sustituye una sesión abierta", async () => {
  const fetcher = vi
    .fn<Transport>()
    .mockResolvedValueOnce(Response.json({ version: 1, status: "valida", email: profile.email }))
    .mockResolvedValueOnce(Response.json({ version: 1, ok: true, email: profile.email }))
    .mockResolvedValueOnce(Response.json({ version: 1, ok: true }))
    .mockResolvedValueOnce(Response.json(session));
  const x = setup(fetcher);
  await x.client.restore();
  await x.client.invitation("a".repeat(43));
  await x.client.registerInvitation({
    token: "a".repeat(43),
    name: "Ana",
    password: "clave-segura",
  });
  await x.client.resetPassword({ token: "b".repeat(56), password: "clave-nueva" });
  expect(x.store.set).not.toHaveBeenCalled();
  expect(x.client.getSnapshot().status).toBe("signedOut");
  await x.client.login(profile.email, "clave");
  await expect(
    x.client.resetPassword({ token: "b".repeat(56), password: "clave-nueva" }),
  ).rejects.toThrow("salir");
  expect(fetcher).toHaveBeenCalledTimes(4);
});
