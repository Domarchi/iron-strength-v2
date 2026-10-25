import { describe, expect, it, vi } from "vitest";
import { createMobileAccountApi } from "./account-api";
const person = { id: "11111111-1111-4111-8111-111111111111", role: "student" as const };
function setup(role: "student" | "coach" = "student") {
  const remove = vi.fn(async () => ({ ok: true as const }));
  const authorize = vi.fn(async (token: string) =>
    token === "valid" ? { profile: { ...person, role } } : null,
  );
  return { api: createMobileAccountApi({ authorize, remove }), remove, authorize };
}
const request = (confirmation: string, token = "valid", extra = {}) =>
  new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ confirmation, ...extra }),
  });
describe("eliminación móvil de cuenta", () => {
  it("exige identidad y confirmación cerrada; nunca acepta otro alumno como destino", async () => {
    const x = setup();
    for (const r of [
      request("no"),
      request("BORRAR", "valid", { userId: person.id }),
      request("BORRAR", "bad"),
    ])
      expect((await x.api.remove(r)).status).toBeGreaterThanOrEqual(400);
    expect(
      (await x.api.remove(new Request("https://example.test", { method: "POST" }))).status,
    ).toBe(401);
    expect(x.remove).not.toHaveBeenCalled();
  });
  it("rechaza coach antes de tocar fotos o usuario; alumno recibe confirmación privada", async () => {
    const coach = setup("coach");
    expect((await coach.api.remove(request("BORRAR"))).status).toBe(403);
    expect(coach.remove).not.toHaveBeenCalled();
    const x = setup();
    const result = await x.api.remove(request(" borrar "));
    expect(await result.json()).toEqual({ version: 1, ok: true, userId: person.id });
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(result.headers.get("Set-Cookie")).toBeNull();
    expect(x.remove).toHaveBeenCalledWith("valid");
  });
  it("fallos no afirman un borrado confirmado ni exponen detalles internos", async () => {
    const remove = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "photos" })
      .mockRejectedValueOnce(Error("secret"));
    const api = createMobileAccountApi({ authorize: async () => ({ profile: person }), remove });
    const photos = await api.remove(request("BORRAR"));
    expect(photos.status).toBe(503);
    expect(JSON.stringify(await photos.json())).toContain("fotos");
    const failed = await api.remove(request("BORRAR"));
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("secret");
  });
});
