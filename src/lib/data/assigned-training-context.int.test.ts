import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addDays, mondayOf, santiagoDate } from "@/domain/dates";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import { RECORD_TYPES } from "@/domain/training-metrics";
import { trainingMetricCases } from "@/test/fixtures/training-metrics";
import { getAssignedTrainingContext } from "./assigned-training-context";
import { saveTypedWorkoutRecording } from "./typed-recordings";
import { createTypedDraft, buildTypedRecording } from "../../../mobile/src/lib/typed-training";
const admin = adminClient(),
  kinds = [null, ...RECORD_TYPES],
  exerciseIds = kinds.map(() => randomUUID()),
  templateId = randomUUID(),
  sessionId = randomUUID(),
  groupId = randomUUID();
let coach: AdminClient, coachId: string, inactive: AdminClient;
const people: { id: string; db: AdminClient; sessionId: string; programId: string }[] = [];
beforeAll(async () => {
  await resetUsers(admin);
  const c = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "assigned-context-coach@test.local",
  });
  coachId = c.id;
  coach = await signedInClient(c.email, c.password);
  const accounts = [{ id: coachId, db: coach }];
  for (let i = 0; i < 3; i++) {
    const p = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: `assigned-context-${i}@test.local`,
      coachId,
    });
    accounts.push({ id: p.id, db: await signedInClient(p.email, p.password) });
  }
  const d = await createProfileUser(admin, {
    role: "student",
    name: "Inactivo",
    email: "assigned-context-inactive@test.local",
    coachId,
    isActive: false,
  });
  inactive = await signedInClient(d.email, d.password);
  expect(
    (
      await coach.from("exercises").insert(
        kinds.map((kind, i) => ({
          id: exerciseIds[i],
          coach_id: coachId,
          name: `Asignado ${i}`,
          muscle_group: "Core",
          record_type: kind,
        })),
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await coach
        .from("programs")
        .insert({ id: templateId, coach_id: coachId, name: "Mixta", weeks_count: 2 })
    ).error,
  ).toBeNull();
  expect(
    (
      await coach.from("program_sessions").insert({
        id: sessionId,
        program_id: templateId,
        week_number: 1,
        label: "A",
        title: "Mixta A",
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await coach.from("session_exercises").insert(
        kinds.map((kind, i) => {
          const p = parsePrescriptionInput(defaultPrescriptionInput(kind));
          return {
            id: randomUUID(),
            program_session_id: sessionId,
            exercise_id: exerciseIds[i],
            position: i,
            sets: p.sets,
            reps_min: null,
            reps_max: null,
            typed_prescription: p,
            note: `Indicación ${i}`,
            rest_seconds: 30,
            superset_id: i < 2 ? groupId : null,
            superset_rest_seconds: i < 2 ? 45 : null,
          };
        }),
      )
    ).error,
  ).toBeNull();
  const first = await coach
    .from("session_exercises")
    .select("id")
    .eq("program_session_id", sessionId)
    .eq("position", 0)
    .single();
  expect(first.error).toBeNull();
  const alternate = parsePrescriptionInput(defaultPrescriptionInput("duration"));
  expect(
    (
      await coach.from("session_exercise_alternatives").insert({
        session_exercise_id: first.data!.id,
        exercise_id: exerciseIds[5],
        position: 0,
        sets: alternate.sets,
        reps_min: null,
        reps_max: null,
        typed_prescription: alternate,
      })
    ).error,
  ).toBeNull();
  for (const a of accounts) {
    const assigned = await coach.rpc("assign_program", {
      p_template_id: templateId,
      p_student_id: a.id,
      p_start_date: mondayOf(santiagoDate(new Date())),
    });
    expect(assigned.error).toBeNull();
    const s = await a.db
      .from("program_sessions")
      .select("id")
      .eq("program_id", assigned.data!)
      .single();
    expect(s.error).toBeNull();
    people.push({ ...a, programId: assigned.data!, sessionId: s.data!.id });
  }
});
afterAll(async () => {
  await admin.from("programs").delete().eq("coach_id", coachId);
  await resetUsers(admin);
});
it("tres alumnos y coach propio leen nueve objetivos, grupos, alternativas y revisión reales", async () => {
  for (const person of people) {
    const read = await getAssignedTrainingContext(person.db, person.id, person.sessionId);
    expect(read.ok).toBe(true);
    if (!read.ok) throw Error("context");
    expect(read.canStart).toBe(true);
    const c = read.context;
    expect(c.userId).toBe(person.id);
    expect(c.version).toBe(5);
    expect(c.origin).toEqual({
      kind: "assigned",
      programId: person.programId,
      programSessionId: person.sessionId,
    });
    const source = await person.db
      .from("program_sessions")
      .select("revision")
      .eq("id", person.sessionId)
      .single();
    expect(c.session.revision).toBe(source.data!.revision);
    expect(c.exercises.map((e) => e.prescribed.recordType)).toEqual(kinds);
    expect(c.exercises[0].supersetId).toBe(c.exercises[1].supersetId);
    expect(c.exercises[0].alternatives[0].prescribed.recordType).toBe("duration");
    expect(c.exercises.map((e) => e.note)).toEqual(kinds.map((_, i) => `Indicación ${i}`));
  }
});
it("no usa el permiso de revisión del coach para entrenar como otro alumno ni expone plantillas", async () => {
  const a = people[1],
    b = people[2];
  for (const [db, userId, session] of [
    [coach, coachId, a.sessionId],
    [coach, a.id, a.sessionId],
    [a.db, a.id, b.sessionId],
    [inactive, a.id, a.sessionId],
    [anonClient(), a.id, a.sessionId],
    [a.db, a.id, sessionId],
  ] as const)
    expect(await getAssignedTrainingContext(db, userId, session)).toEqual({
      ok: false,
      reason: "not_found",
    });
});
it("distingue nueva sesión, recuperación pasada y semana futura sin cambiar la fuente", async () => {
  const a = people[1],
    today = mondayOf(santiagoDate(new Date()));
  expect(
    await getAssignedTrainingContext(a.db, a.id, a.sessionId, addDays(today, -7), true),
  ).toEqual({ ok: false, reason: "not_current_week" });
  expect(await getAssignedTrainingContext(a.db, a.id, a.sessionId, addDays(today, 7))).toEqual({
    ok: false,
    reason: "not_current_week",
  });
  const recovered = await getAssignedTrainingContext(
    a.db,
    a.id,
    a.sessionId,
    addDays(today, 7),
    true,
  );
  expect(recovered).toMatchObject({
    ok: true,
    canStart: false,
    context: { session: { weekNumber: 1 } },
  });
});
it("el contexto real cierra los nueve contratos una sola vez y el historial no mezcla cuentas ni tipos", async () => {
  const a = people[1],
    read = await getAssignedTrainingContext(a.db, a.id, a.sessionId);
  if (!read.ok) throw Error("context");
  const now = new Date(),
    draft = createTypedDraft({ context: read.context, userId: a.id, workoutId: randomUUID(), now });
  for (const [i, row] of draft.exercises.entries()) {
    const m = trainingMetricCases[i];
    row.sets[0] = {
      ...row.sets[0],
      weight: m.weightKg === null ? "" : String(m.weightKg),
      reps: m.reps === null ? "" : String(m.reps),
      duration: m.durationSeconds === null ? "" : String(m.durationSeconds),
      distance: m.distanceMeters === null ? "" : String(m.distanceMeters),
      effort: "8,5",
      done: true,
    };
    row.athleteNote = `Nota ${i}`;
  }
  draft.exercises[0].sets.unshift({
    ...draft.exercises[0].sets[0],
    id: randomUUID(),
    weight: "10",
    reps: "12",
    setType: "warmup",
    effort: "2",
    done: true,
  });
  const built = buildTypedRecording(read.context, draft, new Date());
  if (!built.ok) throw Error("payload");
  expect(await saveTypedWorkoutRecording(a.db, built.payload)).toMatchObject({
    status: "created",
  });
  expect(await saveTypedWorkoutRecording(a.db, built.payload)).toMatchObject({
    status: "duplicate",
  });
  const after = await getAssignedTrainingContext(a.db, a.id, a.sessionId);
  if (!after.ok) throw Error("context after");
  for (const [i, row] of after.context.exercises.entries())
    expect(row.lastMetrics).toEqual(trainingMetricCases[i]);
  expect(after.context.previousSets).toHaveLength(kinds.length);
  const reference = after.context.previousSets.find((p) => p.recordType === null)!;
  expect(reference.sets.map((s) => s.setType)).toEqual(["warmup", "working"]);
  expect(reference.sets.map((s) => s.weightKg)).toEqual([10, 30]);
  expect(reference.sets.map((s) => s.effort)).toEqual([2, 8.5]);
  const other = people[2],
    unrelated = await getAssignedTrainingContext(other.db, other.id, other.sessionId);
  if (!unrelated.ok) throw Error("other");
  expect(unrelated.context.exercises.every((e) => e.lastMetrics === null)).toBe(true);
});
