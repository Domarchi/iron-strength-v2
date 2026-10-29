import { it, expect } from "vitest";
import { trainingHistoryFixture } from "@/test/fixtures/training-history";
import {
  trainingHistorySourceSchema,
  historyProgressSource,
  historyCsvRows,
} from "./training-history";
import { buildHistoryCsv } from "./csv";
import { buildTrainingProgress } from "@/domain/training-progress";
const sample = () => trainingHistoryFixture() as unknown;
it("contrato cerrado conserva estructura, métricas y las 500 letras Unicode de una nota", () => {
  const source = sample(),
    before = structuredClone(source),
    value = trainingHistorySourceSchema.parse(source);
  expect(source).toEqual(before);
  expect(value.workouts[0].sets).toHaveLength(9);
  expect(value.workouts[0].structure?.version).toBe(2);
  expect(value.workouts[0].exerciseNotes?.[0].note).toBe("💪".repeat(500));
  const projected = historyProgressSource(value);
  expect(projected.userId).toBe(value.student.id);
  expect(buildTrainingProgress(projected).exercises).toHaveLength(8);
});
it("exporta cada serie real y una nota explícita sin fabricar métricas", () => {
  const source = trainingHistorySourceSchema.parse(sample()),
    rows = historyCsvRows(source);
  expect(rows).toHaveLength(10);
  for (const [i, row] of rows.slice(0, 9).entries()) {
    expect(row).toMatchObject({
      ...source.workouts[0].sets[i].metrics,
      workoutId: source.workouts[0].id,
      exerciseId: source.workouts[0].sets[i].exerciseId,
      setNumber: 1,
      setType: source.workouts[0].sets[i].setType,
      setEffort: source.workouts[0].sets[i].effort,
      sourceKind: "free",
      perceivedEffort: 8,
      workoutNote: "=SUM(1;2)",
    });
  }
  expect(rows[9]).toMatchObject({
    rowKind: "exercise_note",
    setNumber: null,
    weightKg: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    setType: null,
    setEffort: null,
    exerciseNote: "Nota sin series",
  });
  expect(buildHistoryCsv(rows)).toContain("Nota del ejercicio");
  expect(buildHistoryCsv(rows)).toContain("Nota sin series");
});
it("ningún campo futuro o cambio de identidad/dimensión se degrada a una exportación parcial", () => {
  const original = trainingHistorySourceSchema.parse(sample());
  const mutations = [
    (v: typeof original) => Object.assign(v, { future: 1 }),
    (v: typeof original) => {
      v.workouts[0].studentId = "00000000-0000-4000-8000-000000000001";
    },
    (v: typeof original) => {
      v.workouts[0].sets[0].metrics.durationSeconds = 60;
    },
    (v: typeof original) => {
      v.workouts[0].sets[0].exerciseId = v.workouts[0].sets[1].exerciseId;
    },
    (v: typeof original) => {
      v.workouts[0].sets.push(structuredClone(v.workouts[0].sets[0]));
    },
    (v: typeof original) => {
      v.workouts[0].exerciseNotes?.reverse();
    },
    (v: typeof original) => {
      Object.assign(v.workouts[0].structure!, { future: 1 });
    },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(original);
    mutate(value);
    expect(trainingHistorySourceSchema.safeParse(value).success).toBe(false);
  }
});
it("registros anteriores sin estructura conservan las celdas y el nombre histórico", () => {
  const value = trainingHistorySourceSchema.parse(sample()),
    w = value.workouts[0];
  w.structure = null;
  w.exerciseNotes = null;
  w.exerciseNames = [];
  w.sourceKind = "assigned";
  w.sets = [
    {
      ...w.sets[0],
      setType: "working",
      effort: null,
      name: "Nombre histórico",
      prescribedExerciseName: "Prescrito histórico",
    },
  ];
  const rows = historyCsvRows(trainingHistorySourceSchema.parse(value));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    exerciseName: "Nombre histórico",
    prescribedExerciseName: "Prescrito histórico",
    recordType: null,
    weightKg: 30,
    reps: 8,
    isWarmup: false,
  });
});

it("la nota de una fila intermedia conserva su posición entre las series reales", () => {
  const value = trainingHistorySourceSchema.parse(sample()),
    w = value.workouts[0];
  w.sets = w.sets.filter((s) => s.position !== 1);
  w.exerciseNotes![1].note = "Nota intercalada";
  const rows = historyCsvRows(trainingHistorySourceSchema.parse(value));
  expect(rows[1]).toMatchObject({
    rowKind: "exercise_note",
    exerciseId: w.structure!.exercises[1].exerciseId,
    exerciseNote: "Nota intercalada",
  });
  expect(rows[2].exerciseId).toBe(w.structure!.exercises[2].exerciseId);
});
