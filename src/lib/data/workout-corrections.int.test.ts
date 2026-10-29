import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { trainingMetricCases } from "@/test/fixtures/training-metrics";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import { recordingFixture } from "@/test/fixtures/workout-recording";
import { typedRecordingPayloadSchema } from "@/lib/mobile/typed-recording-contracts";
import {
  workoutCorrectionSchema,
  type WorkoutCorrectionSnapshot,
} from "@/lib/mobile/workout-correction-contracts";
import { saveTypedWorkoutRecording, getTypedWorkoutDetail } from "./typed-recordings";
import { saveWorkoutRecording } from "./save-workout-recording";
import { correctOwnWorkout, readOwnWorkoutCorrection } from "./workout-corrections";
const admin = adminClient();
describe("correcciones completas de resultados propios", () => {
  let coach: AdminClient,
    coachId: string,
    people: string[],
    students: AdminClient[],
    exerciseIds: string[];
  beforeAll(async () => {
    await resetUsers(admin);
    const c = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@corrections.test.local",
    });
    coachId = c.id;
    coach = await signedInClient(c.email, c.password);
    people = [];
    students = [];
    for (let i = 0; i < 3; i++) {
      const person = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `student${i}@corrections.test.local`,
        coachId,
      });
      people.push(person.id);
      students.push(await signedInClient(person.email, person.password));
    }
    const result = await admin
      .from("exercises")
      .insert(
        trainingMetricCases.map((m, i) => ({
          name: `Corrección tipo ${i}`,
          muscle_group: "Core" as const,
          record_type: m.recordType,
        })),
      )
      .select("id,name");
    if (result.error) throw result.error;
    exerciseIds = trainingMetricCases.map(
      (_, i) => result.data.find((r) => r.name === `Corrección tipo ${i}`)!.id,
    );
  });
  afterAll(async () => {
    await resetUsers(admin);
    if (exerciseIds?.length) {
      const r = await admin.from("exercises").delete().in("id", exerciseIds);
      if (r.error) throw r.error;
    }
  });
  function payload(index = 0) {
    const p = typedRecordingFixture("free");
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
      note: i ? "Nota sin series" : "Nota original",
    }));
    p.workout.sets = [
      {
        ...p.workout.sets[0],
        exerciseId: exerciseIds[index],
        metrics: m,
        setType: "working",
        effort: 7.5,
      },
    ];
    return typedRecordingPayloadSchema.parse(p);
  }
  function correction(base: WorkoutCorrectionSnapshot) {
    return workoutCorrectionSchema.parse({
      version: 1,
      requestId: randomUUID(),
      workoutId: base.workout.id,
      expectedRevision: base.workout.revision,
      perceivedEffort: 8,
      note: "💪".repeat(500),
      exerciseNotes:
        base.workout.exerciseNotes?.map((r) => ({ ...r, note: "Nota corregida" })) ?? null,
      sets: base.workout.sets.map((s) => ({
        id: s.id,
        metrics: {
          ...s.metrics,
          weightKg: s.metrics.weightKg === null ? null : s.metrics.weightKg + 2.5,
          reps: s.metrics.reps === null ? null : s.metrics.reps + 1,
          durationSeconds:
            s.metrics.durationSeconds === null ? null : s.metrics.durationSeconds + 15,
          distanceMeters: s.metrics.distanceMeters === null ? null : s.metrics.distanceMeters + 10,
        },
        setType: s.setType === null ? null : "drop",
        effort: s.setType === null ? null : 9,
        isWarmup: false,
      })),
    });
  }
  for (let index = 0; index < trainingMetricCases.length; index++) {
    it(`corrige ${trainingMetricCases[index].recordType ?? "null"} y replay del cierre no deshace la edición`, async () => {
      const p = payload(index);
      await saveTypedWorkoutRecording(students[0], p);
      const base = await readOwnWorkoutCorrection(students[0], p.id, people[0]);
      expect(base).not.toBeNull();
      const input = correction(base!);
      const saved = await correctOwnWorkout(students[0], input);
      expect(saved.status).toBe("updated");
      expect(saved.revision).toBeGreaterThan(base!.workout.revision);
      const result = await getTypedWorkoutDetail(students[0], p.id, people[0]);
      expect(result?.workout.exercises[0].sets[0]).toMatchObject({
        id: input.sets[0].id,
        metrics: input.sets[0].metrics,
        setType: "drop",
        effort: 9,
      });
      expect(result?.workout.exercises[1]).toMatchObject({
        athleteNote: "Nota corregida",
        sets: [],
      });
      expect(result?.workout).toMatchObject({
        structure: base!.workout.structure,
        startedAt: base!.workout.startedAt,
        performedOn: base!.workout.performedOn,
        durationSeconds: 600,
        note: input.note,
        perceivedEffort: 8,
      });
      expect(await correctOwnWorkout(students[0], input)).toEqual({
        ...saved,
        status: "duplicate",
      });
      expect((await readOwnWorkoutCorrection(students[0], p.id, people[0]))?.workout.revision).toBe(
        saved.revision,
      );
      expect((await saveTypedWorkoutRecording(students[0], p)).status).toBe("duplicate");
      expect(
        (await getTypedWorkoutDetail(students[0], p.id, people[0]))?.workout.exercises[0].sets[0]
          .metrics,
      ).toEqual(input.sets[0].metrics);
    });
  }
  it("dos propuestas desde la misma revisión confirman solo una y preservan las identidades", async () => {
    const p = payload(7);
    await saveTypedWorkoutRecording(students[0], p);
    const base = (await readOwnWorkoutCorrection(students[0], p.id, people[0]))!;
    const first = correction(base),
      second = { ...correction(base), note: "Segunda propuesta" };
    const results = await Promise.allSettled([
      correctOwnWorkout(students[0], first),
      correctOwnWorkout(students[0], second),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("40001");
    const winner = results[0].status === "fulfilled" ? first : second;
    expect((await readOwnWorkoutCorrection(students[0], p.id, people[0]))?.workout.note).toBe(
      winner.note,
    );
  });
  it("DML directo invalida la revisión; fallo no cambia datos ni recibos", async () => {
    const p = payload();
    await saveTypedWorkoutRecording(students[0], p);
    const base = (await readOwnWorkoutCorrection(students[0], p.id, people[0]))!;
    const input = correction(base);
    const update = await students[0]
      .from("workout_sets")
      .update({ reps: 12 })
      .eq("id", base.workout.sets[0].id);
    expect(update.error).toBeNull();
    const current = await readOwnWorkoutCorrection(students[0], p.id, people[0]);
    expect(current!.workout.revision).toBeGreaterThan(base.workout.revision);
    await expect(correctOwnWorkout(students[0], input)).rejects.toMatchObject({ code: "40001" });
    expect(await readOwnWorkoutCorrection(students[0], p.id, people[0])).toEqual(current);
    const receipts = await admin
      .from("workout_correction_receipts")
      .select("request_id")
      .eq("request_id", input.requestId);
    expect(receipts.error).toBeNull();
    expect(receipts.data).toEqual([]);
  });
  it("tres alumnos y coach mantienen edición propia; un recibo borrado no recrea el resultado", async () => {
    const p = payload(5);
    await saveTypedWorkoutRecording(students[0], p);
    const base = (await readOwnWorkoutCorrection(students[0], p.id, people[0]))!,
      input = correction(base);
    for (const [db, owner] of [
      [students[1], people[1]],
      [students[2], people[2]],
      [coach, coachId],
    ] as const) {
      expect(await readOwnWorkoutCorrection(db, p.id, owner)).toBeNull();
      await expect(correctOwnWorkout(db, input)).rejects.toMatchObject({ code: "P0002" });
    }
    await correctOwnWorkout(students[0], input);
    const removed = await students[0].from("workouts").delete().eq("id", p.id).select("id");
    expect(removed.error).toBeNull();
    expect(removed.data).toEqual([{ id: p.id }]);
    expect((await correctOwnWorkout(students[0], input)).status).toBe("removed");
    expect(await readOwnWorkoutCorrection(students[0], p.id, people[0])).toBeNull();
    const own = payload(8);
    await saveTypedWorkoutRecording(coach, own);
    const coachBase = (await readOwnWorkoutCorrection(coach, own.id, coachId))!;
    expect((await correctOwnWorkout(coach, correction(coachBase))).status).toBe("updated");
  });
  it("estructura1 permanece original y no se convierte al formato tipado", async () => {
    const p = recordingFixture("free");
    if (p.source !== "free") throw Error("fixture");
    p.id = randomUUID();
    p.workout.id = p.id;
    p.workout.startedAt = new Date(Date.now() - 600000).toISOString();
    p.workout.finishedAt = new Date().toISOString();
    p.workout.durationSeconds = 600;
    p.structure.exercises.forEach((r) => {
      r.id = randomUUID();
      r.exerciseId = exerciseIds[0];
    });
    p.workout.sets = [{ ...p.workout.sets[0], exerciseId: exerciseIds[0] }];
    await saveWorkoutRecording(students[0], p);
    const base = (await readOwnWorkoutCorrection(students[0], p.id, people[0]))!;
    expect(base.workout.structure?.version).toBe(1);
    await correctOwnWorkout(students[0], correction(base));
    const after = (await readOwnWorkoutCorrection(students[0], p.id, people[0]))!;
    expect(after.workout.structure).toEqual(base.workout.structure);
    expect(after.workout.sets[0]).toMatchObject({
      metrics: { recordType: null },
      setType: null,
      effort: null,
    });
  });
  it("corrige un histórico sin estructura conservando su nombre y origen asignado", async () => {
    const id = randomUUID(),
      startedAt = new Date(Date.now() - 600000).toISOString();
    const w = await admin.from("workouts").insert({
      id,
      student_id: people[0],
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_seconds: 600,
    });
    if (w.error) throw w.error;
    const s = await admin.from("workout_sets").insert({
      workout_id: id,
      student_id: people[0],
      exercise_id: exerciseIds[0],
      exercise_name: "Nombre histórico anterior",
      position: 0,
      set_number: 1,
      weight_kg: 30,
      reps: 8,
    });
    if (s.error) throw s.error;
    const base = (await readOwnWorkoutCorrection(students[0], id, people[0]))!;
    expect(base.workout.structure).toBeNull();
    const input = correction(base);
    input.sets[0].isWarmup = true;
    await correctOwnWorkout(students[0], input);
    const after = (await readOwnWorkoutCorrection(students[0], id, people[0]))!;
    expect(after.workout).toMatchObject({
      sourceKind: "assigned",
      structure: null,
      startedAt: base.workout.startedAt,
      exerciseNotes: null,
    });
    expect(after.workout.sets[0]).toMatchObject({
      exerciseName: "Nombre histórico anterior",
      setType: null,
      effort: null,
      isWarmup: true,
      metrics: { recordType: null, weightKg: 32.5, reps: 9 },
    });
  });
  it("Auth elimina realmente una cuenta con resultados y recibos sin permisos nuevos sobre producto", async () => {
    const p = payload(5);
    await saveTypedWorkoutRecording(students[2], p);
    const base = (await readOwnWorkoutCorrection(students[2], p.id, people[2]))!;
    await correctOwnWorkout(students[2], correction(base));
    const removed = await admin.auth.admin.deleteUser(people[2]);
    expect(removed.error).toBeNull();
    const results = await Promise.all([
      admin
        .from("workouts")
        .select("id", { count: "exact", head: true })
        .eq("student_id", people[2]),
      admin
        .from("workout_correction_receipts")
        .select("request_id", { count: "exact", head: true })
        .eq("owner_id", people[2]),
    ]);
    for (const result of results) {
      expect(result.error).toBeNull();
      expect(result.count).toBe(0);
    }
  });
});
