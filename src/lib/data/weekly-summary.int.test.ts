import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getWeeklySummary } from "./weekly-summary";

const admin = adminClient();

// Programa desde el lunes 2025-03-03: semana 1 = A, B (2 sesiones) · semana 2 = A (1 sesión).
// "Hoy" es el miércoles 2025-03-12: la semana en curso es la del 10 al 16 y la anterior la del 3 al 9.
const TODAY = "2025-03-12";

describe("resumen semanal (RF-32; DC-16, DC-29)", () => {
  let coachId: string;
  let studentId: string;
  let otherId: string;
  let studentDb: AdminClient;
  let otherDb: AdminClient;
  let coachDb: AdminClient;
  let programId: string;
  let sessions: Record<string, string>;
  let exerciseId: string;

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
    coachDb = await signedInClient(coach.email, coach.password);
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
    await admin.from("programs").delete().in("student_id", [studentId, otherId]);
    await admin.from("workouts").delete().in("student_id", [studentId, otherId]);
    const { data: program } = await admin
      .from("programs")
      .insert({
        coach_id: coachId,
        student_id: studentId,
        name: "Programa",
        weeks_count: 3,
        start_date: "2025-03-03",
        ends_on: "2025-03-23",
      })
      .select("id")
      .single();
    programId = program!.id;
    const { data: rows } = await admin
      .from("program_sessions")
      .insert([
        { program_id: programId, week_number: 1, label: "A" },
        { program_id: programId, week_number: 1, label: "B" },
        { program_id: programId, week_number: 2, label: "A" },
      ])
      .select("id, week_number, label");
    expect(
      (
        await admin.from("session_exercises").insert(
          rows!.map((r) => ({
            program_session_id: r.id,
            exercise_id: exerciseId,
            position: 0,
            sets: 3,
            reps_min: 8,
            reps_max: 12,
          })),
        )
      ).error,
    ).toBeNull();
    sessions = Object.fromEntries(rows!.map((r) => [`${r.week_number}${r.label}`, r.id]));
  });

  async function workout(sessionKey: string | null, startedAt: string, weight: number, reps = 10) {
    const id = crypto.randomUUID();
    await admin.from("workouts").insert({
      id,
      student_id: studentId,
      program_id: sessionKey ? programId : null,
      program_session_id: sessionKey ? sessions[sessionKey] : null,
      session_label: sessionKey ? sessionKey.slice(1) : null,
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
      duration_seconds: 3600,
    });
    const inserted = await admin.from("workout_sets").insert({
      workout_id: id,
      student_id: studentId,
      exercise_id: exerciseId,
      exercise_name: "Sentadilla",
      position: 0,
      set_number: 1,
      weight_kg: weight,
      reps,
      is_warmup: false,
    });
    expect(inserted.error).toBeNull();
    return id;
  }

  it("una semana sin nada queda en cero y sin tendencia", async () => {
    const summary = await getWeeklySummary(studentDb, studentId, TODAY);
    expect(summary.current).toMatchObject({
      isCurrent: true,
      workoutCount: 0,
      volumeKg: 0,
      records: 0,
    });
    expect(summary.current.volumeTrend).toBeNull();
    expect(summary.previous).toMatchObject({ isCurrent: false, workoutCount: 0 });
    expect(summary.previous.weekStart).toBe("2025-03-03");
    expect(summary.current.weekStart).toBe("2025-03-10");
  });

  it("cumplimiento: sesiones hechas frente a las planificadas de cada semana", async () => {
    await workout("1A", "2025-03-04T15:00:00Z", 60); // semana anterior: 1 de 2
    const summary = await getWeeklySummary(studentDb, studentId, TODAY);
    expect(summary.previous.sessions).toEqual({ planned: 2, done: 1 });
    expect(summary.current.sessions).toEqual({ planned: 1, done: 0 });
  });

  it("volumen, récords y variación frente a la semana anterior", async () => {
    await workout("1A", "2025-03-04T15:00:00Z", 60); // 600 kg, primer registro: sin récord
    await workout("1B", "2025-03-06T15:00:00Z", 60); // 600 kg: igual, sin récord  → semana anterior 1200
    await workout("2A", "2025-03-11T15:00:00Z", 70); // 700 kg y récord de peso
    const summary = await getWeeklySummary(studentDb, studentId, TODAY);

    expect(summary.previous).toMatchObject({
      workoutCount: 2,
      trainedDays: 2,
      volumeKg: 1200,
      records: 0,
    });
    expect(summary.current).toMatchObject({ workoutCount: 1, volumeKg: 700 });
    expect(summary.current.records).toBeGreaterThan(0);
    expect(summary.current.volumeTrend).toBeCloseTo((700 - 1200) / 1200, 5);
  });

  it("un entrenamiento libre (sin programa) cuenta en volumen y en entrenamientos", async () => {
    await workout(null, "2025-03-11T15:00:00Z", 50);
    const summary = await getWeeklySummary(studentDb, studentId, TODAY);
    expect(summary.current.workoutCount).toBe(1);
    expect(summary.current.volumeKg).toBe(500);
  });

  it("sin programa en curso no hay cumplimiento (null), pero sí entrenamientos", async () => {
    await admin.from("programs").delete().eq("student_id", studentId);
    await workout(null, "2025-03-11T15:00:00Z", 50);
    const summary = await getWeeklySummary(studentDb, studentId, TODAY);
    expect(summary.current.sessions).toBeNull();
    expect(summary.current.workoutCount).toBe(1);
  });

  it("el coach ve el resumen de su alumno y otro alumno no ve nada", async () => {
    await workout("2A", "2025-03-11T15:00:00Z", 70);
    expect((await getWeeklySummary(coachDb, studentId, TODAY)).current.workoutCount).toBe(1);
    expect((await getWeeklySummary(otherDb, studentId, TODAY)).current.workoutCount).toBe(0);
  });
});
