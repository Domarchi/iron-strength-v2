import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { saveWorkout } from "./save-workout";
import { getWorkoutDetail } from "./workouts";
import { getHistoryExport } from "./export";
import { getWeekView } from "./week";

const admin = adminClient();

describe("saveWorkout (RF-23, RF-24, DC-8)", () => {
  let coachId: string;
  let studentId: string;
  let otherId: string;
  let studentDb: AdminClient;
  let otherDb: AdminClient;
  let exerciseId: string;
  let programId: string;
  let sessionW1: string;
  let sessionW2: string;
  let otherSession: string;
  let otherProgram: string;

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
    otherDb = await signedInClient(other.email, other.password);
    exerciseId = (
      await admin
        .from("exercises")
        .select("id")
        .eq("name", "Sentadilla")
        .is("coach_id", null)
        .single()
    ).data!.id;
  });
  afterAll(() => resetUsers(admin));

  beforeEach(async () => {
    await admin.from("workouts").delete().in("student_id", [studentId, otherId]);
    await admin.from("programs").delete().in("student_id", [studentId, otherId]);
    // Programa de 2 semanas desde el lunes 2025-03-03 (semana 1: 03-03..03-09; semana 2: 03-10..03-16)
    const make = async (student: string) => {
      const { data: program } = await admin
        .from("programs")
        .insert({
          coach_id: coachId,
          student_id: student,
          name: "P",
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
      expect(
        (
          await admin.from("session_exercises").insert(
            sessions!.map((s) => ({
              program_session_id: s.id,
              exercise_id: exerciseId,
              position: 0,
              sets: 2,
              reps_min: 8,
              reps_max: 12,
            })),
          )
        ).error,
      ).toBeNull();
      return {
        program: program!.id,
        w1: sessions!.find((s) => s.week_number === 1)!.id,
        w2: sessions!.find((s) => s.week_number === 2)!.id,
      };
    };
    const mine = await make(studentId);
    programId = mine.program;
    sessionW1 = mine.w1;
    sessionW2 = mine.w2;
    const theirs = await make(otherId);
    otherProgram = theirs.program;
    otherSession = theirs.w1;
  });

  const payload = (over: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    programId,
    programSessionId: sessionW1,
    sessionLabel: "A",
    startedAt: "2025-03-04T15:00:00.000Z",
    finishedAt: "2025-03-04T16:00:00.000Z",
    durationSeconds: 3600,
    sets: [
      {
        exerciseId,
        exerciseName: "Sentadilla",
        position: 0,
        setNumber: 1,
        weightKg: 60,
        reps: 10,
        isWarmup: false,
      },
      {
        exerciseId,
        exerciseName: "Sentadilla",
        position: 0,
        setNumber: 2,
        weightKg: 62.5,
        reps: 8,
        isWarmup: false,
      },
    ],
    ...over,
  });

  it("valoración opcional atómica, privada y estable al reintentar (T156)", async () => {
    const p = payload({ perceivedEffort: 8, note: "  Buen ritmo  " });
    expect(await saveWorkout({ db: studentDb, payload: p })).toEqual({
      ok: true,
      status: "created",
    });
    expect(await saveWorkout({ db: studentDb, payload: p })).toEqual({
      ok: true,
      status: "duplicate",
    });
    expect(await getWorkoutDetail(studentDb, p.id)).toMatchObject({
      perceivedEffort: 8,
      note: "Buen ritmo",
    });
    expect(await getWorkoutDetail(otherDb, p.id)).toBeNull();
    const exported = await getHistoryExport(studentDb, studentId);
    expect(exported.ok).toBe(true);
    if (exported.ok)
      expect(exported.rows[0]).toMatchObject({ perceivedEffort: 8, workoutNote: "Buen ritmo" });
    for (const patch of [
      { perceivedEffort: 0 },
      { perceivedEffort: 11 },
      { perceivedEffort: 2.5 },
      { note: "x".repeat(501) },
    ]) {
      const invalid = payload(patch);
      expect(await saveWorkout({ db: studentDb, payload: invalid })).toMatchObject({
        ok: false,
        reason: "invalid",
      });
      expect((await admin.from("workouts").select("id").eq("id", invalid.id)).data).toEqual([]);
    }
    const legacy = payload();
    expect((await saveWorkout({ db: studentDb, payload: legacy })).ok).toBe(true);
    expect(await getWorkoutDetail(studentDb, legacy.id)).toMatchObject({
      perceivedEffort: null,
      note: null,
    });
  });

  it("guarda el entrenamiento con sus series y deriva el día en hora de Santiago", async () => {
    const p = payload();
    expect(await saveWorkout({ db: studentDb, payload: p })).toEqual({
      ok: true,
      status: "created",
    });

    const { data } = await admin
      .from("workouts")
      .select("student_id, performed_on, workout_sets(count)")
      .eq("id", p.id)
      .single();
    expect(data).toMatchObject({
      student_id: studentId,
      performed_on: "2025-03-04",
      workout_sets: [{ count: 2 }],
    });
  });

  it("reenviar el mismo id no duplica (reintento tras un corte de red)", async () => {
    const p = payload();
    await saveWorkout({ db: studentDb, payload: p });
    expect(await saveWorkout({ db: studentDb, payload: p })).toEqual({
      ok: true,
      status: "duplicate",
    });
    const { count } = await admin
      .from("workout_sets")
      .select("id", { count: "exact", head: true })
      .eq("workout_id", p.id);
    expect(count).toBe(2);
  });

  it("dos envíos simultáneos del mismo entrenamiento dejan uno solo", async () => {
    const p = payload();
    const results = await Promise.all([
      saveWorkout({ db: studentDb, payload: p }),
      saveWorkout({ db: studentDb, payload: p }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.status === "created")).toHaveLength(1);
    const { count } = await admin
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .eq("id", p.id);
    expect(count).toBe(1);
  });

  it("sin series completadas no guarda nada", async () => {
    const p = payload({ sets: [] });
    expect(await saveWorkout({ db: studentDb, payload: p })).toEqual({
      ok: false,
      reason: "no_sets",
    });
    const { count } = await admin
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .eq("id", p.id);
    expect(count).toBe(0);
  });

  it("rechaza datos inválidos sin guardar nada", async () => {
    for (const bad of [
      payload({
        sets: [
          {
            exerciseId,
            exerciseName: "S",
            position: 0,
            setNumber: 1,
            weightKg: 600,
            reps: 5,
            isWarmup: false,
          },
        ],
      }),
      payload({
        sets: [
          {
            exerciseId,
            exerciseName: "S",
            position: 0,
            setNumber: 1,
            weightKg: 60,
            reps: 0,
            isWarmup: false,
          },
        ],
      }),
      payload({ id: "no-es-uuid" }),
      payload({ startedAt: "ayer" }),
      payload({ durationSeconds: -5 }),
    ]) {
      expect(await saveWorkout({ db: studentDb, payload: bad })).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    const { count } = await admin
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId);
    expect(count).toBe(0);
  });

  it("la sesión debe corresponder a la semana en que se inició el entrenamiento", async () => {
    // La sesión de la semana 2 iniciada en la semana 1
    expect(
      await saveWorkout({ db: studentDb, payload: payload({ programSessionId: sessionW2 }) }),
    ).toEqual({
      ok: false,
      reason: "wrong_week",
    });
    // La sesión de la semana 1 iniciada en la semana 2
    expect(
      await saveWorkout({
        db: studentDb,
        payload: payload({
          startedAt: "2025-03-11T15:00:00.000Z",
          finishedAt: "2025-03-11T16:00:00.000Z",
        }),
      }),
    ).toEqual({
      ok: false,
      reason: "wrong_week",
    });
    // Iniciada el domingo 23:50 (hora de Santiago) y terminada el lunes: pertenece a la semana 1
    expect(
      (
        await saveWorkout({
          db: studentDb,
          payload: payload({
            startedAt: "2025-03-10T02:50:00.000Z",
            finishedAt: "2025-03-10T03:40:00.000Z",
          }),
        })
      ).ok,
    ).toBe(true);
  });

  it("no se puede guardar sobre la sesión de otro alumno", async () => {
    expect(
      await saveWorkout({
        db: studentDb,
        payload: payload({ programId: otherProgram, programSessionId: otherSession }),
      }),
    ).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("un id ya usado por otro alumno da conflicto", async () => {
    const p = payload();
    await saveWorkout({ db: studentDb, payload: p });
    const result = await saveWorkout({
      db: otherDb,
      payload: { ...p, programId: otherProgram, programSessionId: otherSession },
    });
    expect(result).toEqual({ ok: false, reason: "id_taken" });
  });

  it("la sesión pasa a verse como hecha en 'Mi semana'", async () => {
    await saveWorkout({ db: studentDb, payload: payload() });
    const view = await getWeekView(studentDb, studentId, "2025-03-05");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.sessions[0]).toMatchObject({ label: "A", status: "done" });
  });
  it("confirma una respuesta perdida incluso si después se eliminó la rutina (T161)", async () => {
    const p = payload();
    expect((await saveWorkout({ db: studentDb, payload: p })).ok).toBe(true);
    expect((await admin.from("programs").delete().eq("id", programId)).error).toBeNull();
    expect(await saveWorkout({ db: studentDb, payload: p })).toEqual({
      ok: true,
      status: "duplicate",
    });
    expect(
      (await admin.from("workout_sets").select("id").eq("workout_id", p.id)).data,
    ).toHaveLength(2);
  });
  it("la RPC rechaza directamente una semana de inicio incorrecta sin guardar parcialmente (T161)", async () => {
    const p = payload({ programSessionId: sessionW2 });
    const result = await studentDb.rpc("save_workout", { p_workout: p });
    expect(result.error?.code).toBe("P0002");
    expect(result.error?.details).toBe("wrong_week");
    expect((await admin.from("workouts").select("id").eq("id", p.id)).data).toHaveLength(0);
  });
});
