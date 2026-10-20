import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { saveWorkout } from "./save-workout";
import { getWorkoutDetail } from "./workouts";
import { listExerciseHistory } from "./exercise-history";
import { getProgramTree } from "./programs";
import { getWorkoutContext } from "./workout-context";
import { mondayOf, santiagoDate } from "@/domain/dates";
const admin = adminClient();
let db: AdminClient, coachDb: AdminClient;
let studentId: string, programId: string, sessionId: string, rowId: string;
let catalog: { id: string; name: string }[];
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "switch-coach@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "switch-student@test.local",
    coachId: coach.id,
  });
  studentId = student.id;
  db = await signedInClient(student.email, student.password);
  coachDb = await signedInClient(coach.email, coach.password);
  catalog = (await admin.from("exercises").select("id,name").is("coach_id", null).limit(3)).data!;
  const template = (
    await coachDb
      .from("programs")
      .insert({ coach_id: coach.id, name: "Sustitución", weeks_count: 1 })
      .select("id")
      .single()
  ).data!.id;
  const session = (
    await coachDb
      .from("program_sessions")
      .insert({ program_id: template, week_number: 1, label: "A" })
      .select("id")
      .single()
  ).data!.id;
  const row = (
    await coachDb
      .from("session_exercises")
      .insert({
        program_session_id: session,
        exercise_id: catalog[0].id,
        position: 0,
        sets: 3,
        reps_min: 8,
        reps_max: 12,
      })
      .select("id")
      .single()
  ).data!.id;
  expect(
    (
      await coachDb.from("session_exercise_alternatives").insert({
        session_exercise_id: row,
        exercise_id: catalog[1].id,
        position: 0,
        sets: 2,
        reps_min: 6,
        reps_max: 10,
        target_weight_kg: 22.5,
      })
    ).error,
  ).toBeNull();
  const assigned = await coachDb.rpc("assign_program", {
    p_template_id: template,
    p_student_id: studentId,
    p_start_date: mondayOf(santiagoDate(new Date())),
  });
  expect(assigned.error).toBeNull();
  programId = assigned.data!;
  const tree = (await getProgramTree(db, programId))!;
  sessionId = tree.sessions[0].id;
  rowId = tree.sessions[0].exercises[0].id;
});
afterAll(() => resetUsers(admin));
function payload(exerciseId = catalog[1].id) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    programId,
    programSessionId: sessionId,
    sessionLabel: "A",
    startedAt: now,
    finishedAt: now,
    durationSeconds: 0,
    sets: [
      {
        sessionExerciseId: rowId,
        prescribedExerciseId: catalog[0].id,
        exerciseId,
        exerciseName: "Nombre enviado",
        position: 0,
        setNumber: 1,
        weightKg: 22.5,
        reps: 8,
        isWarmup: false,
      },
    ],
  };
}
it("ofrece las alternativas con su contexto y guarda original/realizado para coach e historial", async () => {
  const context = await getWorkoutContext(db, studentId, sessionId);
  expect(context.ok).toBe(true);
  if (context.ok)
    expect(context.context.exercises[0].alternatives?.[0]).toMatchObject({
      exerciseId: catalog[1].id,
      prescribed: { sets: 2, repsMin: 6, repsMax: 10, targetWeightKg: 22.5 },
    });
  const request = payload();
  expect(await saveWorkout({ db, payload: request })).toEqual({ ok: true, status: "created" });
  expect(await saveWorkout({ db, payload: request })).toEqual({ ok: true, status: "duplicate" });
  const saved = (await getWorkoutDetail(coachDb, request.id))!;
  expect(saved.exercises[0]).toMatchObject({
    exerciseId: catalog[1].id,
    name: catalog[1].name,
    prescribedExerciseId: catalog[0].id,
    prescribedExerciseName: catalog[0].name,
  });
  expect(
    (await listExerciseHistory(db, studentId, catalog[1].id)).items.map((w) => w.id),
  ).toContain(request.id);
  expect(
    (await listExerciseHistory(db, studentId, catalog[0].id)).items.map((w) => w.id),
  ).not.toContain(request.id);
});
it("rechaza alternativa no autorizada aunque se invoque directamente la RPC o se omita el origen", async () => {
  const request = payload(catalog[2].id);
  expect((await db.rpc("save_workout", { p_workout: request })).error?.code).toBe("P0001");
  expect((await admin.from("workouts").select("id").eq("id", request.id)).data).toEqual([]);
  const legacy = {
    ...request,
    id: crypto.randomUUID(),
    sets: request.sets.map(
      ({ sessionExerciseId: _row, prescribedExerciseId: _original, ...s }) => s,
    ),
  };
  expect((await db.rpc("save_workout", { p_workout: legacy })).error?.code).toBe("P0001");
});
it("escritura directa tampoco elude autorización ni mezcla identidades en una posición", async () => {
  const request = payload();
  expect((await saveWorkout({ db, payload: request })).ok).toBe(true);
  const response = await db.from("workout_sets").insert({
    workout_id: request.id,
    student_id: studentId,
    exercise_id: catalog[2].id,
    exercise_name: catalog[2].name,
    position: 0,
    set_number: 2,
    weight_kg: 20,
    reps: 10,
    is_warmup: false,
    session_exercise_id: rowId,
  });
  expect(response.error?.code).toBe("P0001");
  expect(
    (
      await db
        .from("workout_sets")
        .update({ exercise_id: catalog[0].id })
        .eq("workout_id", request.id)
    ).error?.code,
  ).toBe("P0001");
});

it("no desvincula una sesión planificada para eludir las alternativas", async () => {
  const request = payload();
  expect((await saveWorkout({ db, payload: request })).ok).toBe(true);
  expect(
    (await db.from("workouts").update({ program_session_id: null }).eq("id", request.id)).error
      ?.code,
  ).toBe("P0001");
});
