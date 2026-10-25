import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminClient, createProfileUser, signedInClient, resetUsers } from "@/test/int/helpers";
import { isMobileTestBackend } from "../testing/mobile-backend";
import { mobileProgressApi } from "./production";
if (!isMobileTestBackend(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env))
  throw Error("Solo pila aislada");
const admin = adminClient();
describe("progreso nativo con propietario Auth/RLS y ejercicio realizado", () => {
  let coach: Awaited<ReturnType<typeof createProfileUser>>,
    a: typeof coach,
    b: typeof coach,
    exercise: string,
    prescribed: string,
    workoutId: string;
  beforeAll(async () => {
    await resetUsers(admin);
    coach = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "progress-coach@test.local",
    });
    a = await createProfileUser(admin, {
      role: "student",
      name: "Ana",
      email: "progress-ana@test.local",
      coachId: coach.id,
    });
    b = await createProfileUser(admin, {
      role: "student",
      name: "Bea",
      email: "progress-bea@test.local",
      coachId: coach.id,
    });
    const ids = await admin
      .from("exercises")
      .select("id,name")
      .in("name", ["Sentadilla", "Press de banca"])
      .is("coach_id", null);
    expect(ids.error).toBeNull();
    exercise = ids.data!.find((e) => e.name === "Press de banca")!.id;
    prescribed = ids.data!.find((e) => e.name === "Sentadilla")!.id;
    const program = await admin
      .from("programs")
      .insert({
        coach_id: coach.id,
        student_id: a.id,
        name: "Prueba progreso",
        weeks_count: 1,
        start_date: "2026-10-19",
        ends_on: "2026-10-25",
      })
      .select("id")
      .single();
    expect(program.error).toBeNull();
    const session = await admin
      .from("program_sessions")
      .insert({ program_id: program.data!.id, week_number: 1, label: "A", position: 0 })
      .select("id")
      .single();
    expect(session.error).toBeNull();
    const source = await admin
      .from("session_exercises")
      .insert({
        program_session_id: session.data!.id,
        exercise_id: prescribed,
        position: 0,
        sets: 2,
        reps_min: 8,
        reps_max: 12,
      })
      .select("id")
      .single();
    expect(source.error).toBeNull();
    expect(
      (
        await admin.from("session_exercise_alternatives").insert({
          session_exercise_id: source.data!.id,
          exercise_id: exercise,
          position: 0,
          sets: 2,
          reps_min: 8,
          reps_max: 12,
        })
      ).error,
    ).toBeNull();
    workoutId = crypto.randomUUID();
    expect(
      (
        await admin.from("workouts").insert({
          id: workoutId,
          student_id: a.id,
          program_session_id: session.data!.id,
          program_id: program.data!.id,
          started_at: "2026-10-24T02:00:00Z",
          finished_at: "2026-10-24T02:30:00Z",
          duration_seconds: 1800,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.from("workout_sets").insert([
          {
            workout_id: workoutId,
            student_id: a.id,
            exercise_id: exercise,
            exercise_name: "Press de banca",
            prescribed_exercise_id: prescribed,
            position: 0,
            set_number: 1,
            weight_kg: 50,
            reps: 10,
            is_warmup: false,
          },
          {
            workout_id: workoutId,
            student_id: a.id,
            exercise_id: exercise,
            exercise_name: "Press de banca",
            prescribed_exercise_id: prescribed,
            position: 0,
            set_number: 2,
            weight_kg: 200,
            reps: 10,
            is_warmup: true,
          },
        ])
      ).error,
    ).toBeNull();
  });
  afterAll(() => resetUsers(admin));
  async function request(user: typeof coach, query = "") {
    const db = await signedInClient(user.email, user.password),
      session = await db.auth.getSession();
    return new Request("https://example.test/" + query, {
      headers: { Authorization: "Bearer " + session.data.session!.access_token },
    });
  }
  it("resume el realizado, excluye calentamientos y enlaza fecha Santiago/evidencia propia", async () => {
    const result = await mobileProgressApi().detail(await request(a), exercise);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(result.headers.get("Set-Cookie")).toBeNull();
    const value = await result.json();
    expect(value.exercise).toMatchObject({
      exerciseId: exercise,
      bestWeightKg: 50,
      workoutCount: 1,
      lastDate: "2026-10-23",
    });
    expect(value.points).toEqual([
      {
        workoutId,
        date: "2026-10-23",
        estimated1RM: 50 * (1 + 10 / 30),
        volumeKg: 500,
        bodyweightReps: 0,
      },
    ]);
    expect((await mobileProgressApi().detail(await request(a), prescribed)).status).toBe(404);
  });
  it("otro alumno y coach sin registros propios no reciben los del alumno", async () => {
    for (const person of [b, coach])
      expect((await mobileProgressApi().detail(await request(person), exercise)).status).toBe(404);
    expect(
      (await mobileProgressApi().detail(await request(coach, "?studentId=" + a.id), exercise))
        .status,
    ).toBe(400);
    expect(
      (await mobileProgressApi().detail(new Request("https://example.test"), exercise)).status,
    ).toBe(401);
  });
  it("el coach que entrena recibe solo sus marcas, aunque RLS permita revisar alumnos en web", async () => {
    const own = crypto.randomUUID();
    expect(
      (
        await admin.from("workouts").insert({
          id: own,
          student_id: coach.id,
          started_at: "2026-10-24T14:00:00Z",
          finished_at: "2026-10-24T14:30:00Z",
          duration_seconds: 1800,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.from("workout_sets").insert({
          workout_id: own,
          student_id: coach.id,
          exercise_id: exercise,
          exercise_name: "Press de banca",
          position: 0,
          set_number: 1,
          weight_kg: 20,
          reps: 10,
          is_warmup: false,
        })
      ).error,
    ).toBeNull();
    const result = await mobileProgressApi().detail(await request(coach), exercise);
    expect(result.status).toBe(200);
    const value = await result.json();
    expect(value.exercise).toMatchObject({ bestWeightKg: 20, workoutCount: 1 });
    expect(value.points.map((p: { workoutId: string }) => p.workoutId)).toEqual([own]);
  });
});
