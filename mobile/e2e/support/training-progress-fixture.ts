import type { Page } from "@playwright/test";
import { setupPersonalTraining } from "./personal-training-fixture";
import { downloadId } from "../../../src/test/fixtures/week-download";
import {
  buildTrainingProgress,
  type TrainingProgressSource,
} from "../../../src/domain/training-progress";
import { trainingProgressSchema } from "../../../src/lib/mobile/training-progress-contracts";
import { legacyTrainingSet, type TrainingMetrics } from "../../../src/domain/training-metrics";
export function progressFixture() {
  const source: TrainingProgressSource = {
    version: 1,
    userId: downloadId(1),
    today: "2026-10-28",
    workouts: [],
  };
  const add = (
    n: number,
    date: string,
    name: string,
    exerciseId: string,
    metrics: TrainingMetrics,
    muscleGroup: string | null = "Core",
    warmup = false,
  ) =>
    source.workouts.push({
      id: downloadId(8100 + n),
      startedAt: `${date}T15:${String(n % 60).padStart(2, "0")}:00Z`,
      date,
      sourceKind: n % 2 ? "personal" : "free",
      title: n % 2 ? "Fuerza personal" : "Entrenamiento libre",
      sessionLabel: null,
      durationSeconds: 1200,
      perceivedEffort: 8,
      note: "Nota conservada",
      sets: [
        {
          id: downloadId(8200 + n),
          exerciseId,
          name,
          muscleGroup,
          position: 0,
          setNumber: 1,
          metrics,
          setType: warmup ? "warmup" : "working",
          effort: 7,
        },
      ],
    });
  const {
    setType: _setType,
    effort: _effort,
    ...weight
  } = legacyTrainingSet({ weightKg: 50, reps: 10, isWarmup: false });
  add(1, "2026-09-20", "Sentadilla", downloadId(8301), weight, "Piernas");
  add(2, "2026-10-20", "Sentadilla", downloadId(8301), { ...weight, weightKg: 60 }, "Piernas");
  add(3, "2026-10-20", "Plancha", downloadId(8302), {
    recordType: "duration",
    weightKg: null,
    reps: null,
    durationSeconds: 60,
    distanceMeters: null,
  });
  add(
    4,
    "2026-10-27",
    "Plancha",
    downloadId(8302),
    {
      recordType: "duration",
      weightKg: null,
      reps: null,
      durationSeconds: 75,
      distanceMeters: null,
    },
    null,
  );
  add(
    5,
    "2026-10-27",
    "Dominadas",
    downloadId(8303),
    {
      recordType: "assisted_bodyweight",
      weightKg: 20,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
    },
    "Espalda",
  );
  add(
    6,
    "2026-10-28",
    "Carrera",
    downloadId(8304),
    {
      recordType: "distance_duration",
      weightKg: null,
      reps: null,
      durationSeconds: 300,
      distanceMeters: 1000,
    },
    "Cardio",
  );
  add(7, "2026-10-28", "Solo entrada en calor", downloadId(8305), weight, "Piernas", true);
  return source;
}
export async function setupTrainingProgress(page: Page) {
  const personal = await setupPersonalTraining(page),
    control = { source: progressFixture(), failed: false, calls: 0 };
  await page.clock.setFixedTime(new Date("2026-10-28T16:00:00Z"));
  const api = "https://iron-strength-seven.vercel.app/api/mobile/v1";
  await page.route(api + "/training-progress", (route) => {
    control.calls++;
    return control.failed
      ? route.fulfill({
          status: 503,
          json: {
            version: 1,
            error: { code: "unavailable", message: "No pudimos cargar el progreso completo." },
          },
        })
      : route.fulfill({
          json: trainingProgressSchema.parse({
            version: 2,
            userId: control.source.userId,
            today: control.source.today,
            ...buildTrainingProgress(control.source),
          }),
        });
  });
  await page.route(api + "/workouts/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1),
      w = control.source.workouts.find((w) => w.id === id);
    if (!w) return route.fallback();
    // The legacy row is used to verify a return from evidence without mocking navigation.
    if (w.sets.some((s) => s.metrics.recordType !== null)) return route.fallback();
    return route.fulfill({
      json: {
        version: 1,
        workout: {
          id: w.id,
          sourceKind: w.sourceKind,
          title: w.title,
          programName: null,
          sessionLabel: null,
          startedAt: w.startedAt,
          performedOn: w.date,
          durationSeconds: w.durationSeconds,
          perceivedEffort: w.perceivedEffort,
          note: w.note,
          summary: {
            workingSets: 1,
            volumeKg: w.sets[0].metrics.weightKg! * w.sets[0].metrics.reps!,
            bodyweightReps: 0,
            exerciseCount: 1,
          },
          exercises: [
            {
              exerciseId: w.sets[0].exerciseId,
              position: 0,
              name: w.sets[0].name,
              sets: w.sets.map((s) => ({
                id: s.id,
                setNumber: s.setNumber,
                weightKg: s.metrics.weightKg,
                reps: s.metrics.reps,
                isWarmup: false,
              })),
            },
          ],
        },
      },
    });
  });
  return { ...personal, control };
}
