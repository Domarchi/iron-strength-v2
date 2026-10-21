import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addRoutineExercises } from "./routine-additions";
import type { AdditionRequest } from "@/lib/coach/routine-additions";
const admin = adminClient();
let db: AdminClient, studentDb: AdminClient, coachId: string, sessionId: string;
let catalog: string[], archived: string;
let request: AdditionRequest;
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "additions@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "additions-student@test.local",
    coachId: coach.id,
  });
  coachId = coach.id;
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  const exercises = await db.from("exercises").select("id").is("coach_id", null).limit(3);
  catalog = exercises.data!.map((e) => e.id);
  const a = await db
    .from("exercises")
    .insert({
      coach_id: coachId,
      name: "Archivado",
      muscle_group: "Core",
      archived_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  archived = a.data!.id;
});
beforeEach(async () => {
  const p = await db
    .from("programs")
    .insert({ coach_id: coachId, name: "Lote", weeks_count: 2 })
    .select("id")
    .single();
  const s = await db
    .from("program_sessions")
    .insert({ program_id: p.data!.id, week_number: 1, label: "A" })
    .select("id")
    .single();
  sessionId = s.data!.id;
  request = {
    id: randomUUID(),
    revision: 0,
    items: catalog.slice(0, 2).map((exerciseId) => ({ id: randomUUID(), exerciseId })),
  };
});
afterAll(() => resetUsers(admin));
async function snapshot() {
  const { data, error } = await db
    .from("program_sessions")
    .select("revision,session_exercises(*)")
    .eq("id", sessionId)
    .single();
  expect(error).toBeNull();
  return {
    revision: data!.revision,
    rows: data!.session_exercises.sort((a, b) => a.position - b.position),
  };
}
it("confirma un lote completo con IDs estables y un reintento no cambia revisión ni filas", async () => {
  expect(await addRoutineExercises(db, sessionId, request)).toMatchObject({ ok: true });
  const first = await snapshot();
  expect(first.rows.map((r) => r.id)).toEqual(request.items.map((r) => r.id));
  expect(
    first.rows.map((r) => [
      r.position,
      r.sets,
      r.reps_min,
      r.reps_max,
      r.target_weight_kg,
      r.superset_id,
    ]),
  ).toEqual([
    [0, 3, 8, 12, null, null],
    [1, 3, 8, 12, null, null],
  ]);
  expect(await addRoutineExercises(db, sessionId, request)).toEqual({
    ok: true,
    revision: first.revision,
  });
  expect(await snapshot()).toEqual(first);
  expect(
    await addRoutineExercises(db, sessionId, { ...request, items: [request.items[0]] }),
  ).toMatchObject({ ok: false, reason: "invalid" });
});
it("SQL revierte la primera fila si la segunda es archivada y no crea recibo", async () => {
  const before = await snapshot();
  const result = await db.rpc("add_routine_exercises", {
    p_session_id: sessionId,
    p_expected_revision: 0,
    p_request_id: request.id,
    p_items: [request.items[0], { ...request.items[1], exerciseId: archived }],
  });
  expect(result.error?.code).toBe("22023");
  expect(await snapshot()).toEqual(before);
  expect((await db.from("routine_mutations").select("id").eq("id", request.id)).data).toEqual([]);
});
it("dos pestañas con igual revisión confirman solo un lote y conservan el otro sin insertar", async () => {
  const other = {
    ...request,
    id: randomUUID(),
    items: [{ id: randomUUID(), exerciseId: catalog[2] }],
  };
  const results = await Promise.all(
    [request, other].map((r) => addRoutineExercises(db, sessionId, r)),
  );
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "conflict" }]);
  expect((await snapshot()).rows).toHaveLength(results[0].ok ? 2 : 1);
});
it("el límite se aplica al lote completo también en SQL", async () => {
  const rows = Array.from({ length: 14 }, (_, position) => ({
    program_session_id: sessionId,
    exercise_id: catalog[0],
    position,
    sets: 3,
    reps_min: 8,
    reps_max: 12,
  }));
  expect((await db.from("session_exercises").insert(rows)).error).toBeNull();
  const before = await snapshot();
  expect(
    await addRoutineExercises(db, sessionId, { ...request, revision: before.revision }),
  ).toEqual({ ok: false, reason: "limit" });
  expect(await snapshot()).toEqual(before);
});
it("SQL rechaza miembros repetidos e identidad perteneciente a otra fila sin actualizarla", async () => {
  expect(
    (
      await db.rpc("add_routine_exercises", {
        p_session_id: sessionId,
        p_expected_revision: 0,
        p_request_id: request.id,
        p_items: [
          request.items[0],
          { ...request.items[1], exerciseId: request.items[0].exerciseId },
        ],
      })
    ).error,
  ).toBeTruthy();
  expect((await snapshot()).rows).toEqual([]);
  expect((await addRoutineExercises(db, sessionId, request)).ok).toBe(true);
  const before = await snapshot();
  expect(
    (
      await db.rpc("add_routine_exercises", {
        p_session_id: sessionId,
        p_expected_revision: before.revision,
        p_request_id: randomUUID(),
        p_items: [request.items[0]],
      })
    ).error,
  ).toBeTruthy();
  expect(await snapshot()).toEqual(before);
});
it("alumno y anónimo no agregan ni leen recibos; la semana vigente permanece bloqueada", async () => {
  expect(await addRoutineExercises(studentDb, sessionId, request)).toEqual({
    ok: false,
    reason: "forbidden",
  });
  expect((await studentDb.from("routine_mutations").select("id")).data).toEqual([]);
  const monday = new Date();
  const { mondayOf, santiagoDate } = await import("@/domain/dates");
  const start = mondayOf(santiagoDate(monday));
  const s = await db.from("program_sessions").select("program_id").eq("id", sessionId).single();
  await admin
    .from("programs")
    .update({ student_id: coachId, start_date: start, ends_on: "2099-12-31" })
    .eq("id", s.data!.program_id);
  expect(await addRoutineExercises(db, sessionId, request)).toEqual({
    ok: false,
    reason: "week_locked",
  });
  expect((await snapshot()).rows).toEqual([]);
});
