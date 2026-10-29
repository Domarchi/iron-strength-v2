import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, it, expect } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import { trainingMetricCases } from "@/test/fixtures/training-metrics";
import {
  typedRecordingPayloadSchema,
  typedWorkoutStructureSchema,
} from "../mobile/typed-recording-contracts";
import { saveTypedWorkoutRecording } from "./typed-recordings";
import { readVisibleTrainingHistory } from "./training-history";
import { getHistoryExport } from "./export";
import { getWeeklySummary } from "./weekly-summary";
import { getTrainingWorkoutRecordCount } from "./training-review";
import { syncAchievements, listAchievements } from "./achievements";
import { mutatePersonalExercise } from "./personal-exercises";
const admin = adminClient();
let coach: AdminClient, coachId: string;
const owners: string[] = [],
  students: AdminClient[] = [],
  exerciseIds: string[] = [],
  workoutIds: string[] = [];
beforeAll(async () => {
  await resetUsers(admin);
  const c = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "coach@visible-history.test.local",
  });
  coachId = c.id;
  coach = await signedInClient(c.email, c.password);
  owners.push(c.id);
  for (let i = 0; i < 3; i++) {
    const p = await createProfileUser(admin, {
      role: "student",
      name: `Alumno ${i}`,
      email: `student${i}@visible-history.test.local`,
      coachId,
    });
    owners.push(p.id);
    students.push(await signedInClient(p.email, p.password));
  }
  const nonce = randomUUID();
  for (const [i, m] of trainingMetricCases.entries()) {
    const id = randomUUID(),
      result = await admin.from("exercises").insert({
        id,
        name: `Visible metric ${i} ${nonce}`,
        muscle_group: "Core",
        record_type: m.recordType,
      });
    if (result.error) throw result.error;
    exerciseIds.push(id);
  }
  for (const [i, db] of [coach, ...students].entries()) {
    const p = typedRecordingFixture();
    if (p.source !== "free") throw Error("fixture");
    p.id = randomUUID();
    p.workout.id = p.id;
    p.workout.title = "Historial visible";
    p.workout.perceivedEffort = 8;
    p.workout.note = "=SUM(1;2)";
    p.structure.exercises = Array.from({ length: 10 }, (_, position) => {
      const m = trainingMetricCases[position % 9];
      return {
        id: randomUUID(),
        exerciseId: exerciseIds[position % 9],
        prescribedExerciseId: null,
        note: "Objetivo",
        restSeconds: 60,
        supersetId: null,
        supersetRestSeconds: null,
        prescribed: {
          recordType: m.recordType,
          sets: 2,
          series: null,
          target: {
            repsMin: m.reps === null ? null : 8,
            repsMax: m.reps === null ? null : 12,
            targetWeightKg: m.weightKg,
            targetDurationSeconds: m.durationSeconds,
            targetDistanceMeters: m.distanceMeters,
          },
        },
      };
    });
    p.workout.exerciseNotes = p.structure.exercises.map((r, n) => ({
      sessionExerciseId: r.id,
      note: n === 9 ? "Nota sin series" : n === 0 ? "💪".repeat(500) : null,
    }));
    p.workout.sets = trainingMetricCases.map((m, n) => ({
      exerciseId: exerciseIds[n],
      position: n,
      setNumber: 1,
      metrics: m,
      setType: n === 0 ? "drop" : n === 1 ? "warmup" : n === 2 ? "failure" : "working",
      effort: n === 1 ? null : 8.5,
    }));
    await saveTypedWorkoutRecording(db, typedRecordingPayloadSchema.parse(p));
    workoutIds[i] = p.id;
  }
});
afterAll(async () => {
  if (owners.length) {
    const removed = await admin.from("workouts").delete().in("student_id", owners);
    if (removed.error) throw removed.error;
  }
  await resetUsers(admin);
  if (exerciseIds.length) {
    const removed = await admin.from("exercises").delete().in("id", exerciseIds);
    if (removed.error) throw removed.error;
  }
});
it("coach y tres alumnos consultan/ exportan solo su historial completo", async () => {
  for (const [i, db] of [coach, ...students].entries()) {
    const source = await readVisibleTrainingHistory(db, owners[i]);
    expect(source?.workouts.map((w) => w.id)).toEqual([workoutIds[i]]);
    expect(source?.workouts[0].sets.map((s) => s.metrics)).toEqual(trainingMetricCases);
    expect(source?.workouts[0].exerciseNotes?.[0].note).toBe("💪".repeat(500));
    const csv = await getHistoryExport(db, owners[i]);
    if (!csv.ok) throw Error("historial propio ausente");
    expect(csv.rows).toHaveLength(10);
    expect(csv.rows.at(-1)).toMatchObject({
      rowKind: "exercise_note",
      setNumber: null,
      weightKg: null,
      reps: null,
      durationSeconds: null,
      distanceMeters: null,
      exerciseNote: "Nota sin series",
    });
  }
  for (const db of students)
    for (const owner of owners)
      if (owner !== owners[students.indexOf(db) + 1])
        expect(await readVisibleTrainingHistory(db, owner)).toBeNull();
});
it("coach obtiene las mismas métricas, notas y CSV que el alumno autorizado", async () => {
  for (const [i, db] of students.entries()) {
    const own = await readVisibleTrainingHistory(db, owners[i + 1]);
    expect(await readVisibleTrainingHistory(coach, owners[i + 1])).toEqual(own);
    expect(await getHistoryExport(coach, owners[i + 1])).toEqual(
      await getHistoryExport(db, owners[i + 1]),
    );
  }
});
it("resumen tipado y récords conservan dimensiones y permisos para cuatro dueños", async () => {
  for (const [i, db] of [coach, ...students].entries()) {
    const source = await readVisibleTrainingHistory(db, owners[i]);
    const w = source!.workouts[0];
    const summary = await getWeeklySummary(db, owners[i], w.date);
    expect(summary.current).toMatchObject({
      workoutCount: 1,
      workingSets: 8,
      volumeKg: 320,
      bodyweightReps: 24,
      recordedSeconds: 420,
      distanceMeters: 1030.5,
      durationSeconds: w.durationSeconds,
      workoutIds: [w.id],
      records: 0,
      sessions: null,
    });
    expect(await getTrainingWorkoutRecordCount(db, owners[i], w.id)).toBe(0);
    expect(await getWeeklySummary(coach, owners[i], w.date)).toEqual(summary);
  }
  expect((await getWeeklySummary(students[0], owners[2], "2026-10-29")).current.workoutCount).toBe(
    0,
  );
  expect(await getTrainingWorkoutRecordCount(students[0], owners[2], workoutIds[2])).toBe(0);
});
it("un récord de tiempo real otorga first_record una vez sin proyectar repeticiones", async () => {
  const db = students[0],
    source = await readVisibleTrainingHistory(db, owners[1]),
    previous = source!.workouts[0];
  expect(await syncAchievements({ db, studentId: owners[1], workoutId: previous.id })).toContain(
    "first_workout",
  );
  const p = typedRecordingFixture();
  if (p.source !== "free") throw Error("fixture");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date(Date.parse(previous.startedAt) + 86400000).toISOString();
  p.workout.finishedAt = new Date(Date.parse(p.workout.startedAt) + 1800000).toISOString();
  p.structure.exercises = [
    { ...typedWorkoutStructureSchema.parse(previous.structure).exercises[5] },
  ];
  p.workout.exerciseNotes = p.structure.exercises.map((r) => ({
    sessionExerciseId: r.id,
    note: null,
  }));
  p.workout.sets = [
    {
      exerciseId: exerciseIds[5],
      position: 0,
      setNumber: 1,
      metrics: {
        recordType: "duration",
        weightKg: null,
        reps: null,
        durationSeconds: 90,
        distanceMeters: null,
      },
      setType: "working",
      effort: 8,
    },
  ];
  try {
    await saveTypedWorkoutRecording(db, typedRecordingPayloadSchema.parse(p));
    expect(await getTrainingWorkoutRecordCount(db, owners[1], p.id)).toBe(1);
    expect(await syncAchievements({ db, studentId: owners[1], workoutId: p.id })).toEqual([
      "first_record",
    ]);
    expect(await syncAchievements({ db, studentId: owners[1], workoutId: p.id })).toEqual([]);
    expect(
      (await listAchievements(coach, owners[1])).filter((a) => a.kind === "first_record"),
    ).toHaveLength(1);
    expect(
      (await readVisibleTrainingHistory(db, owners[1]))!.workouts.find((w) => w.id === p.id)!
        .sets[0].metrics,
    ).toMatchObject({ recordType: "duration", durationSeconds: 90, reps: null, weightKg: null });
  } finally {
    const cleanup = await admin.from("workouts").delete().eq("id", p.id);
    if (cleanup.error) throw cleanup.error;
  }
});
it("no cambia nombres históricos por metadatos actuales o invisibles", async () => {
  const before = await readVisibleTrainingHistory(students[0], owners[1]);
  const historic = before!.workouts[0].sets[0].name;
  const renamed = await admin
    .from("exercises")
    .update({ name: "Nombre actual modificado", archived_at: new Date().toISOString() })
    .eq("id", exerciseIds[0]);
  if (renamed.error) throw renamed.error;
  try {
    const source = await readVisibleTrainingHistory(students[0], owners[1]),
      set = source!.workouts[0].sets[0];
    expect(set.name).toBe(historic);
    expect(set.muscleGroup).toBeNull();
    const csv = await getHistoryExport(coach, owners[1]);
    if (!csv.ok) throw Error("historial ausente");
    expect(csv.rows[0].exerciseName).toBe(historic);
    expect(csv.rows.at(-1)).toMatchObject({
      exerciseName: "Ejercicio no disponible",
      exerciseNote: "Nota sin series",
    });
  } finally {
    const restored = await admin
      .from("exercises")
      .update({ archived_at: null })
      .eq("id", exerciseIds[0]);
    if (restored.error) throw restored.error;
  }
});
it("revisa un ejercicio personal sin ampliar su catálogo privado", async () => {
  const targetId = randomUUID();
  await mutatePersonalExercise(students[0], {
    version: 1,
    requestId: randomUUID(),
    targetId,
    expectedRevision: 0,
    operation: "create",
    data: {
      name: "Privado para revisión",
      muscleGroup: "Espalda",
      equipment: null,
      isBodyweight: false,
      progressionIncrementKg: 2.5,
      recordType: "duration",
    },
  });
  const p = typedRecordingFixture();
  if (p.source !== "free") throw Error("fixture");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.structure.exercises = p.structure.exercises.map((r) => ({
    ...r,
    exerciseId: targetId,
    prescribed: {
      recordType: "duration",
      sets: 2,
      series: null,
      target: {
        repsMin: null,
        repsMax: null,
        targetWeightKg: null,
        targetDurationSeconds: 60,
        targetDistanceMeters: null,
      },
    },
  }));
  p.workout.exerciseNotes = p.structure.exercises.map((r, i) => ({
    sessionExerciseId: r.id,
    note: i ? "Nota privada sin series" : null,
  }));
  p.workout.sets = [
    {
      exerciseId: targetId,
      position: 0,
      setNumber: 1,
      metrics: {
        recordType: "duration",
        weightKg: null,
        reps: null,
        durationSeconds: 60,
        distanceMeters: null,
      },
      setType: "working",
      effort: 7.5,
    },
  ];
  await saveTypedWorkoutRecording(students[0], p);
  const source = await readVisibleTrainingHistory(coach, owners[1]),
    workout = source!.workouts.find((w) => w.id === p.id)!;
  expect(workout.sets[0]).toMatchObject({
    name: "Privado para revisión",
    muscleGroup: null,
    metrics: { durationSeconds: 60, reps: null },
  });
  expect(workout.exerciseNames).toEqual([]);
  const hidden = await coach.from("exercises").select("id").eq("id", targetId);
  expect(hidden.error).toBeNull();
  expect(hidden.data).toEqual([]);
  const exported = await getHistoryExport(coach, owners[1]);
  if (!exported.ok) throw Error("historial ausente");
  expect(
    exported.rows.find((r) => r.workoutId === p.id && r.rowKind === "exercise_note"),
  ).toMatchObject({
    exerciseId: targetId,
    exerciseName: "Ejercicio no disponible",
    exerciseNote: "Nota privada sin series",
    durationSeconds: null,
  });
});
it("supera1000encabezados/series por RPC y CSV sin perder una fila", async () => {
  const ids = Array.from({ length: 1001 }, () => randomUUID());
  for (let from = 0; from < ids.length; from += 250) {
    const batch = ids.slice(from, from + 250);
    const headers = await admin.from("workouts").insert(
      batch.map((id) => ({
        id,
        student_id: owners[2],
        started_at: "2026-10-01T15:00:00Z",
        finished_at: "2026-10-01T16:00:00Z",
        duration_seconds: 3600,
      })),
    );
    if (headers.error) throw headers.error;
    const sets = await admin.from("workout_sets").insert(
      batch.map((id) => ({
        workout_id: id,
        student_id: owners[2],
        exercise_id: exerciseIds[0],
        exercise_name: "Histórico completo",
        position: 0,
        set_number: 1,
        weight_kg: 30,
        reps: 8,
      })),
    );
    if (sets.error) throw sets.error;
  }
  const source = await readVisibleTrainingHistory(coach, owners[2]);
  expect(source!.workouts).toHaveLength(1002);
  expect(source!.workouts.flatMap((w) => w.sets)).toHaveLength(1010);
  expect(new Set(source!.workouts.map((w) => w.id))).toEqual(new Set([workoutIds[2], ...ids]));
  const exported = await getHistoryExport(students[1], owners[2]);
  if (!exported.ok) throw Error("historial ausente");
  expect(exported.rows).toHaveLength(1011);
});
it("anónimo/inactivo no reciben un snapshot vacío exitoso ni filtran la existencia de otro perfil", async () => {
  await expect(readVisibleTrainingHistory(anonClient(), owners[1])).rejects.toMatchObject({
    code: "unauthorized",
  });
  const inactive = await admin.from("profiles").update({ is_active: false }).eq("id", owners[3]);
  if (inactive.error) throw inactive.error;
  await expect(readVisibleTrainingHistory(students[2], owners[3])).rejects.toMatchObject({
    code: "unauthorized",
  });
  expect(await readVisibleTrainingHistory(coach, owners[3])).not.toBeNull();
  expect(await getHistoryExport(students[0], randomUUID())).toEqual({
    ok: false,
    reason: "not_found",
  });
});
