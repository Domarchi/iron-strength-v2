import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addDays, mondayOf, santiagoDate } from "@/domain/dates";
import {
  assignProgram,
  copyWeek,
  duplicateProgram,
  duplicateRoutineItem,
  getProgramTree,
  saveSessionPrescriptions,
} from "./programs";
import { getWeekView } from "./week";
import { moveSessionDay } from "./session-schedule";
const admin = adminClient();
let db: AdminClient, student: AdminClient, other: AdminClient;
let studentId: string, otherId: string, programId: string, sessionId: string, assignedId: string;
const today = santiagoDate(new Date()),
  monday = mondayOf(today);
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "schedule-coach@test.local",
  });
  const a = await createProfileUser(admin, {
    role: "student",
    name: "A",
    email: "schedule-a@test.local",
    coachId: coach.id,
  });
  const b = await createProfileUser(admin, {
    role: "student",
    name: "B",
    email: "schedule-b@test.local",
    coachId: coach.id,
  });
  db = await signedInClient(coach.email, coach.password);
  student = await signedInClient(a.email, a.password);
  studentId = a.id;
  other = await signedInClient(b.email, b.password);
  otherId = b.id;
  programId = (
    await db
      .from("programs")
      .insert({ coach_id: coach.id, name: "Calendario", weeks_count: 2 })
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
});
afterAll(() => resetUsers(admin));
it("día y título atómicos, conflicto y reintento; todas las copias conservan el día", async () => {
  const session = (await getProgramTree(db, programId))!.sessions[0];
  const request = {
    db,
    sessionId,
    rows: [],
    expectedRevision: session.revision,
    requestId: crypto.randomUUID(),
    title: "Fuerza",
    weekday: 2,
  };
  const saved = await saveSessionPrescriptions(request);
  expect(saved.ok).toBe(true);
  expect(await saveSessionPrescriptions(request)).toEqual(saved);
  expect((await getProgramTree(db, programId))!.sessions[0]).toMatchObject({
    title: "Fuerza",
    weekday: 2,
  });
  expect(
    await saveSessionPrescriptions({ ...request, requestId: crypto.randomUUID(), weekday: 4 }),
  ).toMatchObject({ ok: false, reason: "conflict" });
  expect((await copyWeek({ db, programId, fromWeek: 1, toWeek: 2 })).ok).toBe(true);
  const copyId = crypto.randomUUID();
  expect((await duplicateRoutineItem({ db, sessionId, copyId })).ok).toBe(true);
  const fullId = crypto.randomUUID();
  expect(
    (await duplicateProgram({ db, sourceId: programId, copyId: fullId, name: "Copia" })).ok,
  ).toBe(true);
  expect((await getProgramTree(db, fullId))!.sessions.every((s) => s.weekday === 2)).toBe(true);
  const assigned = await assignProgram({ db, templateId: programId, studentId, startDate: monday });
  expect(assigned.ok).toBe(true);
  if (!assigned.ok) throw Error("assignment");
  assignedId = assigned.programId;
  expect((await getProgramTree(db, assignedId))!.sessions.every((s) => s.weekday === 2)).toBe(true);
});
it("alumno mueve solo su semana, sin cambiar rutina, revisión o cumplimiento", async () => {
  const tree = (await getProgramTree(db, assignedId))!;
  const current = tree.sessions.find((s) => s.weekNumber === 1)!;
  const future = tree.sessions.find((s) => s.weekNumber === 2)!;
  const before = await getWeekView(student, studentId, today);
  expect(await moveSessionDay(student, studentId, current.id, 6)).toEqual({ ok: true });
  expect(await moveSessionDay(student, studentId, current.id, 6)).toEqual({ ok: true });
  const view = await getWeekView(student, studentId, today);
  expect(view.kind).toBe("active");
  if (view.kind !== "active" || before.kind !== "active") throw Error("view");
  expect(view.sessions.find((s) => s.sessionId === current.id)).toMatchObject({
    weekday: 2,
    overrideWeekday: 6,
    scheduledOn: addDays(monday, 6),
  });
  expect(view.compliance).toEqual(before.compliance);
  expect((await getProgramTree(db, assignedId))!.sessions).toEqual(tree.sessions);
  expect((await moveSessionDay(other, otherId, current.id, 1)).ok).toBe(false);
  expect((await moveSessionDay(student, studentId, future.id, 1)).ok).toBe(false);
  expect((await moveSessionDay(student, studentId, current.id, 7)).ok).toBe(false);
  expect(await moveSessionDay(student, studentId, current.id, null)).toEqual({ ok: true });
  const restored = await getWeekView(student, studentId, today);
  if (restored.kind !== "active") throw Error("view");
  expect(restored.sessions.find((s) => s.sessionId === current.id)?.scheduledOn).toBe(
    addDays(monday, 2),
  );
});
