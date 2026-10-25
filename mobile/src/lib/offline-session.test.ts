import { describe, expect, it, vi } from "vitest";
import { MobileClient, type CredentialStore, type Transport } from "./client";
const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Ana",
  email: "ana@example.test",
  role: "student",
};
const session = {
  version: 1,
  accessToken: "online-access",
  refreshToken: "refresh-only",
  expiresAt: 4000000000,
  profile,
};
function fixture() {
  let raw: string | null = null;
  const store: CredentialStore = {
    get: vi.fn(async () => raw),
    set: vi.fn(async (value) => {
      raw = value;
    }),
    remove: vi.fn(async () => {
      raw = null;
    }),
  };
  const transport = vi.fn<Transport>(async () => Response.json(session));
  const create = () =>
    new MobileClient("https://iron-strength-seven.vercel.app", store, transport, () => 1000000);
  return {
    store,
    transport,
    create,
    raw: () => raw,
    seed: (value: string) => {
      raw = value;
    },
  };
}
const unavailable = () => Promise.reject(new TypeError("offline"));
describe("identidad local verificada y conexión", () => {
  it("entrada online guarda vault v2 sin access token; reinicio sin red recupera solo esa identidad", async () => {
    const x = fixture();
    await x.create().login(profile.email, "private-password");
    expect(JSON.parse(x.raw()!)).toEqual({
      version: 2,
      refreshToken: session.refreshToken,
      profile,
    });
    expect(x.raw()).not.toContain(session.accessToken);
    expect(x.raw()).not.toContain("private-password");
    x.transport.mockImplementation(unavailable);
    const client = x.create();
    await client.restore();
    expect(client.getSnapshot()).toMatchObject({
      status: "authenticated",
      mode: "offline",
      session: { profile, accessToken: null },
    });
    const count = x.transport.mock.calls.length;
    await expect(client.week()).rejects.toMatchObject({ code: "offline" });
    expect(x.transport).toHaveBeenCalledTimes(count);
  });
  it("vault v1 exige renovación online; el futuro y los fallos no se destruyen", async () => {
    const x = fixture(),
      old = JSON.stringify({ version: 1, refreshToken: "legacy" });
    x.seed(old);
    x.transport.mockImplementation(unavailable);
    const client = x.create();
    await client.restore();
    expect(client.getSnapshot().status).toBe("blocked");
    expect(x.raw()).toBe(old);
    x.transport.mockResolvedValueOnce(Response.json(session));
    await client.restore();
    expect(client.getSnapshot()).toMatchObject({ status: "authenticated", mode: "online" });
    expect(JSON.parse(x.raw()!).version).toBe(2);
    const future = '{"version":99,"refreshToken":"preserve"}';
    x.seed(future);
    const next = x.create();
    await next.restore();
    expect(next.getSnapshot().status).toBe("blocked");
    expect(x.raw()).toBe(future);
  });
  it("rechazo de identidad/inactividad y error de almacenamiento no conceden acceso offline", async () => {
    const x = fixture();
    await x.create().login(profile.email, "password");
    x.transport.mockResolvedValueOnce(
      Response.json(
        { version: 1, error: { code: "unauthorized", message: "Vuelve a entrar" } },
        { status: 401 },
      ),
    );
    const rejected = x.create();
    await rejected.restore();
    expect(rejected.getSnapshot().status).toBe("signedOut");
    expect(x.raw()).toBeNull();
    const y = fixture();
    await y.create().login(profile.email, "password");
    y.store.get = vi.fn(async () => {
      throw Error("locked");
    });
    const locked = y.create();
    await locked.restore();
    expect(locked.getSnapshot().status).toBe("blocked");
  });
  it("servicio temporalmente indisponible permite datos locales, formato incompatible no", async () => {
    const x = fixture();
    await x.create().login(profile.email, "password");
    x.transport.mockResolvedValueOnce(
      Response.json(
        { version: 1, error: { code: "unavailable", message: "Reintenta" } },
        { status: 503 },
      ),
    );
    const offline = x.create();
    await offline.restore();
    expect(offline.getSnapshot()).toMatchObject({ status: "authenticated", mode: "offline" });
    x.transport.mockResolvedValueOnce(Response.json({ version: 99 }));
    const unknown = x.create();
    await unknown.restore();
    expect(unknown.getSnapshot().status).toBe("blocked");
  });
  it("reconectar verifica misma identidad y salir retira el acceso local", async () => {
    const x = fixture();
    await x.create().login(profile.email, "password");
    x.transport.mockImplementation(unavailable);
    const client = x.create();
    await client.restore();
    x.transport.mockImplementation(async (url) =>
      url.endsWith("week")
        ? Response.json({ version: 1, kind: "no_program" })
        : Response.json({ ...session, accessToken: "renewed" }),
    );
    await client.reconnect();
    expect(client.getSnapshot()).toMatchObject({
      status: "authenticated",
      mode: "online",
      session: { accessToken: "renewed" },
    });
    await client.week();
    expect(new Headers(x.transport.mock.calls.at(-1)![1].headers).get("Authorization")).toBe(
      "Bearer renewed",
    );
    await client.logout();
    expect(x.raw()).toBeNull();
    expect(client.getSnapshot().status).toBe("signedOut");
  });
  it("reconectar a otra identidad no mezcla credenciales ni perfiles", async () => {
    const x = fixture();
    await x.create().login(profile.email, "password");
    x.transport.mockImplementation(unavailable);
    const client = x.create();
    await client.restore();
    x.transport.mockResolvedValueOnce(
      Response.json({
        ...session,
        profile: { ...profile, id: "22222222-2222-4222-8222-222222222222" },
      }),
    );
    await expect(client.reconnect()).rejects.toThrow();
    expect(client.getSnapshot().status).toBe("signedOut");
  });
  it("pérdida de red en una sesión abierta conserva su cuenta y cambia el modo", async () => {
    const x = fixture(),
      client = x.create();
    await client.login(profile.email, "password");
    x.transport.mockImplementation(unavailable);
    await expect(client.week()).rejects.toMatchObject({ code: "network" });
    expect(client.getSnapshot()).toMatchObject({
      status: "authenticated",
      mode: "offline",
      session: { profile, accessToken: null, expiresAt: null },
    });
  });
  it("un envío pendiente queda ligado a su cuenta antes de tocar la red", async () => {
    const x = fixture(),
      client = x.create();
    await client.login(profile.email, "password");
    const payload = {
      id: profile.id,
      programId: profile.id,
      programSessionId: profile.id,
      sessionLabel: "A",
      startedAt: "2026-10-24T15:00:00Z",
      finishedAt: "2026-10-24T15:10:00Z",
      durationSeconds: 600,
      sets: [
        {
          exerciseId: profile.id,
          exerciseName: "Sentadilla",
          position: 0,
          setNumber: 1,
          weightKg: 20,
          reps: 10,
          isWarmup: false,
        },
      ],
    };
    await expect(
      client.saveWorkout(payload, "22222222-2222-4222-8222-222222222222"),
    ).rejects.toMatchObject({ code: "identity" });
    await expect(
      client.deleteAccount("BORRAR", "22222222-2222-4222-8222-222222222222"),
    ).rejects.toMatchObject({ code: "identity" });
    await expect(client.logout("22222222-2222-4222-8222-222222222222")).rejects.toMatchObject({
      code: "identity",
    });
    await expect(
      client.publishComment(
        profile.id,
        profile.id,
        "Mensaje privado",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).rejects.toMatchObject({ code: "identity" });
    expect(x.transport).toHaveBeenCalledTimes(1);
    expect(client.getSnapshot().status).toBe("authenticated");
  });
});
