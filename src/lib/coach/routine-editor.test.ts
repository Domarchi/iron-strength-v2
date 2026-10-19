import { expect, it } from "vitest";
import { prescriptionDraft, validatePrescriptions, searchExercises } from "./routine-editor";

const row = {
  id: "a",
  exerciseId: "00000000-0000-4000-8000-000000000001",
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  targetWeightKg: null,
  note: null,
};
it("conserva el peso vacío, admite coma decimal y valida antes de enviar", () => {
  const draft = prescriptionDraft(row);
  expect(draft.targetWeightKg).toBe("");
  expect(
    validatePrescriptions([{ ...draft, targetWeightKg: "62,5" }]).rows[0]?.targetWeightKg,
  ).toBe(62.5);
  expect(validatePrescriptions([{ ...draft, repsMin: "15" }]).errors.a).toContain("mínimo");
});
it("no acepta filas duplicadas ni un lote mayor al límite", () => {
  const draft = prescriptionDraft(row);
  expect(validatePrescriptions([draft, draft]).error).toBeTruthy();
  expect(
    validatePrescriptions(Array.from({ length: 16 }, (_, i) => ({ ...draft, id: String(i) })))
      .error,
  ).toBeTruthy();
});
it("busca sin tildes por nombre, equipo y músculo, combinando el filtro", () => {
  const catalog = [
    { id: "a", name: "Jalón", muscleGroup: "Espalda", equipment: "Polea" },
    { id: "b", name: "Press", muscleGroup: "Pecho", equipment: "Barra" },
  ];
  expect(searchExercises(catalog, "jalon", "").map((e) => e.id)).toEqual(["a"]);
  expect(searchExercises(catalog, "polea", "Espalda").map((e) => e.id)).toEqual(["a"]);
  expect(searchExercises(catalog, "barra", "Espalda")).toEqual([]);
});
