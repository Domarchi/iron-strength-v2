import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { listStudentOverviews } from "./students";

const admin = adminClient();

describe("listStudentOverviews (RF-33, DC-22)", () => {
  let coachId: string;
  let anaId: string;
  let beaId: string;
  let coachDb: AdminClient;
  let anaDb: AdminClient;
  let exerciseId: string;
  let programId: string;
  let sessionA: string;
  let sessionB: string;

  beforeAll(async () => {
    await resetUsers(admin);
    const coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@test.local",
    });
    const ana = await createProfileUser(admin, {
      role: "student",
      name: "Ana",
      email: "ana@test.local",
      coachId: coach.id,
    });
    const bea = await createProfileUser(admin, {
      role: "student",
      name: "Bea",
      email: "bea@test.local",
      coachId: coach.id,
    });
    coachId = coach.id;
    anaId = ana.id;
    beaId = bea.id;
    coachDb = await signedInClient(coach.email, coach.password);
    anaDb = await signedInClient(ana.email, ana.password);
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
    await admin.from("workouts").delete().in("student_id", [anaId, beaId, coachId]);
    await admin.from("programs").delete().in("student_id", [anaId, beaId, coachId]);
    const { data: program } = await admin
      .from("programs")
      .insert({
        coach_id: coachId,
        student_id: anaId,
        name: "Fuerza",
        weeks_count: 2,
        start_date: "2025-03-03",
        ends_on: "2025-03-16",
      })
      .select("id")
      .single();
    programId = program!.id;
    const { data: rows } = await admin
      .from("program_sessions")
      .insert([
        { program_id: programId, week_number: 1, label: "A" },
        { program_id: programId, week_number: 1, label: "B" },
      ])
      .select("id, label");
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
    sessionA = rows!.find((r) => r.label === "A")!.id;
    sessionB = rows!.find((r) => r.label === "B")!.id;
  });

  async function workout(student: string, startedAt: string, sessionId?: string) {
    const id = crypto.randomUUID();
    await admin.from("workouts").insert({
      id,
      student_id: student,
      program_id: sessionId ? programId : null,
      program_session_id: sessionId ?? null,
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
      duration_seconds: 3600,
    });
    const inserted = await admin.from("workout_sets").insert({
      workout_id: id,
      student_id: student,
      exercise_id: exerciseId,
      exercise_name: "Sentadilla",
      position: 0,
      set_number: 1,
      weight_kg: 60,
      reps: 10,
      is_warmup: false,
    });
    expect(inserted.error).toBeNull();
    return id;
  }

  it("lista a los alumnos del coach, sin incluir al propio coach (DC-22)", async () => {
    const overviews = await listStudentOverviews(coachDb, "2025-03-05");
    expect(overviews.map((o) => o.fullName)).toEqual(["Ana", "Bea"]);
  });

  it("un alumno sin actividad ni programa se muestra como tal", async () => {
    const overviews = await listStudentOverviews(coachDb, "2025-03-05");
    const bea = overviews.find((o) => o.id === beaId)!;
    expect(bea).toMatchObject({
      lastWorkoutDate: null,
      lastCommentAt: null,
      week: { kind: "no_program" },
    });
  });

  it("muestra la última actividad y el cumplimiento de la semana en curso", async () => {
    await workout(anaId, "2025-03-04T15:00:00Z", sessionA);
    const overviews = await listStudentOverviews(coachDb, "2025-03-05");
    const ana = overviews.find((o) => o.id === anaId)!;
    expect(ana.lastWorkoutDate).toBe("2025-03-04");
    expect(ana.week).toMatchObject({ kind: "active", programName: "Fuerza", planned: 2, done: 1 });
  });

  it("la última actividad es la del entrenamiento más reciente, aunque sea un extra", async () => {
    await workout(anaId, "2025-03-04T15:00:00Z", sessionA);
    await workout(anaId, "2025-03-06T15:00:00Z", sessionB);
    await workout(anaId, "2025-03-07T15:00:00Z"); // sin sesión planificada
    const ana = (await listStudentOverviews(coachDb, "2025-03-08")).find((o) => o.id === anaId)!;
    expect(ana.lastWorkoutDate).toBe("2025-03-07");
  });

  it("incluye la fecha del último comentario sobre los entrenamientos del alumno", async () => {
    const id = await workout(anaId, "2025-03-04T15:00:00Z", sessionA);
    await admin.from("comments").insert([
      { workout_id: id, author_id: coachId, body: "Muy bien", created_at: "2025-03-05T10:00:00Z" },
      { workout_id: id, author_id: anaId, body: "Gracias", created_at: "2025-03-05T12:00:00Z" },
    ]);
    const ana = (await listStudentOverviews(coachDb, "2025-03-06")).find((o) => o.id === anaId)!;
    expect(ana.lastCommentAt).toBe("2025-03-05T12:00:00+00:00");
  });

  it("expone fechas/evidencia y no considera actividad los entrenamientos vacíos (T157)", async () => {
    const id = await workout(anaId, "2025-03-04T15:00:00Z", sessionA);
    expect(
      (
        await admin.from("workouts").insert({
          id: crypto.randomUUID(),
          student_id: anaId,
          started_at: "2025-03-07T15:00:00Z",
          finished_at: "2025-03-07T16:00:00Z",
          duration_seconds: 3600,
        })
      ).error,
    ).toBeNull();
    const ana = (await listStudentOverviews(coachDb, "2025-03-08")).find((o) => o.id === anaId)!;
    expect(ana).toMatchObject({
      lastWorkoutId: id,
      lastWorkoutDate: "2025-03-04",
      week: { programId, startDate: "2025-03-03", endsOn: "2025-03-16" },
    });
  });

  it("marca a los alumnos desactivados", async () => {
    await admin.from("profiles").update({ is_active: false }).eq("id", beaId);
    const bea = (await listStudentOverviews(coachDb, "2025-03-05")).find((o) => o.id === beaId)!;
    expect(bea.isActive).toBe(false);
    await admin.from("profiles").update({ is_active: true }).eq("id", beaId);
  });

  it("un alumno solo se ve a sí mismo: nunca a los demás alumnos", async () => {
    const seen = await listStudentOverviews(anaDb, "2025-03-05");
    expect(seen.map((o) => o.id)).toEqual([anaId]);
  });
});
