import { expect, it, vi } from "vitest";
import { trainingDownloadFixture } from "@/test/fixtures/training-download";
import { readWebTrainingDownload } from "./web-download-client";
const b = trainingDownloadFixture();
it("lee JSON por cookie con URL cerrada y guarda de cuenta, sin Server Action", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(b));
  expect(await readWebTrainingDownload(b.userId, fetcher)).toEqual(b);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/training/download", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "X-Iron-Strength-Account": b.userId },
  });
});
it("identidad capturada inválida no consulta y un documento de otra cuenta no se entrega", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(b));
  await expect(readWebTrainingDownload("invalid", fetcher)).rejects.toMatchObject({
    code: "account_changed",
  });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    readWebTrainingDownload("00000000-0000-4000-8000-000000000001", fetcher),
  ).rejects.toMatchObject({ code: "account_changed" });
});
it("rechaza versiones futuras, colecciones incompletas y HTML sin degradar la copia", async () => {
  for (const value of [
    { ...b, version: 99 },
    { ...b, history: {} },
  ]) {
    await expect(
      readWebTrainingDownload(
        b.userId,
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(value)),
      ),
    ).rejects.toMatchObject({ code: "format" });
  }
  await expect(
    readWebTrainingDownload(
      b.userId,
      vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>login</html>")),
    ),
  ).rejects.toMatchObject({ code: "format" });
});
it("causas de sesión, cuenta y capacidad son seguras y no muestran detalles remotos", async () => {
  for (const [code, status] of [
    ["unauthorized", 401],
    ["account_changed", 403],
    ["capacity", 409],
  ] as const) {
    const run = () =>
      readWebTrainingDownload(
        b.userId,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            Response.json(
              { version: 1, error: { code, message: "private SQL credentials" } },
              { status },
            ),
          ),
      );
    await expect(run()).rejects.toMatchObject({ code });
    await expect(run()).rejects.not.toThrow("private SQL");
  }
});
it("corte y fallo de servicio no se presentan como descarga vacía", async () => {
  for (const factory of [
    () => Promise.reject(Error("private network")),
    async () => new Response("secret", { status: 500 }),
  ]) {
    await expect(
      readWebTrainingDownload(b.userId, vi.fn<typeof fetch>().mockImplementation(factory)),
    ).rejects.toMatchObject({ code: "network" });
  }
});
it("limita tanto Content-Length como bytes realmente recibidos a16MiB", async () => {
  const limit = 16777216;
  for (const response of [
    new Response("{}", {
      headers: { "Content-Length": String(limit + 1), "Content-Type": "application/json" },
    }),
    new Response(new Uint8Array(limit + 1), { headers: { "Content-Type": "application/json" } }),
  ]) {
    await expect(
      readWebTrainingDownload(b.userId, vi.fn<typeof fetch>().mockResolvedValue(response)),
    ).rejects.toMatchObject({ code: "capacity" });
  }
});
it("un corte durante la lectura conserva la causa de red, sin acusar incompatibilidad", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(Error("connection lost"));
    },
  });
  const response = new Response(body, { headers: { "Content-Type": "application/json" } });
  await expect(
    readWebTrainingDownload(b.userId, vi.fn<typeof fetch>().mockResolvedValue(response)),
  ).rejects.toMatchObject({ code: "network" });
});
