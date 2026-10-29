import { expect, it, vi } from "vitest";
import { createWebAccountDeletion, deleteWebAccount } from "./web-account-delete";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const request = (
  value: unknown = { version: 1, userId: owner, confirmation: "BORRAR" },
  origin = "https://app.test",
) =>
  new Request("https://app.test/api/account/delete", {
    method: "POST",
    headers: { host: "app.test", origin, "content-type": "application/json" },
    body: JSON.stringify(value),
  });
function setup() {
  const remove = vi.fn(async () => ({ ok: true }) as const),
    signOut = vi.fn(async () => {});
  const authorize = vi.fn(async () => ({
    userId: owner,
    role: "student" as "student" | "coach",
    remove,
    signOut,
  }));
  return { remove, signOut, authorize, post: createWebAccountDeletion({ authorize }) };
}
it("confirma JSON propio sin redirigir; salir de cookie ocurre después del borrado", async () => {
  const x = setup();
  const r = await x.post(request());
  expect(await r.json()).toEqual({ version: 1, ok: true, userId: owner });
  expect(r.headers.get("location")).toBeNull();
  expect(r.headers.get("vary")).toBe("Cookie");
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(x.remove.mock.invocationCallOrder[0]).toBeLessThan(x.signOut.mock.invocationCallOrder[0]);
  x.signOut.mockRejectedValueOnce(Error("cookie failure"));
  expect((await x.post(request())).status).toBe(200);
});
it("origen ajeno, cuenta cambiada, coach, cuerpo desconocido y sesión ausente no borran", async () => {
  const x = setup();
  expect((await x.post(request(undefined, "https://foreign.test"))).status).toBe(403);
  expect(x.authorize).not.toHaveBeenCalled();
  for (const body of [
    { version: 1, userId: other, confirmation: "BORRAR" },
    { version: 99, userId: owner, confirmation: "BORRAR" },
    { version: 1, userId: owner, confirmation: "no" },
    { version: 1, userId: owner, confirmation: "BORRAR", target: other },
  ])
    expect((await x.post(request(body))).status).not.toBe(200);
  x.authorize.mockResolvedValueOnce(null as never);
  expect((await x.post(request())).status).toBe(401);
  x.authorize.mockResolvedValueOnce({
    userId: owner,
    role: "coach",
    remove: x.remove,
    signOut: x.signOut,
  });
  expect((await x.post(request())).status).toBe(403);
  expect(x.remove).not.toHaveBeenCalled();
  expect(x.signOut).not.toHaveBeenCalled();
});
it("fallo de fotos/SQL y exceso de tamaño no cierra cookie ni filtra datos privados", async () => {
  const x = setup();
  x.remove.mockResolvedValueOnce({ ok: false, reason: "photos" } as never);
  const photos = await x.post(request());
  expect(photos.status).toBe(503);
  expect((await photos.json()).error.code).toBe("photos");
  x.remove.mockRejectedValueOnce(Error("private connection"));
  expect(await (await x.post(request())).text()).not.toContain("private connection");
  expect((await x.post(request({ padding: "x".repeat(17000) }))).status).toBe(413);
  expect(x.signOut).not.toHaveBeenCalled();
});
it("cliente exige recibo propio y conserva datos ante corte, HTML, cuenta ajena o respuesta perdida", async () => {
  const success = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ version: 1, ok: true, userId: owner }));
  expect(await deleteWebAccount(owner, "BORRAR", success)).toEqual({ status: "deleted" });
  expect(success).toHaveBeenCalledExactlyOnceWith(
    "/api/account/delete",
    expect.objectContaining({
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      body: JSON.stringify({ version: 1, userId: owner, confirmation: "BORRAR" }),
    }),
  );
  for (const factory of [
    async () => Response.json({ version: 1, ok: true, userId: other }),
    async () => new Response("<html>login</html>"),
    () => Promise.reject(Error("lost reply")),
    async () =>
      Response.json(
        { version: 1, error: { code: "photos", message: "private SQL" } },
        { status: 503 },
      ),
  ]) {
    const state = await deleteWebAccount(
      owner,
      "BORRAR",
      vi.fn<typeof fetch>().mockImplementation(factory),
    );
    expect(state.status).toBe("error");
    expect(JSON.stringify(state)).not.toContain("private SQL");
  }
});
