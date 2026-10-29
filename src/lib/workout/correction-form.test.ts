import { expect, it } from "vitest";
import { trainingMetricCases } from "../../test/fixtures/training-metrics";
import { workoutCorrectionSnapshotFixture } from "../../test/fixtures/workout-correction";
import { workoutCorrectionSnapshotSchema } from "../mobile/workout-correction-contracts";
import {
  correctionFormFromSnapshot,
  correctionFromForm,
  mergeCorrectionForm,
} from "./correction-form";
const requestId = "af214a00-0000-4000-8000-000000000005";
const rowId = "af214a00-0000-4000-8000-000000000007";
function typed(index: number) {
  const base = workoutCorrectionSnapshotFixture(),
    metrics = trainingMetricCases[index];
  return workoutCorrectionSnapshotSchema.parse({
    ...base,
    workout: {
      ...base.workout,
      sourceKind: "free",
      title: "Sesión personal",
      sessionLabel: null,
      structure: {
        version: 2,
        exercises: [
          {
            id: rowId,
            exerciseId: base.workout.sets[0].exerciseId,
            prescribedExerciseId: null,
            note: null,
            restSeconds: 60,
            supersetId: null,
            supersetRestSeconds: null,
            prescribed: {
              recordType: metrics.recordType,
              sets: 1,
              target: {
                repsMin: metrics.reps,
                repsMax: metrics.reps,
                targetWeightKg: metrics.weightKg,
                targetDurationSeconds: metrics.durationSeconds,
                targetDistanceMeters: metrics.distanceMeters,
              },
              series: null,
            },
          },
        ],
      },
      exerciseNotes: [{ sessionExerciseId: rowId, note: null }],
      sets: [{ ...base.workout.sets[0], metrics, setType: "working", effort: 7.5 }],
    },
  });
}
for (let i = 0; i < trainingMetricCases.length; i++)
  it(`formulario del tipo ${trainingMetricCases[i].recordType ?? "null"} mantiene dimensiones y coma decimal`, () => {
    const base = typed(i),
      before = structuredClone(base),
      form = correctionFormFromSnapshot(base);
    const metrics = base.workout.sets[0].metrics;
    const expected = {
      ...metrics,
      weightKg: metrics.weightKg === null ? null : 32.5,
      reps: metrics.reps === null ? null : 9,
      durationSeconds: metrics.durationSeconds === null ? null : 75,
      distanceMeters: metrics.distanceMeters === null ? null : 123.45,
    };
    form.sets[0].weightKg = expected.weightKg === null ? "" : "32,5";
    form.sets[0].reps = expected.reps === null ? "" : "9";
    form.sets[0].durationSeconds = expected.durationSeconds === null ? "" : "75";
    form.sets[0].distanceMeters = expected.distanceMeters === null ? "" : "123,45";
    form.sets[0].setType = "warmup";
    form.sets[0].isWarmup = true;
    form.sets[0].effort = "8,5";
    const value = correctionFromForm(base, form, requestId);
    expect(value.sets[0]).toMatchObject({
      metrics: expected,
      setType: "warmup",
      isWarmup: true,
      effort: 8.5,
    });
    expect(value.expectedRevision).toBe(base.workout.revision);
    expect(base).toEqual(before);
  });
it("conserva texto numérico intermedio; rechaza vacíos obligatorios, exponentes, dimensiones ocultas y límites", () => {
  const base = workoutCorrectionSnapshotFixture();
  for (const patch of [
    { weightKg: "62," },
    { reps: "" },
    { weightKg: "1e2" },
    { weightKg: "500,01" },
    { reps: "0" },
    { durationSeconds: "10" },
    { weightKg: "1,234" },
  ]) {
    const form = correctionFormFromSnapshot(base);
    Object.assign(form.sets[0], patch);
    const before = structuredClone(form);
    expect(() => correctionFromForm(base, form, requestId)).toThrow();
    expect(form).toEqual(before);
  }
});
it("legado conserva clase null y calentamiento; no convierte esfuerzo ni tipo al corregir", () => {
  const base = workoutCorrectionSnapshotFixture(),
    form = correctionFormFromSnapshot(base);
  form.sets[0].isWarmup = true;
  expect(correctionFromForm(base, form, requestId).sets[0]).toMatchObject({
    setType: null,
    effort: null,
    isWarmup: true,
    metrics: { recordType: null },
  });
  form.sets[0].effort = "8";
  expect(() => correctionFromForm(base, form, requestId)).toThrow();
});
it("mantiene notas crudas y limita Unicode500, esfuerzo entero de sesión y medio punto por serie", () => {
  const base = typed(0),
    form = correctionFormFromSnapshot(base);
  form.note = "🏋".repeat(500);
  form.perceivedEffort = "10";
  form.exerciseNotes![0].note = "Nota propia";
  expect(correctionFromForm(base, form, requestId)).toMatchObject({
    note: form.note,
    perceivedEffort: 10,
    exerciseNotes: [{ sessionExerciseId: rowId, note: "Nota propia" }],
  });
  for (const patch of [
    { note: "🏋".repeat(501) },
    { perceivedEffort: "7,5" },
    { perceivedEffort: "0" },
  ])
    expect(() => correctionFromForm(base, { ...form, ...patch }, requestId)).toThrow();
  form.sets[0].effort = "7,2";
  expect(() => correctionFromForm(base, form, requestId)).toThrow();
});
it("quitar una serie no exige sus números ni modifica sus valores locales; quitar todas no prepara petición", () => {
  const base = workoutCorrectionSnapshotFixture();
  base.workout.sets.push({ ...structuredClone(base.workout.sets[0]), id: rowId, setNumber: 2 });
  const form = correctionFormFromSnapshot(base);
  form.sets[0].removed = true;
  form.sets[0].reps = "";
  expect(correctionFromForm(base, form, requestId).sets.map((s) => s.id)).toEqual([rowId]);
  expect(form.sets[0].reps).toBe("");
  form.sets[1].removed = true;
  expect(() => correctionFromForm(base, form, requestId)).toThrow();
});
it("la propuesta debe corresponder a todos los IDs originales, sin sustituir ni inventar filas", () => {
  const base = workoutCorrectionSnapshotFixture(),
    form = correctionFormFromSnapshot(base);
  form.sets[0].id = rowId;
  expect(() => correctionFromForm(base, form, requestId)).toThrow();
  form.sets = [];
  expect(() => correctionFromForm(base, form, requestId)).toThrow();
});
it("la comparación mezcla solo cambios locales y conserva métricas/notas/series remotas nuevas", () => {
  const base = workoutCorrectionSnapshotFixture(),
    local = correctionFormFromSnapshot(base),
    latest = structuredClone(base);
  local.sets[0].reps = "9";
  latest.workout.revision++;
  latest.workout.sets[0].metrics.weightKg = 70;
  latest.workout.note = "Nota remota";
  latest.workout.sets.push({ ...structuredClone(latest.workout.sets[0]), id: rowId, setNumber: 2 });
  const before = structuredClone({ base, local, latest }),
    merged = mergeCorrectionForm(base, local, latest);
  expect(merged.unapplied).toEqual([]);
  expect(merged.form.sets[0]).toMatchObject({ weightKg: "70", reps: "9" });
  expect(merged.form.sets[1]).toMatchObject({
    id: rowId,
    weightKg: "70",
    reps: "8",
    removed: false,
  });
  expect(merged.form.note).toBe("Nota remota");
  expect({ base, local, latest }).toEqual(before);
  expect(correctionFromForm(latest, merged.form, requestId).sets).toHaveLength(2);
});
it("una serie desaparecida con cambios queda en información no aplicable; no se recrea ni se borra la propuesta original", () => {
  const base = workoutCorrectionSnapshotFixture();
  base.workout.sets.push({ ...structuredClone(base.workout.sets[0]), id: rowId, setNumber: 2 });
  const local = correctionFormFromSnapshot(base);
  local.sets[0].reps = "9";
  const latest = structuredClone(base);
  latest.workout.revision++;
  latest.workout.sets.shift();
  const merged = mergeCorrectionForm(base, local, latest);
  expect(merged.form.sets.map((s) => s.id)).toEqual([rowId]);
  expect(merged.unapplied).toEqual([
    {
      id: base.workout.sets[0].id,
      exerciseName: "Nombre histórico",
      setNumber: 1,
      values: local.sets[0],
    },
  ]);
  expect(local.sets).toHaveLength(2);
});
it("no compara otra cuenta/resultado, revisión anterior ni tipos/formato distintos", () => {
  const base = workoutCorrectionSnapshotFixture(),
    form = correctionFormFromSnapshot(base);
  for (const patch of [
    { userId: rowId },
    { workout: { ...base.workout, id: rowId } },
    { workout: { ...base.workout, revision: 2 } },
  ])
    expect(() => mergeCorrectionForm(base, form, { ...base, ...patch })).toThrow();
  expect(() => mergeCorrectionForm(base, form, typed(0))).toThrow();
});
