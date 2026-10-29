import { expect, it } from "vitest";
import { parseTrainingSetInput, prefillTrainingInput } from "./training-input";
import { RECORD_TYPES, type RecordType } from "./training-metrics";
const blank = {
  weight: "",
  reps: "",
  duration: "",
  distance: "",
  effort: "",
  setType: "working" as const,
};
it("texto decimal local se valida sin notación científica, dimensiones ocultas ni coerciones vacías", () => {
  expect(parseTrainingSetInput(null, { ...blank, reps: "8" })).toMatchObject({
    weightKg: 0,
    reps: 8,
    effort: null,
  });
  expect(
    parseTrainingSetInput("weight_reps", { ...blank, weight: "20,5", reps: "8", effort: "9,5" }),
  ).toMatchObject({ weightKg: 20.5, effort: 9.5 });
  for (const value of [
    "1e2",
    "+3",
    "-1",
    "Infinity",
    "NaN",
    "1,",
    "1.2.3",
    "0x10",
    "500.01",
    "1.001",
  ])
    expect(parseTrainingSetInput("weight_reps", { ...blank, weight: value, reps: "8" })).toBeNull();
  for (const value of ["1.0", "1,0", "0", "101", "1e1", ""])
    expect(parseTrainingSetInput("bodyweight_reps", { ...blank, reps: value })).toBeNull();
  expect(parseTrainingSetInput("duration", { ...blank, duration: "60", weight: "0" })).toBeNull();
  expect(parseTrainingSetInput("duration", { ...blank, duration: "86400" })).toMatchObject({
    durationSeconds: 86400,
    weightKg: null,
  });
  expect(parseTrainingSetInput("duration", { ...blank, duration: "86401" })).toBeNull();
  expect(parseTrainingSetInput("duration", { ...blank, duration: "30", effort: "0" })).toBeNull();
});
it.each([null, ...RECORD_TYPES])(
  "precarga de %s conserva solo el peso válido del mismo tipo, jamás ejecución de otras dimensiones",
  (kind) => {
    const weighted = [
      null,
      "weight_reps",
      "weighted_bodyweight",
      "assisted_bodyweight",
      "weight_duration",
      "weight_distance",
    ].includes(kind);
    const reps = [
      null,
      "weight_reps",
      "bodyweight_reps",
      "weighted_bodyweight",
      "assisted_bodyweight",
    ].includes(kind);
    const target = {
      repsMin: reps ? 8 : null,
      repsMax: reps ? 10 : null,
      targetWeightKg: weighted ? 25 : null,
      targetDurationSeconds: null,
      targetDistanceMeters: null,
    };
    const p = { recordType: kind, sets: 1, target, series: null };
    const actual = {
      recordType: kind as RecordType,
      weightKg: weighted ? 10 : null,
      reps: reps ? 8 : null,
      durationSeconds: ["duration", "weight_duration", "distance_duration"].includes(kind ?? "")
        ? 30
        : null,
      distanceMeters: ["distance_duration", "weight_distance"].includes(kind ?? "") ? 100 : null,
    };
    expect(prefillTrainingInput(p, 0, actual)).toEqual({ ...blank, weight: weighted ? "25" : "" });
    const unprescribed = { ...p, target: { ...target, targetWeightKg: null } };
    expect(prefillTrainingInput(unprescribed, 0, actual).weight).toBe(weighted ? "10" : "");
    expect(prefillTrainingInput(unprescribed, 0, null).weight).toBe("");
  },
);
it("objetivos fuera del índice y referencias incompatibles no se transforman en una serie ficticia", () => {
  const target = {
    repsMin: 8,
    repsMax: 12,
    targetWeightKg: null,
    targetDurationSeconds: null,
    targetDistanceMeters: null,
  };
  const p = { recordType: null, sets: 1, target, series: null };
  for (const index of [-1, 1, 0.5]) expect(() => prefillTrainingInput(p, index, null)).toThrow();
  const different = {
    recordType: "weight_reps" as const,
    weightKg: 20,
    reps: 8,
    durationSeconds: null,
    distanceMeters: null,
  };
  expect(prefillTrainingInput(p, 0, different).weight).toBe("");
  expect(prefillTrainingInput(p, 0, null, 12.5).weight).toBe("12,5");
  expect(prefillTrainingInput(p, 0, null, NaN).weight).toBe("");
  const details = {
    ...p,
    target: { ...target, targetWeightKg: 35 },
    series: [{ ...target, targetWeightKg: 35 }],
  };
  expect(prefillTrainingInput(details, 0, different).weight).toBe("35");
});
