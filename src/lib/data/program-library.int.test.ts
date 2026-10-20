import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import {
  duplicateProgram,
  getProgramTree,
  listTemplates,
  saveSessionPrescriptions,
} from "./programs";
import { mondayOf, santiagoDate } from "@/domain/dates";
const admin = adminClient();
let db: AdminClient, studentDb: AdminClient;
let coachId: string, studentId: string, programId: string, sessionId: string, alternativeId: string;
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "library-coach@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "library-student@test.local",
    coachId: coach.id,
  });
  coachId = coach.id;
  studentId = student.id;
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  programId = (
    await db
      .from("programs")
      .insert({ coach_id: coachId, name: "Fuerza básica", weeks_count: 2 })
      .select("id")
      .single()
  ).data!.id;
  sessionId = (
    await db
      .from("program_sessions")
      .insert({ program_id: programId, label: "A", week_number: 1 })
      .select("id")
      .single()
  ).data!.id;
  const catalog = (await db.from("exercises").select("id").is("coach_id", null).limit(3)).data!;
  alternativeId = catalog[2].id;
  const group = crypto.randomUUID();
  const rows = await db
    .from("session_exercises")
    .insert(
      catalog.slice(0, 2).map((e, i) => ({
        program_session_id: sessionId,
        exercise_id: e.id,
        position: i,
        sets: i + 2,
        reps_min: 8,
        reps_max: 12,
        note: "Conservar",
        rest_seconds: 45,
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
        exercise_id: alternativeId,
        position: 0,
        sets: 2,
        reps_min: 6,
        reps_max: 10,
      })
    ).error,
  ).toBeNull();
});
afterAll(() => resetUsers(admin));
it("guarda título con revisión y recupera respuesta perdida sin duplicar la mutación", async () => {
  const session = (await getProgramTree(db, programId))!.sessions[0];
  const request = {
    db,
    sessionId,
    expectedRevision: session.revision,
    requestId: crypto.randomUUID(),
    rows: [],
    title: "Tren superior",
  };
  const saved = await saveSessionPrescriptions(request);
  expect(saved.ok).toBe(true);
  expect(await saveSessionPrescriptions(request)).toEqual(saved);
  const current = (await getProgramTree(db, programId))!.sessions[0];
  expect(current.title).toBe("Tren superior");
  expect(current.label).toBe("A");
  expect(
    await saveSessionPrescriptions({
      ...request,
      requestId: crypto.randomUUID(),
      title: "Otra pestaña",
    }),
  ).toMatchObject({ ok: false, reason: "conflict" });
});
it("duplica programa completo con identidad independiente, sin asignación ni registros", async () => {
  const source = (await getProgramTree(db, programId))!;
  const copyId = crypto.randomUUID();
  const request = { db, sourceId: programId, copyId, name: "Fuerza para otro alumno" };
  expect(await duplicateProgram(request)).toEqual({ ok: true, id: copyId });
  const copy = (await getProgramTree(db, copyId))!;
  expect(copy).toMatchObject({
    studentId: null,
    startDate: null,
    endsOn: null,
    weeksCount: 2,
    name: request.name,
  });
  expect(copy.sessions[0]).toMatchObject({ title: "Tren superior", label: "A" });
  expect(copy.sessions[0].id).not.toBe(source.sessions[0].id);
  const normalize = (e: (typeof source.sessions)[0]["exercises"][number]) => ({
    ...e,
    id: "",
    supersetId: "group",
    alternatives: e.alternatives?.map((a) => ({ ...a, id: "" })),
  });
  expect(copy.sessions[0].exercises.map(normalize)).toEqual(
    source.sessions[0].exercises.map(normalize),
  );
  expect(copy.sessions[0].exercises[0].supersetId).not.toBe(
    source.sessions[0].exercises[0].supersetId,
  );
  expect(await duplicateProgram(request)).toEqual({ ok: true, id: copyId });
  expect(await getProgramTree(db, copyId)).toEqual(copy);
  expect(await duplicateProgram({ ...request, name: "Otro contenido" })).toMatchObject({
    ok: false,
    reason: "invalid",
  });
  expect((await listTemplates(db)).find((p) => p.id === copyId)).toMatchObject({
    sessionCount: 1,
    exerciseCount: 2,
    totalSets: 5,
  });
  expect((await admin.from("workouts").select("id").eq("program_id", copyId)).data).toEqual([]);
  expect(
    await duplicateProgram({
      db: studentDb,
      sourceId: programId,
      copyId: crypto.randomUUID(),
      name: "Ajeno",
    }),
  ).toMatchObject({ ok: false, reason: "forbidden" });
});
it("título viaja al copiar semana, duplicar sesión y asignar; semana actual sigue bloqueada", async () => {
  expect(
    (await db.rpc("copy_program_week", { p_program_id: programId, p_from: 1, p_to: 2 })).error,
  ).toBeNull();
  const duplicate = crypto.randomUUID();
  expect(
    (await db.rpc("duplicate_routine_item", { p_session_id: sessionId, p_copy_id: duplicate }))
      .error,
  ).toBeNull();
  expect(
    (await getProgramTree(db, programId))!.sessions.every((s) => s.title === "Tren superior"),
  ).toBe(true);
  const assignment = await db.rpc("assign_program", {
    p_template_id: programId,
    p_student_id: studentId,
    p_start_date: mondayOf(santiagoDate(new Date())),
  });
  expect(assignment.error).toBeNull();
  const assigned = (await getProgramTree(db, assignment.data!))!;
  expect(assigned.sessions.every((s) => s.title === "Tren superior")).toBe(true);
  const current = assigned.sessions.find((s) => s.weekNumber === 1)!;
  expect(
    await saveSessionPrescriptions({
      db,
      sessionId: current.id,
      expectedRevision: current.revision,
      requestId: crypto.randomUUID(),
      rows: [],
      title: "Bloqueado",
    }),
  ).toMatchObject({ ok: false, reason: "week_locked" });
  expect(
    (
      await duplicateProgram({
        db,
        sourceId: assigned.id,
        copyId: crypto.randomUUID(),
        name: "Plantilla desde asignado",
      })
    ).ok,
  ).toBe(true);
});
it("un fallo conserva título y prescripciones; una alternativa archivada revierte la copia completa", async () => {
  const source = (await getProgramTree(db, programId))!;
  const session = source.sessions[0];
  const before = session.title;
  expect(
    await saveSessionPrescriptions({
      db,
      sessionId: session.id,
      expectedRevision: session.revision,
      requestId: crypto.randomUUID(),
      title: "No guardar",
      rows: [{ ...session.exercises[0], repsMin: 0 }],
    }),
  ).toMatchObject({ ok: false, reason: "invalid" });
  expect((await getProgramTree(db, programId))!.sessions[0].title).toBe(before);
  expect(
    (
      await admin
        .from("exercises")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", alternativeId)
    ).error,
  ).toBeNull();
  const copyId = crypto.randomUUID();
  try {
    expect(
      await duplicateProgram({ db, sourceId: programId, copyId, name: "Fallida" }),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect((await admin.from("programs").select("id").eq("id", copyId)).data).toEqual([]);
    expect((await db.from("program_copy_receipts").select("id").eq("id", copyId)).data).toEqual([]);
  } finally {
    await admin.from("exercises").update({ archived_at: null }).eq("id", alternativeId);
  }
});
