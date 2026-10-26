import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { readPersonalLibrary, mutatePersonalLibrary } from "./personal-library";
import type { PersonalMutation } from "../mobile/personal-contracts";

const admin = adminClient();
describe("biblioteca personal real y concurrencia", () => {
  let students: AdminClient[], coach: AdminClient;
  beforeAll(async () => {
    await resetUsers(admin);
    const c = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@personal.test.local",
    });
    coach = await signedInClient(c.email, c.password);
    students = [];
    for (let i = 0; i < 3; i++) {
      const p = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `student${i}@personal.test.local`,
        coachId: c.id,
      });
      students.push(await signedInClient(p.email, p.password));
    }
  });
  afterAll(() => resetUsers(admin));
  const create = (name = "Base"): Extract<PersonalMutation, { operation: "routine_create" }> => ({
    version: 1,
    requestId: randomUUID(),
    targetId: randomUUID(),
    expectedRevision: 0,
    operation: "routine_create",
    data: { name, folderId: null, items: [] },
  });
  it("tres alumnos y coach poseen bases independientes con snapshot completo", async () => {
    for (const db of [...students, coach]) {
      expect((await readPersonalLibrary(db)).routines).toHaveLength(0);
      const input = create();
      expect(await mutatePersonalLibrary(db, input)).toMatchObject({
        status: "created",
        duplicate: false,
        targetId: input.targetId,
      });
    }
    const snapshots = await Promise.all([...students, coach].map((db) => readPersonalLibrary(db)));
    expect(new Set(snapshots.map((p) => p.userId)).size).toBe(4);
    expect(new Set(snapshots.flatMap((p) => p.routines.map((r) => r.id))).size).toBe(4);
    expect(snapshots.every((p) => p.routines.length === 1)).toBe(true);
  });
  it("dos guardados simultáneos desde la misma revisión no se sobreescriben", async () => {
    const current = (await readPersonalLibrary(students[0])).routines[0];
    const save = (name: string): PersonalMutation => ({
      version: 1,
      requestId: randomUUID(),
      targetId: current.id,
      expectedRevision: current.revision,
      operation: "routine_save",
      data: { name, items: [] },
    });
    const outcomes = await Promise.allSettled([
      mutatePersonalLibrary(students[0], save("Primera pestaña")),
      mutatePersonalLibrary(students[0], save("Segunda pestaña")),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "40001" },
    });
    const after = (await readPersonalLibrary(students[0])).routines[0];
    expect(after.revision).toBeGreaterThan(current.revision);
    expect(["Primera pestaña", "Segunda pestaña"]).toContain(after.name);
  });
  it("reintentos simultáneos estables confirman una sola copia y no duplican", async () => {
    const input = create("Respuesta perdida");
    const result = await Promise.all([
      mutatePersonalLibrary(students[1], input),
      mutatePersonalLibrary(students[1], input),
    ]);
    expect(result.map((r) => r.duplicate).sort()).toEqual([false, true]);
    expect(result[0].revision).toBe(result[1].revision);
    expect(
      (await readPersonalLibrary(students[1])).routines.filter((r) => r.id === input.targetId),
    ).toHaveLength(1);
    await expect(
      mutatePersonalLibrary(students[1], {
        ...input,
        data: { ...input.data, name: "Intento cambiado" },
      }),
    ).rejects.toMatchObject({ code: "22023" });
  });
  it("base de otro alumno no se edita ni se revela al coach", async () => {
    const current = (await readPersonalLibrary(students[0])).routines[0];
    for (const db of [students[1], students[2], coach])
      await expect(
        mutatePersonalLibrary(db, {
          version: 1,
          requestId: randomUUID(),
          targetId: current.id,
          expectedRevision: current.revision,
          operation: "routine_delete",
          data: {},
        }),
      ).rejects.toMatchObject({ code: "P0002" });
    expect((await readPersonalLibrary(students[0])).routines).toHaveLength(1);
  });
  it("el cliente envía revisión nula solo para ordenar una colección completa", async () => {
    const before = await readPersonalLibrary(students[1]);
    const reversed = [...before.routines].reverse();
    const result = await mutatePersonalLibrary(students[1], {
      version: 1,
      requestId: randomUUID(),
      targetId: before.userId,
      operation: "routines_reorder",
      expectedRevision: null,
      data: { folderId: null, entries: reversed.map(({ id, revision }) => ({ id, revision })) },
    });
    expect(result).toMatchObject({ status: "reordered", revision: null });
    const after = await readPersonalLibrary(students[1]);
    expect(after.routines.map((row) => row.id)).toEqual(reversed.map((row) => row.id));
    expect(
      after.routines.every(
        (row) => row.revision > before.routines.find((old) => old.id === row.id)!.revision,
      ),
    ).toBe(true);
  });
  it("GoTrue borra un coach sin alumnos con ejercicio y rutina propios, sin permisos artificiales", async () => {
    await resetUsers(admin);
    const person = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach-delete@personal.test.local",
    });
    const db = await signedInClient(person.email, person.password);
    const exerciseId = randomUUID();
    const exercise = await db.from("exercises").insert({
      id: exerciseId,
      coach_id: person.id,
      name: "Ejercicio con propietario",
      muscle_group: "Pecho",
    });
    expect(exercise.error).toBeNull();
    const base = create();
    await mutatePersonalLibrary(db, {
      ...base,
      data: {
        ...base.data,
        items: [
          {
            id: randomUUID(),
            exerciseId,
            sets: 2,
            repsMin: 8,
            repsMax: 12,
            targetWeightKg: null,
            note: "",
            restSeconds: null,
            supersetId: null,
            supersetRestSeconds: null,
            series: null,
          },
        ],
      },
    });
    expect((await readPersonalLibrary(db)).routines[0].items).toHaveLength(1);
    const deleted = await admin.auth.admin.deleteUser(person.id);
    expect(deleted.error).toBeNull();
    expect(
      (await admin.from("personal_routine_items").select("id").eq("owner_id", person.id)).data,
    ).toHaveLength(0);
    expect(
      (
        await admin
          .from("personal_training_receipts")
          .select("request_id")
          .eq("owner_id", person.id)
      ).data,
    ).toHaveLength(0);
  });
});
