import { describe, expect, it } from "vitest";
import { buildTrainingRecording } from "./recording";
import {
  personalRoutineContext,
  createPersonalTrainingDraft,
  buildPersonalTrainingPayload,
  type PersonalTrainingContext,
} from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
import { DEMO_ROUTINES } from "./demo";
import { buildPayload, createDraft } from "../../../src/lib/workout/runner-state";
import { recordingPayloadSchema } from "../../../src/lib/mobile/recording-contracts";
const id = (n: number) => `af214000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-26T12:00:00Z");
function personal(free = false) {
  const routine = personalRoutineContext(personalRoutineFixture());
  const context: PersonalTrainingContext = free
    ? {
        ...routine,
        origin: { kind: "free" },
        session: { ...routine.session, label: "Libre" },
      }
    : routine;
  const draft = createPersonalTrainingDraft({ context, userId: id(1), workoutId: id(2), now });
  draft.exercises[0].sets[0] = { ...draft.exercises[0].sets[0], reps: "10", done: true };
  return { context, draft };
}
function assigned() {
  const context = structuredClone(DEMO_ROUTINES[1]);
  const draft = createDraft({
    workoutId: id(2),
    userId: id(1),
    now,
    plannedSession: context.session,
    exercises: context.exercises.map((e) => ({
      ...e,
      lastWeightKg: null,
      alternatives: e.alternatives?.map((a) => ({ ...a, lastWeightKg: null })),
    })),
  });
  draft.exercises[0].sets[0] = {
    ...draft.exercises[0].sets[0],
    weight: "30",
    reps: "10",
    done: true,
  };
  return { context, draft };
}
describe("documento nativo de cierre con estructura", () => {
  it.each([false, true])(
    "conserva cuerpo personal/libre, filas sin completar y superseries: libre=%s",
    (free) => {
      const { context, draft } = personal(free),
        before = structuredClone({ context, draft });
      const result = buildTrainingRecording(context, draft, now);
      expect(result.ok).toBe(true);
      if (!result.ok) throw Error("Debía construir el cierre");
      expect(result.payload).toMatchObject({
        version: 2,
        id: id(2),
        source: free ? "free" : "personal",
      });
      const old = buildPersonalTrainingPayload(draft, now);
      if (!old.ok) throw Error("fixture inválido");
      expect(result.payload.workout).toEqual(old.payload);
      expect(result.payload.structure.exercises).toHaveLength(2);
      expect(result.payload.structure.exercises[0]).toMatchObject({
        id: context.exercises[0].sessionExerciseId,
        exerciseId: context.exercises[0].exerciseId,
        prescribedExerciseId: null,
        note: "Controlado",
        restSeconds: 90,
        supersetId: context.exercises[0].supersetId,
        supersetRestSeconds: 60,
        prescribed: { sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: 30, series: null },
      });
      expect(result.payload.structure.exercises[0]).not.toHaveProperty("name");
      expect(recordingPayloadSchema.parse(result.payload)).toEqual(result.payload);
      expect({ context, draft }).toEqual(before);
    },
  );
  it("asignada conserva el contexto prescrito mientras el descanso local puede ajustarse", () => {
    const { context, draft } = assigned();
    draft.exercises[0].restSeconds = 120;
    draft.exercises[2].supersetRestSeconds = 180;
    draft.exercises[3].supersetRestSeconds = 180;
    const result = buildTrainingRecording(context, draft, now),
      old = buildPayload(draft, now);
    if (!result.ok || !old.ok) throw Error("Debía construir el cierre");
    expect(result.payload.source).toBe("assigned");
    expect(result.payload.workout).toEqual(old.payload);
    expect(result.payload.structure.exercises[0].restSeconds).toBe(90);
    expect(result.payload.structure.exercises[2].supersetRestSeconds).toBe(60);
    expect(result.payload.structure.exercises[0].prescribedExerciseId).toBe(
      context.exercises[0].exerciseId,
    );
  });
  it("la alternativa realizada conserva su objetivo y la identidad prescrita original", () => {
    const { context, draft } = assigned(),
      choice = context.exercises[0].alternatives![0];
    draft.exercises[0] = {
      ...draft.exercises[0],
      exerciseId: choice.exerciseId,
      name: choice.name,
      prescribed: choice.prescribed,
    };
    const result = buildTrainingRecording(context, draft, now);
    if (!result.ok) throw Error("Debía construir el cierre");
    expect(result.payload.structure.exercises[0]).toMatchObject({
      exerciseId: choice.exerciseId,
      prescribedExerciseId: context.exercises[0].exerciseId,
      prescribed: { ...choice.prescribed, series: null },
    });
    expect(result.payload.workout.sets[0]).toMatchObject({
      exerciseId: choice.exerciseId,
      prescribedExerciseId: context.exercises[0].exerciseId,
    });
  });
  it("conserva objetivos por serie, valoración y duración neta ya calculada", () => {
    const { context, draft } = personal();
    const targets = [
      { repsMin: 6, repsMax: 8, targetWeightKg: 40 },
      { repsMin: 10, repsMax: 12, targetWeightKg: 30 },
    ];
    const prescribed = { sets: 2, repsMin: 6, repsMax: 12, targetWeightKg: null, series: targets };
    context.exercises[0].prescribed = structuredClone(prescribed);
    draft.exercises[0].prescribed = structuredClone(prescribed);
    draft.durationSeconds = 42;
    draft.finishedAt = "2026-10-26T12:10:00Z";
    draft.perceivedEffort = 8;
    draft.note = "Buena sesión";
    const result = buildTrainingRecording(context, draft, now);
    if (!result.ok) throw Error("Debía construir el cierre");
    expect(result.payload.structure.exercises[0].prescribed).toEqual(prescribed);
    expect(result.payload.workout).toMatchObject({
      durationSeconds: 42,
      finishedAt: draft.finishedAt,
      perceivedEffort: 8,
      note: "Buena sesión",
    });
    result.payload.structure.exercises[0].prescribed.series![0].targetWeightKg = 99;
    expect(draft.exercises[0].prescribed.series![0].targetWeightKg).toBe(40);
    expect(context.exercises[0].prescribed.series![0].targetWeightKg).toBe(40);
  });
  it("el descanso personal elegido se guarda sin modificar el contexto base", () => {
    const { context, draft } = personal();
    draft.exercises[0].supersetRestSeconds = 120;
    draft.exercises[1].supersetRestSeconds = 120;
    const result = buildTrainingRecording(context, draft, now);
    if (!result.ok) throw Error("Debía construir el cierre");
    expect(result.payload.structure.exercises.map((e) => e.supersetRestSeconds)).toEqual([
      120, 120,
    ]);
    expect(context.exercises[0].supersetRestSeconds).toBe(60);
  });
  it.each([personal, assigned])(
    "una serie completada inválida rechaza el cierre completo",
    (make) => {
      const { context, draft } = make();
      draft.exercises[0].sets.push({
        ...draft.exercises[0].sets[0],
        id: "otra",
        reps: "inválido",
        done: true,
      });
      expect(buildTrainingRecording(context, draft, now)).toEqual({ ok: false, reason: "invalid" });
    },
  );
  it("conserva veinte series realizadas, con calentamientos, aunque haya dos objetivos", () => {
    const { context, draft } = personal();
    draft.exercises[0].sets = Array.from({ length: 20 }, (_, i) => ({
      ...draft.exercises[0].sets[0],
      id: String(i),
      isWarmup: i === 0,
    }));
    const result = buildTrainingRecording(context, draft, now);
    if (!result.ok) throw Error("Debía construir el cierre");
    expect(result.payload.workout.sets).toHaveLength(20);
    expect(result.payload.workout.sets[0].isWarmup).toBe(true);
    expect(result.payload.structure.exercises[0].prescribed.sets).toBe(2);
    draft.exercises[0].sets.push({ ...draft.exercises[0].sets[0], id: "21" });
    expect(buildTrainingRecording(context, draft, now)).toEqual({ ok: false, reason: "invalid" });
  });
  it("no completa un cierre vacío ni acepta contexto/borrador con otras identidades", () => {
    const { context, draft } = personal();
    const scenarios = [
      { ...draft, origin: { kind: "free" as const } },
      { ...draft, title: "Otro" },
      { ...draft, sessionLabel: "Libre" },
      { ...draft, exercises: [...draft.exercises].reverse() },
      { ...draft, exercises: draft.exercises.slice(0, 1) },
      {
        ...draft,
        exercises: draft.exercises.map((e, i) => (i ? e : { ...e, exerciseId: id(999) })),
      },
    ];
    for (const next of scenarios)
      expect(buildTrainingRecording(context, next, now)).toEqual({ ok: false, reason: "invalid" });
    draft.exercises[0].sets[0].done = false;
    expect(buildTrainingRecording(context, draft, now)).toEqual({ ok: false, reason: "no_sets" });
  });
  it("una asignada con origen, programa o prescripción incoherentes no se degrada", () => {
    const { context, draft } = assigned();
    for (const next of [
      { ...draft, programId: id(987) },
      { ...draft, plannedSessionId: id(988) },
      { ...draft, sessionLabel: "G" },
      {
        ...draft,
        exercises: draft.exercises.map((e, i) =>
          i ? e : { ...e, prescribed: { ...e.prescribed, sets: 8 } },
        ),
      },
      {
        ...draft,
        exercises: draft.exercises.map((e, i) =>
          i ? e : { ...e, original: { ...e.original!, exerciseId: id(999) } },
        ),
      },
    ])
      expect(buildTrainingRecording(context, next, now)).toEqual({ ok: false, reason: "invalid" });
    expect(buildTrainingRecording(personal().context, draft, now)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
