import { describe, expect, it, vi } from "vitest";
import { createMobileAchievementsApi } from "./achievements-api";

const request = (query = "", token = "valid") =>
  new Request("https://example.test/" + query, { headers: { Authorization: "Bearer " + token } });
const value = {
  version: 1 as const,
  streak: { current: 3, longest: 5 },
  workoutCount: 12,
  earned: [{ kind: "first_workout" as const, earnedAt: "2026-10-01T12:00:00.000Z" }],
};

describe("logros y racha nativos", () => {
  it("cierra identidad y parámetros antes de leer datos y no filtra detalles internos", async () => {
    const read = vi.fn(async () => value),
      authorize = vi.fn(async (token: string) => (token === "valid" ? { read } : null));
    const api = createMobileAchievementsApi({ authorize });
    expect((await api.read(request("", "bad"))).status).toBe(401);
    expect((await api.read(new Request("https://example.test/"))).status).toBe(401);
    for (const query of ["?studentId=x", "?weeks=4", "?a=1&a=2"])
      expect((await api.read(request(query))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    const ok = await api.read(request());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(value);
    expect(ok.headers.get("Cache-Control")).toContain("no-store");
    read.mockRejectedValueOnce(Error("private details"));
    const failed = await api.read(request());
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("private details");
  });
  it("rechaza una respuesta que no cumple el contrato", async () => {
    const api = createMobileAchievementsApi({
      authorize: async () => ({
        read: async () => ({ ...value, streak: { current: -1, longest: 0 } }),
      }),
    });
    expect((await api.read(request())).status).toBe(503);
  });
});
