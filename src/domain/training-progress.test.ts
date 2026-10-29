import { describe, expect, it } from "vitest";
import { legacyTrainingSet, type TrainingRecordedSet } from "./training-metrics";
import {
  buildTrainingProgress,
  compareTrainingProgress,
  filterTrainingActivity,
  trainingCalendar,
  trainingPeriodSummary,
  trainingProgressSourceSchema,
  type TrainingProgressSource,
} from "./training-progress";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function source(): TrainingProgressSource {
  return { version: 1, userId: uuid(1), today: "2026-10-28", workouts: [] };
}
function add(
  s: TrainingProgressSource,
  n: number,
  date: string,
  values: TrainingRecordedSet[],
  exercise = 20,
  muscle: string | null = "Core",
) {
  s.workouts.push({
    id: uuid(n),
    startedAt: `${date}T16:00:00Z`,
    date,
    sourceKind: "free",
    title: "Rutina ágil",
    sessionLabel: null,
    durationSeconds: 3600,
    perceivedEffort: 8,
    note: "Anotación",
    sets: values.map((value, i) => {
      const { setType, effort, ...metrics } = value;
      return {
        id: uuid(n * 100 + i),
        exerciseId: uuid(exercise),
        name: "Plancha histórica",
        muscleGroup: muscle,
        position: 0,
        setNumber: i + 1,
        metrics,
        setType,
        effort,
      };
    }),
  });
}
const reps = (weightKg: number, count: number, warmup = false) =>
  legacyTrainingSet({ weightKg, reps: count, isWarmup: warmup });
const metric = (
  recordType: TrainingRecordedSet["recordType"],
  values: Partial<TrainingRecordedSet>,
): TrainingRecordedSet => ({
  recordType,
  weightKg: null,
  reps: null,
  durationSeconds: null,
  distanceMeters: null,
  setType: "working",
  effort: null,
  ...values,
});
describe("progreso real por contrato registrado T218", () => {
  it("vacío conserva identidad y no fabrica marcas/actividad", () => {
    expect(buildTrainingProgress(source())).toEqual({ activity: [], exercises: [] });
  });
  it("separa legado y tipo explícito, conserva nombre histórico y evidencia", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(50, 10)]);
    add(s, 3, "2026-10-02", [metric("weight_reps", { weightKg: 55, reps: 8 })]);
    const p = buildTrainingProgress(s);
    expect(p.exercises).toHaveLength(2);
    expect(p.exercises.map((e) => e.recordType)).toEqual(["weight_reps", null]);
    expect(p.exercises[0]).toMatchObject({
      name: "Plancha histórica",
      exerciseId: uuid(20),
      workoutCount: 1,
    });
    expect(p.exercises[0].marks.find((m) => m.metric === "weightKg")).toMatchObject({
      value: 55,
      workoutId: uuid(3),
      setId: uuid(300),
      date: "2026-10-02",
    });
  });
  it("no celebra primera marca, empate o calentamiento; compara solo el pasado", () => {
    const s = source();
    add(s, 4, "2026-10-03", [reps(65, 8)]);
    add(s, 2, "2026-10-01", [reps(60, 8)]);
    add(s, 3, "2026-10-02", [reps(60, 8), reps(200, 8, true)]);
    const e = buildTrainingProgress(s).exercises[0];
    expect(e.points.map((p) => p.workoutId)).toEqual([uuid(2), uuid(3), uuid(4)]);
    expect(e.points[0].records).toEqual([]);
    expect(e.points[1].records).toEqual([]);
    expect(e.points[2].records.map((r) => r.metric)).toEqual(["weightKg", "estimated1RM"]);
    expect(e.marks.find((m) => m.metric === "reps")?.workoutId).toBe(uuid(2));
  });
  it("cuenta posiciones repetidas del mismo ejercicio una vez por entrenamiento", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(20, 10), reps(20, 8)]);
    s.workouts[0].sets[1].position = 1;
    s.workouts[0].sets[1].setNumber = 1;
    const e = buildTrainingProgress(s).exercises[0];
    expect(e.workoutCount).toBe(1);
    expect(e.points[0].totals).toMatchObject({ workingSets: 2, externalVolumeKg: 360 });
  });
  it("todos los tipos conservan sus dimensiones sin asistencia o tiempo como volumen", () => {
    const s = source();
    [
      metric("weight_reps", { weightKg: 20, reps: 10 }),
      metric("bodyweight_reps", { reps: 10 }),
      metric("weighted_bodyweight", { weightKg: 20, reps: 10 }),
      metric("assisted_bodyweight", { weightKg: 20, reps: 10 }),
      metric("duration", { durationSeconds: 30 }),
      metric("weight_duration", { weightKg: 20, durationSeconds: 30 }),
      metric("distance_duration", { distanceMeters: 500, durationSeconds: 150 }),
      metric("weight_distance", { weightKg: 20, distanceMeters: 50 }),
    ].forEach((v, i) => add(s, i + 2, "2026-10-01", [v], i + 20));
    const p = buildTrainingProgress(s);
    expect(p.exercises).toHaveLength(8);
    expect(
      p.exercises
        .filter((e) => e.marks.some((m) => m.metric === "estimated1RM"))
        .map((e) => e.recordType),
    ).toEqual(["weight_reps"]);
    const a = p.exercises.find((e) => e.recordType === "assisted_bodyweight")!;
    expect(a.points[0].totals.externalVolumeKg).toBe(0);
    expect(a.marks.map((m) => m.metric)).toEqual(["reps", "assistanceKg"]);
    const total = trainingPeriodSummary(p.activity, s.today, "2026-10-01", "2026-10-31");
    expect(total.totals).toEqual({
      workingSets: 8,
      externalVolumeKg: 400,
      bodyweightReps: 30,
      durationSeconds: 210,
      distanceMeters: 550,
    });
  });
  it("la asistencia solo celebra menor carga comparando igual cantidad de repeticiones", () => {
    const s = source();
    add(s, 2, "2026-10-01", [metric("assisted_bodyweight", { weightKg: 30, reps: 10 })]);
    add(s, 3, "2026-10-02", [metric("assisted_bodyweight", { weightKg: 20, reps: 4 })]);
    add(s, 4, "2026-10-03", [metric("assisted_bodyweight", { weightKg: 25, reps: 10 })]);
    const e = buildTrainingProgress(s).exercises[0];
    expect(e.points[1].records).toEqual([]);
    expect(e.points[2].records).toEqual([
      expect.objectContaining({
        metric: "assistanceKg",
        value: 25,
        previous: 30,
        metrics: expect.objectContaining({ reps: 10 }),
      }),
    ]);
  });
  it("un calentamiento sigue consultable pero no acredita regularidad", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(60, 10, true)]);
    const p = buildTrainingProgress(s);
    expect(p.activity).toHaveLength(1);
    expect(p.exercises).toEqual([]);
    expect(trainingPeriodSummary(p.activity, s.today, "2026-10-01", "2026-10-31")).toMatchObject({
      workoutCount: 0,
      activeDays: 0,
      activeWeeks: 0,
      durationSeconds: 0,
    });
  });
  it("compara periodos equivalentes sin filtrar marcas ni inventar porcentaje con base cero", () => {
    const s = source();
    add(s, 2, "2026-09-20", [reps(50, 10)]);
    add(s, 3, "2026-10-20", [reps(60, 10)]);
    const e = buildTrainingProgress(s).exercises[0];
    expect(compareTrainingProgress(e, s.today, 4, "weightKg")).toMatchObject({
      currentValue: 60,
      previousValue: 50,
      changePercent: 20,
      direction: "higher",
    });
    expect(compareTrainingProgress(e, s.today, 8, "weightKg").changePercent).toBeNull();
    expect(compareTrainingProgress(e, s.today, 4, "distanceMeters").currentValue).toBeNull();
    expect(e.marks.find((m) => m.metric === "weightKg")?.value).toBe(60);
  });
  it("totales de periodo suman puntos; marcas usan el mejor y asistencia baja es favorable", () => {
    const s = source();
    add(s, 2, "2026-09-20", [metric("assisted_bodyweight", { weightKg: 30, reps: 10 })]);
    add(s, 3, "2026-10-20", [metric("assisted_bodyweight", { weightKg: 20, reps: 10 })]);
    const e = buildTrainingProgress(s).exercises[0];
    expect(compareTrainingProgress(e, s.today, 4, "assistanceKg")).toMatchObject({
      currentValue: 20,
      previousValue: 30,
      direction: "lower",
    });
    expect(compareTrainingProgress(e, s.today, 4, "workingSets")).toMatchObject({
      currentValue: 1,
      previousValue: 1,
      changePercent: 0,
    });
  });
  it("distribución usa metadatos disponibles, Sin clasificar y fuentes completas", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(20, 10)], 20, null);
    add(s, 3, "2026-10-02", [reps(40, 10)], 21, "Piernas");
    const p = buildTrainingProgress(s);
    const summary = trainingPeriodSummary(p.activity, s.today, "2026-10-01", "2026-10-31");
    expect(summary.muscles).toEqual([
      expect.objectContaining({
        muscleGroup: "Piernas",
        workingSets: 1,
        volumeKg: 400,
        workoutIds: [uuid(3)],
      }),
      expect.objectContaining({
        muscleGroup: null,
        workingSets: 1,
        volumeKg: 200,
        workoutIds: [uuid(2)],
      }),
    ]);
  });
  it("varias sesiones un día no inflan días/semanas, incluye semanas parciales hasta hoy", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(20, 10)]);
    add(s, 3, "2026-10-01", [reps(20, 10)]);
    add(s, 4, "2026-10-27", [reps(20, 10)]);
    const summary = trainingPeriodSummary(
      buildTrainingProgress(s).activity,
      s.today,
      "2026-10-01",
      "2026-10-31",
    );
    expect(summary).toMatchObject({
      workoutCount: 3,
      activeDays: 2,
      activeWeeks: 2,
      observedWeeks: 5,
      durationSeconds: 10800,
    });
    expect(trainingPeriodSummary([], s.today, "2027-01-01", "2027-12-31")).toMatchObject({
      observedWeeks: 0,
      activeWeeks: 0,
    });
  });
  it("calendario lunes-domingo admite bisiesto y límites de año", () => {
    const c = trainingCalendar("2024-02", []);
    expect(c.days).toHaveLength(35);
    expect(c.days[0].date).toBe("2024-01-29");
    expect(c.days.at(-1)?.date).toBe("2024-03-03");
    expect(c.days.find((d) => d.date === "2024-02-29")?.inMonth).toBe(true);
    expect(trainingCalendar("2026-12", []).days.at(-1)?.date).toBe("2027-01-03");
  });
  it("calendario conserva cada ID y búsqueda normaliza tildes, origen y fecha", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(20, 10)]);
    add(s, 3, "2026-10-01", [reps(20, 10)]);
    s.workouts[1].sourceKind = "personal";
    const a = buildTrainingProgress(s).activity;
    expect(
      trainingCalendar("2026-10", a).days.find((d) => d.date === "2026-10-01")?.workoutIds,
    ).toEqual([uuid(2), uuid(3)]);
    expect(
      filterTrainingActivity(a, { query: "AGIL", sourceKind: "personal", date: "2026-10-01" }).map(
        (w) => w.id,
      ),
    ).toEqual([uuid(3)]);
    expect(filterTrainingActivity(a, { query: "historica", month: "2026-10" })).toHaveLength(2);
    expect(filterTrainingActivity(a, { month: "2026-09" })).toEqual([]);
  });
  it("no modifica origen y valida fechas reales/tipo/cuenta/IDs/posiciones duplicadas", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(20, 10)]);
    const before = JSON.stringify(s);
    buildTrainingProgress(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(trainingProgressSourceSchema.safeParse({ ...s, today: "2026-02-30" }).success).toBe(
      false,
    );
    expect(trainingProgressSourceSchema.safeParse({ ...s, version: 3 }).success).toBe(false);
    expect(
      trainingProgressSourceSchema.safeParse({ ...s, workouts: [...s.workouts, ...s.workouts] })
        .success,
    ).toBe(false);
    s.workouts[0].sets.push({ ...s.workouts[0].sets[0], id: uuid(999) });
    expect(() => buildTrainingProgress(s)).toThrow();
  });
  it("rechaza rango invertido, mes inválido y filtros malformados", () => {
    expect(() => trainingCalendar("2026-13", [])).toThrow();
    expect(() => trainingPeriodSummary([], "2026-10-28", "2026-11-01", "2026-10-01")).toThrow();
    expect(() => filterTrainingActivity([], { date: "2026-02-30" })).toThrow();
  });
  it("instantes iguales no son pasado entre sí; los cambios de clase conservan totales", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(20, 10)]);
    add(s, 3, "2026-10-01", [{ ...reps(40, 10), setType: "failure" }]);
    add(s, 4, "2026-10-02", [{ ...reps(30, 10), setType: "drop" }]);
    const e = buildTrainingProgress(s).exercises[0];
    expect(e.points[1].records).toEqual([]);
    expect(e.points[2].records).toEqual([]);
    expect(e.points[1].totals.workingSets).toBe(1);
  });
  it("peso corporal legado, fracciones y comparación de métricas acumuladas no cambian valores", () => {
    const s = source();
    add(s, 2, "2026-09-20", [reps(0, 8)]);
    add(s, 3, "2026-10-20", [reps(0, 10)]);
    const e = buildTrainingProgress(s).exercises[0];
    expect(compareTrainingProgress(e, s.today, 12, "bodyweightReps").currentValue).toBe(18);
    expect(compareTrainingProgress(e, s.today, 4, "externalVolumeKg").changePercent).toBeNull();
    const time = source();
    add(time, 4, "2026-10-01", [
      metric("weight_distance", { weightKg: 20.25, distanceMeters: 30.15 }),
    ]);
    add(time, 5, "2026-10-02", [
      metric("weight_distance", { weightKg: 20.25, distanceMeters: 30.1 }),
    ]);
    const p = buildTrainingProgress(time),
      t = p.exercises[0];
    expect(compareTrainingProgress(t, time.today, 4, "totalDistanceMeters").currentValue).toBe(
      60.25,
    );
    expect(compareTrainingProgress(t, time.today, 4, "totalDurationSeconds").currentValue).toBe(0);
    expect(
      trainingPeriodSummary(p.activity, time.today, "2026-10-01", "2026-12-31").totals
        .distanceMeters,
    ).toBe(60.25);
  });
  it("rechaza mismo ID de serie entre resultados y distintas identidades en una posición", () => {
    const s = source();
    add(s, 2, "2026-10-01", [reps(20, 10)]);
    add(s, 3, "2026-10-02", [reps(30, 10)]);
    s.workouts[1].sets[0].id = s.workouts[0].sets[0].id;
    expect(() => buildTrainingProgress(s)).toThrow();
    s.workouts[1].sets[0].id = uuid(444);
    s.workouts[0].sets.push({
      ...s.workouts[0].sets[0],
      id: uuid(445),
      setNumber: 2,
      exerciseId: uuid(30),
    });
    expect(() => buildTrainingProgress(s)).toThrow();
  });
});
