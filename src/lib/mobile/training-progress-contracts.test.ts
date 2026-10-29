import { expect, it } from "vitest";
import { buildTrainingProgress, type TrainingProgressSource } from "../../domain/training-progress";
import { trainingProgressSchema } from "./training-progress-contracts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function result() {
  const source: TrainingProgressSource = {
    version: 1,
    userId: id(1),
    today: "2026-10-28",
    workouts: [
      {
        id: id(2),
        date: "2026-10-01",
        startedAt: "2026-10-01T16:00:00Z",
        sourceKind: "free",
        title: "Libre",
        sessionLabel: null,
        durationSeconds: 60,
        perceivedEffort: null,
        note: null,
        sets: [
          {
            id: id(3),
            exerciseId: id(4),
            name: "Press",
            muscleGroup: "Pecho",
            position: 0,
            setNumber: 1,
            metrics: {
              recordType: "weight_reps",
              weightKg: 40,
              reps: 8,
              durationSeconds: null,
              distanceMeters: null,
            },
            setType: "working",
            effort: null,
          },
        ],
      },
    ],
  };
  return {
    version: 2 as const,
    userId: source.userId,
    today: source.today,
    ...buildTrainingProgress(source),
  };
}
it("evidencia y totales enlazan cada punto/serie al resultado propio", () => {
  expect(trainingProgressSchema.safeParse(result()).success).toBe(true);
  const cases = [
    (x: ReturnType<typeof result>) => {
      x.exercises[0].marks[0].workoutId = id(8);
    },
    (x: ReturnType<typeof result>) => {
      x.exercises[0].points[0].marks[0].date = "2026-10-02";
    },
    (x: ReturnType<typeof result>) => {
      x.activity = [];
    },
    (x: ReturnType<typeof result>) => {
      x.exercises[0].points[0].totals.workingSets = 99;
    },
  ];
  for (const change of cases) {
    const x = result();
    change(x);
    expect(trainingProgressSchema.safeParse(x).success).toBe(false);
  }
});
it("una cifra no se presenta como marca de una serie con otras métricas", () => {
  const x = result();
  x.exercises[0].marks[0].value = 500;
  x.exercises[0].points[0].marks[0].value = 500;
  expect(trainingProgressSchema.safeParse(x).success).toBe(false);
});
it("cada ejercicio/tipo aparece una vez en actividad y resumen", () => {
  const x = result();
  x.activity[0].exercises.push(structuredClone(x.activity[0].exercises[0]));
  expect(trainingProgressSchema.safeParse(x).success).toBe(false);
  const y = result();
  y.exercises.push(structuredClone(y.exercises[0]));
  expect(trainingProgressSchema.safeParse(y).success).toBe(false);
});
