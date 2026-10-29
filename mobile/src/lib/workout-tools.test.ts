import { expect, it, vi } from "vitest";
import { TrainingController, isTypedTraining } from "./training";
import { createTypedDraft, typedContextSchema } from "./typed-training";
import {
  prepareWarmups,
  describeWarmup,
  applyWarmupProposal,
  applySessionRest,
} from "./workout-tools";
import { trainingMetricCases } from "../../../src/test/fixtures/training-metrics";
import { personalRoutineContext } from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
import type { AtomicStorage } from "./atomic-contract";
const id = (n: number) => `bc216000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const clock = new Date("2026-10-27T14:00:00Z");
function active(i = 0) {
  const m = trainingMetricCases[i];
  const routine = typedContextSchema.parse({
    version: 3,
    origin: { kind: "free" },
    title: "Herramientas",
    sessionLabel: "Libre",
    exercises: [
      {
        sessionExerciseId: id(8),
        exerciseId: id(9),
        name: "Ejercicio",
        isBodyweight: false,
        prescribed: {
          recordType: m.recordType,
          sets: 1,
          target: {
            repsMin: m.reps,
            repsMax: m.reps,
            targetWeightKg: m.weightKg,
            targetDurationSeconds: m.durationSeconds,
            targetDistanceMeters: m.distanceMeters,
          },
          series: null,
        },
        lastMetrics: null,
        note: null,
        restSeconds: null,
        supersetId: null,
        supersetRestSeconds: null,
        alternatives: [],
      },
    ],
  });
  const draft = createTypedDraft({ context: routine, userId: id(1), workoutId: id(2), now: clock });
  const text = (n: number | null) => (n === null ? "" : String(n));
  const input = {
    weight: text(m.weightKg),
    reps: text(m.reps),
    duration: text(m.durationSeconds),
    distance: text(m.distanceMeters),
    effort: "",
    setType: "warmup" as const,
  };
  return { a: { mode: "real" as const, routine, draft, activeIndex: 0 }, input };
}
it("vista previa no escribe; agrega los ocho tipos y legado conservando datos, identidad y descanso", () => {
  for (let i = 0; i < trainingMetricCases.length; i++) {
    const { a, input } = active(i);
    a.draft.rest = { totalSeconds: 90, endsAt: clock.getTime() + 90000 };
    a.draft.exercises[0].sets[0] = {
      ...input,
      id: "existente",
      setType: "working",
      effort: "8",
      done: true,
    };
    expect(describeWarmup(a.draft.exercises[0].prescribed.recordType, input)).toBeTruthy();
    const original = JSON.stringify(a);
    const proposal = prepareWarmups(a, 0, [input], id(20));
    expect(JSON.stringify(a)).toBe(original);
    const next = applyWarmupProposal(a, proposal, clock);
    expect(next.draft.exercises[0].sets[0]).toMatchObject({ done: false });
    expect(next.draft.exercises[0].sets[1]).toEqual(a.draft.exercises[0].sets[0]);
    expect(next.draft.rest).toEqual(a.draft.rest);
    expect(next.routine).toEqual(a.routine);
    expect(next.activeIndex).toBe(a.activeIndex);
  }
});
it("rechaza métrica incompatible, límites, snapshot cambiado, pausa, cierre y otra cuenta", () => {
  const { a, input } = active();
  expect(() => prepareWarmups(a, 0, [{ ...input, reps: "0" }], id(20))).toThrow();
  expect(() => prepareWarmups(a, 0, [], id(20))).toThrow();
  expect(() => prepareWarmups(a, 0, Array(6).fill(input), id(20))).toThrow();
  const proposal = prepareWarmups(a, 0, [input], id(20));
  expect(() =>
    applyWarmupProposal(
      { ...a, pause: { version: 1, pausedAtMs: clock.getTime(), pausedMilliseconds: 0 } },
      proposal,
      clock,
    ),
  ).toThrow();
  expect(() =>
    applyWarmupProposal({ ...a, draft: { ...a.draft, userId: id(3) } }, proposal, clock),
  ).toThrow();
  expect(() =>
    applyWarmupProposal({ ...a, draft: { ...a.draft, status: "pending_save" } }, proposal, clock),
  ).toThrow();
  const changed = structuredClone(a);
  changed.draft.exercises[0].sets[0].reps = "99";
  expect(() => applyWarmupProposal(changed, proposal, clock)).toThrow();
  const full = structuredClone(a);
  full.draft.exercises[0].sets = Array.from({ length: 20 }, (_, i) => ({
    ...full.draft.exercises[0].sets[0],
    id: String(i),
  }));
  expect(() => prepareWarmups(full, 0, [input], id(20))).toThrow();
});
it("cuota tras confirmar conserva una sola propuesta; reintento y recarga no duplican", async () => {
  const data = new Map<string, string>();
  let full = false;
  const storage: AtomicStorage = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
    compareAndSet: async (k, b, v) => {
      if (full) throw Error("quota");
      if ((data.get(k) ?? null) !== b) throw Error("conflict");
      data.set(k, v);
    },
  };
  const send = vi.fn();
  const create = () =>
    new TrainingController(
      id(1),
      storage,
      send,
      () => clock,
      () => id(2),
    );
  const c = create();
  await c.restore();
  await c.startTyped(active().a.routine);
  const proposal = prepareWarmups(c.getSnapshot().active!, 0, [active().input], id(20));
  full = true;
  await expect(c.addWarmups(proposal)).rejects.toThrow();
  expect(c.getSnapshot().active!.draft.exercises[0].sets).toHaveLength(2);
  expect(c.getSnapshot().dirty).toBe(true);
  full = false;
  await c.retryStorage();
  await c.addWarmups(proposal);
  const again = create();
  await again.restore();
  expect(again.getSnapshot().active!.draft.exercises[0].sets).toHaveLength(2);
  expect(send).not.toHaveBeenCalled();
  if (!isTypedTraining(again.getSnapshot().active!)) throw Error("typed");
});
it("legado sigue legado y descanso se aplica completo al grupo sin mover temporizador", async () => {
  const data = new Map<string, string>();
  const storage: AtomicStorage = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
    compareAndSet: async (k, b, v) => {
      if ((data.get(k) ?? null) !== b) throw Error("conflict");
      data.set(k, v);
    },
  };
  const c = new TrainingController(
    id(1),
    storage,
    vi.fn(),
    () => clock,
    () => id(2),
    () => 120,
  );
  await c.restore();
  await c.startPersonal(personalRoutineContext(personalRoutineFixture()));
  const a = c.getSnapshot().active!;
  const p = prepareWarmups(
    a,
    0,
    [{ weight: "20", reps: "5", duration: "", distance: "", effort: "", setType: "warmup" }],
    id(20),
  );
  await c.addWarmups(p);
  expect(isTypedTraining(c.getSnapshot().active!)).toBe(false);
  expect(c.getSnapshot().active!.draft.exercises[0].sets[0]).toMatchObject({
    isWarmup: true,
    done: false,
    weight: "20",
    reps: "5",
  });
  const typed = active().a;
  const second = { ...structuredClone(typed.draft.exercises[0]), sessionExerciseId: id(10) };
  typed.draft.exercises.push(second);
  typed.draft.exercises.forEach((e) => {
    e.supersetId = id(11);
    e.supersetRestSeconds = 0;
  });
  typed.draft.rest = { totalSeconds: 60, endsAt: clock.getTime() + 60000 };
  const next = applySessionRest(typed.draft, 0, 120);
  expect(next.exercises.map((e) => e.supersetRestSeconds)).toEqual([120, 120]);
  expect(next.rest).toEqual(typed.draft.rest);
  expect(() => applySessionRest(typed.draft, 0, 20)).toThrow();
});
it("captura descanso solo al iniciar sin prescripción y no al recuperar o elegir preferencia", async () => {
  const data = new Map<string, string>();
  let preferred = 120;
  const storage: AtomicStorage = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
    compareAndSet: async (k, b, v) => {
      if ((data.get(k) ?? null) !== b) throw Error("conflict");
      data.set(k, v);
    },
  };
  const create = () =>
    new TrainingController(
      id(1),
      storage,
      vi.fn(),
      () => clock,
      () => id(2),
      () => preferred,
    );
  const c = create();
  await c.restore();
  await c.startTyped(active().a.routine);
  expect(c.getSnapshot().active!.draft.exercises[0].restSeconds).toBe(120);
  preferred = 0;
  const d = create();
  await d.restore();
  expect(d.getSnapshot().active!.draft.exercises[0].restSeconds).toBe(120);
});

it("prescripciones explícitas y grupo sin descanso tienen prioridad; cambiar preferencia no toca el contexto", async () => {
  const { captureRestPreference } = await import("./workout-tools");
  const { a } = active();
  a.draft.exercises[0].supersetId = id(90);
  a.draft.exercises[0].supersetRestSeconds = 0;
  a.draft.exercises[0].restSeconds = 60;
  const next = captureRestPreference(a.draft, 120);
  expect(next.exercises[0].restSeconds).toBe(60);
  expect(next.exercises[0].supersetRestSeconds).toBe(0);
  expect(a.routine.exercises[0].restSeconds).toBeNull();
});

it("calentamiento de superserie no cambia foco/ronda ni reemplaza la prescripción de trabajo", async () => {
  const { completeTypedSet, typedSetTarget } = await import("./typed-training");
  const { a, input } = active();
  const other = structuredClone(a.draft.exercises[0]);
  other.sessionExerciseId = id(60);
  a.draft.exercises.push(other);
  for (const e of a.draft.exercises) {
    e.supersetId = id(70);
    e.supersetRestSeconds = 0;
  }
  const p = prepareWarmups(a, 0, [input], id(20));
  const next = applyWarmupProposal(a, p, clock);
  if (!isTypedTraining(next)) throw Error("typed");
  expect(typedSetTarget(next.draft.exercises[0], 0)).toBeNull();
  expect(typedSetTarget(next.draft.exercises[0], 1)).toEqual(
    a.draft.exercises[0].prescribed.target,
  );
  const completed = completeTypedSet(next.draft, 0, 0, clock, 0);
  expect(completed.activeIndex).toBe(0);
  expect(completed.draft.rest).toBeNull();
  expect(completed.draft.exercises[1].sets).toEqual(other.sets);
});

it("preview inválida informa error legible y otra fila no acepta la propuesta", () => {
  const { a, input } = active();
  expect(() =>
    describeWarmup(a.draft.exercises[0].prescribed.recordType, { ...input, reps: "" }),
  ).toThrow("Revisa");
  const p = prepareWarmups(a, 0, [input], id(20));
  const changed = structuredClone(a);
  changed.draft.exercises[0].exerciseId = id(100);
  expect(() => applyWarmupProposal(changed, p, clock)).toThrow("El ejercicio cambió");
});
