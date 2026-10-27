import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { trainingMetricCases } from "@/test/fixtures/training-metrics";
import type {
  TypedPersonalItemInput,
  TypedPersonalMutation,
} from "../mobile/typed-personal-contracts";
import { readTrainingLibrary, mutateTrainingLibrary } from "./typed-personal-library";
import { readPersonalLibrary, mutatePersonalLibrary } from "./personal-library";
import type { Json } from "../../types/database";
const admin = adminClient();
describe("biblioteca2 real, objetivos tipados y compatibilidad de recibos", () => {
  let students: AdminClient[], coach: AdminClient, people: string[], exerciseIds: string[];
  beforeAll(async () => {
    await resetUsers(admin);
    const c = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@typedlibrary.test.local",
    });
    coach = await signedInClient(c.email, c.password);
    students = [];
    people = [];
    for (let i = 0; i < 3; i++) {
      const p = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `student${i}@typedlibrary.test.local`,
        coachId: c.id,
      });
      people.push(p.id);
      students.push(await signedInClient(p.email, p.password));
    }
    const result = await admin
      .from("exercises")
      .insert(
        trainingMetricCases.map((m, i) => ({
          name: `Base tipada ${i}`,
          muscle_group: "Pecho" as const,
          record_type: m.recordType,
        })),
      )
      .select("id,name");
    if (result.error) throw result.error;
    exerciseIds = trainingMetricCases.map(
      (_, i) => result.data.find((e) => e.name === `Base tipada ${i}`)!.id,
    );
  });
  afterAll(async () => {
    await resetUsers(admin);
    if (exerciseIds?.length) {
      const r = await admin.from("exercises").delete().in("id", exerciseIds);
      if (r.error) throw r.error;
    }
  });
  const row = (index = 5): TypedPersonalItemInput => {
    const m = trainingMetricCases[index];
    return {
      id: randomUUID(),
      exerciseId: exerciseIds[index],
      prescribed: {
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
      },
      note: "Indicación",
      restSeconds: 90,
      supersetId: null,
      supersetRestSeconds: null,
    };
  };
  const create = (
    items: TypedPersonalItemInput[] = [],
  ): Extract<TypedPersonalMutation, { operation: "routine_create" }> => ({
    version: 2,
    requestId: randomUUID(),
    targetId: randomUUID(),
    expectedRevision: 0,
    operation: "routine_create",
    data: { name: "Base", folderId: null, items },
  });
  async function current(db: AdminClient, id: string) {
    return (await readTrainingLibrary(db)).routines.find((r) => r.id === id)!;
  }
  const raw = (db: AdminClient, input: TypedPersonalMutation, version = 2) =>
    db.rpc("mutate_training_library", {
      p_request_id: input.requestId,
      p_operation: input.operation,
      p_target_id: input.targetId,
      p_expected_revision: input.expectedRevision as number,
      p_data: input.data as Json,
      p_version: version,
    });
  it("guarda los nueve tipos sin inventar reps, conserva series y copia sin compartir IDs", async () => {
    const rows = trainingMetricCases.map((_, i) => row(i));
    const group = randomUUID();
    rows[5].supersetId = group;
    rows[6].supersetId = group;
    rows[5].supersetRestSeconds = 0;
    rows[6].supersetRestSeconds = 0;
    rows[5].prescribed = {
      ...rows[5].prescribed,
      target: { ...rows[5].prescribed.target, targetDurationSeconds: null },
      series: [
        rows[5].prescribed.target,
        { ...rows[5].prescribed.target, targetDurationSeconds: 90 },
      ],
    };
    rows[7].note = "🏋".repeat(500);
    const input = create(rows);
    const receipt = await mutateTrainingLibrary(students[0], input);
    expect(receipt).toMatchObject({ version: 2, status: "created", duplicate: false });
    const base = await current(students[0], input.targetId);
    expect(base.items.map((r) => r.prescribed)).toEqual(rows.map((r) => r.prescribed));
    const stored = await admin
      .from("personal_routine_items")
      .select("reps_min,reps_max,target_weight_kg,prescription_sets,typed_prescription")
      .eq("routine_id", input.targetId);
    expect(stored.error).toBeNull();
    expect(stored.data).toHaveLength(9);
    expect(
      stored.data!.every(
        (r) =>
          r.reps_min === null &&
          r.reps_max === null &&
          r.target_weight_kg === null &&
          r.prescription_sets === null &&
          r.typed_prescription !== null,
      ),
    ).toBe(true);
    const copy: TypedPersonalMutation = {
      version: 2,
      requestId: randomUUID(),
      targetId: randomUUID(),
      expectedRevision: 0,
      operation: "routine_copy",
      data: { sourceId: base.id, sourceRevision: base.revision, name: "Copia", folderId: null },
    };
    await mutateTrainingLibrary(students[0], copy);
    const copied = await current(students[0], copy.targetId);
    expect(copied.items.map((r) => r.prescribed)).toEqual(rows.map((r) => r.prescribed));
    expect(copied.items.every((r) => !base.items.some((b) => b.id === r.id))).toBe(true);
    expect(copied.items[5].supersetId).not.toBe(group);
    expect(copied.items[5].supersetId).toBe(copied.items[6].supersetId);
    expect(copied.items[5].supersetRestSeconds).toBe(0);
    expect(await current(students[0], base.id)).toEqual(base);
  });
  it("legacy se lee con tipo null explícito; replay antiguo sobrevive a convertir la base", async () => {
    const legacy = {
      version: 1 as const,
      requestId: randomUUID(),
      targetId: randomUUID(),
      expectedRevision: 0 as const,
      operation: "routine_create" as const,
      data: {
        name: "Anterior",
        folderId: null,
        items: [
          {
            id: randomUUID(),
            exerciseId: exerciseIds[0],
            sets: 2,
            repsMin: 8,
            repsMax: 12,
            targetWeightKg: 20,
            note: "Anterior",
            restSeconds: null,
            supersetId: null,
            supersetRestSeconds: null,
            series: [
              { repsMin: 8, repsMax: 8, targetWeightKg: 20 },
              { repsMin: 12, repsMax: 12, targetWeightKg: 20 },
            ],
          },
        ],
      },
    };
    await mutatePersonalLibrary(students[1], legacy);
    expect((await readPersonalLibrary(students[1])).routines).toHaveLength(1);
    const base = await current(students[1], legacy.targetId);
    expect(base.items[0].prescribed.recordType).toBeNull();
    expect(base.items[0].prescribed.series).toHaveLength(2);
    const save: TypedPersonalMutation = {
      version: 2,
      requestId: randomUUID(),
      targetId: base.id,
      expectedRevision: base.revision,
      operation: "routine_save",
      data: {
        name: base.name,
        items: base.items.map((r) => ({
          id: r.id,
          exerciseId: r.exerciseId,
          prescribed: r.prescribed,
          note: r.note,
          restSeconds: r.restSeconds,
          supersetId: r.supersetId,
          supersetRestSeconds: r.supersetRestSeconds,
        })),
      },
    };
    await mutateTrainingLibrary(students[1], save);
    await expect(readPersonalLibrary(students[1])).rejects.toMatchObject({ code: "0A000" });
    expect(await mutatePersonalLibrary(students[1], legacy)).toMatchObject({
      duplicate: true,
      targetId: base.id,
    });
    const updated = await current(students[1], base.id);
    await expect(
      mutatePersonalLibrary(students[1], {
        ...legacy,
        operation: "routine_save",
        requestId: randomUUID(),
        expectedRevision: updated.revision,
        data: { name: "No borrar", items: [] },
      }),
    ).rejects.toMatchObject({ code: "0A000" });
    await expect(
      mutatePersonalLibrary(students[1], {
        version: 1,
        requestId: randomUUID(),
        targetId: randomUUID(),
        expectedRevision: 0,
        operation: "routine_copy",
        data: {
          sourceId: base.id,
          sourceRevision: updated.revision,
          name: "Antigua",
          folderId: null,
        },
      }),
    ).rejects.toMatchObject({ code: "0A000" });
    expect(await current(students[1], base.id)).toEqual(updated);
  });
  it("pérdida de respuesta y dos pestañas confirman una sola operación completa", async () => {
    const input = create([row()]);
    const result = await Promise.all([
      mutateTrainingLibrary(students[2], input),
      mutateTrainingLibrary(students[2], input),
    ]);
    expect(result.map((r) => r.duplicate).sort()).toEqual([false, true]);
    expect(
      (await raw(students[2], { ...input, data: { ...input.data, name: "Distinto" } })).error?.code,
    ).toBe("22023");
    const base = await current(students[2], input.targetId);
    const save = (name: string): TypedPersonalMutation => ({
      version: 2,
      requestId: randomUUID(),
      targetId: base.id,
      expectedRevision: base.revision,
      operation: "routine_save",
      data: { name, items: [row()] },
    });
    const outcomes = await Promise.allSettled([
      mutateTrainingLibrary(students[2], save("Uno")),
      mutateTrainingLibrary(students[2], save("Dos")),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "40001" },
    });
    expect((await current(students[2], base.id)).items).toHaveLength(1);
    expect((await raw(students[2], input, 1)).error?.code).toBe("22023");
  });
  it("valida todo el lote y DML directo sin dejar revisiones o cabeceras parciales", async () => {
    const input = create([row(), row(8)]);
    const bad = structuredClone(input);
    bad.data.items[1].prescribed.target.repsMin = 8;
    expect((await raw(students[2], bad)).error?.code).toBe("22023");
    expect(
      (await readTrainingLibrary(students[2])).routines.some((r) => r.id === bad.targetId),
    ).toBe(false);
    await mutateTrainingLibrary(students[2], input);
    const base = await current(students[2], input.targetId);
    const item = base.items[0];
    for (const patch of [
      { reps_min: 1 },
      { sets: 3 },
      { typed_prescription: { ...item.prescribed, recordType: "weight_reps" } as Json },
      { typed_prescription: null },
    ]) {
      const r = await students[2].from("personal_routine_items").update(patch).eq("id", item.id);
      expect(r.error).not.toBeNull();
    }
    expect(await current(students[2], base.id)).toEqual(base);
    const untyped = {
      version: 1 as const,
      requestId: randomUUID(),
      targetId: randomUUID(),
      expectedRevision: 0 as const,
      operation: "routine_create" as const,
      data: {
        name: "No falsa",
        folderId: null,
        items: [
          {
            id: randomUUID(),
            exerciseId: exerciseIds[5],
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
    };
    await expect(mutatePersonalLibrary(students[2], untyped)).rejects.toMatchObject({
      code: "22023",
    });
  });
  it("RLS separa tres alumnos y coach; anónimo e inactivo no reciben biblioteca", async () => {
    const input = create([row(8)]);
    await mutateTrainingLibrary(coach, input);
    const base = await current(
      students[0],
      (await readTrainingLibrary(students[0])).routines[0].id,
    );
    for (const db of [coach, students[1], students[2]]) {
      expect((await readTrainingLibrary(db)).routines.some((r) => r.id === base.id)).toBe(false);
      const r = await db.from("personal_routine_items").select("id").eq("routine_id", base.id);
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
      await expect(
        mutateTrainingLibrary(db, {
          version: 2,
          requestId: randomUUID(),
          targetId: base.id,
          expectedRevision: base.revision,
          operation: "routine_save",
          data: { name: "Ajena", items: [] },
        }),
      ).rejects.toMatchObject({ code: "P0002" });
    }
    expect((await anonClient().rpc("get_training_library")).error).not.toBeNull();
    const r = await admin.from("profiles").update({ is_active: false }).eq("id", people[2]);
    if (r.error) throw r.error;
    await expect(readTrainingLibrary(students[2])).rejects.toMatchObject({ code: "42501" });
    const restore = await admin.from("profiles").update({ is_active: true }).eq("id", people[2]);
    if (restore.error) throw restore.error;
  });
  it("tombstones cruzan versiones y no resucitan una rutina borrada", async () => {
    const input = create([row()]);
    await mutateTrainingLibrary(students[2], input);
    const base = await current(students[2], input.targetId);
    await mutateTrainingLibrary(students[2], {
      version: 2,
      requestId: randomUUID(),
      targetId: base.id,
      expectedRevision: base.revision,
      operation: "routine_delete",
      data: {},
    });
    expect(await mutateTrainingLibrary(students[2], input)).toMatchObject({
      version: 2,
      status: "removed",
      revision: null,
      duplicate: true,
    });
    expect((await raw(students[2], { ...input, requestId: randomUUID() })).error?.code).toBe(
      "23505",
    );
    await expect(
      mutatePersonalLibrary(students[2], {
        version: 1,
        requestId: randomUUID(),
        targetId: input.targetId,
        expectedRevision: 0,
        operation: "routine_create",
        data: { name: "Anterior", folderId: null, items: [] },
      }),
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("carpetas, movimiento y orden conservan objetivos canónicos", async () => {
    const db = students[2],
      folder = randomUUID();
    await mutateTrainingLibrary(db, {
      version: 2,
      requestId: randomUUID(),
      targetId: folder,
      expectedRevision: 0,
      operation: "folder_create",
      data: { name: "Carpeta" },
    });
    const input = create([row(6)]);
    await mutateTrainingLibrary(db, input);
    let base = await current(db, input.targetId);
    await mutateTrainingLibrary(db, {
      version: 2,
      requestId: randomUUID(),
      targetId: base.id,
      expectedRevision: base.revision,
      operation: "routine_move",
      data: { folderId: folder },
    });
    base = await current(db, base.id);
    expect(base.folderId).toBe(folder);
    expect(base.items[0].prescribed).toEqual(input.data.items[0].prescribed);
    const snapshot = await readTrainingLibrary(db);
    await mutateTrainingLibrary(db, {
      version: 2,
      requestId: randomUUID(),
      targetId: snapshot.userId,
      expectedRevision: null,
      operation: "routines_reorder",
      data: { folderId: folder, entries: [{ id: base.id, revision: base.revision }] },
    });
    await mutateTrainingLibrary(db, {
      version: 2,
      requestId: randomUUID(),
      targetId: snapshot.userId,
      expectedRevision: null,
      operation: "folders_reorder",
      data: { entries: snapshot.folders.map((f) => ({ id: f.id, revision: f.revision })) },
    });
    const f = (await readTrainingLibrary(db)).folders.find((f) => f.id === folder)!;
    await mutateTrainingLibrary(db, {
      version: 2,
      requestId: randomUUID(),
      targetId: f.id,
      expectedRevision: f.revision,
      operation: "folder_rename",
      data: { name: "Renombrada" },
    });
    const renamed = (await readTrainingLibrary(db)).folders.find((f) => f.id === folder)!;
    await mutateTrainingLibrary(db, {
      version: 2,
      requestId: randomUUID(),
      targetId: f.id,
      expectedRevision: renamed.revision,
      operation: "folder_delete",
      data: {},
    });
    base = await current(db, base.id);
    expect(base.folderId).toBeNull();
    expect(base.items[0].prescribed).toEqual(input.data.items[0].prescribed);
  });
  it("un archivado referenciado se conserva y copia, sin autorizarlo a otra cuenta", async () => {
    const input = create([row(7)]);
    await mutateTrainingLibrary(students[2], input);
    const changed = await admin
      .from("exercises")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", exerciseIds[7]);
    if (changed.error) throw changed.error;
    try {
      const base = await current(students[2], input.targetId);
      const copy: TypedPersonalMutation = {
        version: 2,
        requestId: randomUUID(),
        targetId: randomUUID(),
        expectedRevision: 0,
        operation: "routine_copy",
        data: {
          sourceId: base.id,
          sourceRevision: base.revision,
          name: "Archivado propio",
          folderId: null,
        },
      };
      await mutateTrainingLibrary(students[2], copy);
      expect((await current(students[2], copy.targetId)).items[0].prescribed).toEqual(
        base.items[0].prescribed,
      );
      // El coach no posee una referencia personal a este ejercicio.
      await expect(mutateTrainingLibrary(coach, create([row(7)]))).rejects.toMatchObject({
        code: "22023",
      });
    } finally {
      const restored = await admin
        .from("exercises")
        .update({ archived_at: null })
        .eq("id", exerciseIds[7]);
      if (restored.error) throw restored.error;
    }
  });
});
