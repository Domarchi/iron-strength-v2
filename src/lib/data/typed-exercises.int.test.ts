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
import {
  listTypedExercises,
  getTypedActiveExercise,
  listTypedExerciseHistory,
} from "./typed-exercises";
import { listMobileExercises } from "./exercises";
import { saveTypedWorkoutRecording } from "./typed-recordings";
import { saveWorkoutRecording } from "./save-workout-recording";
import { typedRecordingFixture } from "../../test/fixtures/typed-recording";
import { recordingFixture } from "../../test/fixtures/workout-recording";
import { trainingMetricCases } from "../../test/fixtures/training-metrics";
import { typedRecordingPayloadSchema } from "../mobile/typed-recording-contracts";
import { parseExerciseHistoryCursor } from "../mobile/exercise-contracts";
const admin = adminClient();
let coach: AdminClient,
  students: AdminClient[],
  people: string[],
  ids: string[],
  coachId: string,
  archived: string;
async function removeFixtures(ids: string[]) {
  for (let start = 0; start < ids.length; start += 50) {
    const result = await admin
      .from("exercises")
      .delete()
      .in("id", ids.slice(start, start + 50));
    if (result.error) throw result.error;
  }
}
async function cleanupCapacityFixture() {
  const result = await admin
    .from("exercises")
    .select("id,name")
    .like("name", "Capacidad tipada %")
    .is("coach_id", null)
    .eq("record_type", "duration")
    .range(0, 999);
  if (result.error) throw result.error;
  await removeFixtures(
    result.data.filter((r) => /^Capacidad tipada \d+$/.test(r.name)).map((r) => r.id),
  );
}
beforeAll(async () => {
  await resetUsers(admin);
  await cleanupCapacityFixture();
  const c = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "coach@typedcatalog.test.local",
  });
  coachId = c.id;
  coach = await signedInClient(c.email, c.password);
  students = [];
  people = [];
  for (let i = 0; i < 3; i++) {
    const p = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: `student${i}@typedcatalog.test.local`,
      coachId,
    });
    students.push(await signedInClient(p.email, p.password));
    people.push(p.id);
  }
  const seed = await admin
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        name: `Catálogo tipado ${i}`,
        muscle_group: "Core" as const,
        record_type: m.recordType,
        is_bodyweight: i === 0,
      })),
    )
    .select("id,name");
  if (seed.error) throw seed.error;
  ids = trainingMetricCases.map(
    (_, i) => seed.data.find((r) => r.name === `Catálogo tipado ${i}`)!.id,
  );
  const extra = await admin
    .from("exercises")
    .insert({
      name: "Catálogo archivado temporal",
      muscle_group: "Core",
      record_type: "duration",
      archived_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (extra.error) throw extra.error;
  archived = extra.data.id;
});
afterAll(async () => {
  await resetUsers(admin);
  if (ids?.length) await removeFixtures([...ids, archived]);
  await cleanupCapacityFixture();
});

function payload(index: number, startedAt = new Date().toISOString()) {
  const p = typedRecordingFixture();
  if (p.source !== "free") throw Error("fixture");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = startedAt;
  p.workout.finishedAt = startedAt;
  p.workout.durationSeconds = 0;
  const m = trainingMetricCases[index];
  p.structure.exercises.forEach((r, i) => {
    r.id = randomUUID();
    r.exerciseId = ids[i ? 0 : index];
    if (!i)
      r.prescribed = {
        recordType: m.recordType,
        sets: 2,
        target: {
          repsMin: m.reps === null ? null : 8,
          repsMax: m.reps === null ? null : 12,
          targetWeightKg: m.weightKg,
          targetDurationSeconds: m.durationSeconds,
          targetDistanceMeters: m.distanceMeters,
        },
        series: null,
      };
  });
  p.workout.exerciseNotes = p.structure.exercises.map((r, i) => ({
    sessionExerciseId: r.id,
    note: i ? "Sin series" : "Propia 💪",
  }));
  p.workout.sets = [
    { ...p.workout.sets[0], exerciseId: ids[index], metrics: m, setType: "drop", effort: 8.5 },
  ];
  return typedRecordingPayloadSchema.parse(p);
}
it("catálogo2 conserva metadata explícita y legado null para coach/tres alumnos, sin archivados", async () => {
  for (const db of [coach, ...students]) {
    const rows = await listTypedExercises(db);
    for (const [i, m] of trainingMetricCases.entries())
      expect(rows.find((r) => r.id === ids[i])?.recordType).toBe(m.recordType);
    expect(rows.some((r) => r.id === archived)).toBe(false);
  }
  expect((await getTypedActiveExercise(students[0], ids[0]))?.recordType).toBeNull();
  expect(await getTypedActiveExercise(students[0], archived)).toBeNull();
  const old = await listMobileExercises(students[0]);
  expect(old.some((r) => r.id === ids[0])).toBe(true);
  expect(old.some((r) => ids.slice(1).includes(r.id))).toBe(false);
});
it("historial2 conserva cada tipo, clase/esfuerzo/notas y separa alumnos sin inferir desde catálogo", async () => {
  for (const [i, m] of trainingMetricCases.entries()) {
    const p = payload(i);
    await saveTypedWorkoutRecording(students[0], p);
    const page = await listTypedExerciseHistory(students[0], people[0], ids[i]);
    expect(page.items[0].sets[0]).toMatchObject({ metrics: m, setType: "drop", effort: 8.5 });
    expect(page.items[0].exerciseNotes[0]).toEqual({ position: 0, note: "Propia 💪" });
    expect((await listTypedExerciseHistory(students[1], people[0], ids[i])).items).toEqual([]);
    expect((await listTypedExerciseHistory(coach, people[0], ids[i])).items).toEqual(page.items);
  }
  await saveTypedWorkoutRecording(students[1], payload(5));
  expect((await listTypedExerciseHistory(students[0], people[1], ids[5])).items).toEqual([]);
  const direct = await listTypedExerciseHistory(students[0], people[0], ids[0]);
  expect(
    direct.items.some((w) =>
      w.exerciseNotes.some((n) => n.position === 1 && n.note === "Sin series"),
    ),
  ).toBe(true);
});
it("diez sesiones completas por página con desempate UUID sin duplicados ni recortar series", async () => {
  const timestamp = new Date(Date.now() - 60000).toISOString();
  for (let i = 0; i < 12; i++) await saveTypedWorkoutRecording(students[0], payload(5, timestamp));
  const first = await listTypedExerciseHistory(students[0], people[0], ids[5]);
  expect(first.items).toHaveLength(10);
  const cursor = parseExerciseHistoryCursor(first.nextCursor!);
  if (!cursor) throw Error("cursor");
  const next = await listTypedExerciseHistory(students[0], people[0], ids[5], { cursor });
  expect(next.items).toHaveLength(3);
  expect(next.nextCursor).toBeNull();
  expect(new Set([...first.items, ...next.items].map((w) => w.id)).size).toBe(13);
});
it("registro anterior mantiene peso/reps y clase de calentamiento, sin nota propia inventada", async () => {
  const p = recordingFixture();
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date().toISOString();
  p.workout.finishedAt = p.workout.startedAt;
  p.workout.durationSeconds = 0;
  p.structure.exercises.forEach((r) => {
    r.exerciseId = ids[0];
  });
  p.workout.sets.forEach((s) => {
    s.exerciseId = ids[0];
  });
  await saveWorkoutRecording(students[0], p);
  const history = await listTypedExerciseHistory(students[0], people[0], ids[0]),
    w = history.items.find((w) => w.id === p.id)!;
  expect(w.exerciseNotes).toEqual([]);
  expect(w.sets[0]).toMatchObject({
    metrics: {
      recordType: null,
      weightKg: 30,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
    },
    setType: "working",
    effort: null,
  });
});
it("archivar excluye selección sin perder evidencia; IDs/cursor inválidos fallan y anónimo no obtiene historial", async () => {
  const changed = await admin
    .from("exercises")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", ids[5]);
  expect(changed.error).toBeNull();
  expect(await getTypedActiveExercise(students[0], ids[5])).toBeNull();
  expect((await listTypedExerciseHistory(students[0], people[0], ids[5])).items).toHaveLength(10);
  await admin.from("exercises").update({ archived_at: null }).eq("id", ids[5]);
  await expect(listTypedExerciseHistory(students[0], "invalid", ids[0])).rejects.toThrow();
  await expect(
    listTypedExerciseHistory(students[0], people[0], ids[0], {
      cursor: { startedAt: "invalid", id: randomUUID() },
    }),
  ).rejects.toThrow();
  expect(
    (await listTypedExerciseHistory(anonClient(), people[0], ids[0]).catch(() => ({ items: [] })))
      .items,
  ).toEqual([]);
});
it("catálogo no anuncia éxito si sus mil filas no cubren el snapshot completo", async () => {
  const before = await listTypedExercises(students[0]);
  const number = 1001 - before.length;
  const extra = await admin
    .from("exercises")
    .insert(
      Array.from({ length: number }, (_, i) => ({
        name: `Capacidad tipada ${i}`,
        muscle_group: "Core" as const,
        record_type: "duration",
      })),
    )
    .select("id");
  if (extra.error) throw extra.error;
  const extraIds = extra.data.map((e) => e.id);
  try {
    await expect(listTypedExercises(students[0])).rejects.toThrow("completar");
  } finally {
    await removeFixtures(extraIds);
  }
});
