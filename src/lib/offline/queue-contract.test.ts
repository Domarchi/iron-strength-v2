import { describe, expect, it } from "vitest";
import { makeQueueEntry, parseQueueEntry } from "./queue-contract";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const payload = () => ({
  id: id(1),
  programId: id(2),
  programSessionId: id(3),
  sessionLabel: "A",
  startedAt: "2026-10-20T12:00:00.000Z",
  finishedAt: "2026-10-20T13:00:00.000Z",
  durationSeconds: 3600,
  perceivedEffort: 7,
  note: "Buen ritmo",
  sets: [
    {
      exerciseId: id(4),
      exerciseName: "Sentadilla",
      position: 0,
      setNumber: 1,
      weightKg: 60,
      reps: 8,
      isWarmup: false,
      sessionExerciseId: id(5),
      prescribedExerciseId: id(4),
    },
  ],
});
describe("contrato de cola v1", () => {
  it("congela todo el registro y conserva identidad, fechas y valoración", () => {
    const p = payload();
    const entry = makeQueueEntry(id(6), p, "2026-10-20T13:01:00.000Z");
    expect(entry.payload).toEqual(p);
    expect(entry.workoutId).toBe(p.id);
    p.sets[0].reps = 99;
    expect(entry.payload.sets[0].reps).toBe(8);
    expect(parseQueueEntry(entry, id(6))).toEqual(entry);
  });
  it("rechaza otras cuentas, identidad discordante y versiones desconocidas", () => {
    const entry = makeQueueEntry(id(6), payload(), "2026-10-20T13:01:00.000Z");
    expect(parseQueueEntry(entry, id(7))).toBeNull();
    expect(parseQueueEntry({ ...entry, workoutId: id(9) }, id(6))).toBeNull();
    expect(parseQueueEntry({ ...entry, version: 2 }, id(6))).toBeNull();
  });
  it("no encola registros vacíos o de tiempo inválido ni incorpora credenciales ajenas al contrato", () => {
    expect(() =>
      makeQueueEntry(id(6), { ...payload(), sets: [] }, "2026-10-20T13:01:00.000Z"),
    ).toThrow();
    expect(() =>
      makeQueueEntry(
        id(6),
        { ...payload(), finishedAt: "2026-10-19T13:00:00.000Z" },
        "2026-10-20T13:01:00.000Z",
      ),
    ).toThrow();
    expect(
      makeQueueEntry(id(6), { ...payload(), access_token: "secret" }, "2026-10-20T13:01:00.000Z")
        .payload,
    ).not.toHaveProperty("access_token");
  });
});
