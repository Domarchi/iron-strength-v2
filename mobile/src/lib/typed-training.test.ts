import { describe, expect, it } from "vitest";
import {
  typedContextSchema,
  typedDraftSchema,
  createTypedDraft,
  buildTypedRecording,
  completeTypedSet,
  editTypedSet,
  setTypedSetType,
  typedSetTarget,
  upgradeLegacyTraining,
  typedPrescriptionFromLegacy,
  copyTypedPerformance,
  previousTypedSet,
  copyTypedSetPerformance,
  chooseTypedAlternative,
} from "./typed-training";
import { RECORD_TYPES, type RecordType } from "../../../src/domain/training-metrics";
import { typedRecordingPayloadSchema } from "../../../src/lib/mobile/typed-recording-contracts";
import { personalRoutineContext, createPersonalTrainingDraft } from "./personal-training";
import { personalRoutineFixture } from "../test/fixtures/personal-routine";
import { DEMO_ROUTINES } from "./demo";
import { createDraft } from "../../../src/lib/workout/runner-state";
const id = (n: number) => `ac215000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-27T12:00:00Z");
function make(kind: RecordType = null) {
  const reps = [
    null,
    "weight_reps",
    "bodyweight_reps",
    "weighted_bodyweight",
    "assisted_bodyweight",
  ].includes(kind);
  const weight =
    (kind !== "bodyweight_reps" && reps) ||
    ["weight_duration", "weight_distance"].includes(kind ?? "");
  const context = typedContextSchema.parse({
    version: 3,
    origin: { kind: "free" },
    title: "Prueba",
    sessionLabel: "Libre",
    exercises: [
      {
        sessionExerciseId: id(5),
        exerciseId: id(6),
        name: "Ejercicio",
        isBodyweight: false,
        prescribed: {
          recordType: kind,
          sets: 2,
          target: {
            repsMin: reps ? 8 : null,
            repsMax: reps ? 12 : null,
            targetWeightKg: weight ? 25 : null,
            targetDurationSeconds: null,
            targetDistanceMeters: null,
          },
          series: null,
        },
        lastMetrics: null,
        note: "Indicación",
        restSeconds: 90,
        supersetId: null,
        supersetRestSeconds: null,
        alternatives: [],
      },
    ],
  });
  const draft = createTypedDraft({ context, userId: id(1), workoutId: id(2), now });
  return { context, draft };
}
function filled(kind: RecordType = null) {
  const x = make(kind),
    s = x.draft.exercises[0].sets[0];
  if (
    [null, "weight_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight"].includes(
      kind,
    )
  )
    s.reps = "10";
  if (["duration", "weight_duration", "distance_duration"].includes(kind ?? "")) s.duration = "60";
  if (["distance_duration", "weight_distance"].includes(kind ?? "")) s.distance = "100,25";
  s.effort = "8,5";
  s.done = true;
  return x;
}
describe("registro nativo con métricas propias", () => {
  it.each([null, ...RECORD_TYPES])(
    "cierra %s con null explícitos, notas propias y filas sin ejecución",
    (kind) => {
      const { context, draft } = filled(kind);
      draft.exercises[0].athleteNote = "Mi nota 💪";
      context.exercises.push({
        ...structuredClone(context.exercises[0]),
        sessionExerciseId: id(9),
      });
      const extra = createTypedDraft({ context, userId: id(1), workoutId: id(2), now })
        .exercises[1];
      extra.athleteNote = "Sin series";
      draft.exercises.push(extra);
      const before = structuredClone({ context, draft });
      const result = buildTypedRecording(context, draft, new Date(now.getTime() + 60000));
      expect(result.ok).toBe(true);
      if (!result.ok) throw Error("cierre");
      expect(typedRecordingPayloadSchema.parse(result.payload)).toEqual(result.payload);
      expect(result.payload.workout.sets[0]).toMatchObject({
        metrics: { recordType: kind },
        setType: "working",
        effort: 8.5,
      });
      expect(result.payload.workout.exerciseNotes).toEqual([
        { sessionExerciseId: id(5), note: "Mi nota 💪" },
        { sessionExerciseId: id(9), note: "Sin series" },
      ]);
      expect(result.payload.structure.exercises[0].note).toBe("Indicación");
      expect(result.payload.workout.durationSeconds).toBe(60);
      expect({ context, draft }).toEqual(before);
    },
  );
  it("precarga peso prescrito por índice de trabajo; historial no llena reps, segundos ni metros", () => {
    const { context } = make("weight_duration");
    const row = context.exercises[0];
    row.prescribed.target.targetWeightKg = null;
    row.prescribed.series = [
      { ...row.prescribed.target, targetWeightKg: 40 },
      { ...row.prescribed.target, targetWeightKg: 30 },
    ];
    row.lastMetrics = {
      recordType: "weight_duration",
      weightKg: 15,
      reps: null,
      durationSeconds: 70,
      distanceMeters: null,
    };
    const draft = createTypedDraft({ context, userId: id(1), workoutId: id(2), now });
    expect(draft.exercises[0].sets.map((s) => [s.weight, s.reps, s.duration, s.distance])).toEqual([
      ["40", "", "", ""],
      ["30", "", "", ""],
    ]);
    draft.exercises[0].sets.unshift({
      ...draft.exercises[0].sets[0],
      id: "warm",
      setType: "warmup",
    });
    expect(typedSetTarget(draft.exercises[0], 1)?.targetWeightKg).toBe(40);
    expect(typedSetTarget(draft.exercises[0], 2)?.targetWeightKg).toBe(30);
    expect(typedSetTarget(draft.exercises[0], 0)).toBeNull();
  });
  it("usa solo peso histórico del mismo tipo y no infiere corporal ni dimensiones nuevas del legado", () => {
    const { context } = make();
    const e = context.exercises[0];
    e.isBodyweight = true;
    e.prescribed.target.targetWeightKg = null;
    e.lastMetrics = {
      recordType: null,
      weightKg: 12.5,
      reps: 5,
      durationSeconds: null,
      distanceMeters: null,
    };
    expect(
      createTypedDraft({ context, userId: id(1), workoutId: id(2), now }).exercises[0].sets[0]
        .weight,
    ).toBe("12,5");
    e.lastMetrics = {
      recordType: "weight_reps",
      weightKg: 50,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
    };
    expect(() => typedContextSchema.parse(context)).toThrow();
  });
  it("rechaza toda serie completada inválida y conserva el texto intermedio al editar", () => {
    const { context, draft } = filled("distance_duration");
    const edited = editTypedSet(draft, 0, 0, "distance", "1,");
    expect(edited.exercises[0].sets[0]).toMatchObject({ distance: "1,", done: false });
    expect(draft.exercises[0].sets[0].done).toBe(true);
    for (const change of [
      { distance: "" },
      { duration: "1.2" },
      { duration: "86401" },
      { distance: "1000001" },
      { distance: "1.001" },
      { weight: "1" },
      { effort: "8.2" },
    ]) {
      const bad = structuredClone(draft);
      Object.assign(bad.exercises[0].sets[0], change);
      expect(buildTypedRecording(context, bad, now)).toEqual({ ok: false, reason: "invalid" });
    }
    const no = editTypedSet(draft, 0, 0, "duration", "");
    expect(buildTypedRecording(context, no, now)).toEqual({ ok: false, reason: "no_sets" });
  });
  it("no convierte vacío en cero salvo peso legado; moderno exige métricas explícitas", () => {
    const old = filled();
    old.draft.exercises[0].sets[0].weight = "";
    const legacy = buildTypedRecording(old.context, old.draft, now);
    expect(legacy.ok && legacy.payload.workout.sets[0].metrics.weightKg).toBe(0);
    const modern = filled("weight_reps");
    modern.draft.exercises[0].sets[0].weight = "";
    expect(buildTypedRecording(modern.context, modern.draft, now)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
  it("superserie avanza con fallo/drop, descansa por ronda y calentamientos no avanzan", () => {
    const { context, draft } = filled("duration");
    const group = id(10);
    context.exercises[0].supersetId = group;
    context.exercises[0].supersetRestSeconds = 120;
    draft.exercises[0].supersetId = group;
    draft.exercises[0].supersetRestSeconds = 120;
    context.exercises.push({ ...structuredClone(context.exercises[0]), sessionExerciseId: id(7) });
    draft.exercises.push({ ...structuredClone(draft.exercises[0]), sessionExerciseId: id(7) });
    for (const e of draft.exercises) {
      e.sets = e.sets.map((s, i) => ({
        ...s,
        id: e.sessionExerciseId + "-" + i,
        duration: "30",
        done: false,
        setType: i ? "drop" : "failure",
      }));
    }
    let next = completeTypedSet(draft, 0, 0, now, 0);
    expect(next.activeIndex).toBe(1);
    expect(next.draft.rest).toBeNull();
    next = completeTypedSet(next.draft, 1, 0, now, 1);
    expect(next.activeIndex).toBe(0);
    expect(next.draft.rest).toEqual({ endsAt: now.getTime() + 120000, totalSeconds: 120 });
    const before = next.draft;
    next = completeTypedSet(before, 1, 0, new Date(now.getTime() + 10000), 0);
    expect(next.draft.exercises[1].sets[0].done).toBe(false);
    expect(next.draft.rest).toEqual(before.rest);
    const warm = setTypedSetType(draft, 0, 0, "warmup");
    warm.exercises.forEach((e) => (e.supersetRestSeconds = 0));
    next = completeTypedSet(warm, 0, 0, now, 0);
    expect(next.activeIndex).toBe(0);
    expect(next.draft.rest).toBeNull();
  });
  it("cambiar clase conserva carga y descanso; cambio de calentamiento desmarca serie hecha", () => {
    const { draft } = filled();
    draft.rest = { endsAt: now.getTime() + 90000, totalSeconds: 90 };
    const failure = setTypedSetType(draft, 0, 0, "failure");
    expect(failure.exercises[0].sets[0]).toMatchObject({
      weight: "25",
      done: true,
      setType: "failure",
    });
    expect(failure.rest).toEqual(draft.rest);
    const warm = setTypedSetType(failure, 0, 0, "warmup");
    expect(warm.exercises[0].sets[0].done).toBe(false);
  });
  it("no acepta identidad, objetivos o notas incoherentes aunque las métricas sean válidas", () => {
    const { context, draft } = filled();
    const changes = [
      { workoutId: "no" },
      { origin: { kind: "personal" as const, routineId: id(88), revision: 1 } },
      { title: "Otra" },
      { exercises: draft.exercises.map((e) => ({ ...e, exerciseId: id(90) })) },
      {
        exercises: draft.exercises.map((e) => ({ ...e, prescribed: { ...e.prescribed, sets: 4 } })),
      },
      { exercises: draft.exercises.map((e) => ({ ...e, athleteNote: "💪".repeat(501) })) },
    ];
    for (const change of changes)
      expect(buildTypedRecording(context, { ...draft, ...change }, now)).toEqual({
        ok: false,
        reason: "invalid",
      });
    expect(typedDraftSchema.safeParse({ ...draft, version: 5 }).success).toBe(false);
  });
  it("migración explícita conserva borrador legado, sin cambiar tipo ni tocar cierres congelados", () => {
    const context = personalRoutineContext(personalRoutineFixture());
    const draft = createPersonalTrainingDraft({ context, userId: id(1), workoutId: id(2), now });
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      weight: "3,",
      reps: "9",
      done: false,
      isWarmup: true,
    };
    draft.rest = { endsAt: now.getTime() + 60000, totalSeconds: 60 };
    const before = structuredClone({ context, draft });
    const converted = upgradeLegacyTraining(context, draft);
    expect(converted.context.version).toBe(3);
    expect(converted.draft.version).toBe(4);
    expect(converted.draft.exercises[0].sets[0]).toMatchObject({
      weight: "3,",
      reps: "9",
      setType: "warmup",
      effort: "",
      done: false,
    });
    expect(converted.draft.exercises[0].prescribed.recordType).toBeNull();
    expect(converted.draft.rest).toEqual(draft.rest);
    expect({ context, draft }).toEqual(before);
    expect(() => upgradeLegacyTraining(context, { ...draft, status: "pending_save" })).toThrow();
  });
  it("asignadas conservan Rx y alternativas autorizadas con nombres reales", () => {
    const source = structuredClone(DEMO_ROUTINES[1]);
    const old = createDraft({
      workoutId: id(2),
      userId: id(1),
      now,
      plannedSession: source.session,
      exercises: source.exercises.map((e) => ({
        ...e,
        lastWeightKg: null,
        alternatives: e.alternatives?.map((a) => ({ ...a, lastWeightKg: null })),
      })),
    });
    const { context, draft } = upgradeLegacyTraining(source, old),
      alt = context.exercises[0].alternatives[0];
    Object.assign(draft.exercises[0], alt, { restSeconds: 180 });
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      weight: "20",
      reps: "10",
      done: true,
    };
    const result = buildTypedRecording(context, draft, now);
    if (!result.ok || result.payload.source !== "assigned") throw Error("asignada");
    expect(result.payload.workout.sets[0]).toMatchObject({
      exerciseId: alt.exerciseId,
      exerciseName: alt.name,
      prescribedExerciseId: source.exercises[0].exerciseId,
    });
    expect(result.payload.structure.exercises[0].restSeconds).toBe(source.exercises[0].restSeconds);
    expect(result.payload.structure.exercises[0].prescribed).toEqual(
      typedPrescriptionFromLegacy(source.exercises[0].alternatives![0].prescribed),
    );
    draft.exercises[0].exerciseId = id(998);
    expect(buildTypedRecording(context, draft, now)).toEqual({ ok: false, reason: "invalid" });
  });
});
it("copiar ejecución es explícito, respeta calentamientos y conserva completadas, clase y esfuerzo propios", () => {
  const { draft } = filled("distance_duration");
  const e = draft.exercises[0];
  e.sets.push({ ...e.sets[1], id: "extra", setType: "failure", effort: "9" });
  e.sets.unshift({ ...e.sets[1], id: "warmup", setType: "warmup" });
  const actual = {
    recordType: "distance_duration" as const,
    weightKg: null,
    reps: null,
    durationSeconds: 45,
    distanceMeters: 200.5,
    setType: "working" as const,
    effort: 5,
  };
  const result = copyTypedPerformance(draft, 0, [
    { ...actual, setType: "warmup", durationSeconds: 10, distanceMeters: 50 },
    actual,
    { ...actual, durationSeconds: 60 },
    actual,
  ]);
  expect(result.exercises[0].sets[0]).toMatchObject({
    duration: "10",
    distance: "50",
    done: false,
  });
  expect(result.exercises[0].sets[1]).toEqual(draft.exercises[0].sets[1]);
  expect(result.exercises[0].sets[2]).toMatchObject({
    duration: "60",
    distance: "200,5",
    done: false,
  });
  expect(result.exercises[0].sets[3]).toMatchObject({
    setType: "failure",
    effort: "9",
    done: false,
  });
  expect(() =>
    copyTypedPerformance(draft, 0, [{ ...actual, recordType: "weight_reps" }]),
  ).toThrow();
  expect(draft.exercises[0].sets[2].duration).toBe("");
});
it("solo puede elegir una alternativa autorizada antes de completar series; recupera objetivo y grupo", () => {
  const source = structuredClone(DEMO_ROUTINES[1]);
  const legacy = createDraft({
    workoutId: id(2),
    userId: id(1),
    now,
    plannedSession: source.session,
    exercises: source.exercises.map((e) => ({
      ...e,
      lastWeightKg: null,
      alternatives: e.alternatives?.map((a) => ({ ...a, lastWeightKg: null })),
    })),
  });
  const { context, draft } = upgradeLegacyTraining(source, legacy),
    alt = context.exercises[0].alternatives[0];
  const next = chooseTypedAlternative(context, draft, 0, alt.exerciseId);
  expect(next.exercises[0]).toMatchObject({
    exerciseId: alt.exerciseId,
    prescribed: alt.prescribed,
    sessionExerciseId: draft.exercises[0].sessionExerciseId,
    supersetId: draft.exercises[0].supersetId,
  });
  next.exercises[0].sets[0] = {
    ...next.exercises[0].sets[0],
    weight: "20",
    reps: "10",
    done: true,
  };
  expect(() => chooseTypedAlternative(context, next, 0, source.exercises[0].exerciseId)).toThrow();
  expect(() => chooseTypedAlternative(context, draft, 0, id(999))).toThrow();
  expect(draft.exercises[0].exerciseId).toBe(source.exercises[0].exerciseId);
});
it("un cierre congelado no admite ediciones de métricas, clases ni copias posteriores", () => {
  const { draft } = filled();
  draft.status = "pending_save";
  const before = structuredClone(draft);
  expect(() => editTypedSet(draft, 0, 0, "weight", "40")).toThrow();
  expect(() => setTypedSetType(draft, 0, 0, "drop")).toThrow();
  expect(() => copyTypedPerformance(draft, 0, [])).toThrow();
  expect(() => completeTypedSet(draft, 0, 0, now, 0)).toThrow();
  expect(draft).toEqual(before);
});

it("referencia por serie distingue calentamiento/trabajo, conserva objetivos/esfuerzo y protege series hechas", () => {
  const x = make("weight_duration");
  const history = [
    {
      recordType: "weight_duration" as const,
      weightKg: 10,
      reps: null,
      durationSeconds: 20,
      distanceMeters: null,
      setType: "warmup" as const,
      effort: 2,
    },
    {
      recordType: "weight_duration" as const,
      weightKg: 40,
      reps: null,
      durationSeconds: 60,
      distanceMeters: null,
      setType: "working" as const,
      effort: 8,
    },
    {
      recordType: "weight_duration" as const,
      weightKg: 35,
      reps: null,
      durationSeconds: 45,
      distanceMeters: null,
      setType: "drop" as const,
      effort: 9,
    },
  ];
  x.draft.exercises[0].sets[0].effort = "7,5";
  expect(previousTypedSet(x.draft.exercises[0], 0, history)).toEqual(history[1]);
  expect(previousTypedSet(x.draft.exercises[0], 1, history)).toEqual(history[2]);
  const copied = copyTypedSetPerformance(x.draft, 0, 0, history);
  expect(copied.exercises[0].sets[0]).toMatchObject({
    weight: "40",
    duration: "60",
    effort: "7,5",
    setType: "working",
    done: false,
  });
  expect(copied.exercises[0].sets[1]).toEqual(x.draft.exercises[0].sets[1]);
  expect(copied.exercises[0].prescribed).toEqual(x.draft.exercises[0].prescribed);
  const warm = setTypedSetType(copied, 0, 0, "warmup");
  expect(previousTypedSet(warm.exercises[0], 0, history)).toEqual(history[0]);
  expect(previousTypedSet(warm.exercises[0], 1, history)).toEqual(history[1]);
  const finished = completeTypedSet(copied, 0, 0, now, 0).draft;
  expect(copyTypedSetPerformance(finished, 0, 0, history)).toEqual(finished);
  expect(
    previousTypedSet(finished.exercises[0], 0, [
      { ...history[0], recordType: "duration", weightKg: null },
    ]),
  ).toBeNull();
});
