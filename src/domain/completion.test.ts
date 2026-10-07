import { describe, expect, it } from "vitest";
import {
  classifyWorkouts,
  sessionStatuses,
  weekCompliance,
  type PlannedSession,
  type WorkoutSummary,
} from "./completion";
import type { ProgramRange } from "./program-weeks";

// Programa de 2 semanas: lunes 2026-10-05 a domingo 2026-10-18
const program: ProgramRange = { startDate: "2026-10-05", endsOn: "2026-10-18", weeksCount: 2 };

const sessions: PlannedSession[] = [
  { id: "s1a", weekNumber: 1, label: "A" },
  { id: "s1b", weekNumber: 1, label: "B" },
  { id: "s2a", weekNumber: 2, label: "A" },
];

const workout = (over: Partial<WorkoutSummary> & Pick<WorkoutSummary, "id">): WorkoutSummary => ({
  programSessionId: "s1a",
  startedAt: "2026-10-06T15:00:00Z",
  setCount: 3,
  ...over,
});

const statuses = (workouts: WorkoutSummary[], weekNumber: number, today: string) =>
  sessionStatuses({ program, sessions, workouts, weekNumber, today });

describe("sessionStatuses (RF-19, RF-25)", () => {
  it("sin entrenamientos, las sesiones de la semana en curso están pendientes", () => {
    expect(statuses([], 1, "2026-10-07").map((s) => [s.label, s.status])).toEqual([
      ["A", "pending"],
      ["B", "pending"],
    ]);
  });

  it("una sesión con un entrenamiento de al menos 1 serie está hecha", () => {
    const result = statuses([workout({ id: "w1" })], 1, "2026-10-07");
    expect(result.find((s) => s.label === "A")).toMatchObject({ status: "done", workoutId: "w1" });
    expect(result.find((s) => s.label === "B")?.status).toBe("pending");
  });

  it("un entrenamiento sin series no cuenta como cumplido", () => {
    const result = statuses([workout({ id: "w0", setCount: 0 })], 1, "2026-10-07");
    expect(result.find((s) => s.label === "A")?.status).toBe("pending");
  });

  it("una semana pasada con sesiones sin hacer las marca como no realizadas", () => {
    const result = statuses([workout({ id: "w1" })], 1, "2026-10-13");
    expect(result.find((s) => s.label === "A")?.status).toBe("done");
    expect(result.find((s) => s.label === "B")?.status).toBe("missed");
  });

  it("el domingo todavía es la semana en curso: no se marca como no realizada", () => {
    expect(statuses([], 1, "2026-10-11").every((s) => s.status === "pending")).toBe(true);
    expect(statuses([], 1, "2026-10-12").every((s) => s.status === "missed")).toBe(true);
  });

  it("una semana futura aparece como próxima", () => {
    expect(statuses([], 2, "2026-10-07").map((s) => s.status)).toEqual(["upcoming"]);
  });

  it("ignora los entrenamientos de otras sesiones planificadas", () => {
    const result = statuses([workout({ id: "w9", programSessionId: "s2a" })], 1, "2026-10-07");
    expect(result.every((s) => s.status === "pending")).toBe(true);
  });

  it("con dos entrenamientos de la misma sesión, el primero la cumple", () => {
    const result = statuses(
      [
        workout({ id: "tarde", startedAt: "2026-10-08T20:00:00Z" }),
        workout({ id: "temprano", startedAt: "2026-10-06T15:00:00Z" }),
      ],
      1,
      "2026-10-09",
    );
    expect(result.find((s) => s.label === "A")).toMatchObject({
      status: "done",
      workoutId: "temprano",
    });
  });
});

describe("classifyWorkouts: cumplimiento vs sesión extra", () => {
  it("el primero por fecha cumple; los siguientes de la misma sesión son extra", () => {
    const result = classifyWorkouts([
      workout({ id: "segundo", startedAt: "2026-10-08T15:00:00Z" }),
      workout({ id: "primero", startedAt: "2026-10-06T15:00:00Z" }),
      workout({ id: "otra", programSessionId: "s1b", startedAt: "2026-10-07T15:00:00Z" }),
    ]);
    expect(result.get("primero")).toBe("completion");
    expect(result.get("segundo")).toBe("extra");
    expect(result.get("otra")).toBe("completion");
  });

  it("un entrenamiento sin sesión planificada es extra", () => {
    expect(classifyWorkouts([workout({ id: "w", programSessionId: null })]).get("w")).toBe("extra");
  });

  it("un entrenamiento sin series nunca cumple, ni siquiera es el primero", () => {
    const result = classifyWorkouts([
      workout({ id: "vacio", setCount: 0, startedAt: "2026-10-06T15:00:00Z" }),
      workout({ id: "real", startedAt: "2026-10-07T15:00:00Z" }),
    ]);
    expect(result.get("vacio")).toBe("extra");
    expect(result.get("real")).toBe("completion");
  });
});

describe("weekCompliance (RF-33, DC-11)", () => {
  it("calcula hechas contra planificadas", () => {
    const one = weekCompliance(statuses([workout({ id: "w1" })], 1, "2026-10-09"));
    expect(one).toEqual({ planned: 2, done: 1, ratio: 0.5, complete: false, deload: false });
  });

  it("la semana está completa cuando se hicieron todas", () => {
    const all = weekCompliance(
      statuses(
        [workout({ id: "w1" }), workout({ id: "w2", programSessionId: "s1b" })],
        1,
        "2026-10-09",
      ),
    );
    expect(all).toMatchObject({ planned: 2, done: 2, ratio: 1, complete: true });
  });

  it("los extras no suben el cumplimiento por encima de 1", () => {
    const result = weekCompliance(
      statuses(
        [
          workout({ id: "w1" }),
          workout({ id: "w1b", startedAt: "2026-10-08T15:00:00Z" }),
          workout({ id: "w2", programSessionId: "s1b" }),
        ],
        1,
        "2026-10-09",
      ),
    );
    expect(result.ratio).toBe(1);
  });

  it("una semana de descarga (sin sesiones) no tiene cumplimiento y no está 'completa'", () => {
    const deload = sessionStatuses({
      program: { ...program, weeksCount: 3, endsOn: "2026-10-25" },
      sessions,
      workouts: [],
      weekNumber: 3,
      today: "2026-10-20",
    });
    expect(weekCompliance(deload)).toEqual({
      planned: 0,
      done: 0,
      ratio: null,
      complete: false,
      deload: true,
    });
  });
});
