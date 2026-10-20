import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getProgramTree, reorderSessionExercises } from "./programs";
const admin = adminClient();
let db: AdminClient;
let studentDb: AdminClient;
let programId: string;
let sessionId: string;
let ids: string[];
const groupId = crypto.randomUUID();
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "groups@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "groups-student@test.local",
    coachId: coach.id,
  });
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  programId = (
    await db
      .from("programs")
      .insert({ coach_id: coach.id, name: "Grupos", weeks_count: 2 })
      .select("id")
      .single()
  ).data!.id;
  sessionId = (
    await db
      .from("program_sessions")
      .insert({ program_id: programId, week_number: 1, label: "A" })
      .select("id")
      .single()
  ).data!.id;
  const exercises = (await db.from("exercises").select("id").is("coach_id", null).limit(4)).data!;
  const added = await db
    .from("session_exercises")
    .insert(
      exercises.map((e, i) => ({
        program_session_id: sessionId,
        exercise_id: e.id,
        position: i,
        sets: 3,
        reps_min: 8,
        reps_max: 12,
      })),
    )
    .select("id,position");
  ids = added.data!.sort((a, b) => a.position - b.position).map((e) => e.id);
});
afterAll(() => resetUsers(admin));
it("forma un grupo en una sola escritura y expone sus metadatos", async () => {
  expect(
    (
      await db
        .from("session_exercises")
        .update({ superset_id: groupId, superset_rest_seconds: 120 })
        .in("id", ids.slice(0, 2))
    ).error,
  ).toBeNull();
  const session = (await getProgramTree(db, programId))!.sessions[0];
  expect(session.exercises.slice(0, 2).map((e) => e.supersetId)).toEqual([groupId, groupId]);
  expect(session.exercises[0].supersetRestSeconds).toBe(120);
  expect(session.exercises[2].supersetId).toBeNull();
});
it("reordenar no puede partir un grupo ni cambiar parcialmente la revisión", async () => {
  const before = (await getProgramTree(db, programId))!.sessions[0];
  expect(
    await reorderSessionExercises({
      db,
      sessionId,
      orderedIds: [ids[0], ids[2], ids[1], ids[3]],
      expectedRevision: before.revision,
      requestId: crypto.randomUUID(),
    }),
  ).toMatchObject({ ok: false, reason: "invalid" });
  expect((await getProgramTree(db, programId))!.sessions[0]).toEqual(before);
});
it("mover el bloque completo mantiene grupo, prescripciones y permisos", async () => {
  expect(
    (await reorderSessionExercises({ db, sessionId, orderedIds: [ids[2], ids[3], ids[0], ids[1]] }))
      .ok,
  ).toBe(true);
  expect((await getProgramTree(db, programId))!.sessions[0].exercises.map((e) => e.id)).toEqual([
    ids[2],
    ids[3],
    ids[0],
    ids[1],
  ]);
  expect(
    (
      await studentDb
        .from("session_exercises")
        .update({ superset_id: null, superset_rest_seconds: null })
        .in("id", ids)
        .select("id")
    ).data,
  ).toEqual([]);
});
it("quitar uno de dos integrantes disuelve el grupo sin perder la prescripción restante", async () => {
  expect((await db.from("session_exercises").delete().eq("id", ids[0])).error).toBeNull();
  const remaining = (await getProgramTree(db, programId))!.sessions[0].exercises.find(
    (e) => e.id === ids[1],
  );
  expect(remaining).toMatchObject({
    supersetId: null,
    supersetRestSeconds: null,
    sets: 3,
    repsMin: 8,
    repsMax: 12,
  });
});
