import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { listMobileExercises } from "./exercises";
const row = (n: number) => ({
  id: String(n),
  coach_id: null,
  name: "Ejercicio " + n,
  muscle_group: "Brazos",
  equipment: null,
  is_bodyweight: false,
  progression_increment_kg: 1,
  archived_at: null,
});
function setup(pages: unknown[]) {
  const range = vi.fn();
  for (const page of pages) range.mockResolvedValueOnce(page);
  const query = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range,
  };
  const db = { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;
  return { db, query };
}
it("lee catálogo y conteo en una consulta, sin páginas OFFSET de instantes distintos", async () => {
  const x = setup([{ data: [row(1), row(2), row(3)], count: 3, error: null }]);
  expect(await listMobileExercises(x.db)).toHaveLength(3);
  expect(x.query.range.mock.calls).toEqual([[0, 999]]);
  expect(x.query.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
  expect(x.query.is).toHaveBeenCalledWith("archived_at", null);
});
it("rechaza un recorte del servidor en vez de completar con otro instante del catálogo", async () => {
  const x = setup([
    { data: [row(1), row(2)], count: 3, error: null },
    { data: [row(4)], count: 3, error: null },
  ]);
  await expect(listMobileExercises(x.db)).rejects.toThrow();
  expect(x.query.range).toHaveBeenCalledTimes(1);
});
it("falla de forma explícita ante catálogo incompleto, repetido o demasiado grande", async () => {
  for (const pages of [
    [{ data: [], count: 1001, error: null }],
    [{ data: [], count: 1, error: null }],
    [{ data: [row(1)], count: null, error: null }],
    [
      { data: [row(1)], count: 2, error: null },
      { data: [row(2)], count: 3, error: null },
    ],
    [{ data: [row(1), row(1)], count: 2, error: null }],
    [{ data: null, count: null, error: { message: "unavailable" } }],
  ])
    await expect(listMobileExercises(setup(pages).db)).rejects.toThrow();
});
