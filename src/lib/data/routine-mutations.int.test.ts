import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getProgramTree, saveSessionPrescriptions, reorderSessionExercises } from "./programs";
const admin = adminClient();
let db: AdminClient;
let studentDb: AdminClient;
let programId: string;
let sessionId: string;
let rows: {
  id: string;
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeightKg: null;
  note: null;
}[];
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "atomic@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "atomic-student@test.local",
    coachId: coach.id,
  });
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  const p = await db
    .from("programs")
    .insert({ coach_id: coach.id, name: "Atomic", weeks_count: 2 })
    .select("id")
    .single();
  programId = p.data!.id;
  const s = await db
    .from("program_sessions")
    .insert({ program_id: programId, week_number: 1, label: "A" })
    .select("id")
    .single();
  sessionId = s.data!.id;
  const ex = await db.from("exercises").select("id").is("coach_id", null).limit(2);
  const added = await db
    .from("session_exercises")
    .insert(
      ex.data!.map((e, position) => ({
        program_session_id: sessionId,
        exercise_id: e.id,
        position,
        sets: 3,
        reps_min: 8,
        reps_max: 12,
      })),
    )
    .select("id,exercise_id");
  rows = added.data!.map((e) => ({
    id: e.id,
    exerciseId: e.exercise_id,
    sets: 4,
    repsMin: 8,
    repsMax: 12,
    targetWeightKg: null,
    note: null,
  }));
});
afterAll(() => resetUsers(admin));
async function session() {
  return (await getProgramTree(db, programId))!.sessions[0];
}
it("guarda el lote completo y confirma la misma operación sin escribir otra vez", async () => {
  const before = await session();
  const args = { db, sessionId, expectedRevision: before.revision, requestId: randomUUID(), rows };
  expect((await saveSessionPrescriptions(args)).ok).toBe(true);
  const after = await session();
  expect(after.exercises.map((e) => e.sets)).toEqual([4, 4]);
  expect(after.revision).toBeGreaterThan(before.revision);
  expect((await saveSessionPrescriptions(args)).ok).toBe(true);
  expect((await session()).revision).toBe(after.revision);
  expect(
    await saveSessionPrescriptions({ ...args, rows: [{ ...rows[0], sets: 5 }] }),
  ).toMatchObject({ ok: false, reason: "invalid" });
});
it("revierte todo el lote ante un error en la segunda fila incluso llamando SQL directamente", async () => {
  const before = await session();
  const result = await db.rpc("mutate_routine_session", {
    p_session_id: sessionId,
    p_expected_revision: before.revision,
    p_request_id: randomUUID(),
    p_rows: [
      { ...rows[0], sets: 5 },
      { ...rows[1], sets: 0 },
    ],
  });
  expect(result.error).toBeTruthy();
  expect(await session()).toEqual(before);
});
it("dos pestañas con igual revisión no sobrescriben entre sí", async () => {
  const before = await session();
  const results = await Promise.all(
    [5, 6].map((sets) =>
      saveSessionPrescriptions({
        db,
        sessionId,
        expectedRevision: before.revision,
        requestId: randomUUID(),
        rows: [{ ...rows[0], sets }],
      }),
    ),
  );
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "conflict" }]);
});
it("reordena atómicamente y rechaza permutaciones parciales o revisiones antiguas", async () => {
  const before = await session();
  const ids = before.exercises.map((e) => e.id).reverse();
  const args = {
    db,
    sessionId,
    orderedIds: ids,
    expectedRevision: before.revision,
    requestId: randomUUID(),
  };
  expect((await reorderSessionExercises(args)).ok).toBe(true);
  expect((await session()).exercises.map((e) => e.id)).toEqual(ids);
  const after = await session();
  expect((await reorderSessionExercises(args)).ok).toBe(true);
  expect((await session()).revision).toBe(after.revision);
  expect(await reorderSessionExercises({ ...args, requestId: randomUUID() })).toMatchObject({
    ok: false,
    reason: "conflict",
  });
  expect(
    (
      await db.rpc("mutate_routine_session", {
        p_session_id: sessionId,
        p_expected_revision: after.revision,
        p_request_id: randomUUID(),
        p_ordered_ids: [ids[0]],
      })
    ).error,
  ).toBeTruthy();
  expect(await session()).toEqual(after);
});
it("una edición antigua también invalida la revisión y el alumno no puede escribir ni leer recibos", async () => {
  const before = await session();
  await db.from("session_exercises").update({ note: "Edición externa" }).eq("id", rows[0].id);
  expect((await session()).revision).toBeGreaterThan(before.revision);
  expect(
    await saveSessionPrescriptions({
      db,
      sessionId,
      expectedRevision: before.revision,
      requestId: randomUUID(),
      rows,
    }),
  ).toMatchObject({ ok: false, reason: "conflict" });
  expect(
    await saveSessionPrescriptions({
      db: studentDb,
      sessionId,
      expectedRevision: before.revision,
      requestId: randomUUID(),
      rows,
    }),
  ).toMatchObject({ ok: false, reason: "forbidden" });
  expect((await studentDb.from("routine_mutations").select("*")).data).toEqual([]);
});
