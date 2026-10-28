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
import { mutatePersonalExercise, readPersonalExercises } from "./personal-exercises";
import { listTypedExercises, listTypedExerciseHistory } from "./typed-exercises";
import { saveTypedWorkoutRecording, getTypedWorkoutDetail } from "./typed-recordings";
import { typedRecordingFixture } from "../../test/fixtures/typed-recording";
import { readTrainingLibrary, mutateTrainingLibrary } from "./typed-personal-library";
import type { PersonalExerciseMutation } from "../mobile/personal-exercise-contracts";
const admin = adminClient();
let coach: AdminClient, students: AdminClient[], people: string[], coachId: string;
const fields = {
  name: "Privado",
  muscleGroup: "Core" as const,
  equipment: null,
  isBodyweight: false,
  progressionIncrementKg: 2.5,
  recordType: null,
};
const create = (name = "Privado"): Extract<PersonalExerciseMutation, { operation: "create" }> => ({
  version: 1,
  requestId: randomUUID(),
  targetId: randomUUID(),
  expectedRevision: 0,
  operation: "create",
  data: { ...fields, name },
});
beforeAll(async () => {
  await resetUsers(admin);
  const c = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "coach@ownex.test.local",
  });
  coachId = c.id;
  coach = await signedInClient(c.email, c.password);
  students = [];
  people = [];
  for (let i = 0; i < 3; i++) {
    const s = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: `student${i}@ownex.test.local`,
      coachId: c.id,
    });
    people.push(s.id);
    students.push(await signedInClient(s.email, s.password));
  }
});
afterAll(() => resetUsers(admin));
it("tres alumnos y coach poseen ejercicios con el mismo nombre sin compartir catálogo ni gestión", async () => {
  const ids: string[] = [];
  for (const db of [coach, ...students]) {
    const input = create();
    ids.push(input.targetId);
    expect(await mutatePersonalExercise(db, input)).toMatchObject({
      revision: 1,
      duplicate: false,
    });
  }
  for (const [index, db] of [coach, ...students].entries()) {
    expect((await readPersonalExercises(db)).exercises.map((e) => e.id)).toEqual([ids[index]]);
    const catalog = await listTypedExercises(db);
    expect(catalog.filter((e) => ids.includes(e.id)).map((e) => e.id)).toEqual([ids[index]]);
  }
});
it("respuesta perdida y reintentos simultáneos no duplican; el cuerpo diferente se rechaza", async () => {
  const input = create("Intento estable");
  const result = await Promise.all([
    mutatePersonalExercise(students[0], input),
    mutatePersonalExercise(students[0], input),
  ]);
  expect(result.map((r) => r.duplicate).sort()).toEqual([false, true]);
  expect(
    (await readPersonalExercises(students[0])).exercises.filter((e) => e.id === input.targetId),
  ).toHaveLength(1);
  await expect(
    mutatePersonalExercise(students[0], { ...input, data: { ...fields, name: "Otro" } }),
  ).rejects.toMatchObject({ code: "22023" });
});
it("revisión detecta dos ventanas y reintento anterior confirma antes de releer la revisión", async () => {
  const input = create("Dos ventanas");
  await mutatePersonalExercise(students[0], input);
  const update = (name: string): PersonalExerciseMutation => ({
    ...input,
    requestId: randomUUID(),
    expectedRevision: 1,
    operation: "update",
    data: { ...fields, name },
  });
  const results = await Promise.allSettled([
    mutatePersonalExercise(students[0], update("Primera")),
    mutatePersonalExercise(students[0], update("Segunda")),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "40001" } });
  expect(await mutatePersonalExercise(students[0], input)).toMatchObject({
    revision: 1,
    duplicate: true,
  });
});
it("ni otro alumno ni coach pueden escribir un ejercicio privado ajeno", async () => {
  const own = (await readPersonalExercises(students[0])).exercises[0];
  for (const db of [coach, students[1], students[2]]) {
    await expect(
      mutatePersonalExercise(db, {
        version: 1,
        requestId: randomUUID(),
        targetId: own.id,
        expectedRevision: own.revision,
        operation: "archive",
        data: {},
      }),
    ).rejects.toMatchObject({ code: "P0002" });
    const direct = await db
      .from("exercises")
      .update({ name: "Intruso" })
      .eq("id", own.id)
      .select("id");
    expect(direct.data).toEqual([]);
  }
});
it("archivar conserva cierre propio iniciado, nombre histórico, revisión del coach y restauración", async () => {
  const input = create("Nombre original");
  await mutatePersonalExercise(students[0], input);
  const p = typedRecordingFixture();
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date().toISOString();
  p.workout.finishedAt = p.workout.startedAt;
  p.workout.durationSeconds = 0;
  p.structure.exercises.forEach((r) => {
    r.exerciseId = input.targetId;
  });
  p.workout.sets.forEach((r) => {
    r.exerciseId = input.targetId;
  });
  await mutatePersonalExercise(students[0], {
    version: 1,
    requestId: randomUUID(),
    targetId: input.targetId,
    expectedRevision: 1,
    operation: "archive",
    data: {},
  });
  expect((await listTypedExercises(students[0])).some((e) => e.id === input.targetId)).toBe(false);
  await saveTypedWorkoutRecording(students[0], p);
  await mutatePersonalExercise(students[0], {
    version: 1,
    requestId: randomUUID(),
    targetId: input.targetId,
    expectedRevision: 2,
    operation: "update",
    data: { ...fields, name: "Nombre editado" },
  });
  const own = await getTypedWorkoutDetail(students[0], p.id, people[0]);
  const review = await getTypedWorkoutDetail(coach, p.id, people[0]);
  expect(own?.workout.exercises[0].name).toBe("Nombre original");
  expect(review?.workout.exercises[0].sets).toEqual(own?.workout.exercises[0].sets);
  expect((await listTypedExerciseHistory(students[1], people[0], input.targetId)).items).toEqual(
    [],
  );
  await mutatePersonalExercise(students[0], {
    version: 1,
    requestId: randomUUID(),
    targetId: input.targetId,
    expectedRevision: 3,
    operation: "restore",
    data: {},
  });
  expect((await listTypedExercises(students[0])).find((e) => e.id === input.targetId)?.name).toBe(
    "Nombre editado",
  );
});
it("bases propias conservan referencias archivadas y copias; una base ajena no autoriza el ejercicio", async () => {
  const input = create("Tiempo privado en base");
  input.data.recordType = "duration";
  await mutatePersonalExercise(students[0], input);
  const routineId = randomUUID();
  const item = {
    id: randomUUID(),
    exerciseId: input.targetId,
    prescribed: {
      recordType: "duration" as const,
      sets: 2,
      target: {
        repsMin: null,
        repsMax: null,
        targetWeightKg: null,
        targetDurationSeconds: 45,
        targetDistanceMeters: null,
      },
      series: null,
    },
    note: "Mantener",
    restSeconds: 0,
    supersetId: null,
    supersetRestSeconds: null,
  };
  const data = { name: "Base privada", folderId: null, items: [item] };
  await mutateTrainingLibrary(students[0], {
    version: 2,
    requestId: randomUUID(),
    targetId: routineId,
    expectedRevision: 0,
    operation: "routine_create",
    data,
  });
  await mutatePersonalExercise(students[0], {
    version: 1,
    requestId: randomUUID(),
    targetId: input.targetId,
    expectedRevision: 1,
    operation: "archive",
    data: {},
  });
  const before = (await readTrainingLibrary(students[0])).routines.find((r) => r.id === routineId)!;
  expect(before.items[0]).toMatchObject({
    name: "Tiempo privado en base",
    prescribed: item.prescribed,
    restSeconds: 0,
  });
  await mutateTrainingLibrary(students[0], {
    version: 2,
    requestId: randomUUID(),
    targetId: routineId,
    expectedRevision: before.revision,
    operation: "routine_save",
    data: { name: "Base editada", items: [item] },
  });
  const source = (await readTrainingLibrary(students[0])).routines.find((r) => r.id === routineId)!;
  const copyId = randomUUID();
  await mutateTrainingLibrary(students[0], {
    version: 2,
    requestId: randomUUID(),
    targetId: copyId,
    expectedRevision: 0,
    operation: "routine_copy",
    data: { name: "Copia", folderId: null, sourceId: source.id, sourceRevision: source.revision },
  });
  const copy = (await readTrainingLibrary(students[0])).routines.find((r) => r.id === copyId)!;
  expect(copy.items[0].id).not.toBe(item.id);
  expect(copy.items[0].exerciseId).toBe(item.exerciseId);
  for (const db of [students[1], students[2], coach])
    await expect(
      mutateTrainingLibrary(db, {
        version: 2,
        requestId: randomUUID(),
        targetId: randomUUID(),
        expectedRevision: 0,
        operation: "routine_create",
        data,
      }),
    ).rejects.toMatchObject({ code: "22023" });
});
it("anónimo/desactivado no gestiona ni crea; borrar cuenta retira ejercicios/recibos y preserva otras", async () => {
  await expect(readPersonalExercises(anonClient())).rejects.toBeDefined();
  const before = await readPersonalExercises(students[1]);
  const disabled = await admin.from("profiles").update({ is_active: false }).eq("id", people[2]);
  expect(disabled.error).toBeNull();
  await expect(readPersonalExercises(students[2])).rejects.toBeDefined();
  await expect(mutatePersonalExercise(students[2], create("Desactivado"))).rejects.toMatchObject({
    code: "42501",
  });
  const deleted = await students[0].rpc("delete_my_account");
  expect(deleted.error).toBeNull();
  expect(
    (await admin.from("exercises").select("id").eq("personal_owner_id", people[0])).data,
  ).toEqual([]);
  expect(
    (await admin.from("personal_exercise_receipts").select("request_id").eq("owner_id", people[0]))
      .data,
  ).toEqual([]);
  expect(await readPersonalExercises(students[1])).toEqual(before);
  expect((await readPersonalExercises(coach)).userId).toBe(coachId);
});
