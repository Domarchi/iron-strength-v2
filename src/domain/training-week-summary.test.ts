import { expect, it } from "vitest";
import { trainingHistoryFixture } from "@/test/fixtures/training-history";
import { historyProgressSource, trainingHistorySourceSchema } from "./training-history";
import { buildTrainingProgress } from "./training-progress";
import { summarizeTrainingWeek, trainingRecordCount } from "./training-week-summary";
function source() {
  return historyProgressSource(trainingHistorySourceSchema.parse(trainingHistoryFixture()));
}
it("resume dimensiones reales y solo trabajo, manteniendo duración de sesión separada", () => {
  const s = source(),
    progress = buildTrainingProgress(s);
  const result = summarizeTrainingWeek(progress, "2026-10-26", s.today);
  expect(result).toMatchObject({
    weekStart: "2026-10-26",
    weekEnd: "2026-11-01",
    workoutCount: 1,
    trainedDays: 1,
    records: 0,
    workingSets: 8,
    durationSeconds: 1800,
    workoutIds: [s.workouts[0].id],
  });
  expect(result.recordedSeconds).toBe(
    s.workouts[0].sets.reduce(
      (n, r) => n + (r.setType === "warmup" ? 0 : (r.metrics.durationSeconds ?? 0)),
      0,
    ),
  );
  expect(result.distanceMeters).toBe(
    s.workouts[0].sets.reduce(
      (n, r) => n + (r.setType === "warmup" ? 0 : (r.metrics.distanceMeters ?? 0)),
      0,
    ),
  );
  expect(result.volumeKg).toBe(320);
  expect(result.bodyweightReps).toBe(24);
  expect(s).toEqual(source());
});
it("calentamiento, nota sin series y sesión futura no inventan actividad", () => {
  const s = source();
  const future = structuredClone(s.workouts[0]);
  future.id = crypto.randomUUID();
  future.startedAt = "2026-10-30T01:00:00Z";
  future.date = "2026-10-30";
  future.sets = future.sets.map((r) => ({ ...r, id: crypto.randomUUID() }));
  s.workouts[0].sets = s.workouts[0].sets.map((r) => ({ ...r, setType: "warmup" }));
  s.workouts.push(future, {
    ...structuredClone(future),
    id: crypto.randomUUID(),
    date: "2026-10-27",
    sets: [],
  });
  expect(summarizeTrainingWeek(buildTrainingProgress(s), "2026-10-26", s.today)).toMatchObject({
    workoutCount: 0,
    trainedDays: 0,
    workingSets: 0,
    records: 0,
    workoutIds: [],
    volumeKg: 0,
    recordedSeconds: 0,
    distanceMeters: 0,
  });
});
it("usa fecha Santiago y no el día UTC para la semana", () => {
  const s = source();
  s.workouts[0].startedAt = "2026-10-26T01:00:00Z";
  s.workouts[0].date = "2026-10-25";
  const p = buildTrainingProgress(s);
  expect(summarizeTrainingWeek(p, "2026-10-26", s.today).workoutCount).toBe(0);
  expect(summarizeTrainingWeek(p, "2026-10-19", s.today).workoutIds).toEqual([s.workouts[0].id]);
});
it("cuenta récords por tipo, descarta primera marca e instantes iguales y exige repeticiones iguales para asistencia", () => {
  const s = source();
  s.workouts[0].date = "2026-10-19";
  s.workouts[0].startedAt = "2026-10-19T12:00:00Z";
  s.workouts[0].sets = s.workouts[0].sets.filter(
    (r) => r.metrics.recordType === "duration" || r.metrics.recordType === "assisted_bodyweight",
  );
  const next = structuredClone(s.workouts[0]);
  next.id = crypto.randomUUID();
  next.date = "2026-10-26";
  next.startedAt = "2026-10-26T12:00:00Z";
  next.sets = next.sets.map((r) => ({
    ...r,
    id: crypto.randomUUID(),
    metrics: {
      ...r.metrics,
      durationSeconds: r.metrics.durationSeconds === null ? null : r.metrics.durationSeconds + 30,
      weightKg: r.metrics.weightKg === null ? null : r.metrics.weightKg - 5,
    },
  }));
  const same = structuredClone(next);
  same.id = crypto.randomUUID();
  same.sets = same.sets.map((r) => ({ ...r, id: crypto.randomUUID() }));
  s.workouts.push(next, same);
  const p = buildTrainingProgress(s);
  expect(trainingRecordCount(p, s.workouts[0].id)).toBe(0);
  expect(trainingRecordCount(p, next.id)).toBe(2);
  expect(trainingRecordCount(p, same.id)).toBe(2);
  expect(summarizeTrainingWeek(p, "2026-10-26", s.today).records).toBe(4);
  expect(trainingRecordCount(p, crypto.randomUUID())).toBe(0);
  next.sets = next.sets.map((r) =>
    r.metrics.recordType === "assisted_bodyweight"
      ? { ...r, metrics: { ...r.metrics, reps: r.metrics.reps! + 1 } }
      : r,
  );
  const changed = buildTrainingProgress({ ...s, workouts: [s.workouts[0], next] });
  expect(trainingRecordCount(changed, next.id)).toBe(2); // duración y repeticiones; asistencia no comparable
  expect(
    changed.exercises
      .flatMap((e) => e.points.filter((p) => p.workoutId === next.id).flatMap((p) => p.records))
      .map((r) => r.metric)
      .sort(),
  ).toEqual(["durationSeconds", "reps"]);
  const firstAtSameTime = buildTrainingProgress({ ...s, workouts: [next, same] });
  expect(trainingRecordCount(firstAtSameTime, next.id)).toBe(0);
  expect(trainingRecordCount(firstAtSameTime, same.id)).toBe(0);
});
