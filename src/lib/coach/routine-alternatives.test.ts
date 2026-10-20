import { expect, it } from "vitest";
import { validateAlternatives, alternativeDraft } from "./routine-alternatives";
const source = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const row = { exerciseId: target, sets: "3", repsMin: "8", repsMax: "12", targetWeightKg: "22,5" };
it("valida prescripción propia, coma decimal y eliminación de todas las alternativas", () => {
  expect(validateAlternatives(source, [row])).toMatchObject({
    ok: true,
    rows: [{ exerciseId: target, sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 22.5 }],
  });
  expect(validateAlternatives(source, [])).toEqual({ ok: true, rows: [] });
  expect(
    alternativeDraft({ exerciseId: target, sets: 2, repsMin: 6, repsMax: 8, targetWeightKg: null }),
  ).toEqual({ exerciseId: target, sets: "2", repsMin: "6", repsMax: "8", targetWeightKg: "" });
});
it("rechaza más de tres, duplicados, autorreferencias y rangos inválidos", () => {
  for (const rows of [
    [row, row],
    Array.from({ length: 4 }, () => row),
    [{ ...row, exerciseId: source }],
    [{ ...row, sets: "" }],
    [{ ...row, repsMax: "7" }],
    [{ ...row, targetWeightKg: "501" }],
  ])
    expect(validateAlternatives(source, rows).ok).toBe(false);
});
