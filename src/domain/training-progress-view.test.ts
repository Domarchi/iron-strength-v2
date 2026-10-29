import { expect, it } from "vitest";
import { buildTrainingProgress, type TrainingProgressSource } from "./training-progress";
import {
  availableTrainingMetrics,
  defaultTrainingMetric,
  primaryTrainingMark,
  trainingProgressReturn,
  queryPeriod,
  formatProgressValue,
} from "./training-progress-view";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function sample(kind: "duration" | "assisted_bodyweight" | null = null) {
  const metrics =
    kind === "duration"
      ? { recordType: kind, weightKg: null, reps: null, durationSeconds: 60, distanceMeters: null }
      : kind === "assisted_bodyweight"
        ? { recordType: kind, weightKg: 20, reps: 8, durationSeconds: null, distanceMeters: null }
        : { recordType: null, weightKg: 40, reps: 8, durationSeconds: null, distanceMeters: null };
  const source: TrainingProgressSource = {
    version: 1,
    userId: id(1),
    today: "2026-10-28",
    workouts: [
      {
        id: id(2),
        startedAt: "2026-10-01T16:00:00Z",
        date: "2026-10-01",
        sourceKind: "free",
        title: "Rutina",
        sessionLabel: null,
        durationSeconds: 1200,
        perceivedEffort: null,
        note: null,
        sets: [
          {
            id: id(3),
            exerciseId: id(4),
            name: "Ejercicio",
            muscleGroup: "Core",
            position: 0,
            setNumber: 1,
            metrics,
            setType: "working",
            effort: null,
          },
        ],
      },
    ],
  };
  return buildTrainingProgress(source).exercises[0];
}
it("tiempo/asistencia/legado ofrecen solo métricas aplicables y una marca real", () => {
  const time = sample("duration");
  expect(defaultTrainingMetric(time)).toBe("durationSeconds");
  expect(availableTrainingMetrics(time)).toEqual([
    "durationSeconds",
    "workingSets",
    "totalDurationSeconds",
  ]);
  expect(primaryTrainingMark(time)).toMatchObject({ metric: "durationSeconds", value: 60 });
  const assistance = sample("assisted_bodyweight");
  expect(defaultTrainingMetric(assistance)).toBe("assistanceKg");
  expect(availableTrainingMetrics(assistance)).not.toContain("estimated1RM");
  expect(availableTrainingMetrics(assistance)).not.toContain("externalVolumeKg");
  expect(primaryTrainingMark(assistance)).toMatchObject({
    metric: "assistanceKg",
    value: 20,
    metrics: { reps: 8 },
  });
  expect(defaultTrainingMetric(sample())).toBe("estimated1RM");
  expect(primaryTrainingMark(sample())?.value).toBe(40);
});
it("periodos y navegación de mes/año se calculan sin reloj ni cambios por zona del dispositivo", () => {
  expect(queryPeriod("2026-10-28", "month", 0)).toEqual({
    from: "2026-10-01",
    to: "2026-10-31",
    label: "Octubre 2026",
  });
  expect(queryPeriod("2026-01-28", "month", -1)).toEqual({
    from: "2025-12-01",
    to: "2025-12-31",
    label: "Diciembre 2025",
  });
  expect(queryPeriod("2024-02-28", "month", 0).to).toBe("2024-02-29");
  expect(queryPeriod("2026-10-28", "year", -1)).toEqual({
    from: "2025-01-01",
    to: "2025-12-31",
    label: "2025",
  });
  expect(() => queryPeriod("2026-02-30", "month", 0)).toThrow();
});
it("retorno valida cuenta implícita/ejercicio/tipo de evidencia, periodo/métrica cerrados y versión2", () => {
  const params = {
    progressVersion: "2",
    exercise: id(4),
    recordType: "duration",
    weeks: "4",
    metric: "durationSeconds",
  };
  expect(trainingProgressReturn(params, [{ exerciseId: id(4), recordType: "duration" }])).toEqual({
    exercise: id(4),
    recordType: "duration",
    weeks: 4,
    metric: "durationSeconds",
  });
  for (const patch of [
    { progressVersion: "3" },
    { weeks: ["4", "8"] },
    { recordType: "future" },
    { exercise: "https://evil.test" },
    { metric: "estimated1RM" },
  ])
    expect(
      trainingProgressReturn({ ...params, ...patch }, [
        { exerciseId: id(4), recordType: "duration" },
      ]),
    ).toBeNull();
  expect(trainingProgressReturn(params, [{ exerciseId: id(4), recordType: null }])).toBeNull();
});
it("presentación usa preferencias sin cambiar kg/metros; dimensiones ausentes no se inventan", () => {
  expect(formatProgressValue("weightKg", 40, { weightUnit: "lb", distanceUnit: "km" })).toContain(
    "lb",
  );
  expect(
    formatProgressValue("distanceMeters", 1000, { weightUnit: "kg", distanceUnit: "km" }),
  ).toBe("1 km");
  expect(formatProgressValue("durationSeconds", 60)).toBe("60 s");
  expect(formatProgressValue("workingSets", 1)).toBe("1 serie");
});
