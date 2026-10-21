import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { getWeekView } from "./week";
import { downloadCurrentWeek } from "./offline-week";

const admin = adminClient();

// Programa de 3 semanas desde el lunes 2025-03-03: S1 = A,B · S2 = A · S3 = descarga (sin sesiones).
describe("getWeekView (RF-19, RF-25, DC-11)", () => {
  let coachId: string;
  let studentId: string;
  let otherStudentId: string;
  let studentDb: AdminClient;
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
    otherStudentId = other.id;
    studentDb = await signedInClient(student.email, student.password);
    const { data: ex } = await admin
      .from("exercises")
      .select("id")
      .eq("name", "Sentadilla")
      .is("coach_id", null)
      .single();
    exerciseId = ex!.id;
  });
  afterAll(() => resetUsers(admin));

  beforeEach(async () => {
    await admin.from("programs").delete().in("student_id", [studentId, otherStudentId]);
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
    sessions = Object.fromEntries(rows!.map((r) => [`${r.week_number}${r.label}`, r.id]));
    await admin.from("session_exercises").insert([
      {
        program_session_id: sessions["1A"],
        exercise_id: exerciseId,
        position: 0,
        sets: 3,
        reps_min: 8,
        reps_max: 12,
      },
      {
        program_session_id: sessions["1A"],
        exercise_id: exerciseId,
        position: 1,
        sets: 3,
        reps_min: 8,
        reps_max: 12,
      },
      {
        program_session_id: sessions["1B"],
        exercise_id: exerciseId,
        position: 0,
        sets: 3,
        reps_min: 8,
        reps_max: 12,
      },
    ]);
  });

  async function workout(
    sessionKey: string,
    startedAt: string,
    setCount = 3,
    forStudent = studentId,
  ) {
    const id = crypto.randomUUID();
    await admin.from("workouts").insert({
      id,
      student_id: forStudent,
      program_id: programId,
      program_session_id: sessions[sessionKey],
      session_label: sessionKey.slice(1),
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
      duration_seconds: 3600,
    });
    if (setCount > 0) {
      await admin.from("workout_sets").insert(
        Array.from({ length: setCount }, (_, i) => ({
          workout_id: id,
          student_id: forStudent,
          exercise_id: exerciseId,
          exercise_name: "Sentadilla",
          position: 0,
          set_number: i + 1,
          weight_kg: 60,
          reps: 10,
        })),
      );
    }
    return id;
  }

  it("sin programa asignado", async () => {
    await admin.from("programs").delete().eq("id", programId);
    expect(await getWeekView(studentDb, studentId, "2025-03-05")).toEqual({ kind: "no_program" });
  });

  it("programa que aún no empieza", async () => {
    const view = await getWeekView(studentDb, studentId, "2025-02-26");
    expect(view).toMatchObject({
      kind: "scheduled",
      program: { name: "Programa", startDate: "2025-03-03" },
    });
  });

  it("semana en curso: sesiones pendientes con su cantidad de ejercicios", async () => {
    const view = await getWeekView(studentDb, studentId, "2025-03-05");
    expect(view).toMatchObject({
      kind: "active",
      weekNumber: 1,
      weekStart: "2025-03-03",
      weekEnd: "2025-03-09",
    });
    if (view.kind !== "active") return;
    expect(view.sessions.map((s) => [s.label, s.status, s.exerciseCount])).toEqual([
      ["A", "pending", 2],
      ["B", "pending", 1],
    ]);
    expect(view.sessions.map((session) => [session.label, session.setCount])).toEqual([
      ["A", 6],
      ["B", 3],
    ]);
    expect(view.compliance).toMatchObject({ planned: 2, done: 0, complete: false });
    expect(view.allDone).toBe(false);
  });

  it("una sesión con entrenamiento queda hecha y apunta a ese entrenamiento", async () => {
    const id = await workout("1A", "2025-03-04T15:00:00Z");
    const view = await getWeekView(studentDb, studentId, "2025-03-05");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.sessions.find((s) => s.label === "A")).toMatchObject({
      status: "done",
      workoutId: id,
    });
    expect(view.compliance).toMatchObject({ planned: 2, done: 1, ratio: 0.5 });
  });

  it("con todas hechas, la semana está completa", async () => {
    await workout("1A", "2025-03-04T15:00:00Z");
    await workout("1B", "2025-03-05T15:00:00Z");
    const view = await getWeekView(studentDb, studentId, "2025-03-06");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.allDone).toBe(true);
    expect(view.compliance.complete).toBe(true);
  });

  it("informa los días entrenados de la semana y los ejercicios de cada sesión (RF-61, RF-62)", async () => {
    await workout("1A", "2025-03-04T15:00:00Z");
    await workout("1A", "2025-03-04T20:00:00Z"); // mismo día: cuenta una vez
    await workout("1A", "2025-02-25T15:00:00Z"); // semana anterior: no cuenta
    const view = await getWeekView(studentDb, studentId, "2025-03-07");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.trainedDates).toEqual(["2025-03-04"]);
    expect(view.sessions.every((s) => s.exerciseNames.length === s.exerciseCount)).toBe(true);
    expect(view.sessions.find((s) => s.exerciseCount > 0)?.exerciseNames[0]).toEqual(
      expect.any(String),
    );
  });

  it("repetir una sesión cuenta como extra y no cambia el cumplimiento", async () => {
    await workout("1A", "2025-03-04T15:00:00Z");
    await workout("1A", "2025-03-06T15:00:00Z");
    const view = await getWeekView(studentDb, studentId, "2025-03-07");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.extraCount).toBe(1);
    expect(view.compliance).toMatchObject({ done: 1, planned: 2 });
  });

  it("un entrenamiento sin series no cumple la sesión", async () => {
    await workout("1A", "2025-03-04T15:00:00Z", 0);
    const view = await getWeekView(studentDb, studentId, "2025-03-05");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.sessions.find((s) => s.label === "A")?.status).toBe("pending");
  });

  it("la semana siguiente muestra solo sus propias sesiones", async () => {
    const view = await getWeekView(studentDb, studentId, "2025-03-11");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.weekNumber).toBe(2);
    expect(view.sessions.map((s) => s.label)).toEqual(["A"]);
  });

  it("una semana de descarga no tiene sesiones", async () => {
    const view = await getWeekView(studentDb, studentId, "2025-03-18");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.weekNumber).toBe(3);
    expect(view.sessions).toEqual([]);
    expect(view.compliance.deload).toBe(true);
    expect(view.allDone).toBe(false);
  });

  it("programa terminado", async () => {
    expect(await getWeekView(studentDb, studentId, "2025-04-01")).toMatchObject({
      kind: "finished",
      program: { name: "Programa" },
    });
  });

  it("no mezcla los entrenamientos de otro alumno", async () => {
    await workout("1A", "2025-03-04T15:00:00Z", 3, otherStudentId).catch(() => undefined);
    const view = await getWeekView(studentDb, studentId, "2025-03-05");
    if (view.kind !== "active") throw new Error("debía estar activo");
    expect(view.sessions.every((s) => s.status === "pending")).toBe(true);
  });

  it("el alumno no ve el programa de otro", async () => {
    expect(await getWeekView(studentDb, otherStudentId, "2025-03-05")).toEqual({
      kind: "no_program",
    });
  });
  it("descarga todas las sesiones e historial propio y rechaza otra cuenta o semana inactiva", async () => {
    const workoutId = await workout("1A", "2025-03-04T15:00:00Z");
    const pack = await downloadCurrentWeek(studentDb, studentId, new Date("2025-03-05T15:00:00Z"));
    expect(pack.sessions).toHaveLength(2);
    expect(pack.sessions[0].context.exercises).toHaveLength(2);
    expect(pack.history[exerciseId].items.map((w) => w.id)).toContain(workoutId);
    expect(pack.history[exerciseId].items.length).toBeLessThanOrEqual(10);
    expect(pack.userId).toBe(studentId);
    await expect(
      downloadCurrentWeek(studentDb, otherStudentId, new Date("2025-03-05T15:00:00Z")),
    ).rejects.toThrow();
    await expect(
      downloadCurrentWeek(studentDb, studentId, new Date("2025-04-01T15:00:00Z")),
    ).rejects.toThrow();
  });
});
