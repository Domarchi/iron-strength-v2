import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getStreakSummary } from "./streak";

const admin = adminClient();

// Programa de 5 semanas desde el lunes 2025-03-03. Sesiones: S1 A,B · S2 A,B · S3 (descarga) · S4 A · S5 A
describe("getStreakSummary (RF-29, DC-11)", () => {
  let coachId: string;
  let studentId: string;
  let studentDb: AdminClient;
  let exerciseId: string;
  let programId: string;
  let sessions: Record<string, string>;

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
    coachId = coach.id;
    studentId = student.id;
    studentDb = await signedInClient(student.email, student.password);
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
    await admin.from("workouts").delete().eq("student_id", studentId);
    await admin.from("programs").delete().eq("student_id", studentId);
    const { data: program } = await admin
      .from("programs")
      .insert({
        coach_id: coachId,
        student_id: studentId,
        name: "P",
        weeks_count: 5,
        start_date: "2025-03-03",
        ends_on: "2025-04-06",
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
        { program_id: programId, week_number: 2, label: "B" },
        { program_id: programId, week_number: 4, label: "A" },
        { program_id: programId, week_number: 5, label: "A" },
      ])
      .select("id, week_number, label");
    sessions = Object.fromEntries(rows!.map((r) => [`${r.week_number}${r.label}`, r.id]));
  });

  async function done(sessionKey: string, startedAt: string) {
    const id = crypto.randomUUID();
    await admin.from("workouts").insert({
      id,
      student_id: studentId,
      program_id: programId,
      program_session_id: sessions[sessionKey],
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
      duration_seconds: 3600,
    });
    await admin.from("workout_sets").insert({
      workout_id: id,
      student_id: studentId,
      exercise_id: exerciseId,
      exercise_name: "Sentadilla",
      position: 0,
      set_number: 1,
      weight_kg: 60,
      reps: 10,
      is_warmup: false,
    });
  }

  it("sin programa no hay racha ni semanas", async () => {
    await admin.from("programs").delete().eq("id", programId);
    const result = await getStreakSummary(studentDb, studentId, "2025-03-12");
    expect(result).toMatchObject({ current: 0, longest: 0 });
    expect(result.calendar.every((w) => w.outcome === "none")).toBe(true);
  });

  it("la semana en curso incompleta no rompe ni suma", async () => {
    const result = await getStreakSummary(studentDb, studentId, "2025-03-05");
    expect(result).toMatchObject({ current: 0, longest: 0 });
    expect(result.calendar.at(-1)).toMatchObject({
      outcome: "in_progress",
      planned: 2,
      done: 0,
      current: true,
    });
  });

  it("cuenta las semanas con todas las sesiones hechas", async () => {
    await done("1A", "2025-03-04T15:00:00Z");
    await done("1B", "2025-03-06T15:00:00Z");
    await done("2A", "2025-03-11T15:00:00Z");
    await done("2B", "2025-03-13T15:00:00Z");
    expect(await getStreakSummary(studentDb, studentId, "2025-03-14")).toMatchObject({
      current: 2,
      longest: 2,
    });
  });

  it("una semana terminada incompleta rompe la racha", async () => {
    await done("1A", "2025-03-04T15:00:00Z");
    await done("1B", "2025-03-06T15:00:00Z");
    await done("2A", "2025-03-11T15:00:00Z"); // falta 2B
    // Hoy ya es la semana 3 (descarga): la semana 2 quedó incompleta
    const result = await getStreakSummary(studentDb, studentId, "2025-03-18");
    expect(result).toMatchObject({ current: 0, longest: 1 });
  });

  it("la descarga no suma ni rompe", async () => {
    await done("1A", "2025-03-04T15:00:00Z");
    await done("1B", "2025-03-06T15:00:00Z");
    await done("2A", "2025-03-11T15:00:00Z");
    await done("2B", "2025-03-13T15:00:00Z");
    await done("4A", "2025-03-25T15:00:00Z");
    const result = await getStreakSummary(studentDb, studentId, "2025-03-26");
    expect(result).toMatchObject({ current: 3, longest: 3 }); // S1, S2, (S3 descarga neutra), S4
    expect(result.calendar.find((w) => w.weekStart === "2025-03-17")?.outcome).toBe("neutral");
  });

  it("un entrenamiento extra no cambia la racha", async () => {
    await done("1A", "2025-03-04T15:00:00Z");
    await done("1A", "2025-03-05T15:00:00Z"); // extra
    await done("1B", "2025-03-06T15:00:00Z");
    expect(await getStreakSummary(studentDb, studentId, "2025-03-12")).toMatchObject({
      current: 1,
      longest: 1,
    });
  });

  it("el calendario trae las últimas 12 semanas, la actual al final", async () => {
    const result = await getStreakSummary(studentDb, studentId, "2025-03-12");
    expect(result.calendar).toHaveLength(12);
    expect(result.calendar.at(-1)).toMatchObject({ weekStart: "2025-03-10", current: true });
    expect(result.calendar[0].weekStart).toBe("2024-12-23");
  });
});
