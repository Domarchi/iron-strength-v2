import { expect, it } from "vitest";
import { formatTrainingTarget } from "./training-labels";
const empty = {
  repsMin: null,
  repsMax: null,
  targetWeightKg: null,
  targetDurationSeconds: null,
  targetDistanceMeters: null,
};
it("separa peso/tiempo/distancia y conserva ceros y coma decimal sin juntar las unidades", () => {
  expect(formatTrainingTarget({ ...empty, targetWeightKg: 20, targetDurationSeconds: 60 })).toBe(
    "20 kg · 60 s",
  );
  expect(formatTrainingTarget({ ...empty, targetWeightKg: 0, targetDistanceMeters: 30.5 })).toBe(
    "0 kg · 30,5 m",
  );
  expect(
    formatTrainingTarget({ ...empty, targetDurationSeconds: 300, targetDistanceMeters: 1000 }),
  ).toBe("300 s · 1.000 m");
});
it("presenta un rango o reps iguales y no inventa un objetivo numérico cuando no existe", () => {
  expect(formatTrainingTarget({ ...empty, repsMin: 8, repsMax: 12, targetWeightKg: 30.5 })).toBe(
    "8–12 reps · 30,5 kg",
  );
  expect(formatTrainingTarget({ ...empty, repsMin: 8, repsMax: 8 })).toBe("8 reps");
  expect(formatTrainingTarget(empty)).toBe("");
});
