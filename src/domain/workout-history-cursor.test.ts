import { expect, it } from "vitest";
import { parseWorkoutHistoryCursor, workoutHistoryCursorString } from "./workout-history-cursor";
const userId = "a0000000-0000-4000-8000-000000000001",
  id = "b0000000-0000-4000-8000-000000000002",
  startedAt = "2026-10-29T12:00:00.123456+00:00";
it("el cursor opaco conserva instante, desempate y cuenta sin interpretar milisegundos", () => {
  const value = workoutHistoryCursorString({ userId, startedAt, id });
  expect(value).toBe(`v2|${userId}|${startedAt}|${id}`);
  expect(parseWorkoutHistoryCursor(value)).toEqual({ version: 2, userId, startedAt, id });
  expect(parseWorkoutHistoryCursor(startedAt)).toEqual({ version: 1, startedAt });
});
it("rechaza versiones/filtros/campos inválidos en vez de degradarlos a fechas", () => {
  for (const value of [
    null,
    [],
    {},
    "",
    `v3|${userId}|${startedAt}|${id}`,
    `v2|${userId}|${startedAt}|${id}|extra`,
    `v2|${userId}|2026-02-30|${id}`,
    `v2|${userId}|${startedAt}|${id}),id.gt.0`,
    "x".repeat(161),
  ])
    expect(parseWorkoutHistoryCursor(value)).toBeNull();
});
