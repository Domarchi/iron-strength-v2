import { it, expect } from "vitest";
import { buildHistoryCsv, type ExportSet } from "./csv";
import { trainingMetricCases } from "@/test/fixtures/training-metrics";
const base = {
  date: "2026-10-05",
  sessionLabel: null,
  exerciseName: "Ejercicio",
  sourceKind: "free" as const,
  setNumber: 1,
  isWarmup: false,
  weightKg: null,
  reps: null,
};
it("exporta los nueve contratos sin ceros ficticios y conserva las doce primeras columnas", () => {
  const rows: ExportSet[] = trainingMetricCases.map((metrics, i) => ({
    ...base,
    ...metrics,
    setType: i === 0 ? "drop" : i === 1 ? "failure" : "working",
    setEffort: 8.5,
    exerciseNote: "=nota",
    workoutId: "workout-id",
    exerciseId: "exercise-id",
    prescribedExerciseId: null,
  }));
  const lines = buildHistoryCsv(rows)
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n")
    .map((r) => r.split(";"));
  expect(lines[0].slice(0, 12)).toEqual([
    "Fecha",
    "Sesión",
    "Ejercicio",
    "Serie",
    "Tipo",
    "Kg",
    "Reps",
    "Ejercicio prescrito",
    "Esfuerzo (1–10)",
    "Nota del entrenamiento",
    "Origen",
    "Título",
  ]);
  expect(lines[0].slice(12)).toEqual([
    "Tipo de registro",
    "Duración (s)",
    "Distancia (m)",
    "Esfuerzo de serie (1–10)",
    "Nota del ejercicio",
    "Fila",
    "Entrenamiento ID",
    "Ejercicio ID",
    "Ejercicio prescrito ID",
  ]);
  for (const [i, m] of trainingMetricCases.entries()) {
    const r = lines[i + 1],
      number = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
    expect(r[5]).toBe(number(m.weightKg));
    expect(r[6]).toBe(number(m.reps));
    expect(r[7]).toBe("");
    expect(r.slice(12)).toEqual([
      m.recordType ?? "",
      number(m.durationSeconds),
      number(m.distanceMeters),
      "8,5",
      "'=nota",
      "Serie",
      "workout-id",
      "exercise-id",
      "",
    ]);
  }
  expect(lines[1][4]).toBe("Descendente");
  expect(lines[2][4]).toBe("Fallo");
});
it("una nota sin series tiene fila explícita y ninguna métrica realizada", () => {
  const row: ExportSet = {
    ...base,
    rowKind: "exercise_note",
    setNumber: null,
    recordType: "duration",
    durationSeconds: null,
    distanceMeters: null,
    setType: null,
    setEffort: null,
    exerciseNote: "Nota sin series",
  };
  const cells = buildHistoryCsv([row]).split("\r\n")[1].split(";");
  expect(cells.slice(3, 7)).toEqual(["", "", "", ""]);
  expect(cells.slice(12, 18)).toEqual([
    "duration",
    "",
    "",
    "",
    "Nota sin series",
    "Nota del ejercicio",
  ]);
  expect(() => buildHistoryCsv([{ ...row, weightKg: 0 }])).toThrow();
});
it("rechaza dimensiones incompatibles, clase contradictoria y esfuerzo fuera del contrato", () => {
  for (const row of [
    { ...base, recordType: "duration", durationSeconds: 60, reps: 8 },
    { ...base, weightKg: 20, reps: 8, setType: "warmup" },
    { ...base, weightKg: 20, reps: 8, setEffort: 11 },
  ] as ExportSet[])
    expect(() => buildHistoryCsv([row])).toThrow();
});
it("los textos nuevos también conservan fórmula, comillas y saltos de línea seguros", () => {
  const csv = buildHistoryCsv([
    {
      ...base,
      weightKg: 20,
      reps: 8,
      workoutId: "=1",
      exerciseId: "@id",
      prescribedExerciseId: "-id",
      exerciseNote: '=SUM(1;2)\n"nota"',
    },
  ]);
  expect(csv).toContain('"\'=SUM(1;2)\n""nota"""');
  expect(csv).toContain(";'=1;'@id;'-id");
});
