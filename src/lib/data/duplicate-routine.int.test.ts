import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { duplicateRoutineItem, getProgramTree } from "./programs";

const admin = adminClient();
let db: AdminClient;
let studentDb: AdminClient;
let programId: string;
let sessionId: string;
let rowId: string;
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
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  const { data: exercise } = await admin
    .from("exercises")
    .select("id")
    .eq("name", "Sentadilla")
    .is("coach_id", null)
    .single();
  const { data: program } = await admin
    .from("programs")
    .insert({ coach_id: coach.id, name: "Duplicación", weeks_count: 2 })
    .select("id")
    .single();
  programId = program!.id;
  const { data: session } = await admin
    .from("program_sessions")
    .insert({ program_id: programId, week_number: 1, label: "A" })
    .select("id")
    .single();
  sessionId = session!.id;
  const { data: row } = await admin
    .from("session_exercises")
    .insert({
      program_session_id: sessionId,
      exercise_id: exercise!.id,
      position: 0,
      sets: 4,
      reps_min: 6,
      reps_max: 9,
      target_weight_kg: 62.5,
      note: "Pausa abajo",
    })
    .select("id")
    .single();
  rowId = row!.id;
});
afterAll(() => resetUsers(admin));

it("duplica prescripción e identidad y reintenta concurrentemente sin otra copia", async () => {
  const copyId = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      duplicateRoutineItem({ db, sessionId, exerciseId: rowId, copyId }),
    ),
  );
  expect(results.every((result) => result.ok)).toBe(true);
  const tree = (await getProgramTree(db, programId))!;
  const rows = tree.sessions[0].exercises;
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({
    id: copyId,
    sets: 4,
    repsMin: 6,
    repsMax: 9,
    targetWeightKg: 62.5,
    note: "Pausa abajo",
    position: 1,
  });
  await db.from("session_exercises").update({ sets: 2 }).eq("id", copyId);
  expect((await getProgramTree(db, programId))!.sessions[0].exercises[0].sets).toBe(4);
});

it("copia una sesión completa en orden y con identidades independientes", async () => {
  const copyId = randomUUID();
  expect(await duplicateRoutineItem({ db, sessionId, copyId })).toEqual({ ok: true, id: copyId });
  expect(await duplicateRoutineItem({ db, sessionId, copyId })).toEqual({ ok: true, id: copyId });
  const tree = (await getProgramTree(db, programId))!;
  expect(tree.sessions).toHaveLength(2);
  const [source, copy] = tree.sessions;
  expect(copy.label).toBe("B");
  expect(copy.exercises.map((row) => ({ ...row, id: "" }))).toEqual(
    source.exercises.map((row) => ({ ...row, id: "" })),
  );
  expect(
    copy.exercises.every((row) => !source.exercises.some((original) => original.id === row.id)),
  ).toBe(true);
});

it("un alumno no puede duplicar y una fila de otra sesión se rechaza", async () => {
  expect((await duplicateRoutineItem({ db: studentDb, sessionId, copyId: randomUUID() })).ok).toBe(
    false,
  );
  const copy = (await getProgramTree(db, programId))!.sessions[1];
  expect(
    await duplicateRoutineItem({
      db,
      sessionId,
      exerciseId: copy.exercises[0].id,
      copyId: randomUUID(),
    }),
  ).toEqual({ ok: false, reason: "not_found" });
});
