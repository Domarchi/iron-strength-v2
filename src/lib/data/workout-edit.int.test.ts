import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addDays, santiagoDate } from "@/domain/dates";
import { deleteWorkout, updateWorkoutSets } from "./workout-edit";

const admin = adminClient();

describe("editar y borrar entrenamientos (RF-26b)", () => {
  let studentId: string;
  let otherId: string;
  let studentDb: AdminClient;
  let otherDb: AdminClient;
  let coachDb: AdminClient;
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
    studentId = student.id;
    otherId = other.id;
    coachDb = await signedInClient(coach.email, coach.password);
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
  });

  const today = santiagoDate(new Date());
  // Mediodía en Santiago de hace N días (evita ambigüedad cerca de la medianoche)
  const daysAgo = (n: number) => {
    const date = addDays(today, -n);
    return new Date(`${date}T15:00:00Z`).toISOString();
  };

  async function workout(ago: number, student = studentId) {
    const id = crypto.randomUUID();
    const startedAt = daysAgo(ago);
    await admin.from("workouts").insert({
      id,
      student_id: student,
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
      duration_seconds: 3600,
      created_at: startedAt,
    });
    const { data } = await admin
      .from("workout_sets")
      .insert([
        {
          workout_id: id,
          student_id: student,
          exercise_id: exerciseId,
          exercise_name: "Sentadilla",
          position: 0,
          set_number: 1,
          weight_kg: 60,
          reps: 10,
          is_warmup: false,
        },
        {
          workout_id: id,
          student_id: student,
          exercise_id: exerciseId,
          exercise_name: "Sentadilla",
          position: 0,
          set_number: 2,
          weight_kg: 60,
          reps: 8,
          is_warmup: false,
        },
      ])
      .select("id, set_number");
    return { id, setIds: data!.sort((a, b) => a.set_number - b.set_number).map((s) => s.id) };
  }

  it("edita peso, repeticiones y calentamiento de las series dentro de la ventana", async () => {
    const w = await workout(2);
    const result = await updateWorkoutSets({
      db: studentDb,
      workoutId: w.id,
      sets: [
        { id: w.setIds[0], weightKg: "62,5", reps: "9", isWarmup: false },
        { id: w.setIds[1], weightKg: "40", reps: "12", isWarmup: true },
      ],
    });
    expect(result).toEqual({ ok: true });
    const { data } = await admin
      .from("workout_sets")
      .select("weight_kg, reps, is_warmup")
      .eq("workout_id", w.id)
      .order("set_number");
    expect(data).toEqual([
      { weight_kg: 62.5, reps: 9, is_warmup: false },
      { weight_kg: 40, reps: 12, is_warmup: true },
    ]);
  });

  it("el día 7 todavía se edita; el día 8 no, y los datos quedan intactos", async () => {
    const edge = await workout(7);
    const late = await workout(8);
    const set = (id: string) => [{ id, weightKg: "99", reps: "5", isWarmup: false }];

    expect(
      await updateWorkoutSets({ db: studentDb, workoutId: edge.id, sets: set(edge.setIds[0]) }),
    ).toEqual({ ok: true });
    expect(
      await updateWorkoutSets({ db: studentDb, workoutId: late.id, sets: set(late.setIds[0]) }),
    ).toEqual({ ok: false, reason: "locked" });

    const { data } = await admin
      .from("workout_sets")
      .select("weight_kg")
      .eq("id", late.setIds[0])
      .single();
    expect(data!.weight_kg).toBe(60);
  });

  it("quita series, pero no todas (para eso se borra el entrenamiento)", async () => {
    const w = await workout(1);
    expect(
      await updateWorkoutSets({
        db: studentDb,
        workoutId: w.id,
        sets: [],
        removeSetIds: [w.setIds[1]],
      }),
    ).toEqual({ ok: true });
    const { count } = await admin
      .from("workout_sets")
      .select("id", { count: "exact", head: true })
      .eq("workout_id", w.id);
    expect(count).toBe(1);

    expect(
      await updateWorkoutSets({
        db: studentDb,
        workoutId: w.id,
        sets: [],
        removeSetIds: [w.setIds[0]],
      }),
    ).toEqual({ ok: false, reason: "no_sets" });
  });

  it("rechaza valores fuera de los límites sin cambiar nada", async () => {
    const w = await workout(1);
    for (const bad of [
      { weightKg: "501", reps: "5" },
      { weightKg: "60", reps: "0" },
      { weightKg: "60", reps: "101" },
      { weightKg: "-1", reps: "5" },
    ]) {
      expect(
        await updateWorkoutSets({
          db: studentDb,
          workoutId: w.id,
          sets: [{ id: w.setIds[0], isWarmup: false, ...bad }],
        }),
      ).toEqual({ ok: false, reason: "invalid" });
    }
    const { data } = await admin
      .from("workout_sets")
      .select("weight_kg, reps")
      .eq("id", w.setIds[0])
      .single();
    expect(data).toEqual({ weight_kg: 60, reps: 10 });
  });

  it("no se pueden tocar series de otro entrenamiento ni de otro alumno", async () => {
    const mine = await workout(1);
    const theirs = await workout(1, otherId);
    expect(
      await updateWorkoutSets({
        db: studentDb,
        workoutId: mine.id,
        sets: [{ id: theirs.setIds[0], weightKg: "1", reps: "1", isWarmup: false }],
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await updateWorkoutSets({
        db: studentDb,
        workoutId: theirs.id,
        sets: [{ id: theirs.setIds[0], weightKg: "1", reps: "1", isWarmup: false }],
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(
      await updateWorkoutSets({
        db: coachDb,
        workoutId: mine.id,
        sets: [{ id: mine.setIds[0], weightKg: "1", reps: "1", isWarmup: false }],
      }),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("borra un entrenamiento dentro de la ventana, con sus series", async () => {
    const w = await workout(3);
    expect(await deleteWorkout({ db: studentDb, workoutId: w.id })).toEqual({ ok: true });
    const { count } = await admin
      .from("workout_sets")
      .select("id", { count: "exact", head: true })
      .eq("workout_id", w.id);
    expect(count).toBe(0);
  });

  it("no borra fuera de la ventana, ni uno ajeno, ni uno inexistente", async () => {
    const late = await workout(8);
    const theirs = await workout(1, otherId);
    expect(await deleteWorkout({ db: studentDb, workoutId: late.id })).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(await deleteWorkout({ db: studentDb, workoutId: theirs.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteWorkout({ db: otherDb, workoutId: crypto.randomUUID() })).toEqual({
      ok: false,
      reason: "not_found",
    });
    const { count } = await admin
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .in("id", [late.id, theirs.id]);
    expect(count).toBe(2);
  });
});
