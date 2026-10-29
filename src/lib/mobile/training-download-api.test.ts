import { expect, it, vi } from "vitest";
import { createTrainingDownloadApi } from "./training-download-api";
import { trainingDownloadFixture } from "../../test/fixtures/training-download";
import { TrainingDownloadError } from "../data/training-download";
const request = (query = "", token = "valid") =>
  new Request("https://example.test/api/mobile/v1/training-download" + query, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
it("JWT propio, parámetros cerrados, contrato completo y nada de cookies/caché", async () => {
  const b = trainingDownloadFixture(),
    read = vi.fn(async () => b),
    authorize = vi.fn(async (token: string) =>
      token === "valid" ? { userId: b.userId, read } : null,
    ),
    api = createTrainingDownloadApi({ authorize });
  expect((await api.read(request("", ""))).status).toBe(401);
  expect((await api.read(request("?studentId=" + b.userId))).status).toBe(400);
  expect(read).not.toHaveBeenCalled();
  const r = await api.read(request());
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual(b);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(r.headers.get("set-cookie")).toBeNull();
});
it("otra cuenta, campos nuevos o paquete incompleto no salen como descarga válida", async () => {
  const b = trainingDownloadFixture(),
    read = vi.fn<() => Promise<unknown>>(),
    api = createTrainingDownloadApi({ authorize: async () => ({ userId: b.userId, read }) });
  for (const value of [
    { ...b, userId: "00000000-0000-4000-8000-000000000002" },
    { ...b, version: 99 },
    { ...b, history: {} },
    { ...b, credential: "no" },
  ]) {
    read.mockResolvedValue(value);
    expect((await api.read(request())).status).toBe(503);
  }
});
it("capacidad, sesión rechazada y servicio conservan una causa segura sin datos internos", async () => {
  const b = trainingDownloadFixture(),
    read = vi.fn<() => Promise<unknown>>(),
    api = createTrainingDownloadApi({ authorize: async () => ({ userId: b.userId, read }) });
  for (const [code, status] of [
    ["capacity", 409],
    ["unauthorized", 401],
    ["incompatible", 503],
    ["unavailable", 503],
  ] as const) {
    read.mockRejectedValue(new TrainingDownloadError(code));
    const r = await api.read(request());
    expect(r.status).toBe(status);
    expect((await r.json()).error.code).toBe(
      code === "unauthorized" ? code : code === "capacity" ? code : "unavailable",
    );
  }
  read.mockRejectedValue(Error("private SQL host/password"));
  const r = await api.read(request());
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("private SQL");
});
