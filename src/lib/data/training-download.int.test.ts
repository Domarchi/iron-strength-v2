import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { trainingMetricCases } from "@/test/fixtures/training-metrics";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import { typedRecordingPayloadSchema } from "../mobile/typed-recording-contracts";
import { mutateTrainingLibrary, readTrainingLibrary } from "./typed-personal-library";
import { readTrainingDownload } from "./training-download";
import { saveTypedWorkoutRecording } from "./typed-recordings";
import { listTypedExerciseHistory } from "./typed-exercises";
import { mondayOf, santiagoDate } from "@/domain/dates";
import { downloadedAssignedContext } from "../offline/training-bundle";
const admin = adminClient(),
  people: { id: string; db: AdminClient }[] = [],
  exercises: string[] = [];
let coach: AdminClient, coachId: string;
const goals = trainingMetricCases.map((m) => ({
  recordType: m.recordType,
  sets: 2,
  target: {
    repsMin: m.reps === null ? null : 8,
    repsMax: m.reps === null ? null : 12,
    targetWeightKg: m.weightKg,
    targetDurationSeconds: m.durationSeconds,
    targetDistanceMeters: m.distanceMeters,
  },
  series: null,
}));
beforeAll(async () => {
  await resetUsers(admin);
  const c = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "coach@complete-download.test.local",
  });
  coachId = c.id;
  coach = await signedInClient(c.email, c.password);
  people.push({ id: c.id, db: coach });
  for (let i = 0; i < 3; i++) {
    const p = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: `student${i}@complete-download.test.local`,
      coachId,
    });
    people.push({ id: p.id, db: await signedInClient(p.email, p.password) });
  }
  for (const [i, m] of trainingMetricCases.entries()) {
    const id = randomUUID();
    expect(
      (
        await coach.from("exercises").insert({
          id,
          coach_id: coachId,
          name: `Descarga ${i}`,
          muscle_group: "Core",
          record_type: m.recordType,
        })
      ).error,
    ).toBeNull();
    exercises.push(id);
  }
  for (const [index, person] of people.entries()) {
    const group = randomUUID();
    await mutateTrainingLibrary(person.db, {
      version: 2,
      requestId: randomUUID(),
      targetId: randomUUID(),
      operation: "routine_create",
      expectedRevision: 0,
      data: {
        name: `Base propia ${index}`,
        folderId: null,
        items: goals.map((prescribed, i) => ({
          id: randomUUID(),
          exerciseId: exercises[i],
          prescribed,
          note: `Control ${i}`,
          restSeconds: 30,
          supersetId: i < 2 ? group : null,
          supersetRestSeconds: i < 2 ? 45 : null,
        })),
      },
    });
    const p = typedRecordingFixture();
    if (p.source !== "free") throw Error("fixture");
    p.id = randomUUID();
    p.workout.id = p.id;
    p.workout.startedAt = new Date().toISOString();
    p.workout.finishedAt = p.workout.startedAt;
    p.workout.durationSeconds = 0;
    p.structure.exercises = goals.map((prescribed, i) => ({
      id: randomUUID(),
      exerciseId: exercises[i],
      prescribedExerciseId: null,
      prescribed,
      note: "Objetivo",
      restSeconds: 30,
      supersetId: null,
      supersetRestSeconds: null,
    }));
    p.workout.exerciseNotes = p.structure.exercises.map((r) => ({
      sessionExerciseId: r.id,
      note: `Nota propia ${index}`,
    }));
    p.workout.sets = trainingMetricCases.map((metrics, i) => ({
      exerciseId: exercises[i],
      position: i,
      setNumber: 1,
      metrics,
      setType: i === 0 ? "warmup" : "working",
      effort: i === 0 ? null : 8.5,
    }));
    await saveTypedWorkoutRecording(person.db, typedRecordingPayloadSchema.parse(p));
  }
});
afterAll(async () => {
  if (people.length)
    expect(
      (
        await admin
          .from("workouts")
          .delete()
          .in(
            "student_id",
            people.map((p) => p.id),
          )
      ).error,
    ).toBeNull();
  if (coachId)
    expect((await admin.from("programs").delete().eq("coach_id", coachId)).error).toBeNull();
  await resetUsers(admin);
});
it("cuatro cuentas sin programa descargan biblioteca/catálogo/historial propios completos y no escriben", async () => {
  for (const [i, p] of people.entries()) {
    const before = await readTrainingLibrary(p.db),
      b = await readTrainingDownload(p.db, p.id);
    expect(b.userId).toBe(p.id);
    expect(b.week).toBeNull();
    expect(b.library).toEqual(before);
    expect(await readTrainingLibrary(p.db)).toEqual(before);
    expect(b.library.routines[0].name).toBe(`Base propia ${i}`);
    expect(b.library.routines[0].items.map((r) => r.prescribed)).toEqual(goals);
    for (const [n, id] of exercises.entries()) {
      expect(b.history[id].history.items).toHaveLength(1);
      expect(b.history[id].history.items[0].sets[0].metrics).toEqual(trainingMetricCases[n]);
      expect(b.history[id].history.items[0].exerciseNotes[0].note).toBe(`Nota propia ${i}`);
    }
  }
});
it("asignación vigente conserva nueve objetivos, alternativas, grupos, día elegido y referencia compatible", async () => {
  const template = randomUUID(),
    session = randomUUID(),
    group = randomUUID();
  expect(
    (
      await coach
        .from("programs")
        .insert({ id: template, coach_id: coachId, name: "Base mixta", weeks_count: 4 })
    ).error,
  ).toBeNull();
  expect(
    (
      await coach.from("program_sessions").insert({
        id: session,
        program_id: template,
        week_number: 1,
        label: "A",
        title: "Fuerza mixta",
        weekday: 1,
      })
    ).error,
  ).toBeNull();
  const rows = goals.map((typed_prescription, i) => ({
    id: randomUUID(),
    program_session_id: session,
    exercise_id: exercises[i],
    position: i,
    sets: 2,
    reps_min: null,
    reps_max: null,
    typed_prescription,
    note: `Control ${i}`,
    rest_seconds: 30,
    superset_id: i < 2 ? group : null,
    superset_rest_seconds: i < 2 ? 45 : null,
  }));
  expect((await coach.from("session_exercises").insert(rows)).error).toBeNull();
  expect(
    (
      await coach.from("session_exercise_alternatives").insert({
        session_exercise_id: rows[0].id,
        exercise_id: exercises[5],
        position: 0,
        sets: 2,
        reps_min: null,
        reps_max: null,
        typed_prescription: goals[5],
      })
    ).error,
  ).toBeNull();
  for (const p of people) {
    const assigned = await coach.rpc("assign_program", {
      p_template_id: template,
      p_student_id: p.id,
      p_start_date: mondayOf(santiagoDate(new Date())),
    });
    expect(assigned.error).toBeNull();
    const s = await p.db
      .from("program_sessions")
      .select("id")
      .eq("program_id", assigned.data!)
      .single();
    expect(s.error).toBeNull();
    expect(
      (
        await p.db
          .from("session_day_overrides")
          .insert({ session_id: s.data!.id, student_id: p.id, weekday: 4 })
      ).error,
    ).toBeNull();
    expect((await p.db.rpc("get_own_training_download")).error).toBeNull();
    const b = await readTrainingDownload(p.db, p.id),
      row = b.week!.sessions[0],
      c = row.context;
    expect(row.weekday).toBe(4);
    expect(c.exercises.map((r) => r.prescribed)).toEqual(goals);
    expect(c.exercises[0].supersetId).toBe(c.exercises[1].supersetId);
    expect(c.exercises[0].supersetId).not.toBe(group);
    expect(c.exercises[0].supersetRestSeconds).toBe(45);
    expect(c.exercises[0].lastMetrics).toBeNull(); // only warmup for this type
    expect(c.exercises[5].lastMetrics).toEqual(trainingMetricCases[5]);
    expect(c.exercises[0].alternatives[0].lastMetrics).toEqual(trainingMetricCases[5]);
    expect(c.previousSets.some((r) => r.recordType === "duration")).toBe(true);
    expect(downloadedAssignedContext(b, p.id, s.data!.id, santiagoDate(new Date()))).toEqual(c);
    expect(downloadedAssignedContext(b, p.id, s.data!.id, "2099-01-01")).toBeNull();
  }
});
it("archivo referenciado conserva objetivos/historial y no reaparece en el catálogo", async () => {
  const id = exercises[8];
  expect(
    (await coach.from("exercises").update({ archived_at: new Date().toISOString() }).eq("id", id))
      .error,
  ).toBeNull();
  try {
    const b = await readTrainingDownload(people[1].db, people[1].id);
    expect(b.catalog.exercises.some((e) => e.id === id)).toBe(false);
    expect(b.library.routines[0].items[8].exerciseId).toBe(id);
    expect(b.history[id].history.items).toHaveLength(1);
    expect(b.week!.sessions[0].context.exercises[8].prescribed).toEqual(goals[8]);
  } finally {
    expect(
      (await coach.from("exercises").update({ archived_at: null }).eq("id", id)).error,
    ).toBeNull();
  }
});
it("historial reciente coincide con lector online: diez entrenamientos completos, empate y cursor", async () => {
  const p = people[1],
    now = new Date().toISOString(),
    ids = Array.from({ length: 12 }, () => randomUUID());
  expect(
    (
      await admin.from("workouts").insert(
        ids.map((id) => ({
          id,
          student_id: p.id,
          started_at: now,
          finished_at: now,
          duration_seconds: 0,
        })),
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await admin.from("workout_sets").insert(
        ids.flatMap((workout_id) =>
          [1, 2].map((set_number) => ({
            workout_id,
            student_id: p.id,
            exercise_id: exercises[0],
            exercise_name: "Anterior",
            position: 0,
            set_number,
            weight_kg: 20,
            reps: 8,
            is_warmup: set_number === 1,
          })),
        ),
      )
    ).error,
  ).toBeNull();
  const b = await readTrainingDownload(p.db, p.id),
    online = await listTypedExerciseHistory(p.db, p.id, exercises[0]);
  expect(b.history[exercises[0]].history).toEqual(online);
  expect(online.items).toHaveLength(10);
  expect(online.items.every((w) => w.sets.length === 2)).toBe(true);
  expect(online.nextCursor).not.toBeNull();
});
it("anon/inactivo no descargan y no acepta un propietario ajeno, incluso siendo coach", async () => {
  await expect(readTrainingDownload(anonClient(), people[1].id)).rejects.toMatchObject({
    code: "unauthorized",
  });
  await expect(readTrainingDownload(coach, people[1].id)).rejects.toMatchObject({
    code: "incompatible",
  });
  const p = people[3];
  expect(
    (await admin.from("profiles").update({ is_active: false }).eq("id", p.id)).error,
  ).toBeNull();
  try {
    await expect(readTrainingDownload(p.db, p.id)).rejects.toMatchObject({ code: "unauthorized" });
  } finally {
    expect(
      (await admin.from("profiles").update({ is_active: true }).eq("id", p.id)).error,
    ).toBeNull();
  }
});
