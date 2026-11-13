import { describe, expect, it, vi } from "vitest";
import { createMobileMeasurementsApi, type MobileMeasurementsIdentity } from "./measurements-api";

const id = "11111111-1111-4111-8111-111111111111";
const item = {
  id,
  measuredOn: "2026-11-10",
  weightKg: 80.5,
  waistCm: null,
  chestCm: null,
  armCm: null,
};
const measurement = {
  measuredOn: "2026-11-10",
  weightKg: 80.5,
  waistCm: null,
  chestCm: null,
  armCm: null,
};
const req = (body?: unknown, token = "valid", query = "") =>
  new Request("https://example.test/" + query, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

function setup(overrides: Partial<MobileMeasurementsIdentity> = {}) {
  const who: MobileMeasurementsIdentity = {
    list: vi.fn(async () => [item]),
    save: vi.fn(async () => ({ ok: true as const, replaced: false })),
    remove: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
  return {
    who,
    api: createMobileMeasurementsApi({ authorize: async (t) => (t === "valid" ? who : null) }),
  };
}

describe("medidas corporales nativas", () => {
  it("lista solo con identidad y sin parámetros", async () => {
    const { api, who } = setup();
    expect((await api.list(req(undefined, "bad"))).status).toBe(401);
    expect((await api.list(req(undefined, "valid", "?studentId=x"))).status).toBe(400);
    expect(who.list).not.toHaveBeenCalled();
    const ok = await api.list(req());
    expect(await ok.json()).toEqual({ version: 1, items: [item] });
  });
  it("guarda, exige confirmar el reemplazo y mapea los rechazos", async () => {
    const { api, who } = setup();
    expect((await api.save(req({ version: 1, measurement, replace: false }, "bad"))).status).toBe(
      401,
    );
    for (const body of [
      { version: 1, measurement: { ...measurement, studentId: "x" }, replace: false },
      { version: 1, measurement: { ...measurement, weightKg: -1 }, replace: false },
      { version: 1, measurement, replace: "si" },
      { version: 2, measurement, replace: false },
      "no es json",
    ])
      expect((await api.save(req(body))).status).toBe(400);
    expect(who.save).not.toHaveBeenCalled();
    const created = await api.save(req({ version: 1, measurement, replace: false }));
    expect(await created.json()).toEqual({ version: 1, status: "created" });
    expect(who.save).toHaveBeenCalledWith(measurement, false);
    const cases: [object, number][] = [
      [{ ok: true, replaced: true }, 200],
      [{ ok: false, reason: "exists" }, 409],
      [{ ok: false, reason: "forbidden" }, 403],
      [{ ok: false, reason: "invalid" }, 400],
    ];
    for (const [result, status] of cases) {
      const s = setup({ save: async () => result as never });
      expect((await s.api.save(req({ version: 1, measurement, replace: true }))).status).toBe(
        status,
      );
    }
  });
  it("borra por UUID propio y no filtra detalles internos", async () => {
    const { api, who } = setup();
    expect((await api.remove(req({ version: 1, id: "no" }))).status).toBe(400);
    expect((await api.remove(req({ version: 1, id }))).status).toBe(200);
    expect(who.remove).toHaveBeenCalledWith(id);
    const gone = setup({
      remove: async () => ({ ok: false as const, reason: "not_found" as const }),
    });
    expect((await gone.api.remove(req({ version: 1, id }))).status).toBe(404);
    const boom = setup({
      list: async () => {
        throw Error("private details");
      },
    });
    const r = await boom.api.list(req());
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("private details");
  });
});
