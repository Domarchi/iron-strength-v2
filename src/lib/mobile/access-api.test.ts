import { describe, expect, it, vi } from "vitest";
import { createMobileAccessApi, type MobileAccessApiDependencies } from "./access-api";
import { nativeAccessLink } from "./access-link";
const token = "a".repeat(43),
  recovery = "b".repeat(56);
function setup() {
  const deps: MobileAccessApiDependencies = {
    invitation: vi.fn(async () => ({ status: "valida" as const, email: "alumno@example.test" })),
    register: vi.fn(async () => ({
      ok: true as const,
      userId: "11111111-1111-4111-8111-111111111111",
      email: "alumno@example.test",
    })),
    reset: vi.fn(async () => ({ ok: true as const })),
  };
  return { deps, api: createMobileAccessApi(deps) };
}
const post = (value: unknown) =>
  new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
describe("acceso móvil por enlace", () => {
  it("consultar no consume; respuesta sin cookies y sin caché", async () => {
    const { api, deps } = setup();
    const r = await api.invitation(post({ token }));
    expect(await r.json()).toEqual({ version: 1, status: "valida", email: "alumno@example.test" });
    expect(r.headers.get("Set-Cookie")).toBeNull();
    expect(r.headers.get("Cache-Control")).toContain("no-store");
    expect(deps.register).not.toHaveBeenCalled();
    expect(deps.reset).not.toHaveBeenCalled();
  });
  it("rechaza token, contraseña y propiedades extra antes de tocar Auth", async () => {
    const { api, deps } = setup();
    expect((await api.register(post({ token, name: "Ana", password: "corta" }))).status).toBe(400);
    expect((await api.reset(post({ token: recovery, password: "corta" }))).status).toBe(400);
    expect(
      (await api.register(post({ token, name: "Ana", password: "12345678", role: "coach" })))
        .status,
    ).toBe(400);
    expect((await api.invitation(post({ token: "arbitrario" }))).status).toBe(400);
    expect((await api.reset(post({ token: recovery, password: "x".repeat(17000) }))).status).toBe(
      413,
    );
    expect(deps.register).not.toHaveBeenCalled();
    expect(deps.reset).not.toHaveBeenCalled();
  });
  it("crear devuelve cuenta lista sin tokens ni cambiar identidad automáticamente", async () => {
    const { api, deps } = setup();
    const r = await api.register(post({ token, name: " Ana ", password: "12345678" }));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ version: 1, ok: true, email: "alumno@example.test" });
    expect(deps.register).toHaveBeenCalledWith({ token, name: "Ana", password: "12345678" });
  });
  it("recuperación verifica solo al enviar y no retorna sesión temporal", async () => {
    const { api, deps } = setup();
    const r = await api.reset(post({ token: recovery, password: "12345678" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ version: 1, ok: true });
    expect(deps.reset).toHaveBeenCalledWith({ token: recovery, password: "12345678" });
  });
  it("errores internos no filtran secretos; enlaces usados tienen salida de acceso", async () => {
    const { api, deps } = setup();
    vi.mocked(deps.reset).mockRejectedValueOnce(Error("token-secret-host"));
    const r = await api.reset(post({ token: recovery, password: "12345678" }));
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("token-secret-host");
  });
  it("distingue invitación vencida/usada y enlaces de recuperación consumidos sin filtrar tokens", async () => {
    const { api, deps } = setup();
    vi.mocked(deps.invitation).mockResolvedValueOnce({ status: "vencida", email: null });
    expect(await (await api.invitation(post({ token }))).json()).toEqual({
      version: 1,
      status: "vencida",
      email: null,
    });
    vi.mocked(deps.register).mockResolvedValueOnce({ ok: false, reason: "usada" });
    const used = await api.register(post({ token, name: "Ana", password: "12345678" }));
    expect(used.status).toBe(410);
    expect(await used.text()).not.toContain(token);
    vi.mocked(deps.reset).mockResolvedValueOnce({ ok: false, reason: "invalid_link" });
    expect((await api.reset(post({ token: recovery, password: "12345678" }))).status).toBe(410);
  });
  it("el enlace nativo conserva solo kind/token y rechaza formatos ajenos", () => {
    const url = new URL(nativeAccessLink("reset", recovery)!);
    expect(url.protocol).toBe("iron-strength:");
    expect(url.hostname).toBe("access");
    expect(url.searchParams.get("token")).toBe(recovery);
    expect(nativeAccessLink("reset", "https://evil.test")).toBeNull();
  });
});
