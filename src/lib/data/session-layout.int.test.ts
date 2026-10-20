import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getProgramTree } from "./programs";
import { configureSessionLayout } from "./session-layout";
import { sessionLayout, groupSelected } from "@/lib/coach/routine-layout";
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

async function current() {
  return (await getProgramTree(db, programId))!.sessions[0];
}
it("configura grupos y descansos sin tocar la prescripción, con reintento idempotente", async () => {
  const before = await current();
  const layout = groupSelected(sessionLayout(before.exercises), ids.slice(0, 3), groupId)!;
  const request = {
    id: crypto.randomUUID(),
    revision: before.revision,
    layout: layout.map((row) => ({
      ...row,
      restSeconds: 60,
      supersetRestSeconds: row.supersetId ? 120 : null,
    })),
  };
  expect((await configureSessionLayout(db, sessionId, request)).ok).toBe(true);
  const saved = await current();
  expect(saved.exercises.map((e) => e.sets)).toEqual([3, 3, 3, 3]);
  expect(saved.exercises.slice(0, 3).map((e) => e.supersetId)).toEqual([groupId, groupId, groupId]);
  expect((await configureSessionLayout(db, sessionId, request)).ok).toBe(true);
  expect((await current()).revision).toBe(saved.revision);
  expect(
    await configureSessionLayout(db, sessionId, { ...request, id: crypto.randomUUID() }),
  ).toMatchObject({ ok: false, reason: "conflict" });
});
it("la base revierte la configuración completa si un grupo no es consecutivo", async () => {
  const before = await current();
  const layout = sessionLayout(before.exercises);
  [layout[1], layout[3]] = [layout[3], layout[1]];
  const response = await db.rpc("configure_session_layout", {
    p_session_id: sessionId,
    p_expected_revision: before.revision,
    p_request_id: crypto.randomUUID(),
    p_layout: layout,
  });
  expect(response.error).toBeTruthy();
  expect(await current()).toEqual(before);
});
it("no admite filas omitidas ni cambios de un alumno", async () => {
  const before = await current();
  const request = {
    id: crypto.randomUUID(),
    revision: before.revision,
    layout: sessionLayout(before.exercises),
  };
  expect(await configureSessionLayout(studentDb, sessionId, request)).toMatchObject({
    ok: false,
    reason: "forbidden",
  });
  expect(
    (
      await db.rpc("configure_session_layout", {
        p_session_id: sessionId,
        p_expected_revision: before.revision,
        p_request_id: crypto.randomUUID(),
        p_layout: request.layout.slice(0, 2),
      })
    ).error,
  ).toBeTruthy();
  expect(await current()).toEqual(before);
});
