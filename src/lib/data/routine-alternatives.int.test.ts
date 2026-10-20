import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { configureAlternatives } from "./routine-alternatives";
import { getProgramTree } from "./programs";
import { mondayOf, santiagoDate } from "@/domain/dates";
const admin = adminClient();
let db: AdminClient, studentDb: AdminClient;
let studentId: string, programId: string, sessionId: string, rowId: string;
let exercises: string[];
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "alts-coach@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "alts-student@test.local",
    coachId: coach.id,
  });
  studentId = student.id;
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  exercises = (await db.from("exercises").select("id").is("coach_id", null).limit(5)).data!.map(
    (e) => e.id,
  );
  programId = (
    await db
      .from("programs")
      .insert({ coach_id: coach.id, name: "Alternativas", weeks_count: 2 })
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
  rowId = (
    await db
      .from("session_exercises")
      .insert({
        program_session_id: sessionId,
        exercise_id: exercises[0],
        position: 0,
        sets: 3,
        reps_min: 8,
        reps_max: 12,
      })
      .select("id")
      .single()
  ).data!.id;
});
afterAll(() => resetUsers(admin));
const tree = async () => (await getProgramTree(db, programId))!;
const alt = (index: number) => ({
  exerciseId: exercises[index],
  sets: 2,
  repsMin: 6,
  repsMax: 10,
  targetWeightKg: 22.5,
});
it("guarda atómicamente, confirma respuesta perdida y rechaza revisión anterior", async () => {
  const revision = (await tree()).sessions[0].revision;
  const request = {
    id: crypto.randomUUID(),
    revision,
    exerciseRowId: rowId,
    alternatives: [alt(1), alt(2)],
  };
  expect((await configureAlternatives(db, sessionId, request)).ok).toBe(true);
  const once = await tree();
  expect(once.sessions[0].exercises[0].alternatives?.map((e) => e.exerciseId)).toEqual([
    exercises[1],
    exercises[2],
  ]);
  expect((await configureAlternatives(db, sessionId, request)).ok).toBe(true);
  expect(await tree()).toEqual(once);
  expect(
    await configureAlternatives(db, sessionId, { ...request, id: crypto.randomUUID() }),
  ).toMatchObject({ ok: false, reason: "conflict" });
});
it("la base rechaza duplicados/autorreferencia y no deja cambios parciales", async () => {
  const before = await tree();
  for (const alternatives of [[alt(1), alt(1)], [alt(0)], [alt(1), alt(2), alt(3), alt(4)]]) {
    const response = await db.rpc("configure_session_alternatives", {
      p_session_id: sessionId,
      p_exercise_row_id: rowId,
      p_expected_revision: before.sessions[0].revision,
      p_request_id: crypto.randomUUID(),
      p_alternatives: alternatives,
    });
    expect(response.error).not.toBeNull();
    expect(await tree()).toEqual(before);
  }
});
it("duplicar fila/sesión, copiar semana y asignar conservan alternativas independientes", async () => {
  const original = (await tree()).sessions[0].exercises[0].alternatives!;
  const rowCopy = crypto.randomUUID(),
    sessionCopy = crypto.randomUUID();
  expect(
    (
      await db.rpc("duplicate_routine_item", {
        p_session_id: sessionId,
        p_copy_id: rowCopy,
        p_exercise_id: rowId,
      })
    ).error,
  ).toBeNull();
  expect(
    (await db.rpc("duplicate_routine_item", { p_session_id: sessionId, p_copy_id: sessionCopy }))
      .error,
  ).toBeNull();
  expect(
    (await db.rpc("copy_program_week", { p_program_id: programId, p_from: 1, p_to: 2 })).error,
  ).toBeNull();
  const assigned = await db.rpc("assign_program", {
    p_template_id: programId,
    p_student_id: studentId,
    p_start_date: mondayOf(santiagoDate(new Date())),
  });
  expect(assigned.error).toBeNull();
  const copy = (await getProgramTree(db, assigned.data!))!;
  const ids = new Set(original.map((a) => a.id));
  for (const t of [await tree(), copy])
    for (const s of t.sessions)
      for (const row of s.exercises) {
        if (row.id === rowId) continue;
        expect(row.alternatives!.map(({ id: _id, ...rest }) => rest)).toEqual(
          original.map(({ id: _id, ...rest }) => rest),
        );
        for (const a of row.alternatives!) {
          expect(ids.has(a.id)).toBe(false);
          ids.add(a.id);
        }
      }
  expect(
    (await getProgramTree(studentDb, assigned.data!))!.sessions[0].exercises[0].alternatives,
  ).toHaveLength(2);
  const s = copy.sessions[0];
  expect(
    await configureAlternatives(db, s.id, {
      id: crypto.randomUUID(),
      revision: s.revision,
      exerciseRowId: s.exercises[0].id,
      alternatives: [],
    }),
  ).toMatchObject({ ok: false, reason: "week_locked" });
  expect(
    (
      await configureAlternatives(studentDb, s.id, {
        id: crypto.randomUUID(),
        revision: s.revision,
        exerciseRowId: s.exercises[0].id,
        alternatives: [],
      })
    ).ok,
  ).toBe(false);
});
