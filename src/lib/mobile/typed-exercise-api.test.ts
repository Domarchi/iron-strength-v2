import { expect, it, vi } from "vitest";
import { createTypedExerciseApi } from "./typed-exercise-api";
import { typedCatalogSchema, typedExerciseDetailSchema } from "./typed-exercise-contracts";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const exercise = {
  id,
  name: "Plancha",
  muscleGroup: "Core",
  equipment: null,
  isBodyweight: true,
  progressionIncrementKg: 1,
  recordType: "duration",
};
const history = {
  items: [
    {
      id: other,
      startedAt: "2026-10-27T12:00:00Z",
      date: "2026-10-27",
      sessionLabel: null,
      title: "Libre",
      sourceKind: "free",
      exerciseNotes: [{ position: 17, note: "Propia" }],
      sets: [
        {
          id,
          position: 17,
          setNumber: 21,
          metrics: {
            recordType: "duration",
            weightKg: null,
            reps: null,
            durationSeconds: 60,
            distanceMeters: null,
          },
          setType: "drop",
          effort: 8.5,
        },
      ],
    },
  ],
  nextCursor: null,
};
function setup() {
  const catalog = vi.fn(async () => [exercise]),
    detail = vi.fn(async () => ({ exercise, history }));
  return {
    catalog,
    detail,
    api: createTypedExerciseApi({
      authorize: async (t) => (t === "valid" ? { catalog, detail } : null),
    }),
  };
}
const request = (query = "", token: string | null = "valid") =>
  new Request("https://example.test/api/mobile/v1/training-catalog" + query, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
it("exige Bearer, rechaza queries ajenas y devuelve catálogo2 canónico sin cookies/caché", async () => {
  const x = setup();
  for (const t of [null, "bad"]) expect((await x.api.catalog(request("", t))).status).toBe(401);
  expect((await x.api.catalog(request("?studentId=" + other))).status).toBe(400);
  expect(x.catalog).not.toHaveBeenCalled();
  const response = await x.api.catalog(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ version: 2, exercises: [exercise] });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("vary")).toContain("Authorization");
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("ficha2 valida ID/cursor y preserva dimensiones, notas y numeración histórica", async () => {
  const x = setup();
  expect((await x.api.detail(request(), "../other")).status).toBe(404);
  expect((await x.api.detail(request("?cursor=bad"), id)).status).toBe(400);
  const response = await x.api.detail(request(), id);
  expect(await response.json()).toEqual({ version: 2, exercise, history });
  expect(typedExerciseDetailSchema.safeParse({ version: 2, exercise, history }).success).toBe(true);
  x.detail.mockResolvedValueOnce({ exercise: { ...exercise, id: other }, history });
  expect((await x.api.detail(request(), id)).status).toBe(503);
  x.detail.mockResolvedValueOnce(null!);
  expect((await x.api.detail(request(), id)).status).toBe(404);
});
it("rechaza catálogo/tipos/filas duplicadas o futuras y errores privados sin normalizar historial por metadata", async () => {
  const x = setup();
  for (const value of [
    { version: 1, exercises: [exercise] },
    { version: 2, exercises: [{ ...exercise, recordType: undefined }] },
    { version: 2, exercises: [exercise, exercise] },
    { version: 2, exercises: [{ ...exercise, recordType: "other" }] },
  ])
    expect(typedCatalogSchema.safeParse(value).success).toBe(false);
  const legacy = {
    ...history,
    items: history.items.map((w) => ({
      ...w,
      sets: w.sets.map((row) => ({
        ...row,
        metrics: {
          recordType: null,
          weightKg: 30,
          reps: 8,
          durationSeconds: null,
          distanceMeters: null,
        },
      })),
    })),
  };
  expect(
    typedExerciseDetailSchema.safeParse({ version: 2, exercise, history: legacy }).success,
  ).toBe(true);
  x.catalog.mockRejectedValueOnce(Error("privateSQL"));
  const response = await x.api.catalog(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("privateSQL");
});
