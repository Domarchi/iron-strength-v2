import type { Page } from "@playwright/test";
import { setupCorrection } from "./correction-fixture";
import {
  workoutRemovalSchema,
  type WorkoutRemoval,
} from "../../../src/lib/mobile/workout-removal-contracts";
export async function setupRemoval(page: Page) {
  const correction = await setupCorrection(page);
  const control = {
    correction,
    calls: [] as WorkoutRemoval[],
    lost: false,
    conflict: false,
    deleted: false,
    comments: 2,
    beforeReply: null as null | (() => Promise<void>),
  };
  const receipts = new Map<string, { revision: number; body: string }>();
  const api = "https://iron-strength-seven.vercel.app/api/mobile/v1";
  await page.route(api + "/workout-removals/**", async (r) => {
    if (control.deleted)
      return r.fulfill({
        status: 404,
        json: {
          version: 1,
          error: { code: "not_found", message: "Ese entrenamiento ya no está disponible." },
        },
      });
    const w = correction.base.workout;
    await r.fulfill({
      json: {
        version: 1,
        userId: correction.base.userId,
        today: correction.base.today,
        workout: {
          id: w.id,
          revision: w.revision,
          sourceKind: w.sourceKind,
          title: w.title,
          sessionLabel: w.sessionLabel,
          performedOn: w.performedOn,
          setCount: w.sets.length,
          commentCount: control.comments,
        },
      },
    });
  });
  await page.route(api + "/workout-removals", async (r) => {
    const request = workoutRemovalSchema.parse(r.request().postDataJSON());
    control.calls.push(request);
    const saved = receipts.get(request.requestId),
      body = JSON.stringify(request);
    if (
      control.conflict ||
      (!saved && request.expectedRevision !== correction.base.workout.revision)
    )
      return r.fulfill({
        status: 409,
        json: { version: 1, error: { code: "conflict", message: "El entrenamiento cambió." } },
      });
    if (saved && saved.body !== body) throw Error("changed retry");
    const revision = saved?.revision ?? correction.base.workout.revision + 1;
    receipts.set(request.requestId, { revision, body });
    control.deleted = true;
    if (control.beforeReply) await control.beforeReply();
    if (control.lost) {
      control.lost = false;
      return r.abort("failed");
    }
    await r.fulfill({
      json: {
        version: 1,
        requestId: request.requestId,
        workoutId: request.workoutId,
        revision,
        status: saved ? "duplicate" : "deleted",
      },
    });
  });
  for (const suffix of [
    "/workouts/" + correction.base.workout.id,
    "/workout-corrections/" + correction.base.workout.id,
  ])
    await page.route(api + suffix, async (r) =>
      control.deleted
        ? r.fulfill({
            status: 404,
            json: {
              version: 1,
              error: { code: "not_found", message: "Ese entrenamiento ya no está disponible." },
            },
          })
        : r.fallback(),
    );
  return control;
}
