import { describe, expect, it, vi } from "vitest";
import { createTypedPersonalApi } from "./typed-personal-api";
const id = (n: number) => `ad210000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const library = () => ({ version: 2, userId: id(1), folders: [], routines: [] });
const input = () => ({
  version: 2,
  requestId: id(2),
  targetId: id(3),
  operation: "folder_create",
  expectedRevision: 0,
  data: { name: "Fuerza" },
});
const request = (body?: unknown, query = "", token: string | null = "valid") =>
  new Request("https://example.test/api/mobile/v1/training-library" + query, {
    method: body === undefined ? "GET" : "POST",
    headers: token ? { Authorization: "Bearer " + token } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
function setup() {
  const read = vi.fn(async (): Promise<unknown> => library());
  const mutate = vi.fn(async (): Promise<unknown> => ({
    version: 2,
    requestId: id(2),
    targetId: id(3),
    revision: 1,
    status: "created",
    duplicate: false,
  }));
  const authorize = vi.fn(async (token: string) =>
    token === "valid" ? { userId: id(1), read, mutate } : null,
  );
  return { api: createTypedPersonalApi({ authorize }), read, mutate, authorize };
}
describe("API de bases personales tipadas2", () => {
  it("JWT obligatorio y consultas cerradas sin datos ajenos", async () => {
    const x = setup();
    expect((await x.api.library(request(undefined, "", null))).status).toBe(401);
    expect((await x.api.export(request(undefined, "", "invalid"))).status).toBe(401);
    expect((await x.api.mutate(request(input(), "", null))).status).toBe(401);
    expect((await x.api.library(request(undefined, "?userId=" + id(8)))).status).toBe(400);
    expect((await x.api.mutate(request({ ...input(), ownerId: id(8) }))).status).toBe(400);
    expect(x.read).not.toHaveBeenCalled();
    expect(x.mutate).not.toHaveBeenCalled();
  });
  it("lectura y exportación son snapshot propio, sin recibos, cookies o caché", async () => {
    const x = setup();

    for (const r of [await x.api.library(request()), await x.api.export(request())]) {
      expect(r.status).toBe(200);
      expect(r.headers.get("Cache-Control")).toContain("no-store");
      expect(r.headers.get("Set-Cookie")).toBeNull();
      expect(r.headers.get("Vary")).toContain("Authorization");
      expect(await r.json()).toEqual(library());
    }
    x.read.mockResolvedValueOnce({ ...library(), userId: id(8) });
    expect((await x.api.library(request())).status).toBe(503);
  });
  it("rechaza respuestas de otra versión o con campos privados", async () => {
    const x = setup();
    for (const value of [
      { ...library(), version: 1 },
      { ...library(), receipts: [{ private: true }] },
    ]) {
      x.read.mockResolvedValueOnce(value);
      expect((await x.api.library(request())).status).toBe(503);
    }
    x.mutate.mockResolvedValueOnce({
      version: 1,
      requestId: id(2),
      targetId: id(3),
      revision: 1,
      status: "created",
      duplicate: false,
    });
    expect((await x.api.mutate(request(input()))).status).toBe(503);
  });
  it("valida recibo, identidad, reintento y tamaño sin duplicar lógica SQL", async () => {
    const x = setup();
    const r = await x.api.mutate(request(input()));
    expect(r.status).toBe(200);
    expect(x.mutate).toHaveBeenCalledWith(input());
    expect((await r.json()).duplicate).toBe(false);
    x.mutate.mockResolvedValueOnce({
      version: 2,
      requestId: id(8),
      targetId: id(3),
      revision: 1,
      status: "created",
      duplicate: false,
    });
    expect((await x.api.mutate(request(input()))).status).toBe(503);
    expect(
      (await x.api.mutate(request({ ...input(), data: { name: "x".repeat(66000) } }))).status,
    ).toBe(413);
    expect(
      (
        await x.api.mutate(
          request({
            ...input(),
            operation: "folders_reorder",
            targetId: id(8),
            expectedRevision: null,
            data: { entries: [] },
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("mapea causas cerradas y oculta mensajes SQL o excepciones", async () => {
    const x = setup();
    for (const [code, status] of [
      ["40001", 409],
      ["23505", 409],
      ["22023", 400],
      ["42501", 403],
      ["P0002", 404],
      ["XX000", 503],
    ] as const) {
      x.mutate.mockRejectedValueOnce({ code, message: "secret SQL detail" });
      const r = await x.api.mutate(request(input()));
      expect(r.status).toBe(status);
      expect(JSON.stringify(await r.json())).not.toContain("secret SQL detail");
    }
    x.read.mockRejectedValueOnce(Error("secret SQL detail"));
    const r = await x.api.export(request());
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("secret SQL detail");
  });
});
