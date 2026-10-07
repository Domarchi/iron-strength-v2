import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getWorkoutDetail, listWorkouts } from "./workouts";

const admin = adminClient();

describe("historial de entrenamientos (RF-34, RF-77)", () => {
  let coachId: string;
  let studentId: string;
  let otherId: string;
  let studentDb: AdminClient;
  let coachDb: AdminClient;
  let otherDb: AdminClient;
  let squatId: string;
  let benchId: string;

  beforeAll(async () => {
    await resetUsers(admin);
    const coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@test.local",
    });
    const student = await createProfileUser(admin, {
      role: "student",
      name: "Alumno",
      email: "alumno@test.local",
      coachId: coach.id,
    });
    const other = await createProfileUser(admin, {
      role: "student",
      name: "Otro",
      email: "otro@test.local",
      coachId: coach.id,
    });
    coachId = coach.id;
    studentId = student.id;
    otherId = other.id;
    coachDb = await signedInClient(coach.email, coach.password);
    studentDb = await signedInClient(student.email, student.password);
    otherDb = await signedInClient(other.email, other.password);
    const ids = await admin
      .from("exercises")
      .select("id, name")
      .in("name", ["Sentadilla", "Press de banca"])
      .is("coach_id", null);
    squatId = ids.data!.find((e) => e.name === "Sentadilla")!.id;
    benchId = ids.data!.find((e) => e.name === "Press de banca")!.id;
    void coachId;
  });
  afterAll(() => resetUsers(admin));
  beforeEach(async () => {
    await admin.from("workouts").delete().in("student_id", [studentId, otherId]);
  });

  async function addWorkout(student: string, startedAt: string, label = "A") {
    const id = crypto.randomUUID();
    const created = await admin.from("workouts").insert({
      id,
      student_id: student,
      session_label: label,
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3000_000).toISOString(),
      duration_seconds: 3000,
    });
    if (created.error) throw created.error;
    const sets = await admin.from("workout_sets").insert([
      {
        workout_id: id,
        student_id: student,
        exercise_id: squatId,
        exercise_name: "Sentadilla",
        position: 0,
        set_number: 1,
        weight_kg: 20,
        reps: 10,
        is_warmup: true,
      },
      {
        workout_id: id,
        student_id: student,
        exercise_id: squatId,
        exercise_name: "Sentadilla",
        position: 0,
        set_number: 2,
        weight_kg: 60,
        reps: 10,
        is_warmup: false,
      },
      {
        workout_id: id,
        student_id: student,
        exercise_id: squatId,
        exercise_name: "Sentadilla",
        position: 0,
        set_number: 3,
        weight_kg: 60,
        reps: 8,
        is_warmup: false,
      },
      {
        workout_id: id,
        student_id: student,
        exercise_id: benchId,
        exercise_name: "Press de banca",
        position: 1,
        set_number: 1,
        weight_kg: 40,
        reps: 10,
        is_warmup: false,
      },
    ]);
    if (sets.error) throw sets.error;
    return id;
  }

  it("el detalle agrupa las series por ejercicio, en orden, e incluye el resumen", async () => {
    const id = await addWorkout(studentId, "2026-10-01T15:00:00Z");
    const detail = await getWorkoutDetail(studentDb, id);
    expect(detail).toMatchObject({
      id,
      studentId,
      sessionLabel: "A",
      durationSeconds: 3000,
      performedOn: "2026-10-01",
    });
    expect(detail!.exercises.map((e) => e.name)).toEqual(["Sentadilla", "Press de banca"]);
    expect(
      detail!.exercises[0].sets.map((s) => [s.setNumber, s.weightKg, s.reps, s.isWarmup]),
    ).toEqual([
      [1, 20, 10, true],
      [2, 60, 10, false],
      [3, 60, 8, false],
    ]);
    // Volumen de series de trabajo: 60×10 + 60×8 + 40×10 = 1480 (el calentamiento no cuenta)
    expect(detail!.summary).toEqual({
      workingSets: 3 + 0,
      volumeKg: 1480,
      bodyweightReps: 0,
      exerciseCount: 2,
    });
  });

  it("el coach ve el detalle de sus alumnos; otro alumno no", async () => {
    const id = await addWorkout(studentId, "2026-10-01T15:00:00Z");
    expect(await getWorkoutDetail(coachDb, id)).not.toBeNull();
    expect(await getWorkoutDetail(otherDb, id)).toBeNull();
  });

  it("un id inexistente devuelve null", async () => {
    expect(await getWorkoutDetail(studentDb, crypto.randomUUID())).toBeNull();
  });

  it("lista del más reciente al más antiguo con resumen por entrenamiento", async () => {
    await addWorkout(studentId, "2026-10-01T15:00:00Z", "A");
    await addWorkout(studentId, "2026-10-05T15:00:00Z", "B");
    await addWorkout(otherId, "2026-10-06T15:00:00Z", "C");

    const page = await listWorkouts(studentDb, studentId, { limit: 10 });
    expect(page.items.map((w) => w.sessionLabel)).toEqual(["B", "A"]);
    expect(page.items[0]).toMatchObject({
      performedOn: "2026-10-05",
      durationSeconds: 3000,
      workingSets: 3,
      volumeKg: 1480,
    });
    expect(page.nextCursor).toBeNull();
  });

  it("pagina con cursor sin repetir ni saltar entrenamientos", async () => {
    for (let day = 1; day <= 5; day++)
      await addWorkout(studentId, `2026-10-0${day}T15:00:00Z`, `S${day}`);

    const first = await listWorkouts(studentDb, studentId, { limit: 2 });
    expect(first.items.map((w) => w.sessionLabel)).toEqual(["S5", "S4"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await listWorkouts(studentDb, studentId, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((w) => w.sessionLabel)).toEqual(["S3", "S2"]);

    const third = await listWorkouts(studentDb, studentId, {
      limit: 2,
      cursor: second.nextCursor!,
    });
    expect(third.items.map((w) => w.sessionLabel)).toEqual(["S1"]);
    expect(third.nextCursor).toBeNull();
  });

  it("el coach lista los entrenamientos de un alumno suyo; otro alumno ve una lista vacía", async () => {
    await addWorkout(studentId, "2026-10-01T15:00:00Z");
    expect((await listWorkouts(coachDb, studentId, { limit: 10 })).items).toHaveLength(1);
    expect((await listWorkouts(otherDb, studentId, { limit: 10 })).items).toHaveLength(0);
  });
});
