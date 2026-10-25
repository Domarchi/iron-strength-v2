import { describe, expect, it, vi } from "vitest";
import { createMobileDownloadApi } from "./download-api";
import { weekDownloadFixture } from "../../test/fixtures/week-download";
const request = (query = "", token = "valid") =>
  new Request("https://example.test/" + query, { headers: { Authorization: "Bearer " + token } });
describe("descarga móvil autenticada", () => {
  it("deriva cuenta, cierra parámetros y confirma un paquete completo sin cookies/caché", async () => {
    const pack = weekDownloadFixture(),
      download = vi.fn(async () => pack),
      authorize = vi.fn(async (token: string) =>
        token === "valid" ? { userId: pack.userId, download } : null,
      ),
      api = createMobileDownloadApi({ authorize });
    expect((await api.download(request("", "bad"))).status).toBe(401);
    expect((await api.download(request("?studentId=" + pack.userId))).status).toBe(400);
    expect(download).not.toHaveBeenCalled();
    const response = await api.download(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await response.json()).toEqual({ version: 1, userId: pack.userId, pack });
  });
  it("no publica un paquete ajeno o incompleto ni filtra el fallo de base", async () => {
    const pack = weekDownloadFixture(),
      download = vi.fn(async () => pack),
      api = createMobileDownloadApi({ authorize: async () => ({ userId: pack.userId, download }) });
    download.mockResolvedValueOnce({ ...pack, userId: "11111111-1111-4111-8111-111111111111" });
    expect((await api.download(request())).status).toBe(503);
    download.mockRejectedValueOnce(Error("private database details"));
    const failed = await api.download(request());
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("private database details");
  });
});
