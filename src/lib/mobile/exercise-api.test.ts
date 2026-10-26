import { describe, expect, it, vi } from "vitest";
import { createMobileExerciseApi } from "./exercise-api";
import {
  mobileCatalogSchema,
  mobileExerciseDetailSchema,
  parseExerciseHistoryCursor,
} from "./exercise-contracts";
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const exercise = {
  id,
  name: "Curl de bíceps",
  muscleGroup: "Brazos",
  equipment: null,
  isBodyweight: false,
  progressionIncrementKg: 1,
};
const history = {
  items: [
    {
      id: other,
      startedAt: "2026-10-23T15:00:00Z",
      date: "2026-10-23",
      sessionLabel: "A",
      sets: [{ id, position: 0, setNumber: 1, weightKg: 12, reps: 10, isWarmup: false }],
    },
  ],
  nextCursor: "2026-10-23T15:00:00Z|" + other,
};
const request = (query = "", token: string | null = "valid") =>
  new Request("https://example.test/api/mobile/v1/exercises" + query, {
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
function setup() {
  const catalog = vi.fn(async () => [exercise]);
  const detail = vi.fn(async () => ({ exercise, history }));
  const authorize = vi.fn(async (token: string) =>
    token === "valid" ? { catalog, detail } : null,
  );
  return { api: createMobileExerciseApi({ authorize }), catalog, detail, authorize };
}
describe("biblioteca móvil autenticada", () => {
  it("exige bearer y rechaza parámetros ajenos/repetidos antes de consultar", async () => {
    const x = setup();
    for (const token of [null, "bad"])
      expect((await x.api.catalog(request("", token))).status).toBe(401);
    expect(x.catalog).not.toHaveBeenCalled();
    expect((await x.api.catalog(request("?studentId=" + id))).status).toBe(400);
    for (const query of ["?studentId=" + other, "?cursor=invalid", "?cursor=a&cursor=b"])
      expect((await x.api.detail(request(query), id)).status).toBe(400);
    expect((await x.api.detail(request(), "../other")).status).toBe(404);
    expect(x.detail).not.toHaveBeenCalled();
  });
  it("devuelve catálogo validado sin campos privados, cookies ni caché compartida", async () => {
    const x = setup();
    x.catalog.mockResolvedValueOnce([{ ...exercise, coachId: other } as typeof exercise]);
    const response = await x.api.catalog(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await response.json()).toEqual({ version: 1, exercises: [exercise] });
  });
  it("valida detalle, pasa cursor descompuesto y no acepta otra identidad de ejercicio", async () => {
    const x = setup();
    const response = await x.api.detail(
      request("?cursor=" + encodeURIComponent(history.nextCursor)),
      id,
    );
    expect(response.status).toBe(200);
    expect(x.detail).toHaveBeenCalledWith(id, { startedAt: "2026-10-23T15:00:00Z", id: other });
    expect(await response.json()).toEqual({ version: 1, exercise, history });
    x.detail.mockResolvedValueOnce({ exercise: { ...exercise, id: other }, history });
    expect((await x.api.detail(request(), id)).status).toBe(503);
  });
  it("no filtra errores de base y diferencia detalle inexistente", async () => {
    const x = setup();
    x.detail.mockResolvedValueOnce(null!);
    expect((await x.api.detail(request(), id)).status).toBe(404);
    x.catalog.mockRejectedValueOnce(Error("private database details"));
    const response = await x.api.catalog(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database details");
  });
  it("contrato cierra versión, duplicados, paginación y límites", () => {
    expect(mobileCatalogSchema.safeParse({ version: 1, exercises: [exercise] }).success).toBe(true);
    expect(
      mobileCatalogSchema.safeParse({ version: 1, exercises: [exercise, exercise] }).success,
    ).toBe(false);
    expect(mobileCatalogSchema.safeParse({ version: 2, exercises: [] }).success).toBe(false);
    expect(mobileExerciseDetailSchema.safeParse({ version: 1, exercise, history }).success).toBe(
      true,
    );
    expect(
      mobileExerciseDetailSchema.safeParse({
        version: 1,
        exercise,
        history: { ...history, items: [] },
      }).success,
    ).toBe(false);
    for (const cursor of [
      "bad",
      "2026-10-23T15:00:00Z|" + other + "|extra",
      "2026-10-23T15:00:00Z|invalid",
    ])
      expect(parseExerciseHistoryCursor(cursor)).toBeNull();
  });
  it("conserva posiciones y números de series históricos sin aplicar límites de la UI actual", () => {
    const previous = structuredClone(history);
    previous.items[0].sets[0].position = 15;
    previous.items[0].sets[0].setNumber = 21;
    expect(
      mobileExerciseDetailSchema.safeParse({ version: 1, exercise, history: previous }).success,
    ).toBe(true);
    expect(
      mobileCatalogSchema.safeParse({
        version: 1,
        exercises: Array.from({ length: 1001 }, (_, n) => ({
          ...exercise,
          id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        })),
      }).success,
    ).toBe(false);
  });
});
