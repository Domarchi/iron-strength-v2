import { it, expect } from "vitest";
import { trainingHistoryFixture } from "@/test/fixtures/training-history";
import { historyProgressSource, trainingHistorySourceSchema } from "@/domain/training-history";
import { buildTrainingProgress } from "@/domain/training-progress";
import { selectTrainingExercise, progressSelectionNavigation } from "./training-progress-selection";
import { navigationContext, progressHref, workoutHref, evidenceReturn } from "./training-context";
import { availableTrainingMetrics } from "@/domain/training-progress-view";
const all = () => {
  const value = trainingHistoryFixture();
  value.workouts[0].sets[1].setType = "working";
  return buildTrainingProgress(historyProgressSource(trainingHistorySourceSchema.parse(value)))
    .exercises;
};
it("selecciona los nueve contratos registrados y cada métrica real sin inferir catálogo", () => {
  const input = all();
  expect(input).toHaveLength(9);
  for (const e of input)
    for (const metric of availableTrainingMetrics(e)) {
      const selected = selectTrainingExercise(input, e.exerciseId, {
        tipo: e.recordType ?? "legacy",
        metrica: metric,
        semanas: "4",
      });
      expect(selected.kind).toBe("ready");
      if (selected.kind !== "ready") throw Error("missing");
      expect(selected.exercise).toBe(e);
      expect(selected.metric).toBe(metric);
      expect(selected.weeks).toBe(4);
      expect(selected.notices).toEqual([]);
      const nav = progressSelectionNavigation(selected, "volumen");
      const url = new URL(progressHref(e.exerciseId, nav), "https://iron.test");
      expect(url.searchParams.get("tipo")).toBe(e.recordType ?? "legacy");
      expect(url.searchParams.get("metrica")).toBe(metric);
    }
});
it("mantiene null separado del tipo explícito y jamás sustituye un tipo solicitado que falta", () => {
  const e = all().find((e) => e.recordType === null)!;
  const modern = { ...e, recordType: "weight_reps" as const };
  const rows = [modern, e];
  const implicit = selectTrainingExercise(rows, e.exerciseId, {});
  expect(implicit.kind === "ready" && implicit.exercise.recordType).toBe(null);
  const explicit = selectTrainingExercise(rows, e.exerciseId, { tipo: "weight_reps" });
  expect(explicit.kind === "ready" && explicit.exercise.recordType).toBe("weight_reps");
  expect(selectTrainingExercise([modern], e.exerciseId, { tipo: "legacy" }).kind).toBe("missing");
  for (const tipo of ["future", ["duration", "weight_reps"], null])
    expect(selectTrainingExercise(rows, e.exerciseId, { tipo }).kind).toBe("invalid_type");
  expect(
    selectTrainingExercise([modern, { ...e, recordType: "duration" as const }], e.exerciseId, {})
      .kind,
  ).toBe("choose_type");
});
it("enlaces legados conservan volumen y las métricas inválidas/periodos inválidos avisan al descartarse", () => {
  const rows = all(),
    e = rows.find((e) => e.recordType === null)!;
  const old = selectTrainingExercise(rows, e.exerciseId, { vista: "volumen", semanas: "12" });
  expect(old.kind === "ready" && old.metric).toBe("externalVolumeKg");
  const time = rows.find((e) => e.recordType === "duration")!;
  const selected = selectTrainingExercise(rows, time.exerciseId, {
    tipo: "duration",
    metrica: "estimated1RM",
    semanas: ["4", "12"],
  });
  expect(selected).toMatchObject({ kind: "ready", metric: "durationSeconds", weeks: 8 });
  if (selected.kind !== "ready") throw Error("missing");
  expect(selected.notices).toHaveLength(2);
  expect(selectTrainingExercise(rows, crypto.randomUUID(), {}).kind).toBe("missing");
});
it("retorno valida la pareja ejercicio/tipo y usa solo el alumno real del resultado", () => {
  const e = all().find((e) => e.recordType === "duration")!,
    owner = crypto.randomUUID(),
    attacker = crypto.randomUUID(),
    workout = crypto.randomUUID();
  const nav = navigationContext({ semanas: "12", tipo: "duration", metrica: "durationSeconds" });
  const url = new URL(workoutHref(workout, nav, owner, e.exerciseId), "https://iron.test");
  expect(url.searchParams.get("tipo")).toBe("duration");
  const query = { desde: "progreso", ejercicio: e.exerciseId, alumno: attacker };
  const back = evidenceReturn(nav, owner, false, query, [
    { exerciseId: e.exerciseId, recordType: "duration" },
  ]);
  expect(back.href).toContain("alumno=" + owner);
  expect(back.href).not.toContain(attacker);
  expect(back.label).toBe("Volver al progreso");
  expect(
    evidenceReturn(nav, owner, false, query, [{ exerciseId: e.exerciseId, recordType: null }])
      .label,
  ).toBe("Volver a la ficha");
  expect(
    evidenceReturn(nav, owner, true, query, [{ exerciseId: e.exerciseId, recordType: null }]).href,
  ).toBe("/history");
  expect(
    evidenceReturn(nav, owner, true, { ...query, tipo: "future" }, [
      { exerciseId: e.exerciseId, recordType: "duration" },
    ]).href,
  ).toBe("/history");
  expect(
    navigationContext({ tipo: "future", metrica: "https://evil.test", vista: "https://evil.test" }),
  ).toEqual({ weeks: 8, view: "1rm" });
});

it("el enlace legado sin carga conserva repeticiones totales, distintas de la mejor serie", () => {
  const fixture = trainingHistorySourceSchema.parse(trainingHistoryFixture());
  fixture.workouts[0].sets[0].metrics.weightKg = 0;
  fixture.workouts[0].sets.push({
    ...structuredClone(fixture.workouts[0].sets[0]),
    id: crypto.randomUUID(),
    setNumber: 2,
  });
  const rows = buildTrainingProgress(
    historyProgressSource(trainingHistorySourceSchema.parse(fixture)),
  ).exercises;
  const e = rows.find((e) => e.recordType === null)!;
  expect(e.marks.find((m) => m.metric === "reps")!.value).toBe(8);
  expect(e.points[0].totals.bodyweightReps).toBe(16);
  expect(selectTrainingExercise(rows, e.exerciseId, {})).toMatchObject({
    kind: "ready",
    metric: "bodyweightReps",
  });
});
