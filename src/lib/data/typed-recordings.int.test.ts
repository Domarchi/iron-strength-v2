import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  anonClient,
  type AdminClient,
} from "../../test/int/helpers";
import { typedRecordingFixture } from "../../test/fixtures/typed-recording";
import { trainingMetricCases } from "../../test/fixtures/training-metrics";
import { typedRecordingPayloadSchema } from "../mobile/typed-recording-contracts";
import { saveTypedWorkoutRecording, getTypedWorkoutDetail } from "./typed-recordings";
import { listWorkouts } from "./workouts";
import { getWorkoutResult } from "./workout-result";
import { mutatePersonalLibrary } from "./personal-library";
import { mondayOf, santiagoDate } from "../../domain/dates";
import type { Database } from "../../types/database";
import { recordingFixture } from "../../test/fixtures/workout-recording";
import { personalWorkoutPayloadSchema } from "../mobile/personal-workout-contracts";
const admin = adminClient();
describe("persistencia de métricas y notas, sin datos inventados", () => {
  let coach: AdminClient,
    students: AdminClient[],
    people: string[],
    exerciseIds: string[],
    coachId: string;
  beforeAll(async () => {
    await resetUsers(admin);
    const c = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@typed.test.local",
    });
    coach = await signedInClient(c.email, c.password);
    coachId = c.id;
    students = [];
    people = [];
    for (let i = 0; i < 3; i++) {
      const p = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `student${i}@typed.test.local`,
        coachId: c.id,
      });
      people.push(p.id);
      students.push(await signedInClient(p.email, p.password));
    }
    const result = await admin
      .from("exercises")
      .insert(
        trainingMetricCases.map((m, i) => ({
          name: `Métrica ${i}`,
          muscle_group: "Pecho" as const,
          record_type: m.recordType,
        })),
      )
      .select("id,name");
    if (result.error) throw result.error;
    exerciseIds = trainingMetricCases.map(
      (_, i) => result.data.find((e) => e.name === `Métrica ${i}`)!.id,
    );
  });
  afterAll(async () => {
    await resetUsers(admin);
    if (exerciseIds?.length) await admin.from("exercises").delete().in("id", exerciseIds);
  });
  function payload(index = 0) {
    const p = typedRecordingFixture();
    if (p.source !== "free") throw Error("fixture");
    p.id = randomUUID();
    p.workout.id = p.id;
    p.workout.startedAt = new Date(Date.now() - 600000).toISOString();
    p.workout.finishedAt = new Date().toISOString();
    p.workout.durationSeconds = 600;
    const m = trainingMetricCases[index];
    p.structure.exercises.forEach((r, i) => {
      r.id = randomUUID();
      r.exerciseId = exerciseIds[i ? 0 : index];
      if (!i)
        r.prescribed = {
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
        };
    });
    p.workout.exerciseNotes = p.structure.exercises.map((r, i) => ({
      sessionExerciseId: r.id,
      note: i ? "Nota propia sin series" : "💪".repeat(500),
    }));
    p.workout.sets = [
      {
        ...p.workout.sets[0],
        exerciseId: exerciseIds[index],
        metrics: m,
        setType: "failure",
        effort: 8.5,
      },
    ];
    return typedRecordingPayloadSchema.parse(p);
  }
  for (let index = 0; index < trainingMetricCases.length; index++)
    it(`cierre y lectura del tipo ${trainingMetricCases[index].recordType ?? "legado explícito"}`, async () => {
      const p = payload(index),
        before = structuredClone(p);
      const results = await Promise.all([
        saveTypedWorkoutRecording(students[0], p),
        saveTypedWorkoutRecording(students[0], p),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual(["created", "duplicate"]);
      const own = await getTypedWorkoutDetail(students[0], p.id, people[0]);
      expect(own?.workout.structure).toEqual(p.structure);
      expect(own?.workout.exercises).toHaveLength(2);
      expect(own?.workout.exercises[0].sets[0]).toMatchObject({
        metrics: p.workout.sets[0].metrics,
        setType: "failure",
        effort: 8.5,
      });
      expect(own?.workout.exercises[1]).toMatchObject({
        athleteNote: "Nota propia sin series",
        sets: [],
      });
      expect(own?.workout.summary.recordedSeconds).toBe(
        p.workout.sets[0].metrics.durationSeconds ?? 0,
      );
      expect((await getTypedWorkoutDetail(coach, p.id))?.workout).toEqual(own?.workout);
      for (const db of students.slice(1)) expect(await getTypedWorkoutDetail(db, p.id)).toBeNull();
      expect(await getWorkoutResult(students[0], p.id)).toEqual({
        kind: "typed",
        studentId: people[0],
        workout: own!.workout,
      });
      expect(await getWorkoutResult(coach, p.id)).toEqual({
        kind: "typed",
        studentId: people[0],
        workout: own!.workout,
      });
      for (const db of [...students.slice(1), anonClient()])
        expect(await getWorkoutResult(db, p.id)).toBeNull();
      const stored = await students[0]
        .from("workout_sets")
        .select("weight_kg,reps,duration_seconds,distance_meters,record_type,effort,set_type")
        .eq("workout_id", p.id)
        .single();
      expect(stored.error).toBeNull();
      expect(stored.data).toMatchObject({
        weight_kg: mValue(p, "weightKg"),
        reps: mValue(p, "reps"),
        duration_seconds: mValue(p, "durationSeconds"),
        distance_meters: mValue(p, "distanceMeters"),
        effort: 8.5,
        set_type: "failure",
      });
      expect(p).toEqual(before);
    });
  function mValue(
    p: ReturnType<typeof payload>,
    key: "weightKg" | "reps" | "durationSeconds" | "distanceMeters",
  ) {
    return p.workout.sets[0].metrics[key];
  }
  it("conflicto y tombstone no reescriben el resultado ni lo recrean", async () => {
    const p = payload(7);
    await saveTypedWorkoutRecording(students[0], p);
    const changed = structuredClone(p);
    changed.workout.sets[0].effort = 9;
    await expect(saveTypedWorkoutRecording(students[0], changed)).rejects.toMatchObject({
      code: "23505",
    });
    const removed = await students[0].from("workouts").delete().eq("id", p.id);
    expect(removed.error).toBeNull();
    expect((await saveTypedWorkoutRecording(students[0], p)).status).toBe("removed");
    expect(await getTypedWorkoutDetail(students[0], p.id)).toBeNull();
  });
  it("trabajo y calentamiento conservan la serie y suman métricas por separado", async () => {
    for (const setType of ["working", "warmup"] as const) {
      const p = payload(5);
      p.workout.sets[0].setType = setType;
      p.workout.sets[0].effort = null;
      await saveTypedWorkoutRecording(students[0], p);
      const got = (await getTypedWorkoutDetail(students[0], p.id))!;
      expect(got.workout.exercises[0].sets[0]).toMatchObject({
        setType,
        effort: null,
        metrics: { durationSeconds: 60, reps: null },
      });
      expect(got.workout.summary).toMatchObject({
        workingSets: setType === "warmup" ? 0 : 1,
        recordedSeconds: setType === "warmup" ? 0 : 60,
        volumeKg: 0,
      });
    }
  });
  it("no recicla el tombstone de un cierre personal anterior", async () => {
    const old = personalWorkoutPayloadSchema.parse(recordingFixture("free").workout);
    old.id = randomUUID();
    old.sets.forEach((s) => {
      s.exerciseId = exerciseIds[0];
    });
    const saved = await students[0].rpc("save_personal_workout", { p_workout: old });
    expect(saved.error).toBeNull();
    expect(await getWorkoutResult(students[0], old.id)).toMatchObject({
      kind: "legacy",
      studentId: people[0],
      workout: { id: old.id },
    });
    const removed = await students[0].from("workouts").delete().eq("id", old.id);
    expect(removed.error).toBeNull();
    const p = payload();
    p.id = old.id;
    p.workout.id = old.id;
    await expect(saveTypedWorkoutRecording(students[0], p)).rejects.toMatchObject({
      code: "23505",
    });
    expect(await getTypedWorkoutDetail(students[0], old.id)).toBeNull();
  });
  it("valida DML directo y un replay no revierte ediciones válidas", async () => {
    const p = payload(5);
    await saveTypedWorkoutRecording(students[0], p);
    const before = (await getTypedWorkoutDetail(students[0], p.id))!;
    const id = before.workout.exercises[0].sets[0].id;
    for (const change of [
      { reps: 1 },
      { duration_seconds: 1.5 },
      { effort: 8.1 },
      { is_warmup: true },
      { record_type: "weight_reps", weight_kg: 30, reps: 8, duration_seconds: null },
    ]) {
      const bad = await students[0].from("workout_sets").update(change).eq("id", id);
      expect(bad.error?.code).toBe("23514");
    }
    const edited = await students[0]
      .from("workout_sets")
      .update({ duration_seconds: 65 })
      .eq("id", id)
      .select("id");
    expect(edited.error).toBeNull();
    expect(edited.data).toHaveLength(1);
    const notes = p.workout.exerciseNotes.map((n, i) => ({
      ...n,
      note: i ? n.note : "Actualizada",
    }));
    const changed = await students[0]
      .from("workouts")
      .update({ exercise_notes: notes })
      .eq("id", p.id)
      .select("id");
    expect(changed.error).toBeNull();
    expect(changed.data).toHaveLength(1);
    expect((await saveTypedWorkoutRecording(students[0], p)).status).toBe("duplicate");
    const after = (await getTypedWorkoutDetail(students[0], p.id))!;
    expect(after.workout.exercises[0].sets[0].metrics.durationSeconds).toBe(65);
    expect(after.workout.exercises[0].athleteNote).toBe("Actualizada");
    const wrong = await students[0]
      .from("workouts")
      .update({ exercise_notes: [{ sessionExerciseId: randomUUID(), note: null }] })
      .eq("id", p.id);
    expect(wrong.error?.code).toBe("23514");
  });
  it("SQL no redondea un peso inválido antes de validar", async () => {
    const p = payload(1);
    await saveTypedWorkoutRecording(students[0], p);
    const bad = await students[0]
      .from("workout_sets")
      .update({ weight_kg: 1.001 })
      .eq("workout_id", p.id);
    expect(bad.error?.code).toBe("23514");
    expect(
      (await getTypedWorkoutDetail(students[0], p.id))?.workout.exercises[0].sets[0].metrics
        .weightKg,
    ).toBe(30);
  });
  it("el coach entrena por sí mismo y el historial resume segundos sin reps ficticias", async () => {
    const p = payload(6);
    await saveTypedWorkoutRecording(coach, p);
    expect(
      (await coach.from("workouts").select("student_id").eq("id", p.id).single()).data?.student_id,
    ).toBe(coachId);
    const history = await listWorkouts(coach, coachId);
    expect(history.items.find((w) => w.id === p.id)).toMatchObject({
      workingSets: 1,
      volumeKg: 0,
      bodyweightReps: 0,
      recordedSeconds: 60,
      distanceMeters: 0,
    });
  });
  it("base personal eliminada conserva origen/nota/resultado y reintenta sin recrearla", async () => {
    const base = randomUUID();
    await mutatePersonalLibrary(students[0], {
      version: 1,
      requestId: randomUUID(),
      targetId: base,
      operation: "routine_create",
      expectedRevision: 0,
      data: { name: "Base", folderId: null, items: [] },
    });
    const found = await students[0]
      .from("personal_routines")
      .select("revision")
      .eq("id", base)
      .single();
    if (found.error) throw found.error;
    const free = payload(7),
      p = typedRecordingPayloadSchema.parse({
        ...free,
        source: "personal",
        workout: {
          ...free.workout,
          origin: { kind: "personal", routineId: base, revision: found.data.revision },
        },
      });
    await saveTypedWorkoutRecording(students[0], p);
    const removed = await students[0].from("personal_routines").delete().eq("id", base);
    expect(removed.error).toBeNull();
    expect((await saveTypedWorkoutRecording(students[0], p)).status).toBe("duplicate");
    expect((await getTypedWorkoutDetail(students[0], p.id))?.workout).toMatchObject({
      sourceKind: "personal",
      personalRoutineId: null,
      personalRoutineRevision: found.data.revision,
      structure: p.structure,
    });
  });
  it("asignadas comparan fuente y alternativa completas en SQL", async () => {
    const p = typedRecordingFixture("assigned");
    if (p.source !== "assigned") throw Error("fixture");
    const monday = mondayOf(santiagoDate(new Date())),
      program = randomUUID(),
      session = randomUUID();
    const created = await admin.from("programs").insert({
      id: program,
      coach_id: coachId,
      student_id: people[0],
      name: "Programa",
      weeks_count: 2,
      start_date: monday,
      ends_on: new Date(new Date(monday + "T12:00:00Z").getTime() + 13 * 86400000)
        .toISOString()
        .slice(0, 10),
    });
    if (created.error) throw created.error;
    const sess = await admin
      .from("program_sessions")
      .insert({ id: session, program_id: program, week_number: 1, label: "A" });
    if (sess.error) throw sess.error;
    p.id = randomUUID();
    p.workout.id = p.id;
    p.workout.programId = program;
    p.workout.programSessionId = session;
    p.workout.startedAt = monday + "T15:00:00Z";
    p.workout.finishedAt = monday + "T15:30:00Z";
    const rows: Database["public"]["Tables"]["session_exercises"]["Insert"][] = [];
    for (const [i, r] of p.structure.exercises.entries()) {
      r.id = randomUUID();
      r.exerciseId = exerciseIds[i];
      r.prescribedExerciseId = exerciseIds[i];
      r.prescribed.recordType = trainingMetricCases[i].recordType;
      rows.push({
        id: r.id,
        program_session_id: session,
        exercise_id: r.exerciseId,
        position: i,
        sets: 2,
        reps_min: 8,
        reps_max: 12,
        target_weight_kg: 30,
        note: r.note,
        rest_seconds: r.restSeconds,
        superset_id: r.supersetId,
        superset_rest_seconds: r.supersetRestSeconds,
      });
      Object.assign(p.workout.sets[i], {
        exerciseId: r.exerciseId,
        sessionExerciseId: r.id,
        prescribedExerciseId: r.exerciseId,
      });
      p.workout.sets[i].metrics.recordType = r.prescribed.recordType;
    }
    const inserted = await admin.from("session_exercises").insert(rows);
    if (inserted.error) throw inserted.error;
    p.workout.exerciseNotes = p.structure.exercises.map((r) => ({
      sessionExerciseId: r.id,
      note: "Propia",
    }));
    const alt = await admin.from("session_exercise_alternatives").insert({
      session_exercise_id: p.structure.exercises[0].id,
      exercise_id: exerciseIds[3],
      position: 0,
      sets: 1,
      reps_min: 10,
      reps_max: 10,
      target_weight_kg: 10,
    });
    if (alt.error) throw alt.error;
    p.structure.exercises[0].exerciseId = exerciseIds[3];
    p.structure.exercises[0].prescribed = {
      recordType: "weighted_bodyweight",
      sets: 1,
      target: {
        repsMin: 10,
        repsMax: 10,
        targetWeightKg: 10,
        targetDurationSeconds: null,
        targetDistanceMeters: null,
      },
      series: null,
    };
    p.workout.sets[0].exerciseId = exerciseIds[3];
    p.workout.sets[0].metrics = { ...trainingMetricCases[3] };
    await saveTypedWorkoutRecording(students[0], p);
    expect((await getTypedWorkoutDetail(students[0], p.id))?.workout.exercises[0]).toMatchObject({
      name: "Métrica 3",
      prescribedExerciseName: "Métrica 0",
      athleteNote: "Propia",
    });
    const bad = structuredClone(p);
    bad.id = randomUUID();
    bad.workout.id = bad.id;
    bad.structure.exercises[0].prescribed.target.targetWeightKg = 20;
    await expect(saveTypedWorkoutRecording(students[0], bad)).rejects.toMatchObject({
      code: "40001",
    });
    expect((await students[0].from("workouts").select("id").eq("id", bad.id)).data).toEqual([]);
  });
  it("SQL también rechaza JSON incompleto y revierte cabecera/series/recibo", async () => {
    const p = payload(5),
      bad = {
        ...p,
        workout: {
          ...p.workout,
          sets: [{ ...p.workout.sets[0], metrics: { ...p.workout.sets[0].metrics, reps: 1 } }],
        },
      };
    const result = await students[0].rpc("save_typed_workout_recording", { p_recording: bad });
    expect(result.error?.code).toBe("22023");
    expect((await students[0].from("workouts").select("id").eq("id", p.id)).data).toEqual([]);
    expect(
      (
        await students[0]
          .from("workout_recording_receipts")
          .select("workout_id")
          .eq("workout_id", p.id)
      ).data,
    ).toEqual([]);
    await expect(saveTypedWorkoutRecording(anonClient(), p)).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("una sesión con perfil inactivo conserva la barrera de acceso", async () => {
    const p = payload(5);
    await saveTypedWorkoutRecording(students[2], p);
    const inactive = await admin.from("profiles").update({ is_active: false }).eq("id", people[2]);
    expect(inactive.error).toBeNull();
    await expect(saveTypedWorkoutRecording(students[2], payload(5))).rejects.toMatchObject({
      code: "42501",
    });
    expect(await getTypedWorkoutDetail(students[2], p.id)).toBeNull();
  });
});
