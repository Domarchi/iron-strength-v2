import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getProgramTree, assignProgram } from "./programs";
import { copyProgramWeeks, getAssignmentPreview, assignReviewedProgram } from "./planning";
import { makeCopyInput } from "@/lib/coach/planning";
import { addDays, mondayOf, santiagoDate } from "@/domain/dates";
const admin = adminClient();
let db: AdminClient,
  studentDb: AdminClient,
  coachId: string,
  studentId: string,
  otherStudentId: string,
  programId: string;
let catalog: string[];
const monday = mondayOf(santiagoDate(new Date()));
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "planning@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "A",
    email: "planning-a@test.local",
    coachId: coach.id,
  });
  const other = await createProfileUser(admin, {
    role: "student",
    name: "B",
    email: "planning-b@test.local",
    coachId: coach.id,
  });
  coachId = coach.id;
  studentId = student.id;
  otherStudentId = other.id;
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  catalog = (await db.from("exercises").select("id").is("coach_id", null).limit(3)).data!.map(
    (e) => e.id,
  );
});
beforeEach(async () => {
  await admin.from("programs").delete().eq("coach_id", coachId);
  const p = await db
    .from("programs")
    .insert({ coach_id: coachId, name: "Base", weeks_count: 4 })
    .select("id")
    .single();
  programId = p.data!.id;
  const sessions = await db
    .from("program_sessions")
    .insert(
      [1, 2, 3].map((week_number) => ({
        program_id: programId,
        week_number,
        label: "A",
        title: `Semana ${week_number}`,
        weekday: 1,
      })),
    )
    .select("id,week_number");
  expect(sessions.error).toBeNull();
  for (const s of sessions.data!) {
    const group = randomUUID();
    const rows = await db
      .from("session_exercises")
      .insert(
        catalog.slice(0, 2).map((exercise_id, position) => ({
          program_session_id: s.id,
          exercise_id,
          position,
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          target_weight_kg: 50,
          note: `Nota ${s.week_number}`,
          rest_seconds: 90,
          superset_id: group,
          superset_rest_seconds: 120,
        })),
      )
      .select("id");
    expect(rows.error).toBeNull();
    expect(
      (
        await db.from("session_exercise_alternatives").insert({
          session_exercise_id: rows.data![0].id,
          exercise_id: catalog[2],
          position: 0,
          sets: 2,
          reps_min: 5,
          reps_max: 8,
          target_weight_kg: 20,
        })
      ).error,
    ).toBeNull();
  }
});
afterAll(() => resetUsers(admin));
const tree = async () => (await getProgramTree(db, programId))!;
it("copia varios destinos completos con grupos/alternativas independientes y confirma reintentos sin cambios", async () => {
  const before = await tree();
  const request = {
    id: randomUUID(),
    input: makeCopyInput(before, 1, [
      { week: 2, replace: true },
      { week: 3, replace: true },
    ]),
  };
  expect(await copyProgramWeeks(db, programId, request)).toEqual({ ok: true, sessions: 2 });
  const after = await tree();
  expect(after.sessions.find((s) => s.weekNumber === 1)).toEqual(
    before.sessions.find((s) => s.weekNumber === 1),
  );
  const source = after.sessions.find((s) => s.weekNumber === 1)!;
  const groups = new Set<string>();
  for (const week of [1, 2, 3]) {
    const s = after.sessions.find((s) => s.weekNumber === week)!;
    expect(s.title).toBe("Semana 1");
    expect(s.weekday).toBe(1);
    expect(
      s.exercises.map((e) => [
        e.exerciseId,
        e.sets,
        e.targetWeightKg,
        e.note,
        e.supersetRestSeconds,
      ]),
    ).toEqual(
      source.exercises.map((e) => [
        e.exerciseId,
        e.sets,
        e.targetWeightKg,
        e.note,
        e.supersetRestSeconds,
      ]),
    );
    groups.add(s.exercises[0].supersetId!);
    expect(s.exercises[0].alternatives).toMatchObject([
      { exerciseId: catalog[2], sets: 2, targetWeightKg: 20 },
    ]);
    if (week !== 1)
      expect(s.exercises[0].alternatives![0].id).not.toBe(source.exercises[0].alternatives![0].id);
  }
  expect(groups.size).toBe(3);
  expect(await copyProgramWeeks(db, programId, request)).toEqual({ ok: true, sessions: 2 });
  expect(await tree()).toEqual(after);
  expect(
    await copyProgramWeeks(db, programId, {
      ...request,
      input: { ...request.input, targets: [request.input.targets[0]] },
    }),
  ).toMatchObject({ ok: false, reason: "invalid" });
});
it("un destino no confirmado o una revisión cambiada deja todos intactos", async () => {
  const before = await tree();
  const input = makeCopyInput(before, 1, [
    { week: 2, replace: true },
    { week: 3, replace: false },
  ]);
  expect(await copyProgramWeeks(db, programId, { id: randomUUID(), input })).toEqual({
    ok: false,
    reason: "destination_not_empty",
  });
  expect(await tree()).toEqual(before);
  const stale = makeCopyInput(before, 1, [
    { week: 2, replace: true },
    { week: 3, replace: true },
  ]);
  const row = before.sessions.find((s) => s.weekNumber === 3)!.exercises[0];
  await db.from("session_exercises").update({ note: "Otra pestaña" }).eq("id", row.id);
  const current = await tree();
  expect(await copyProgramWeeks(db, programId, { id: randomUUID(), input: stale })).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(await tree()).toEqual(current);
});
it("detecta sesiones añadidas en un destino vacío y cambios del origen; permite copiar descarga explícita", async () => {
  const before = await tree();
  const input = makeCopyInput(before, 1, [
    { week: 2, replace: true },
    { week: 4, replace: false },
  ]);
  await db.from("program_sessions").insert({ program_id: programId, week_number: 4, label: "A" });
  const current = await tree();
  expect(await copyProgramWeeks(db, programId, { id: randomUUID(), input })).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(await tree()).toEqual(current);
  const stale = makeCopyInput(current, 1, [{ week: 2, replace: true }]);
  await db
    .from("session_exercises")
    .update({ sets: 4 })
    .eq("id", current.sessions[0].exercises[0].id);
  expect(await copyProgramWeeks(db, programId, { id: randomUUID(), input: stale })).toEqual({
    ok: false,
    reason: "conflict",
  });
  await db.from("program_sessions").delete().eq("program_id", programId).eq("week_number", 4);
  const now = await tree();
  expect(
    await copyProgramWeeks(db, programId, {
      id: randomUUID(),
      input: makeCopyInput(now, 4, [
        { week: 2, replace: true },
        { week: 3, replace: true },
      ]),
    }),
  ).toEqual({ ok: true, sessions: 0 });
  expect((await tree()).sessions.filter((s) => [2, 3].includes(s.weekNumber))).toHaveLength(0);
});
it("rechaza el lote completo si un destino es de semana vigente, también al llamar SQL", async () => {
  await admin
    .from("programs")
    .update({ student_id: studentId, start_date: monday, ends_on: addDays(monday, 27) })
    .eq("id", programId);
  const before = await tree();
  const request = {
    id: randomUUID(),
    input: makeCopyInput(before, 3, [
      { week: 2, replace: true },
      { week: 1, replace: true },
    ]),
  };
  expect(await copyProgramWeeks(db, programId, request)).toEqual({
    ok: false,
    reason: "week_locked",
  });
  expect(await tree()).toEqual(before);
});
it("alumno no copia ni asigna ni ve recibos privados", async () => {
  const input = makeCopyInput(await tree(), 1, [{ week: 2, replace: true }]);
  expect(await copyProgramWeeks(studentDb, programId, { id: randomUUID(), input })).toEqual({
    ok: false,
    reason: "forbidden",
  });
  const preview = await getAssignmentPreview(db, programId, studentId, monday);
  expect(
    await assignReviewedProgram(studentDb, programId, {
      id: randomUUID(),
      input: { studentId, startDate: monday, ...preview! },
    }),
  ).toEqual({ ok: false, reason: "forbidden" });
  expect((await studentDb.from("planning_mutations").select("id")).data).toEqual([]);
});
it("asigna una copia independiente una sola vez y otra pestaña debe revisar de nuevo", async () => {
  const source = await tree();
  const preview = await getAssignmentPreview(db, programId, studentId, monday);
  const request = { id: randomUUID(), input: { studentId, startDate: monday, ...preview! } };
  const first = await assignReviewedProgram(db, programId, request);
  expect(first.ok).toBe(true);
  if (!first.ok) throw new Error("asignación");
  expect(await assignReviewedProgram(db, programId, request)).toEqual(first);
  expect(await assignReviewedProgram(db, programId, { ...request, id: randomUUID() })).toEqual({
    ok: false,
    reason: "conflict",
  });
  const assigned = await getProgramTree(db, first.programId);
  expect(assigned!.studentId).toBe(studentId);
  expect(assigned!.sessions).toHaveLength(3);
  expect(assigned!.sessions[0].exercises[0].id).not.toBe(source.sessions[0].exercises[0].id);
  expect(assigned!.sessions[0].exercises[0].alternatives![0].id).not.toBe(
    source.sessions[0].exercises[0].alternatives![0].id,
  );
  expect(await tree()).toEqual(source);
  expect((await db.from("programs").select("id").eq("student_id", otherStudentId)).data).toEqual(
    [],
  );
});
it("la revisión de asignación detecta cambios del origen y conserva programas con entrenamientos", async () => {
  const preview = await getAssignmentPreview(db, programId, studentId, monday);
  const source = await tree();
  await db
    .from("session_exercises")
    .update({ note: "Cambio" })
    .eq("id", source.sessions[0].exercises[0].id);
  expect(
    await assignReviewedProgram(db, programId, {
      id: randomUUID(),
      input: { studentId, startDate: monday, ...preview! },
    }),
  ).toEqual({ ok: false, reason: "conflict" });
  const old = await assignProgram({ db, templateId: programId, studentId, startDate: monday });
  expect(old.ok).toBe(true);
  if (!old.ok) throw new Error("fixture");
  expect(
    (
      await admin.from("workouts").insert({
        id: randomUUID(),
        student_id: studentId,
        program_id: old.programId,
        started_at: new Date(Date.now() - 600000).toISOString(),
        finished_at: new Date(Date.now() - 540000).toISOString(),
        duration_seconds: 60,
      })
    ).error,
  ).toBeNull();
  const current = await getAssignmentPreview(db, programId, studentId, monday);
  const before = await getProgramTree(db, old.programId);
  expect(
    await assignReviewedProgram(db, programId, {
      id: randomUUID(),
      input: { studentId, startDate: monday, ...current! },
    }),
  ).toEqual({ ok: false, reason: "has_workouts" });
  expect(await getProgramTree(db, old.programId)).toEqual(before);
});

it("el coach puede asignarse una base revisada para entrenar", async () => {
  const preview = await getAssignmentPreview(db, programId, coachId, monday);
  const result = await assignReviewedProgram(db, programId, {
    id: randomUUID(),
    input: { studentId: coachId, startDate: monday, ...preview! },
  });
  expect(result.ok).toBe(true);
  if (result.ok) expect((await getProgramTree(db, result.programId))!.studentId).toBe(coachId);
});
