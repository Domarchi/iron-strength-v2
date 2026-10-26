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
  archiveExercise,
  getActiveExercise,
  listMobileExercises,
} from "./exercises";
const admin = adminClient();
let coachDb: AdminClient, studentDbs: AdminClient[], inactiveDb: AdminClient;
let activeId: string, archivedId: string;
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "catalog-coach@test.local",
  });
  coachDb = await signedInClient(coach.email, coach.password);
  studentDbs = [];
  for (let i = 0; i < 3; i++) {
    const student = await createProfileUser(admin, {
      role: "student",
      name: "Alumno " + i,
      email: `catalog-${i}@test.local`,
      coachId: coach.id,
    });
    studentDbs.push(await signedInClient(student.email, student.password));
  }
  const inactive = await createProfileUser(admin, {
    role: "student",
    name: "Inactivo",
    email: "catalog-inactive@test.local",
    coachId: coach.id,
    isActive: false,
  });
  inactiveDb = await signedInClient(inactive.email, inactive.password);
  for (const [name, archived] of [
    ["Ejercicio móvil activo", false],
    ["Ejercicio móvil archivado", true],
  ] as const) {
    const result = await createExercise({
      db: coachDb,
      coachId: coach.id,
      input: {
        name,
        muscleGroup: "Espalda",
        equipment: "Banda elástica",
        progressionIncrementKg: 1,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.id) throw Error("Missing fixture");
    if (archived) {
      archivedId = result.id;
      expect((await archiveExercise({ db: coachDb, id: result.id })).ok).toBe(true);
    } else activeId = result.id;
  }
});
afterAll(() => resetUsers(admin));
it("entrega el catálogo activo completo a los tres alumnos sin programa y al coach", async () => {
  for (const db of [coachDb, ...studentDbs]) {
    const catalog = await listMobileExercises(db);
    expect(catalog.length).toBeGreaterThanOrEqual(468);
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
    expect(catalog.some((e) => e.id === activeId)).toBe(true);
    expect(catalog.some((e) => e.id === archivedId)).toBe(false);
    expect((await getActiveExercise(db, activeId))?.id).toBe(activeId);
    expect(await getActiveExercise(db, archivedId)).toBeNull();
  }
});
it("RLS mantiene fuera al visitante/inactivo y no concede escritura al alumno", async () => {
  const anonymous = anonClient();
  await expect(listMobileExercises(anonymous)).rejects.toThrow();
  await expect(getActiveExercise(anonymous, activeId)).rejects.toThrow();
  expect(await listMobileExercises(inactiveDb)).toEqual([]);
  expect(await getActiveExercise(inactiveDb, activeId)).toBeNull();
  const update = await studentDbs[0]
    .from("exercises")
    .update({ name: "No autorizado" })
    .eq("id", activeId)
    .select("id");
  expect(update.data ?? []).toHaveLength(0);
  expect((await getActiveExercise(coachDb, activeId))?.name).toBe("Ejercicio móvil activo");
});
