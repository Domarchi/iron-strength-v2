import { it, expect, vi } from "vitest";
import { createWebTrainingDownload } from "./web-download";
import { trainingDownloadFixture } from "@/test/fixtures/training-download";
import { TrainingDownloadError } from "@/lib/data/training-download";
const b = trainingDownloadFixture();
const req = (headers: Record<string, string> = {}, search = "") =>
  new Request("https://app.test/api/training/download" + search, {
    headers: { host: "app.test", "x-iron-strength-account": b.userId, ...headers },
  });
function setup() {
  const read = vi.fn(async () => b),
    authorize = vi.fn(async () => ({ userId: b.userId, read }));
  return { read, authorize, get: createWebTrainingDownload({ authorize }) };
}
it("GET de cookie devuelve solo paquete completo de la cuenta capturada y no se cachea", async () => {
  const x = setup(),
    r = await x.get(req());
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual(b);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(r.headers.get("vary")).toBe("Cookie");
  expect(r.headers.has("access-control-allow-origin")).toBe(false);
});
it("sin sesión, cuenta distinta o parámetros no lee datos", async () => {
  const x = setup();
  expect((await x.get(req({}, "?userId=" + b.userId))).status).toBe(400);
  expect(
    (await x.get(req({ "x-iron-strength-account": "00000000-0000-4000-8000-000000000001" })))
      .status,
  ).toBe(403);
  x.authorize.mockResolvedValue(null as never);
  expect((await x.get(req())).status).toBe(401);
  expect(x.read).not.toHaveBeenCalled();
});
it("GET same-origin sin Origin se permite; Origin ajeno se rechaza antes de autenticar", async () => {
  const x = setup();
  expect((await x.get(req({ origin: "https://foreign.test" }))).status).toBe(403);
  expect(x.authorize).not.toHaveBeenCalled();
  expect((await x.get(req({ origin: "https://app.test" }))).status).toBe(200);
});
it("paquete futuro, parcial o ajeno no se anuncia completo", async () => {
  for (const value of [
    { ...b, version: 99 },
    { ...b, history: {} },
    { ...b, userId: "00000000-0000-4000-8000-000000000001" },
  ]) {
    const x = setup();
    x.read.mockResolvedValue(value as never);
    expect((await x.get(req())).status).toBe(503);
  }
});
it("capacidad o expiración conservan su causa segura, sin detalles SQL", async () => {
  for (const [code, status] of [
    ["capacity", 409],
    ["unauthorized", 401],
  ] as const) {
    const x = setup();
    x.read.mockRejectedValue(new TrainingDownloadError(code));
    const r = await x.get(req());
    expect(r.status).toBe(status);
    expect((await r.json()).error.code).toBe(code);
  }
  const x = setup();
  x.read.mockRejectedValue(Error("secret database connection"));
  expect(await (await x.get(req())).text()).not.toContain("secret database");
});
