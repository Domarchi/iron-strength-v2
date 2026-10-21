import { expect, it } from "vitest";
import { createDraft, finishDraft, buildPayload } from "./runner-state";
import { makeQueueEntry } from "@/lib/offline/queue-contract";
import { pendingWorkoutEntries, finishExerciseOverview } from "./local-summary";
const userId = "22222222-2222-4222-8222-222222222222";
const started = new Date("2026-10-21T12:00:00Z");
const d = () =>
  createDraft({
    workoutId: "11111111-1111-4111-8111-111111111111",
    userId,
    plannedSession: {
      id: "33333333-3333-4333-8333-333333333333",
      programId: "44444444-4444-4444-8444-444444444444",
      label: "A",
    },
    now: started,
    exercises: [0, 1].map((i) => ({
      sessionExerciseId: `55555555-5555-4555-8555-55555555555${i}`,
      exerciseId: `66666666-6666-4666-8666-66666666666${i}`,
      name: `Ejercicio ${i}`,
      isBodyweight: false,
      lastWeightKg: null,
      prescribed: { sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
    })),
  });
const ended = () => {
  const value = d();
  value.exercises[0].sets[0] = { ...value.exercises[0].sets[0], done: true, reps: "8" };
  return finishDraft(value, new Date("2026-10-21T13:00:00Z"));
};
it("un pendiente con copia local y cola aparece una sola vez; manda el payload congelado", () => {
  const draft = ended(),
    built = buildPayload(draft, started);
  if (!built.ok) throw new Error("fixture");
  const entry = makeQueueEntry(userId, built.payload, draft.updatedAt);
  entry.error = "Sin conexión";
  draft.note = "Cambio que no reemplaza el envío";
  expect(pendingWorkoutEntries(userId, [entry], [draft], [], started)).toEqual([entry]);
  expect(pendingWorkoutEntries(userId, [entry], [draft], [draft.workoutId], started)).toEqual([]);
});
it("sin cola recupera la copia terminada, ignora en curso y separa cuentas", () => {
  const draft = ended();
  expect(pendingWorkoutEntries(userId, [], [d(), draft], [], started)).toHaveLength(1);
  expect(
    pendingWorkoutEntries("77777777-7777-4777-8777-777777777777", [], [draft], [], started),
  ).toEqual([]);
});
it("el cierre diferencia pendientes de saltados sin modificar series", () => {
  const draft = ended();
  draft.exercises[1].skipped = true;
  const previous = structuredClone(draft);
  expect(finishExerciseOverview(draft)).toEqual([
    { name: "Ejercicio 0", completed: 1, pending: 1, skipped: false },
    { name: "Ejercicio 1", completed: 0, pending: 0, skipped: true },
  ]);
  expect(draft).toEqual(previous);
});
