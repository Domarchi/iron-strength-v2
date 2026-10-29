import type { Page } from "@playwright/test";
import { setupTrainingProgress } from "./training-progress-fixture";
import { workoutCorrectionSnapshotFixture } from "../../../src/test/fixtures/workout-correction";
import {
  workoutCorrectionSchema,
  type WorkoutCorrection,
} from "../../../src/lib/mobile/workout-correction-contracts";
import { downloadId } from "../../../src/test/fixtures/week-download";
export async function setupCorrection(page: Page) {
  const progress = await setupTrainingProgress(page);
  const base = workoutCorrectionSnapshotFixture();
  base.userId = downloadId(1);
  base.workout.title = "Fuerza revisada";
  base.workout.sourceKind = "free";
  base.workout.sessionLabel = null;
  base.workout.sets.push({ ...base.workout.sets[0], id: downloadId(9901), setNumber: 2 });
  progress.control.source.workouts = [
    {
      id: base.workout.id,
      startedAt: base.workout.startedAt,
      date: base.workout.performedOn,
      sourceKind: base.workout.sourceKind,
      title: base.workout.title,
      sessionLabel: base.workout.sessionLabel,
      durationSeconds: base.workout.durationSeconds,
      perceivedEffort: base.workout.perceivedEffort,
      note: base.workout.note,
      sets: base.workout.sets.map((s) => ({
        id: s.id,
        exerciseId: s.exerciseId,
        name: s.exerciseName,
        muscleGroup: "Piernas",
        position: s.position,
        setNumber: s.setNumber,
        metrics: s.metrics,
        setType: "working",
        effort: null,
      })),
    },
  ];
  const control = {
    base,
    calls: [] as WorkoutCorrection[],
    loseResponse: false,
    conflict: false,
    reads: 0,
  };
  const api = "https://iron-strength-seven.vercel.app/api/mobile/v1";
  await page.route(api + "/workout-corrections/**", async (r) => {
    control.reads++;
    await r.fulfill({ json: control.base });
  });
  await page.route(api + "/workout-corrections", async (r) => {
    const input = workoutCorrectionSchema.parse(r.request().postDataJSON());
    control.calls.push(input);
    if (control.conflict)
      return r.fulfill({
        status: 409,
        json: { version: 1, error: { code: "conflict", message: "El entrenamiento cambió." } },
      });
    const duplicate = control.calls.some(
      (c, i) => i < control.calls.length - 1 && c.requestId === input.requestId,
    );
    if (!duplicate) {
      control.base = {
        ...control.base,
        workout: {
          ...control.base.workout,
          revision: input.expectedRevision + 1,
          note: input.note,
          perceivedEffort: input.perceivedEffort,
          exerciseNotes: input.exerciseNotes,
          sets: input.sets.map((s) => ({
            ...control.base.workout.sets.find((v) => v.id === s.id)!,
            ...s,
          })),
        },
      };
    }
    if (control.loseResponse) {
      control.loseResponse = false;
      return r.abort("failed");
    }
    await r.fulfill({
      json: {
        version: 1,
        requestId: input.requestId,
        workoutId: input.workoutId,
        revision: control.base.workout.revision,
        status: duplicate ? "duplicate" : "updated",
      },
    });
  });
  await page.route(api + "/workouts/" + base.workout.id, (r) => {
    const w = control.base.workout;
    return r.fulfill({
      json: {
        version: 1,
        workout: {
          id: w.id,
          sourceKind: w.sourceKind,
          title: w.title,
          programName: null,
          sessionLabel: w.sessionLabel,
          startedAt: w.startedAt,
          performedOn: w.performedOn,
          durationSeconds: w.durationSeconds,
          perceivedEffort: w.perceivedEffort,
          note: w.note,
          summary: {
            workingSets: w.sets.filter((s) => !s.isWarmup).length,
            volumeKg: w.sets
              .filter((s) => !s.isWarmup)
              .reduce((n, s) => n + s.metrics.weightKg! * s.metrics.reps!, 0),
            bodyweightReps: 0,
            exerciseCount: 1,
          },
          exercises: [
            {
              position: 0,
              exerciseId: w.sets[0].exerciseId,
              name: w.sets[0].exerciseName,
              sets: w.sets.map((s) => ({
                id: s.id,
                setNumber: s.setNumber,
                weightKg: s.metrics.weightKg,
                reps: s.metrics.reps,
                isWarmup: s.isWarmup,
              })),
            },
          ],
        },
      },
    });
  });
  return control;
}
