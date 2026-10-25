import { describe, expect, it, vi } from "vitest";
import { createMobileProgressApi } from "./progress-api";
const id = "11111111-1111-4111-8111-111111111111";
const request = (query = "", token = "valid") =>
  new Request("https://example.test/" + query, { headers: { Authorization: "Bearer " + token } });
describe("detalle de progreso nativo", () => {
  it("cierra identidad, UUID y parámetros antes de consultar datos", async () => {
    const detail = vi.fn(async () => null),
      authorize = vi.fn(async (token: string) => (token === "valid" ? { detail } : null));
    const api = createMobileProgressApi({ authorize });
    expect((await api.detail(request("", "bad"), id)).status).toBe(401);
    expect((await api.detail(request(), "bad")).status).toBe(404);
    for (const query of ["?studentId=" + id, "?weeks=4", "?metric=1rm", "?id=a&id=b"])
      expect((await api.detail(request(query), id)).status).toBe(400);
    expect(detail).not.toHaveBeenCalled();
    expect((await api.detail(request(), id)).status).toBe(404);
    detail.mockRejectedValueOnce(Error("private details"));
    const failed = await api.detail(request(), id);
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("private details");
  });
});
