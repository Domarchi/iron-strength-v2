import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import {
  archiveExercise,
  createExercise,
  getOwnExercise,
  listExercises,
  restoreExercise,
  updateExercise,
} from "./exercises";

const admin = adminClient();

describe("biblioteca de ejercicios (RF-9 a RF-11, DC-12)", () => {
  let coachId: string;
  let coachDb: AdminClient;
  let studentDb: AdminClient;

  beforeAll(async () => {
    await resetUsers(admin);
    const coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@test.local",
    });
    const student = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: "alumno@test.local",
      coachId: coach.id,
    });
    coachId = coach.id;
    coachDb = await signedInClient(coach.email, coach.password);
    studentDb = await signedInClient(student.email, student.password);
  });
  afterAll(() => resetUsers(admin));

  const input = (over: Partial<Parameters<typeof createExercise>[0]["input"]> = {}) => ({
    name: "Remo con banda propio",
    muscleGroup: "Espalda" as const,
    equipment: "Banda elástica",
    progressionIncrementKg: 1,
    ...over,
  });

  it("el catálogo base de v1 está cargado y es visible para el coach", async () => {
    const all = await listExercises(coachDb, { limit: 1000 });
    expect(all.length).toBeGreaterThanOrEqual(467);
    expect(all.some((e) => e.name === "Press de banca" && e.coachId === null)).toBe(true);
  });

  it("filtra por grupo muscular y por texto sin distinguir mayúsculas ni tildes del patrón", async () => {
    const chest = await listExercises(coachDb, { group: "Pecho", limit: 1000 });
    expect(chest.length).toBeGreaterThan(10);
    expect(chest.every((e) => e.muscleGroup === "Pecho")).toBe(true);

    const search = await listExercises(coachDb, { query: "PRESS DE BANCA", limit: 1000 });
    expect(search.length).toBeGreaterThan(0);
    expect(search.every((e) => /press de banca/i.test(e.name))).toBe(true);
  });

  it("crea un ejercicio propio que ve el coach y también el alumno", async () => {
    const result = await createExercise({ db: coachDb, coachId, input: input() });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    const mine = await listExercises(coachDb, { query: "remo con banda propio" });
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      coachId,
      equipment: "Banda elástica",
      progressionIncrementKg: 1,
    });

    const seenByStudent = await listExercises(studentDb, { query: "remo con banda propio" });
    expect(seenByStudent).toHaveLength(1);
  });

  it("rechaza nombres repetidos, también si coinciden con un ejercicio del catálogo base", async () => {
    expect(await createExercise({ db: coachDb, coachId, input: input() })).toEqual({
      ok: false,
      reason: "name_taken",
    });
    expect(
      await createExercise({ db: coachDb, coachId, input: input({ name: " press DE banca " }) }),
    ).toEqual({
      ok: false,
      reason: "name_taken",
    });
  });

  it("valida los datos de entrada", async () => {
    expect(await createExercise({ db: coachDb, coachId, input: input({ name: "" }) })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await createExercise({
        db: coachDb,
        coachId,
        input: input({ name: "Otro", progressionIncrementKg: 0 }),
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("un alumno no puede crear ejercicios", async () => {
    expect(
      await createExercise({ db: studentDb, coachId, input: input({ name: "Intruso de alumno" }) }),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("edita un ejercicio propio y no uno del catálogo base", async () => {
    const [own] = await listExercises(coachDb, { query: "remo con banda propio" });
    expect(
      await updateExercise({ db: coachDb, id: own.id, input: input({ equipment: "Polea" }) }),
    ).toEqual({ ok: true });
    expect((await getOwnExercise(coachDb, own.id))?.equipment).toBe("Polea");

    const [base] = await listExercises(coachDb, { query: "press de banca", limit: 1 });
    expect(
      await updateExercise({ db: coachDb, id: base.id, input: input({ name: "Editado" }) }),
    ).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("editar al mismo nombre de otro ejercicio da name_taken", async () => {
    await createExercise({ db: coachDb, coachId, input: input({ name: "Segundo propio" }) });
    const [second] = await listExercises(coachDb, { query: "segundo propio" });
    expect(
      await updateExercise({
        db: coachDb,
        id: second.id,
        input: input({ name: "Remo con banda propio" }),
      }),
    ).toEqual({
      ok: false,
      reason: "name_taken",
    });
  });

  it("archivar lo oculta por defecto al alumno y al listado; restaurar lo devuelve", async () => {
    const [own] = await listExercises(coachDb, { query: "segundo propio" });
    expect(await archiveExercise({ db: coachDb, id: own.id })).toEqual({ ok: true });

    expect(await listExercises(coachDb, { query: "segundo propio" })).toHaveLength(0);
    expect(
      await listExercises(coachDb, { query: "segundo propio", includeArchived: true }),
    ).toHaveLength(1);
    expect(await listExercises(studentDb, { query: "segundo propio" })).toHaveLength(0);

    expect(await restoreExercise({ db: coachDb, id: own.id })).toEqual({ ok: true });
    expect(await listExercises(coachDb, { query: "segundo propio" })).toHaveLength(1);
  });

  it("no se pueden archivar ejercicios del catálogo base", async () => {
    const [base] = await listExercises(coachDb, { query: "sentadilla", limit: 1 });
    expect(await archiveExercise({ db: coachDb, id: base.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
