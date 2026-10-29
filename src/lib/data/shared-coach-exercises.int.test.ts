import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import {
  createExercise,
  updateExercise,
  listExercises,
  getOwnExercise,
  getActiveExercise,
  listMobileExercises,
  archiveExercise,
  restoreExercise,
} from "./exercises";
import { listTypedExercises } from "./typed-exercises";
import { getCoachProgramTree, listCoachCatalog } from "./coach-programs";
import { mutateCoachSession } from "./coach-session";
import { RECORD_TYPES, type RecordType } from "@/domain/training-metrics";
const admin = adminClient(),
  kinds: RecordType[] = [null, ...RECORD_TYPES],
  ids: string[] = [];
let coach: AdminClient, coachId: string, inactive: AdminClient;
const students: AdminClient[] = [];
const privateCoachId = randomUUID(),
  privateStudentId = randomUUID(),
  programId = randomUUID(),
  sessionId = randomUUID();
const metadata = { muscleGroup: "Core", equipment: "Peso corporal", progressionIncrementKg: 2.5 };
beforeAll(async () => {
  await resetUsers(admin);
  const user = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "shared-kind-coach@test.local",
  });
  coachId = user.id;
  coach = await signedInClient(user.email, user.password);
  let firstStudentId = "";
  for (let i = 0; i < 3; i++) {
    const student = await createProfileUser(admin, {
      role: "student",
      coachId,
      name: "Alumno",
      email: `shared-kind-${i}@test.local`,
    });
    if (i === 0) firstStudentId = student.id;
    students.push(await signedInClient(student.email, student.password));
  }
  const disabled = await createProfileUser(admin, {
    role: "student",
    coachId,
    name: "Inactivo",
    email: "shared-kind-inactive@test.local",
    isActive: false,
  });
  inactive = await signedInClient(disabled.email, disabled.password);
  expect(
    (
      await admin.from("exercises").insert([
        {
          id: privateCoachId,
          personal_owner_id: coachId,
          name: "Nombre privado compartible",
          muscle_group: "Core",
          record_type: "duration",
        },
        {
          id: privateStudentId,
          personal_owner_id: firstStudentId,
          name: "Privado alumno",
          muscle_group: "Core",
          record_type: "duration",
        },
      ])
    ).error,
  ).toBeNull();
});
afterAll(async () => {
  expect((await admin.from("programs").delete().eq("coach_id", coachId)).error).toBeNull();
  await resetUsers(admin);
});
it("crea los nueve contratos y conserva el tipo real pese al equipamiento", async () => {
  for (const [i, recordType] of kinds.entries()) {
    const result = await createExercise({
      db: coach,
      coachId,
      input: { ...metadata, name: `Compartido tipado ${i}`, recordType },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.id) throw Error("fixture create failed");
    ids.push(result.id);
    expect(
      (
        await coach
          .from("exercises")
          .select("record_type,is_bodyweight")
          .eq("id", result.id)
          .single()
      ).data,
    ).toEqual({ record_type: recordType, is_bodyweight: true });
    expect(await getOwnExercise(coach, result.id)).toMatchObject({ recordType });
  }
});
it("tres alumnos ven los compartidos tipados, y la API anterior no los proyecta como clásicos", async () => {
  for (const db of [coach, ...students]) {
    const catalog = await listTypedExercises(db);
    expect(
      catalog
        .filter((row) => ids.includes(row.id))
        .map((row) => row.recordType)
        .sort(),
    ).toEqual([...kinds].sort());
    const legacy = await listMobileExercises(db);
    expect(legacy.some((row) => row.id === ids[0])).toBe(true);
    expect(legacy.some((row) => ids.slice(1).includes(row.id))).toBe(false);
    expect(await getActiveExercise(db, ids[1])).toBeNull();
  }
});
it("no expone privados en la biblioteca compartida ni bloquea crear otra identidad con igual nombre", async () => {
  expect(await listExercises(coach, { query: "Nombre privado compartible" })).toEqual([]);
  const result = await createExercise({
    db: coach,
    coachId,
    input: { ...metadata, name: "Nombre privado compartible", recordType: "weight_duration" },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error("create failed");
  expect(result.id).not.toBe(privateCoachId);
  expect(
    (await listExercises(coach, { query: "Nombre privado compartible" })).map((row) => row.id),
  ).toEqual([result.id]);
  expect(
    (await listCoachCatalog(coach)).some((row) =>
      new Set<string>([privateCoachId, privateStudentId]).has(row.id),
    ),
  ).toBe(false);
  for (const db of students)
    expect((await listTypedExercises(db)).some((row) => row.id === privateCoachId)).toBe(false);
});
it("el coach no obtiene el privado propio como ejercicio compartido editable", async () => {
  expect(await getOwnExercise(coach, privateCoachId)).toBeNull();
  expect(
    await updateExercise({
      db: coach,
      id: privateCoachId,
      input: { ...metadata, name: "No publicar" },
    }),
  ).toEqual({ ok: false, reason: "not_found" });
  expect(
    (
      await admin
        .from("exercises")
        .select("name,personal_owner_id")
        .eq("id", privateCoachId)
        .single()
    ).data,
  ).toEqual({ name: "Nombre privado compartible", personal_owner_id: coachId });
});
it("editar metadatos conserva tipo, y cambiarlo se rechaza en aplicación y SQL", async () => {
  const id = ids[6];
  expect(
    await updateExercise({ db: coach, id, input: { ...metadata, name: "Carga sostenida" } }),
  ).toEqual({ ok: true });
  expect(await getOwnExercise(coach, id)).toMatchObject({
    name: "Carga sostenida",
    recordType: kinds[6],
  });
  expect(
    await updateExercise({
      db: coach,
      id,
      input: { ...metadata, name: "No modificar", recordType: "duration" },
    }),
  ).toEqual({ ok: false, reason: "invalid" });
  expect(
    (await coach.from("exercises").update({ record_type: "duration" }).eq("id", id)).error?.code,
  ).toBe("23514");
});
it("alumnos, anónimos e inactivos no crean ni modifican el catálogo del coach", async () => {
  for (const db of [...students, inactive, anonClient()]) {
    expect(
      (
        await createExercise({
          db,
          coachId,
          input: { ...metadata, name: `Intruso ${randomUUID()}`, recordType: "duration" },
        })
      ).ok,
    ).toBe(false);
    expect(
      (await db.from("exercises").update({ name: "Intruso" }).eq("id", ids[1]).select("id")).data ??
        [],
    ).toEqual([]);
  }
});
it("archivar y restaurar conserva el tipo y su identidad", async () => {
  expect(await archiveExercise({ db: coach, id: ids[1] })).toEqual({ ok: true });
  for (const db of students)
    expect((await listTypedExercises(db)).some((row) => row.id === ids[1])).toBe(false);
  expect(
    (await listExercises(coach, { query: "Compartido tipado 1", includeArchived: true }))[0],
  ).toMatchObject({ id: ids[1], recordType: kinds[1] });
  expect(await restoreExercise({ db: coach, id: ids[1] })).toEqual({ ok: true });
});
it("el editor agrega los compartidos con sus objetivos y dimensiones reales", async () => {
  expect(
    (
      await coach
        .from("programs")
        .insert({ id: programId, coach_id: coachId, name: "Tipos compartidos", weeks_count: 1 })
    ).error,
  ).toBeNull();
  expect(
    (
      await coach
        .from("program_sessions")
        .insert({ id: sessionId, program_id: programId, week_number: 1, label: "A" })
    ).error,
  ).toBeNull();
  const revision = (await getCoachProgramTree(coach, programId))!.sessions[0].revision;
  expect(
    (
      await mutateCoachSession(coach, sessionId, {
        version: 2,
        id: randomUUID(),
        revision,
        operation: "add",
        data: { items: ids.map((exerciseId) => ({ id: randomUUID(), exerciseId })) },
      })
    ).ok,
  ).toBe(true);
  const rows = (await getCoachProgramTree(coach, programId))!.sessions[0].exercises;
  expect(rows.map((row) => row.prescribed.recordType)).toEqual(kinds);
  expect(rows.find((row) => row.recordType === "duration")!.prescribed.target.repsMin).toBeNull();
});
