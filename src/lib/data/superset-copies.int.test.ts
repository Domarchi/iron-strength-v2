import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getProgramTree, type SessionRow } from "./programs";
import { mondayOf, santiagoDate } from "@/domain/dates";
const admin = adminClient();
let db: AdminClient, studentDb: AdminClient;
let coachId: string, studentId: string, programId: string, sessionId: string;
const groupIds = [crypto.randomUUID(), crypto.randomUUID()];
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "copy-groups@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "copy-student@test.local",
    coachId: coach.id,
  });
  coachId = coach.id;
  studentId = student.id;
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  programId = (
    await db
      .from("programs")
      .insert({ coach_id: coachId, name: "Grupos copiados", weeks_count: 2 })
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
  const rows = (await db.from("exercises").select("id").is("coach_id", null).limit(5)).data!;
  expect(
    (
      await db.from("session_exercises").insert(
        rows.map((row, i) => ({
          program_session_id: sessionId,
          exercise_id: row.id,
          position: i,
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          target_weight_kg: 25,
          note: `Nota ${i}`,
          rest_seconds: 45,
          superset_id: i < 4 ? groupIds[Math.floor(i / 2)] : null,
          superset_rest_seconds: i < 4 ? 120 : null,
        })),
      )
    ).error,
  ).toBeNull();
});
afterAll(() => resetUsers(admin));

function expectIndependent(source: SessionRow, copy: SessionRow) {
  const comparable = (row: SessionRow["exercises"][number]) => ({
    ...row,
    id: "",
    supersetId: row.supersetId ? "group" : null,
  });
  expect(copy.exercises.map(comparable)).toEqual(source.exercises.map(comparable));
  const sourceIds = new Set(source.exercises.map((e) => e.id));
  const sourceGroups = new Set(source.exercises.map((e) => e.supersetId).filter(Boolean));
  expect(copy.exercises.every((e) => !sourceIds.has(e.id))).toBe(true);
  const mapping = new Map<string, string>();
  source.exercises.forEach((row, i) => {
    if (!row.supersetId) return;
    const group = copy.exercises[i].supersetId!;
    expect(sourceGroups.has(group)).toBe(false);
    if (mapping.has(row.supersetId)) expect(group).toBe(mapping.get(row.supersetId));
    else mapping.set(row.supersetId, group);
  });
  expect(new Set(mapping.values()).size).toBe(sourceGroups.size);
}
it("duplica una sesión con grupos nuevos y mantiene la misma copia al reintentar", async () => {
  const copyId = crypto.randomUUID();
  const source = (await getProgramTree(db, programId))!.sessions[0];
  const params = { p_session_id: sessionId, p_copy_id: copyId };
  expect((await db.rpc("duplicate_routine_item", params)).error).toBeNull();
  const once = (await getProgramTree(db, programId))!.sessions.find((s) => s.id === copyId)!;
  expectIndependent(source, once);
  expect((await db.rpc("duplicate_routine_item", params)).error).toBeNull();
  expect((await getProgramTree(db, programId))!.sessions.find((s) => s.id === copyId)).toEqual(
    once,
  );
});
it("copiar semana conserva grupos distintos en cada sesión y deja intacto el origen", async () => {
  const before = (await getProgramTree(db, programId))!.sessions;
  expect(
    (await db.rpc("copy_program_week", { p_program_id: programId, p_from: 1, p_to: 2 })).error,
  ).toBeNull();
  const after = (await getProgramTree(db, programId))!.sessions;
  expect(after.filter((s) => s.weekNumber === 1)).toEqual(before);
  for (const source of before)
    expectIndependent(
      source,
      after.find((s) => s.weekNumber === 2 && s.label === source.label)!,
    );
  const newGroups = after
    .filter((s) => s.weekNumber === 2)
    .flatMap((s) => [...new Set(s.exercises.map((e) => e.supersetId).filter(Boolean))]);
  expect(new Set(newGroups).size).toBe(newGroups.length);
});
it("asigna al alumno y al propio coach sin compartir grupos ni permisos", async () => {
  const source = (await getProgramTree(db, programId))!;
  const date = mondayOf(santiagoDate(new Date()));
  const allGroups = new Set(
    source.sessions.flatMap((s) => s.exercises.map((e) => e.supersetId).filter(Boolean)),
  );
  for (const owner of [studentId, coachId]) {
    const result = await db.rpc("assign_program", {
      p_template_id: programId,
      p_student_id: owner,
      p_start_date: date,
    });
    expect(result.error).toBeNull();
    const copy = (await getProgramTree(db, result.data!))!;
    expect(copy.sessions).toHaveLength(source.sessions.length);
    source.sessions.forEach((s, i) => expectIndependent(s, copy.sessions[i]));
    const groups = new Set(
      copy.sessions.flatMap((s) => s.exercises.map((e) => e.supersetId).filter(Boolean)),
    );
    for (const group of groups) {
      expect(allGroups.has(group)).toBe(false);
      allGroups.add(group);
    }
    if (owner === coachId) expect(await getProgramTree(studentDb, result.data!)).toBeNull();
  }
});
it("duplicar un integrante conserva su descanso individual y lo deja fuera del grupo", async () => {
  const source = (await getProgramTree(db, programId))!.sessions[0].exercises[0];
  const copyId = crypto.randomUUID();
  expect(
    (
      await db.rpc("duplicate_routine_item", {
        p_session_id: sessionId,
        p_copy_id: copyId,
        p_exercise_id: source.id,
      })
    ).error,
  ).toBeNull();
  const rows = (await getProgramTree(db, programId))!.sessions[0].exercises;
  expect(rows.find((e) => e.id === copyId)).toMatchObject({
    restSeconds: 45,
    supersetId: null,
    supersetRestSeconds: null,
    sets: 3,
    note: "Nota 0",
  });
  expect(rows.find((e) => e.id === source.id)).toEqual(source);
});
