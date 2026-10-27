import { expect, it } from "vitest";
import { repetitionValues, storedTrainingSet } from "./stored-training-set";
it("no convierte null, asistencia o segundos a peso/repeticiones", () => {
  for (const row of [
    { weight_kg: null, reps: 8 },
    { weight_kg: 30, reps: null },
    { weight_kg: 20, reps: 8, record_type: "assisted_bodyweight" },
    { weight_kg: 20, reps: 8, record_type: "weighted_bodyweight" },
    { weight_kg: 0, reps: 8, record_type: "weight_reps" },
  ])
    expect(() => repetitionValues(row)).toThrow("métricas avanzadas");
  expect(repetitionValues({ weight_kg: 30, reps: 8, record_type: null })).toEqual({
    weightKg: 30,
    reps: 8,
  });
  expect(storedTrainingSet({ weight_kg: 0, reps: 8, is_warmup: true })).toMatchObject({
    recordType: null,
    setType: "warmup",
    weightKg: 0,
    reps: 8,
  });
  expect(
    storedTrainingSet({
      weight_kg: null,
      reps: null,
      is_warmup: false,
      record_type: "duration",
      duration_seconds: 60,
      distance_meters: null,
      set_type: "drop",
      effort: 8.5,
    }),
  ).toMatchObject({
    weightKg: null,
    reps: null,
    durationSeconds: 60,
    setType: "drop",
    effort: 8.5,
  });
  expect(() =>
    storedTrainingSet({ weight_kg: 0, reps: 8, is_warmup: false, record_type: "weight_reps" }),
  ).toThrow("incompatible");
});
