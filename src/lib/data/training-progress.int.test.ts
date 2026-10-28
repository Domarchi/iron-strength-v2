import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "../../test/int/helpers";
import { readOwnTrainingProgress } from "./training-progress";
import { buildTrainingProgress } from "../../domain/training-progress";
import { trainingProgressSchema } from "../mobile/training-progress-contracts";
import { typedRecordingFixture } from "../../test/fixtures/typed-recording";
import { saveTypedWorkoutRecording } from "./typed-recordings";
import { trainingMetricCases } from "../../test/fixtures/training-metrics";
const admin = adminClient();
let coachId: string, coach: AdminClient, people: string[], students: AdminClient[], ids: string[];
beforeAll(async () => {
  await resetUsers(admin);
  const c = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "coach@trainingprogress.test.local",
  });
  coachId = c.id;
  coach = await signedInClient(c.email, c.password);
  people = [];
  students = [];
  for (let i = 0; i < 3; i++) {
    const p = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: `student${i}@trainingprogress.test.local`,
      coachId,
    });
    people.push(p.id);
    students.push(await signedInClient(p.email, p.password));
  }
  const e = await admin
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        name: `Métricas progreso ${i}`,
        record_type: m.recordType,
        muscle_group: "Core" as const,
      })),
    )
    .select("id,name");
  if (e.error) throw e.error;
  ids = trainingMetricCases.map(
    (_, i) => e.data.find((e) => e.name === `Métricas progreso ${i}`)!.id,
  );
});
afterAll(async () => {
  await resetUsers(admin);
  if (ids?.length) {
    const removed = await admin.from("exercises").delete().in("id", ids);
    if (removed.error) throw removed.error;
  }
});
async function workout(owner: string, n: number, quantity = 1) {
  const id = randomUUID(),
    startedAt = `2026-10-${String(n).padStart(2, "0")}T16:00:00Z`,
    value = typedRecordingFixture();
  if (value.source !== "free") throw Error("fixture");
  value.id = id;
  value.workout.id = id;
  value.workout.startedAt = startedAt;
  value.workout.finishedAt = new Date(Date.parse(startedAt) + 1200000).toISOString();
  value.workout.durationSeconds = 1200;
  value.structure.exercises = trainingMetricCases.slice(0, Math.min(9, quantity)).map((m, i) => ({
    id: randomUUID(),
    exerciseId: ids[i],
    prescribedExerciseId: null,
    note: null,
    restSeconds: 90,
    supersetId: null,
    supersetRestSeconds: null,
    prescribed: {
      recordType: m.recordType,
      sets: 2,
      series: null,
      target: {
        repsMin: m.reps === null ? null : 8,
        repsMax: m.reps === null ? null : 12,
        targetWeightKg: m.weightKg,
        targetDurationSeconds: m.durationSeconds,
        targetDistanceMeters: m.distanceMeters,
      },
    },
  }));
  value.workout.exerciseNotes = value.structure.exercises.map((r) => ({
    sessionExerciseId: r.id,
    note: null,
  }));
  value.workout.sets = Array.from({ length: quantity }, (_, i) => ({
    exerciseId: ids[i % ids.length],
    position: i % ids.length,
    setNumber: Math.floor(i / ids.length) + 1,
    metrics: trainingMetricCases[i % ids.length],
    setType: "working" as const,
    effort: null,
  }));
  const db = owner === coachId ? coach : students[people.indexOf(owner)];
  await saveTypedWorkoutRecording(db, value);
  return id;
}
it("lee todas las dimensiones y evidencia, preserva nombres históricos y metadatos propios", async () => {
  const id = await workout(people[0], 1, 9),
    snapshot = await readOwnTrainingProgress(students[0], people[0]);
  expect(snapshot.workouts.find((w) => w.id === id)?.sets).toHaveLength(9);
  const result = trainingProgressSchema.parse({
    version: 2,
    userId: snapshot.userId,
    today: snapshot.today,
    ...buildTrainingProgress(snapshot),
  });
  expect(result.exercises).toHaveLength(9);
  expect(result.exercises.find((e) => e.recordType === "duration")?.marks[0]).toMatchObject({
    metric: "durationSeconds",
    workoutId: id,
    metrics: { reps: null },
  });
  expect(
    result.activity[0].exercises.every(
      (e) => e.name.startsWith("Métricas progreso") && e.muscleGroup === "Core",
    ),
  ).toBe(true);
});
it("coach y tres alumnos tienen snapshot exclusivamente propio", async () => {
  for (const [i, owner] of [coachId, ...people].entries()) await workout(owner, i + 2);
  for (const [db, owner] of [
    [coach, coachId],
    ...students.map((s, i) => [s, people[i]] as const),
  ] as const) {
    const snapshot = await readOwnTrainingProgress(db, owner);
    expect(snapshot.userId).toBe(owner);
    const headers = await admin.from("workouts").select("id").eq("student_id", owner);
    if (headers.error) throw headers.error;
    expect(snapshot.workouts.map((w) => w.id).sort()).toEqual(headers.data.map((w) => w.id).sort());
  }
  await expect(readOwnTrainingProgress(students[0], people[1])).rejects.toThrow("cuenta");
});
it("metadatos no visibles quedan Sin clasificar, sin ampliar el catálogo", async () => {
  const changed = await admin
    .from("exercises")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", ids[0]);
  if (changed.error) throw changed.error;
  const snapshot = await readOwnTrainingProgress(coach, coachId);
  expect(
    snapshot.workouts.every((w) =>
      w.sets.filter((s) => s.exerciseId === ids[0]).every((s) => s.muscleGroup === null),
    ),
  ).toBe(true);
  const catalog = await coach.from("exercises").select("id").eq("id", ids[0]);
  expect(catalog.data).toEqual([]);
  const restored = await admin.from("exercises").update({ archived_at: null }).eq("id", ids[0]);
  if (restored.error) throw restored.error;
});
it("renombrar conserva nombres históricos y clasificación del propietario", async () => {
  const changed = await admin
    .from("exercises")
    .update({ name: "Nombre actual cambiado" })
    .eq("id", ids[0]);
  if (changed.error) throw changed.error;
  const snapshot = await readOwnTrainingProgress(students[0], people[0]);
  expect(
    snapshot.workouts
      .flatMap((w) => w.sets)
      .filter((s) => s.exerciseId === ids[0])
      .every((s) => s.name === "Métricas progreso 0" && s.muscleGroup === "Core"),
  ).toBe(true);
});
it("supera1000 series sin perder filas por el límite REST", async () => {
  const fixtures: string[] = [];
  for (let n = 8; n < 14; n++) fixtures.push(await workout(people[0], n, 180));
  const snapshot = await readOwnTrainingProgress(students[0], people[0]),
    sets = snapshot.workouts.filter((w) => fixtures.includes(w.id)).flatMap((w) => w.sets);
  expect(sets).toHaveLength(1080);
  expect(new Set(sets.map((s) => s.id)).size).toBe(1080);
});
it("archivar un ejercicio privado conserva su clasificación histórica propia", async () => {
  const created = await students[0]
    .from("exercises")
    .insert({
      name: "Propio para progreso",
      muscle_group: "Espalda",
      personal_owner_id: people[0],
      record_type: null,
    })
    .select("id")
    .single();
  if (created.error) throw created.error;
  const original = ids[0];
  let workoutId: string;
  try {
    ids[0] = created.data.id;
    workoutId = await workout(people[0], 14);
  } finally {
    ids[0] = original;
  }
  const archived = await students[0]
    .from("exercises")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", created.data.id);
  if (archived.error) throw archived.error;
  const own = await readOwnTrainingProgress(students[0], people[0]);
  expect(own.workouts.find((w) => w.id === workoutId)!.sets[0]).toMatchObject({
    name: "Propio para progreso",
    muscleGroup: "Espalda",
  });
  const hidden = await coach.from("exercises").select("id").eq("id", created.data.id);
  expect(hidden.data).toEqual([]);
});
it("anónimo y desactivado no obtienen snapshot vacío exitoso", async () => {
  await expect(readOwnTrainingProgress(anonClient(), people[0])).rejects.toBeTruthy();
  const changed = await admin.from("profiles").update({ is_active: false }).eq("id", people[2]);
  if (changed.error) throw changed.error;
  await expect(readOwnTrainingProgress(students[2], people[2])).rejects.toMatchObject({
    code: "42501",
  });
});
