import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addDays, santiagoDate } from "@/domain/dates";
import { trainingMetricCases } from "@/test/fixtures/training-metrics";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import { typedRecordingPayloadSchema } from "@/lib/mobile/typed-recording-contracts";
import {
  workoutRemovalSchema,
  type WorkoutRemovalSnapshot,
} from "@/lib/mobile/workout-removal-contracts";
import { saveTypedWorkoutRecording, getTypedWorkoutDetail } from "./typed-recordings";
import { correctOwnWorkout, readOwnWorkoutCorrection } from "./workout-corrections";
import { correctionFromForm, correctionFormFromSnapshot } from "@/lib/workout/correction-form";
import { readOwnWorkoutRemoval, removeOwnWorkout } from "./workout-removals";
const admin = adminClient();
describe("eliminación propia atómica y recuperable", () => {
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
      email: "coach@removals.test.local",
    });
    coachId = c.id;
    coach = await signedInClient(c.email, c.password);
    people = [];
    students = [];
    for (let i = 0; i < 3; i++) {
      const p = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `student${i}@removals.test.local`,
        coachId,
      });
      people.push(p.id);
      students.push(await signedInClient(p.email, p.password));
    }
    const r = await admin
      .from("exercises")
      .insert(
        trainingMetricCases.map((m, i) => ({
          name: `Eliminar tipo ${i}`,
          muscle_group: "Core" as const,
          record_type: m.recordType,
        })),
      )
      .select("id,name");
    if (r.error) throw r.error;
    exerciseIds = trainingMetricCases.map(
      (_, i) => r.data.find((e) => e.name === `Eliminar tipo ${i}`)!.id,
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
    p.workout.exerciseNotes = p.structure.exercises.map((r) => ({
      sessionExerciseId: r.id,
      note: "Nota propia",
    }));
    p.workout.sets = [
      {
        ...p.workout.sets[0],
        exerciseId: exerciseIds[index],
        metrics: m,
        setType: "working",
        effort: 8,
      },
    ];
    return typedRecordingPayloadSchema.parse(p);
  }
  const request = (base: WorkoutRemovalSnapshot) =>
    workoutRemovalSchema.parse({
      version: 1,
      requestId: randomUUID(),
      workoutId: base.workout.id,
      expectedRevision: base.workout.revision,
    });
  async function legacy(ago = 1, owner = people[0]) {
    const id = randomUUID(),
      day = addDays(santiagoDate(new Date()), -ago),
      startedAt = `${day}T15:00:00Z`;
    const w = await admin.from("workouts").insert({
      id,
      student_id: owner,
      started_at: startedAt,
      finished_at: `${day}T16:00:00Z`,
      duration_seconds: 3600,
    });
    if (w.error) throw w.error;
    const s = await admin.from("workout_sets").insert(
      [1, 2].map((n) => ({
        workout_id: id,
        student_id: owner,
        exercise_id: exerciseIds[0],
        exercise_name: "Nombre original",
        position: 0,
        set_number: n,
        weight_kg: 60,
        reps: 8,
        is_warmup: false,
      })),
    );
    if (s.error) throw s.error;
    return id;
  }
  it("legado: cuenta y elimina series/comentarios con un recibo; reintentar no duplica", async () => {
    const id = await legacy();
    const c = await admin.from("comments").insert([
      { workout_id: id, author_id: people[0], body: "Alumno" },
      { workout_id: id, author_id: coachId, body: "Coach" },
    ]);
    if (c.error) throw c.error;
    const base = await readOwnWorkoutRemoval(students[0], id, people[0]);
    expect(base?.workout).toMatchObject({ id, setCount: 2, commentCount: 2 });
    const input = request(base!),
      ack = await removeOwnWorkout(students[0], input);
    expect(ack).toMatchObject({ workoutId: id, requestId: input.requestId, status: "deleted" });
    expect(ack.revision).toBeGreaterThan(input.expectedRevision);
    expect(await readOwnWorkoutRemoval(students[0], id, people[0])).toBeNull();
    for (const table of ["workout_sets", "comments"] as const)
      expect((await admin.from(table).select("id").eq("workout_id", id)).data).toEqual([]);
    expect(await removeOwnWorkout(students[0], input)).toEqual({ ...ack, status: "duplicate" });
    expect(
      (
        await admin
          .from("workout_correction_receipts")
          .select("request_id")
          .eq("owner_id", people[0])
          .eq("request_id", input.requestId)
      ).data,
    ).toHaveLength(1);
  });
  for (let i = 0; i < trainingMetricCases.length; i++)
    it(`borra ${trainingMetricCases[i].recordType ?? "null"} y el cierre original no lo recrea`, async () => {
      const p = payload(i);
      await saveTypedWorkoutRecording(students[0], p);
      const base = await readOwnWorkoutRemoval(students[0], p.id, people[0]);
      expect(base!.workout.setCount).toBe(1);
      await removeOwnWorkout(students[0], request(base!));
      expect(await getTypedWorkoutDetail(students[0], p.id, people[0])).toBeNull();
      const replay = await saveTypedWorkoutRecording(students[0], p);
      expect(replay.status).toBe("removed");
      expect((await admin.from("workouts").select("id").eq("id", p.id)).data).toEqual([]);
    });
  it("ventana de7días inclusiva, día8 rechazado sin recibo", async () => {
    for (const ago of [7, 8]) {
      const id = await legacy(ago),
        base = await readOwnWorkoutRemoval(students[0], id, people[0]),
        input = request(base!);
      if (ago === 7) expect((await removeOwnWorkout(students[0], input)).status).toBe("deleted");
      else {
        await expect(removeOwnWorkout(students[0], input)).rejects.toMatchObject({ code: "55000" });
        expect((await admin.from("workouts").select("id").eq("id", id)).data).toHaveLength(1);
        expect(
          (
            await admin
              .from("workout_correction_receipts")
              .select("request_id")
              .eq("request_id", input.requestId)
          ).data,
        ).toEqual([]);
      }
    }
  });
  it("tres alumnos separados y coach solo elimina su resultado; anónimo/inactivo rechazados", async () => {
    const id = await legacy(),
      base = await readOwnWorkoutRemoval(students[0], id, people[0]),
      input = request(base!);
    for (const db of [students[1], students[2], coach]) {
      expect(await readOwnWorkoutRemoval(db, id, people[0])).toBeNull();
      await expect(removeOwnWorkout(db, input)).rejects.toMatchObject({ code: "P0002" });
    }
    await expect(removeOwnWorkout(anonClient(), input)).rejects.toMatchObject({ code: "42501" });
    await admin.from("profiles").update({ is_active: false }).eq("id", people[0]);
    try {
      await expect(removeOwnWorkout(students[0], input)).rejects.toMatchObject({ code: "42501" });
    } finally {
      await admin.from("profiles").update({ is_active: true }).eq("id", people[0]);
    }
    const own = await legacy(1, coachId),
      ownBase = await readOwnWorkoutRemoval(coach, own, coachId);
    expect((await removeOwnWorkout(coach, request(ownBase!))).status).toBe("deleted");
  });
  it("dos reintentos concurrentes reconocen un único borrado", async () => {
    const id = await legacy(),
      base = await readOwnWorkoutRemoval(students[0], id, people[0]),
      input = request(base!);
    const results = await Promise.all([
      removeOwnWorkout(students[0], input),
      removeOwnWorkout(students[0], input),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["deleted", "duplicate"]);
    expect(
      (
        await admin
          .from("workout_correction_receipts")
          .select("request_id")
          .eq("request_id", input.requestId)
      ).data,
    ).toHaveLength(1);
  });
  it("corregir y borrar desde una misma revisión no se confirman ambas", async () => {
    const p = payload(5);
    await saveTypedWorkoutRecording(students[0], p);
    const base = await readOwnWorkoutCorrection(students[0], p.id, people[0]),
      removeBase = await readOwnWorkoutRemoval(students[0], p.id, people[0]);
    const form = correctionFormFromSnapshot(base!);
    form.note = "Cambio concurrente";
    const edit = correctionFromForm(base!, form, randomUUID()),
      input = request(removeBase!);
    const results = await Promise.allSettled([
      correctOwnWorkout(students[0], edit),
      removeOwnWorkout(students[0], input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await readOwnWorkoutRemoval(students[0], p.id, people[0]);
    if (results[1].status === "fulfilled") expect(current).toBeNull();
    else expect(current!.workout.revision).toBeGreaterThan(input.expectedRevision);
  });
  it("recibos de edición y eliminación no comparten operación ni recrean resultados", async () => {
    const p = payload();
    await saveTypedWorkoutRecording(students[0], p);
    const base = await readOwnWorkoutCorrection(students[0], p.id, people[0]),
      form = correctionFormFromSnapshot(base!);
    form.note = "Conservar";
    const edit = correctionFromForm(base!, form, randomUUID());
    await correctOwnWorkout(students[0], edit);
    const latest = await readOwnWorkoutRemoval(students[0], p.id, people[0]);
    await expect(
      removeOwnWorkout(students[0], { ...request(latest!), requestId: edit.requestId }),
    ).rejects.toMatchObject({ code: "22023" });
    await removeOwnWorkout(students[0], request(latest!));
    expect((await correctOwnWorkout(students[0], edit)).status).toBe("removed");
  });
});
