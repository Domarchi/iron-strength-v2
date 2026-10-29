import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getWorkoutContext } from "./workout-context";
import { defaultPrescriptionInput, parsePrescriptionInput } from "@/domain/prescription-input";
import { typedRecordingFixture } from "@/test/fixtures/typed-recording";
import { saveTypedWorkoutRecording } from "./typed-recordings";

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
  let typedHistoryId: string | undefined;

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
  afterAll(async () => {
    await resetUsers(admin);
    if (typedHistoryId)
      expect((await admin.from("exercises").delete().eq("id", typedHistoryId)).error).toBeNull();
  });

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
    return id;
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

  it("carga los grupos y descansos prescritos sin quitar el contexto anterior", async () => {
    const group = crypto.randomUUID();
    const { error } = await admin
      .from("session_exercises")
      .update({
        superset_id: group,
        superset_rest_seconds: 120,
        rest_seconds: 45,
      })
      .eq("program_session_id", sessionA);
    expect(error).toBeNull();
    const result = await load(sessionA);
    if (!result.ok) throw new Error("debía cargar");
    expect(result.context.exercises).toHaveLength(2);
    for (const exercise of result.context.exercises)
      expect(exercise).toMatchObject({
        supersetId: group,
        supersetRestSeconds: 120,
        restSeconds: 45,
      });
  });
  it("conserva el tipo legado null al consultar una prescripción canónica con detalle y alternativa", async () => {
    const prescribed = parsePrescriptionInput(defaultPrescriptionInput(null));
    const series = [
      { ...prescribed.target, targetWeightKg: 0 },
      { ...prescribed.target, targetWeightKg: 20.5 },
      { ...prescribed.target, targetWeightKg: null },
    ];
    const updated = await admin
      .from("session_exercises")
      .update({
        reps_min: null,
        reps_max: null,
        target_weight_kg: null,
        typed_prescription: { ...prescribed, series },
      })
      .eq("program_session_id", sessionA)
      .eq("exercise_id", squatId)
      .select("id")
      .single();
    expect(updated.error).toBeNull();
    const alt = { ...prescribed, sets: 2 };
    expect(
      (
        await admin.from("session_exercise_alternatives").insert({
          session_exercise_id: updated.data!.id,
          exercise_id: pullUpId,
          position: 0,
          sets: 2,
          reps_min: null,
          reps_max: null,
          typed_prescription: alt,
        })
      ).error,
    ).toBeNull();
    const result = await load(sessionA);
    if (!result.ok) throw Error("context");
    expect(result.context.exercises[0].prescribed.series).toEqual([
      { repsMin: 8, repsMax: 12, targetWeightKg: 0 },
      { repsMin: 8, repsMax: 12, targetWeightKg: 20.5 },
      { repsMin: 8, repsMax: 12, targetWeightKg: null },
    ]);
    expect(result.context.exercises[0].alternatives?.[0].prescribed).toEqual({
      sets: 2,
      repsMin: 8,
      repsMax: 12,
      targetWeightKg: null,
    });
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
  it("el historial de otro ejercicio cronometrado no se reinterpreta como repeticiones", async () => {
    await pastWorkout("2025-03-03T15:00:00Z", [{ exerciseId: squatId, weightKg: 60, reps: 8 }]);
    const created = await admin
      .from("exercises")
      .insert({ name: "Contexto temporal aislado", muscle_group: "Core", record_type: "duration" })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    typedHistoryId = created.data!.id;
    const value = typedRecordingFixture();
    if (value.source !== "free") throw Error("fixture");
    value.workout.startedAt = "2025-03-04T15:00:00Z";
    value.workout.finishedAt = "2025-03-04T15:20:00Z";
    value.workout.durationSeconds = 1200;
    const row = {
      ...value.structure.exercises[0],
      exerciseId: typedHistoryId,
      prescribed: parsePrescriptionInput(defaultPrescriptionInput("duration")),
      supersetId: null,
      supersetRestSeconds: null,
    };
    value.structure.exercises = [row];
    value.workout.exerciseNotes = [{ sessionExerciseId: row.id, note: null }];
    value.workout.sets = [
      {
        exerciseId: typedHistoryId,
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
        effort: null,
      },
    ];
    await saveTypedWorkoutRecording(studentDb, value);
    const result = await load(sessionA);
    if (!result.ok) throw Error("context");
    expect(result.context.exercises[0].lastWeightKg).toBe(60);
    expect(result.context.exercises[0].last?.sets).toEqual([
      { weightKg: 60, reps: 8, isWarmup: false },
    ]);
    expect(result.context.exercises[1].last).toBeNull();
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

  it("ordena la última ejecución por serie aunque se haya insertado al revés", async () => {
    const workoutId = await pastWorkout("2025-02-26T15:00:00Z", []);
    const { error } = await admin.from("workout_sets").insert([
      {
        id: "00000000-0000-4000-8000-000000000001",
        workout_id: workoutId,
        student_id: studentId,
        exercise_id: squatId,
        exercise_name: "Sentadilla",
        position: 0,
        set_number: 2,
        weight_kg: 55,
        reps: 9,
        is_warmup: false,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        workout_id: workoutId,
        student_id: studentId,
        exercise_id: squatId,
        exercise_name: "Sentadilla",
        position: 0,
        set_number: 1,
        weight_kg: 60,
        reps: 10,
        is_warmup: false,
      },
    ]);
    expect(error).toBeNull();
    const result = await load(sessionA);
    if (!result.ok) throw new Error("debía cargar");
    expect(result.context.exercises[0].last?.sets).toEqual([
      { weightKg: 60, reps: 10, isWarmup: false },
      { weightKg: 55, reps: 9, isWarmup: false },
    ]);
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
