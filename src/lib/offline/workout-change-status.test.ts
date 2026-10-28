import { expect, it } from "vitest";
import { workoutChangePending } from "./local-account";
import { workoutCorrectionSnapshotFixture } from "@/test/fixtures/workout-correction";
import { correctionFormFromSnapshot } from "@/lib/workout/correction-form";
import {
  workoutRemovalSnapshotFixture,
  workoutRemovalFixture,
} from "@/test/fixtures/workout-removal";
it("solo sobres coherentes sin cambios dejan de contar como pendientes", () => {
  const base = workoutCorrectionSnapshotFixture(),
    user = base.userId,
    form = correctionFormFromSnapshot(base),
    key = `is:workout-correction:v1:${user}`;
  expect(
    workoutChangePending(
      key,
      JSON.stringify({ version: 1, userId: user, draft: null, pending: null }),
      user,
    ),
  ).toBe(false);
  const doc = { version: 1, userId: user, draft: { base, form, changed: false }, pending: null };
  expect(workoutChangePending(key, JSON.stringify(doc), user)).toBe(false);
  doc.draft.form.note = "Nota propia";
  doc.draft.changed = true;
  expect(workoutChangePending(key, JSON.stringify(doc), user)).toBe(true);
  expect(workoutChangePending(key, JSON.stringify({ ...doc, userId: base.workout.id }), user)).toBe(
    true,
  );
  expect(workoutChangePending(key, null, user)).toBe(false);
  expect(workoutChangePending(key, '{"version":99}', user)).toBe(true);
  expect(
    workoutChangePending(
      key.replace(":v1:", ":v99:"),
      JSON.stringify({ version: 1, userId: user, draft: null, pending: null }),
      user,
    ),
  ).toBe(true);
});
it("una eliminación congelada o ilegible es pendiente; una vacía válida no", () => {
  const base = workoutRemovalSnapshotFixture(),
    key = `is:workout-removal:v1:${base.userId}`;
  expect(
    workoutChangePending(
      key,
      JSON.stringify({ version: 1, userId: base.userId, pending: null }),
      base.userId,
    ),
  ).toBe(false);
  expect(
    workoutChangePending(
      key,
      JSON.stringify({
        version: 1,
        userId: base.userId,
        pending: { review: base, request: workoutRemovalFixture(), issue: null },
      }),
      base.userId,
    ),
  ).toBe(true);
  expect(workoutChangePending(key, "broken", base.userId)).toBe(true);
});
