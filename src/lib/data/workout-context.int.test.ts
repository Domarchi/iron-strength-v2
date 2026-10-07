import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getWorkoutContext } from "./workout-context";

const admin = adminClient();

describe("getWorkoutContext (RF-19, RF-20, RF-15b, DC-9)", () => {
  let coachId: string;
  let studentId: string;
  let otherId: string;
  let studentDb: AdminClient;
  let squatId: string;
  let pullUpId: string;
  let programId: string;
  let sessionA: string;
  let sessionW2: string;
  let otherSession: string;

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
    studentDb = await signedInClient(student.email, student.password);
    const ids = await admin
      .from("exercises")
      .select("id, name")
      .in("name", ["Sentadilla", "Dominadas"])
      .is("coach_id", null);
    squatId = ids.data!.find((e) => e.name === "Sentadilla")!.id;
    pullUpId = ids.data!.find((e) => e.name === "Dominadas")!.id;
  });
  afterAll(() => resetUsers(admin));

  beforeEach(async () => {
    await admin.from("workouts").delete().in("student_id", [studentId, otherId]);
    await admin.from("programs").delete().in("student_id", [studentId, otherId]);
    const make = async (student: string) => {
      const { data: program } = await admin
        .from("programs")
        .insert({
          coach_id: coachId,
          student_id: student,
          name: "Fuerza",
          weeks_count: 2,
          start_date: "2025-03-03",
          ends_on: "2025-03-16",
        })
        .select("id")
        .single();
      const { data: sessions } = await admin
        .from("program_sessions")
        .insert([
          { program_id: program!.id, week_number: 1, label: "A" },
          { program_id: program!.id, week_number: 2, label: "A" },
        ])
        .select("id, week_number");
      const w1 = sessions!.find((s) => s.week_number === 1)!.id;
      await admin.from("session_exercises").insert([
        {
          program_session_id: w1,
          exercise_id: squatId,
          position: 0,
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          target_weight_kg: null,
        },
        {
          program_session_id: w1,
          exercise_id: pullUpId,
          position: 1,
          sets: 2,
          reps_min: 5,
          reps_max: 8,
        },
      ]);
      return { program: program!.id, w1, w2: sessions!.find((s) => s.week_number === 2)!.id };
    };
    const mine = await make(studentId);
    programId = mine.program;
    sessionA = mine.w1;
    sessionW2 = mine.w2;
    otherSession = (await make(otherId)).w1;
  });

  async function pastWorkout(
    startedAt: string,
    sets: { exerciseId: string; weightKg: number; reps: number; isWarmup?: boolean }[],
  ) {
    const id = crypto.randomUUID();
    await admin.from("workouts").insert({
      id,
      student_id: studentId,
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
      duration_seconds: 3600,
    });
    await admin.from("workout_sets").insert(
      sets.map((s, i) => ({
        workout_id: id,
        student_id: studentId,
        exercise_id: s.exerciseId,
        exercise_name: "x",
        position: 0,
        set_number: i + 1,
        weight_kg: s.weightKg,
        reps: s.reps,
        is_warmup: s.isWarmup ?? false,
      })),
    );
  }

  const load = (sessionId: string, today = "2025-03-05") =>
    getWorkoutContext(studentDb, studentId, sessionId, today);

  it("carga la sesión con sus ejercicios en orden y su prescripción", async () => {
    const result = await load(sessionA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.session).toMatchObject({
      id: sessionA,
      label: "A",
      programId,
      programName: "Fuerza",
      weekNumber: 1,
    });
    expect(result.context.exercises.map((e) => e.name)).toEqual(["Sentadilla", "Dominadas"]);
    expect(result.context.exercises[0].prescribed).toEqual({
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      targetWeightKg: null,
    });
    expect(result.context.exercises[1].isBodyweight).toBe(true);
  });

  it("sin historial: sin 'última vez', sin peso previo y sin sugerencia", async () => {
    const result = await load(sessionA);
    if (!result.ok) throw new Error("debía cargar");
    expect(result.context.exercises[0]).toMatchObject({
      last: null,
      lastWeightKg: null,
      suggestion: null,
    });
  });

  it("con historial: muestra la última vez y precarga el último peso", async () => {
    await pastWorkout("2025-02-24T15:00:00Z", [{ exerciseId: squatId, weightKg: 55, reps: 9 }]);
    await pastWorkout("2025-02-26T15:00:00Z", [
      { exerciseId: squatId, weightKg: 20, reps: 5, isWarmup: true },
      { exerciseId: squatId, weightKg: 60, reps: 10 },
      { exerciseId: squatId, weightKg: 60, reps: 9 },
    ]);
    const result = await load(sessionA);
    if (!result.ok) throw new Error("debía cargar");
    const squat = result.context.exercises[0];
    expect(squat.lastWeightKg).toBe(60);
    expect(squat.last).toMatchObject({ date: "2025-02-26" });
    expect(squat.last?.sets).toHaveLength(3);
  });

  it("sugiere subir el peso cuando la última vez llegó al tope en todas las series", async () => {
    await pastWorkout("2025-02-26T15:00:00Z", [
      { exerciseId: squatId, weightKg: 60, reps: 12 },
      { exerciseId: squatId, weightKg: 60, reps: 12 },
      { exerciseId: squatId, weightKg: 60, reps: 12 },
    ]);
    const result = await load(sessionA);
    if (!result.ok) throw new Error("debía cargar");
    expect(result.context.exercises[0].suggestion).toEqual({
      kind: "increase",
      weightKg: 62.5,
      reps: 8,
    });
  });

  it("sugiere mantener si no llegó al tope", async () => {
    await pastWorkout("2025-02-26T15:00:00Z", [
      { exerciseId: squatId, weightKg: 60, reps: 12 },
      { exerciseId: squatId, weightKg: 60, reps: 10 },
      { exerciseId: squatId, weightKg: 60, reps: 9 },
    ]);
    const result = await load(sessionA);
    if (!result.ok) throw new Error("debía cargar");
    expect(result.context.exercises[0].suggestion).toEqual({
      kind: "keep",
      weightKg: 60,
      reps: 12,
    });
  });

  it("el peso corporal no tiene sugerencia", async () => {
    await pastWorkout("2025-02-26T15:00:00Z", [
      { exerciseId: pullUpId, weightKg: 0, reps: 8 },
      { exerciseId: pullUpId, weightKg: 0, reps: 8 },
    ]);
    const result = await load(sessionA);
    if (!result.ok) throw new Error("debía cargar");
    expect(result.context.exercises[1].suggestion).toBeNull();
  });

  it("solo se puede entrenar una sesión de la semana en curso", async () => {
    expect(await load(sessionW2, "2025-03-05")).toEqual({ ok: false, reason: "not_current_week" }); // semana 2 en la semana 1
    expect(await load(sessionA, "2025-03-12")).toEqual({ ok: false, reason: "not_current_week" }); // semana 1 en la semana 2
    expect(await load(sessionA, "2025-04-02")).toEqual({ ok: false, reason: "not_current_week" }); // programa terminado
    expect((await load(sessionW2, "2025-03-12")).ok).toBe(true);
  });

  it("no carga la sesión de otro alumno ni una inexistente", async () => {
    expect(await load(otherSession)).toEqual({ ok: false, reason: "not_found" });
    expect(await load("00000000-0000-4000-8000-00000000dead")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
