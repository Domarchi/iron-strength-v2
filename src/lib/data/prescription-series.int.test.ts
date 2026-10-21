import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import {
  getProgramTree,
  saveSessionPrescriptions,
  duplicateRoutineItem,
  duplicateProgram,
  copyWeek,
  assignProgram,
} from "./programs";
import { configureAlternatives } from "./routine-alternatives";
import { copyProgramWeeks } from "./planning";
import { makeCopyInput } from "@/lib/coach/planning";
import { getWorkoutContext } from "./workout-context";
import { mondayOf, santiagoDate } from "@/domain/dates";
const admin = adminClient();
let db: AdminClient,
  studentDb: AdminClient,
  coachId: string,
  studentId: string,
  programId: string,
  sessionId: string,
  ids: string[];
const series = [
  { repsMin: 6, repsMax: 8, targetWeightKg: 75 },
  { repsMin: 8, repsMax: 10, targetWeightKg: 70 },
  { repsMin: 10, repsMax: 12, targetWeightKg: null },
];
const altSeries = [
  { repsMin: 6, repsMax: 8, targetWeightKg: 20 },
  { repsMin: 10, repsMax: 12, targetWeightKg: 15 },
];
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "series-coach@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "series-student@test.local",
    coachId: coach.id,
  });
  coachId = coach.id;
  studentId = student.id;
  db = await signedInClient(coach.email, coach.password);
  studentDb = await signedInClient(student.email, student.password);
  ids = (await db.from("exercises").select("id").is("coach_id", null).limit(3)).data!.map(
    (e) => e.id,
  );
});
beforeEach(async () => {
  await admin.from("programs").delete().eq("coach_id", coachId);
  programId = (
    await db
      .from("programs")
      .insert({ coach_id: coachId, name: "Series", weeks_count: 4 })
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
  const group = randomUUID();
  expect(
    (
      await db.from("session_exercises").insert(
        ids.slice(0, 2).map((exercise_id, position) => ({
          program_session_id: sessionId,
          exercise_id,
          position,
          sets: 3,
          reps_min: 6,
          reps_max: 12,
          target_weight_kg: null,
          superset_id: group,
          superset_rest_seconds: 120,
        })),
      )
    ).error,
  ).toBeNull();
  let s = (await tree()).sessions[0];
  const row = s.exercises[0];
  expect(
    (
      await saveSessionPrescriptions({
        db,
        sessionId,
        requestId: randomUUID(),
        expectedRevision: s.revision,
        rows: [
          {
            id: row.id,
            exerciseId: row.exerciseId,
            sets: 3,
            repsMin: 6,
            repsMax: 12,
            targetWeightKg: null,
            note: "Conservar",
            series,
          },
        ],
      })
    ).ok,
  ).toBe(true);
  s = (await tree()).sessions[0];
  expect(
    (
      await configureAlternatives(db, sessionId, {
        id: randomUUID(),
        revision: s.revision,
        exerciseRowId: row.id,
        alternatives: [
          {
            exerciseId: ids[2],
            sets: 2,
            repsMin: 6,
            repsMax: 12,
            targetWeightKg: null,
            series: altSeries,
          },
        ],
      })
    ).ok,
  ).toBe(true);
});
afterAll(() => resetUsers(admin));
const tree = async () => (await getProgramTree(db, programId))!;
it("conserva detalle y alternativas al leer y rechaza SQL inválido sin tocar la fila", async () => {
  const before = await tree(),
    row = before.sessions[0].exercises[0];
  expect(row.series).toEqual(series);
  expect(row.alternatives![0].series).toEqual(altSeries);
  for (const value of [
    [],
    series.slice(0, 2),
    [{ ...series[0], targetWeightKg: 501 }, ...series.slice(1)],
    [{ ...series[0], targetWeightKg: 1.001 }, ...series.slice(1)],
    [{ ...series[0], repsMin: 9 }, ...series.slice(1)],
  ]) {
    const result = await db
      .from("session_exercises")
      .update({ prescription_sets: value })
      .eq("id", row.id);
    expect(result.error?.code).toBe("23514");
    expect(await tree()).toEqual(before);
  }
});
it("todas las copias y asignaciones conservan listas por valor e identidades independientes", async () => {
  const initial = await tree(),
    source = initial.sessions[0].exercises[0];
  const item = await duplicateRoutineItem({
    db,
    sessionId,
    exerciseId: source.id,
    copyId: randomUUID(),
  });
  expect(item.ok).toBe(true);
  let current = await tree();
  const single = current.sessions[0].exercises.find((e) => item.ok && e.id === item.id)!;
  expect(single.series).toEqual(series);
  expect(single.supersetId).toBeNull();
  expect(single.alternatives![0].series).toEqual(altSeries);
  expect((await duplicateRoutineItem({ db, sessionId, copyId: randomUUID() })).ok).toBe(true);
  expect((await copyWeek({ db, programId, fromWeek: 1, toWeek: 2, replace: false })).ok).toBe(true);
  current = await tree();
  expect(
    (
      await copyProgramWeeks(db, programId, {
        id: randomUUID(),
        input: makeCopyInput(current, 1, [
          { week: 3, replace: false },
          { week: 4, replace: false },
        ]),
      })
    ).ok,
  ).toBe(true);
  current = await tree();
  for (const s of current.sessions) {
    expect(s.exercises[0].series).toEqual(series);
    expect(s.exercises[0].alternatives![0].series).toEqual(altSeries);
  }
  const clone = await duplicateProgram({
    db,
    sourceId: programId,
    copyId: randomUUID(),
    name: "Independiente",
  });
  expect(clone.ok).toBe(true);
  if (!clone.ok) throw new Error("copia");
  const copied = (await getProgramTree(db, clone.id))!;
  expect(copied.sessions).toHaveLength(current.sessions.length);
  expect(copied.sessions[0].exercises[0].series).toEqual(series);
  expect(copied.sessions[0].exercises[0].id).not.toBe(source.id);
  const assigned = await assignProgram({
    db,
    templateId: clone.id,
    studentId,
    startDate: mondayOf(santiagoDate(new Date())),
  });
  expect(assigned.ok).toBe(true);
  if (!assigned.ok) throw new Error("asignación");
  const active = (await getProgramTree(db, assigned.programId))!;
  expect(active.sessions[0].exercises[0].series).toEqual(series);
  expect(active.sessions[0].exercises[0].alternatives![0].series).toEqual(altSeries);
  const old = (await tree()).sessions[0].exercises[0];
  expect(old).toEqual(source);
});
it("parches y conflictos mantienen los objetivos no elegidos; redimensionar replica la última", async () => {
  let s = (await tree()).sessions[0],
    row = s.exercises[0];
  await db.from("session_exercises").update({ note: "Nota remota" }).eq("id", row.id);
  s = (await tree()).sessions[0];
  row = s.exercises[0];
  const args = {
    db,
    sessionId,
    requestId: randomUUID(),
    expectedRevision: s.revision,
    rows: [
      {
        id: row.id,
        exerciseId: row.exerciseId,
        sets: 5,
        repsMin: 6,
        repsMax: 12,
        targetWeightKg: null,
        note: "Antigua",
        fields: ["sets"],
      },
    ],
  };
  expect((await saveSessionPrescriptions(args)).ok).toBe(true);
  let saved = (await tree()).sessions[0].exercises[0];
  expect(saved.series).toEqual([...series, series[2], series[2]]);
  expect(saved.note).toBe("Nota remota");
  expect((await saveSessionPrescriptions(args)).ok).toBe(true);
  s = (await tree()).sessions[0];
  expect(
    (
      await saveSessionPrescriptions({
        ...args,
        requestId: randomUUID(),
        expectedRevision: s.revision,
        rows: [
          { ...args.rows[0], sets: 5, repsMin: 4, repsMax: 6, fields: ["repsMin", "repsMax"] },
        ],
      })
    ).ok,
  ).toBe(true);
  saved = (await tree()).sessions[0].exercises[0];
  expect(saved.series!.map((t) => [t.repsMin, t.repsMax, t.targetWeightKg])).toEqual([
    [4, 6, 75],
    [4, 6, 70],
    [4, 6, null],
    [4, 6, null],
    [4, 6, null],
  ]);
});
it("payloads uniformes antiguos confirman el mismo recibo sin añadir series:null", async () => {
  let s = (await tree()).sessions[0];
  const row = s.exercises[1];
  const args = {
    db,
    sessionId,
    requestId: randomUUID(),
    expectedRevision: s.revision,
    rows: [
      {
        id: row.id,
        exerciseId: row.exerciseId,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        targetWeightKg: 50,
        note: null,
      },
    ],
  };
  expect((await saveSessionPrescriptions(args)).ok).toBe(true);
  const receipt = await db
    .from("routine_mutations")
    .select("payload")
    .eq("id", args.requestId)
    .single();
  expect(JSON.stringify(receipt.data!.payload)).not.toContain('"series"');
  s = (await tree()).sessions[0];
  expect((await saveSessionPrescriptions(args)).ok).toBe(true);
  expect((await tree()).sessions[0].revision).toBe(s.revision);
  const alt = {
    id: randomUUID(),
    revision: s.revision,
    exerciseRowId: row.id,
    alternatives: [{ exerciseId: ids[2], sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: 25 }],
  };
  expect((await configureAlternatives(db, sessionId, alt)).ok).toBe(true);
  const payload = (await db.from("routine_mutations").select("payload").eq("id", alt.id).single())
    .data!.payload;
  expect(JSON.stringify(payload)).not.toContain('"series"');
  expect((await configureAlternatives(db, sessionId, alt)).ok).toBe(true);
});
it("la lectura de entrenamiento conserva objetivos, suprime solo sugerencia variable y protege semana vigente", async () => {
  const assigned = await assignProgram({
    db,
    templateId: programId,
    studentId,
    startDate: mondayOf(santiagoDate(new Date())),
  });
  expect(assigned.ok).toBe(true);
  if (!assigned.ok) throw new Error("asignación");
  const active = (await getProgramTree(db, assigned.programId))!,
    s = active.sessions[0],
    row = s.exercises[0];
  const workoutId = randomUUID();
  expect(
    (
      await admin.from("workouts").insert({
        id: workoutId,
        student_id: studentId,
        started_at: new Date(Date.now() - 3600000).toISOString(),
        finished_at: new Date(Date.now() - 3540000).toISOString(),
        duration_seconds: 60,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("workout_sets").insert(
        [1, 2, 3].map((set_number) => ({
          workout_id: workoutId,
          student_id: studentId,
          exercise_id: row.exerciseId,
          exercise_name: row.name,
          position: 0,
          set_number,
          weight_kg: 75,
          reps: 12,
          is_warmup: false,
        })),
      )
    ).error,
  ).toBeNull();
  const context = await getWorkoutContext(studentDb, studentId, s.id);
  expect(context.ok).toBe(true);
  if (!context.ok) throw new Error("contexto");
  expect(context.context.exercises[0].prescribed.series).toEqual(series);
  expect(context.context.exercises[0].last).not.toBeNull();
  expect(context.context.exercises[0].suggestion).toBeNull();
  expect(context.context.exercises[0].alternatives![0].prescribed.series).toEqual(altSeries);
  const denied = await db
    .from("session_exercises")
    .update({ prescription_sets: [{ ...series[0], targetWeightKg: 60 }, ...series.slice(1)] })
    .eq("id", row.id);
  expect(denied.error?.code).toBe("55000");
  const studentWrite = await studentDb
    .from("session_exercises")
    .update({ prescription_sets: null })
    .eq("id", row.id)
    .select("id");
  expect(studentWrite.data ?? []).toEqual([]);
  expect((await getProgramTree(db, assigned.programId))!.sessions[0].exercises[0].series).toEqual(
    series,
  );
});
