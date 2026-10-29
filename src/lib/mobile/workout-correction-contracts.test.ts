import { describe, expect, it } from "vitest";
import type { TrainingMetrics } from "@/domain/training-metrics";
import { RECORD_TYPES } from "@/domain/training-metrics";
import {
  workoutCorrectionSchema,
  workoutCorrectionSnapshotSchema,
  validateWorkoutCorrection,
} from "./workout-correction-contracts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const metrics: TrainingMetrics = {
  recordType: null,
  weightKg: 60,
  reps: 8,
  durationSeconds: null,
  distanceMeters: null,
};
function snapshot() {
  return {
    version: 1 as const,
    userId: id(1),
    today: "2026-10-28",
    workout: {
      id: id(2),
      revision: 3,
      sourceKind: "free" as const,
      title: "Mi sesión",
      sessionLabel: null,
      performedOn: "2026-10-21",
      startedAt: "2026-10-21T15:00:00Z",
      durationSeconds: 3600,
      structure: null,
      perceivedEffort: null,
      note: null,
      exerciseNotes: null,
      sets: [
        {
          id: id(3),
          position: 0,
          setNumber: 1,
          exerciseId: id(4),
          exerciseName: "Nombre histórico",
          prescribedExerciseId: null,
          prescribedExerciseName: null,
          sessionExerciseId: null,
          metrics,
          setType: null,
          effort: null,
          isWarmup: false,
        },
      ],
    },
  };
}
function request() {
  return {
    version: 1 as const,
    requestId: id(5),
    workoutId: id(2),
    expectedRevision: 3,
    perceivedEffort: 7,
    note: "Corrección",
    exerciseNotes: null,
    sets: [
      {
        id: id(3),
        metrics: { ...metrics, weightKg: 62.5 },
        setType: null,
        effort: null,
        isWarmup: false,
      },
    ],
  };
}
describe("contratos de corrección histórica T218", () => {
  for (const recordType of [null, ...RECORD_TYPES]) {
    it(`corrige el tipo registrado ${recordType ?? "legado en cierre tipado"} sin introducir dimensiones`, () => {
      const hasReps =
        recordType === null ||
        ["weight_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight"].includes(
          recordType,
        );
      const hasWeight =
        recordType === null ||
        [
          "weight_reps",
          "weighted_bodyweight",
          "assisted_bodyweight",
          "weight_duration",
          "weight_distance",
        ].includes(recordType);
      const hasTime = ["duration", "weight_duration", "distance_duration"].includes(
        recordType ?? "",
      );
      const hasDistance = ["distance_duration", "weight_distance"].includes(recordType ?? "");
      const recorded = {
        recordType,
        weightKg: hasWeight ? 60 : null,
        reps: hasReps ? 8 : null,
        durationSeconds: hasTime ? 60 : null,
        distanceMeters: hasDistance ? 1000 : null,
      };
      const target = {
        repsMin: recorded.reps,
        repsMax: recorded.reps,
        targetWeightKg: recorded.weightKg,
        targetDurationSeconds: recorded.durationSeconds,
        targetDistanceMeters: recorded.distanceMeters,
      };
      const notes = [{ sessionExerciseId: id(7), note: "Nota histórica" }];
      const source = snapshot();
      const base = workoutCorrectionSnapshotSchema.parse({
        ...source,
        workout: {
          ...source.workout,
          structure: {
            version: 2,
            exercises: [
              {
                id: id(7),
                exerciseId: id(4),
                prescribedExerciseId: null,
                prescribed: { recordType, sets: 1, target, series: null },
                note: null,
                restSeconds: 60,
                supersetId: null,
                supersetRestSeconds: null,
              },
            ],
          },
          exerciseNotes: notes,
          sets: [{ ...source.workout.sets[0], metrics: recorded, setType: "working" }],
        },
      });
      const input = workoutCorrectionSchema.parse({
        ...request(),
        exerciseNotes: [{ sessionExerciseId: id(7), note: "Corrección de nota" }],
        sets: [
          {
            ...request().sets[0],
            metrics: {
              ...recorded,
              weightKg: hasWeight ? 62.5 : null,
              reps: hasReps ? 9 : null,
              durationSeconds: hasTime ? 75 : null,
              distanceMeters: hasDistance ? 1100 : null,
            },
            setType: "warmup",
            isWarmup: true,
            effort: 8.5,
          },
        ],
      });
      expect(validateWorkoutCorrection(base, input)).toEqual(input);
      expect(() =>
        validateWorkoutCorrection(base, {
          ...input,
          exerciseNotes: [{ sessionExerciseId: id(8), note: null }],
        }),
      ).toThrow();
      expect(() => validateWorkoutCorrection(base, { ...input, exerciseNotes: null })).toThrow();
      expect(() =>
        validateWorkoutCorrection(base, { ...input, sets: [{ ...input.sets[0], setType: null }] }),
      ).toThrow();
      expect(
        workoutCorrectionSchema.safeParse({
          ...input,
          sets: [{ ...input.sets[0], isWarmup: false }],
        }).success,
      ).toBe(false);
    });
  }
  it("mantiene la revisión y corrige datos legado sin convertir el cierre", () => {
    const base = workoutCorrectionSnapshotSchema.parse(snapshot());
    const input = workoutCorrectionSchema.parse(request());
    expect(validateWorkoutCorrection(base, input)).toEqual(input);
    expect(base.workout.sets[0].exerciseName).toBe("Nombre histórico");
    expect(base.workout.sets[0].metrics.weightKg).toBe(60);
    expect(base.workout.structure).toBeNull();
  });
  it("conserva también el cierre con estructura1 y sus objetivos originales", () => {
    const source = snapshot();
    const base = workoutCorrectionSnapshotSchema.parse({
      ...source,
      workout: {
        ...source.workout,
        structure: {
          version: 1,
          exercises: [
            {
              id: id(7),
              exerciseId: id(4),
              prescribedExerciseId: null,
              prescribed: { sets: 3, repsMin: 8, repsMax: 12, targetWeightKg: 60, series: null },
              note: "Objetivo al cerrar",
              restSeconds: 90,
              supersetId: null,
              supersetRestSeconds: null,
            },
          ],
        },
      },
    });
    expect(
      validateWorkoutCorrection(base, workoutCorrectionSchema.parse(request())).sets[0].metrics
        .weightKg,
    ).toBe(62.5);
    expect(base.workout.structure?.exercises[0].prescribed.sets).toBe(3);
    expect(base.workout.structure?.exercises[0].note).toBe("Objetivo al cerrar");
  });
  it("rechaza versiones futuras, campos ajenos, vacíos y series repetidas", () => {
    for (const value of [
      { ...request(), version: 2 },
      { ...request(), studentId: id(1) },
      { ...request(), sets: [] },
      { ...request(), sets: [...request().sets, ...request().sets] },
      { ...request(), expectedRevision: -1 },
      { ...request(), sets: [{ ...request().sets[0], position: 1 }] },
    ])
      expect(workoutCorrectionSchema.safeParse(value).success).toBe(false);
  });
  it("valida todos los IDs y la revisión; nunca admite una serie agregada o ajena", () => {
    const base = workoutCorrectionSnapshotSchema.parse(snapshot());
    for (const value of [
      { ...request(), workoutId: id(9) },
      { ...request(), expectedRevision: 4 },
      { ...request(), sets: [{ ...request().sets[0], id: id(9) }] },
    ])
      expect(() => validateWorkoutCorrection(base, workoutCorrectionSchema.parse(value))).toThrow();
  });
  it("conserva el formato anterior y solo permite sus dimensiones y calentamiento", () => {
    const base = workoutCorrectionSnapshotSchema.parse(snapshot());
    for (const set of [
      { ...request().sets[0], metrics: { ...metrics, recordType: "weight_reps" } },
      { ...request().sets[0], setType: "failure" },
      { ...request().sets[0], effort: 8 },
    ])
      expect(() =>
        validateWorkoutCorrection(
          base,
          workoutCorrectionSchema.parse({ ...request(), sets: [set] }),
        ),
      ).toThrow();
    const warmup = workoutCorrectionSchema.parse({
      ...request(),
      sets: [{ ...request().sets[0], isWarmup: true }],
    });
    expect(validateWorkoutCorrection(base, warmup).sets[0].isWarmup).toBe(true);
  });
  it("permite quitar algunas series, preservando al menos una", () => {
    const source = snapshot();
    source.workout.sets.push({ ...source.workout.sets[0], id: id(6), setNumber: 2 });
    expect(
      validateWorkoutCorrection(
        workoutCorrectionSnapshotSchema.parse(source),
        workoutCorrectionSchema.parse(request()),
      ).sets,
    ).toHaveLength(1);
    expect(workoutCorrectionSchema.safeParse({ ...request(), sets: [] }).success).toBe(false);
  });
  it("usa notas de 500 puntos Unicode y esfuerzo de sesión entero opcional", () => {
    expect(
      workoutCorrectionSchema.safeParse({
        ...request(),
        note: "🏋".repeat(500),
        perceivedEffort: 10,
      }).success,
    ).toBe(true);
    for (const value of [
      { ...request(), note: "🏋".repeat(501) },
      { ...request(), perceivedEffort: 7.5 },
      { ...request(), perceivedEffort: 0 },
    ])
      expect(workoutCorrectionSchema.safeParse(value).success).toBe(false);
  });
  it("no admite instantáneas truncadas o incoherentes con fecha/tipo/IDs", () => {
    const base = snapshot();
    for (const value of [
      { ...base, version: 2 },
      { ...base, workout: { ...base.workout, sets: [] } },
      { ...base, workout: { ...base.workout, sets: [...base.workout.sets, ...base.workout.sets] } },
      { ...base, workout: { ...base.workout, performedOn: "2026-10-22" } },
      {
        ...base,
        workout: { ...base.workout, sets: [{ ...base.workout.sets[0], setType: "working" }] },
      },
    ])
      expect(workoutCorrectionSnapshotSchema.safeParse(value).success).toBe(false);
  });
});
