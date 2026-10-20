// @vitest-environment jsdom
import { expect, it } from "vitest";
import { clearConfirmedDraft } from "./sync";
import { createDraft, buildPayload, finishDraft } from "@/lib/workout/runner-state";
import { legacyDraftKey, loadDraft, saveDraft } from "@/lib/workout/draft";
it("confirmar el pendiente v1 limpia solo su ID aunque exista otro entrenamiento v2 de la misma sesión", () => {
  localStorage.clear();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const old = createDraft({
    workoutId: id(1),
    userId: id(2),
    plannedSession: { id: id(3), programId: id(4), label: "A" },
    now: new Date("2026-10-20T12:00:00Z"),
    exercises: [
      {
        sessionExerciseId: id(5),
        exerciseId: id(6),
        name: "Sentadilla",
        isBodyweight: false,
        lastWeightKg: null,
        prescribed: { sets: 1, repsMin: 8, repsMax: 10, targetWeightKg: 60 },
      },
    ],
  });
  old.exercises[0].sets[0] = { ...old.exercises[0].sets[0], done: true, reps: "8" };
  const finished = finishDraft(old, new Date("2026-10-20T12:15:00Z"));
  const current = { ...old, workoutId: id(7) };
  saveDraft(localStorage, current);
  localStorage.setItem(legacyDraftKey(old.userId, old.plannedSessionId), JSON.stringify(finished));
  const built = buildPayload(finished, new Date());
  if (!built.ok) throw new Error("fixture inválido");
  clearConfirmedDraft(old.userId, built.payload);
  expect(localStorage.getItem(legacyDraftKey(old.userId, old.plannedSessionId))).toBeNull();
  expect(loadDraft(localStorage, old.userId, old.plannedSessionId)?.workoutId).toBe(
    current.workoutId,
  );
});
