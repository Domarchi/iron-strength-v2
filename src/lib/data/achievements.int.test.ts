import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { listAchievements, syncAchievements } from "./achievements";

const admin = adminClient();

describe("logros (RF-31, RF-66; DC-17, DC-28)", () => {
  let anaId: string;
  let beaId: string;
  let anaDb: AdminClient;
  let beaDb: AdminClient;
  let coachDb: AdminClient;
  let squat: string;

  // Guarda un entrenamiento de Ana con una serie (día distinto cada vez, hacia atrás desde hoy).
  async function workout(weight: number, daysAgo: number, studentId = anaId): Promise<string> {
    const id = crypto.randomUUID();
    const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    await admin.from("workouts").insert({
      id,
      student_id: studentId,
      started_at: at,
      finished_at: at,
      duration_seconds: 3000,
    });
    await admin.from("workout_sets").insert({
      workout_id: id,
      student_id: studentId,
      exercise_id: squat,
      exercise_name: "Sentadilla",
      position: 0,
      set_number: 1,
      weight_kg: weight,
      reps: 10,
      is_warmup: false,
    });
    return id;
  }

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
    anaId = ana.id;
    beaId = bea.id;
    anaDb = await signedInClient(ana.email, ana.password);
    beaDb = await signedInClient(bea.email, bea.password);
    coachDb = await signedInClient(coach.email, coach.password);
    squat = (
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
    await admin.from("achievements").delete().in("student_id", [anaId, beaId]);
    await admin.from("workouts").delete().in("student_id", [anaId, beaId]);
  });

  it("sin entrenamientos no hay logros", async () => {
    expect(await syncAchievements({ db: anaDb, studentId: anaId })).toEqual([]);
    expect(await listAchievements(anaDb, anaId)).toEqual([]);
  });

  it("el primer entrenamiento otorga 'first_workout' una sola vez", async () => {
    const id = await workout(60, 1);
    expect(await syncAchievements({ db: anaDb, studentId: anaId, workoutId: id })).toEqual([
      "first_workout",
    ]);
    expect(await syncAchievements({ db: anaDb, studentId: anaId, workoutId: id })).toEqual([]);
    expect((await listAchievements(anaDb, anaId)).map((a) => a.kind)).toEqual(["first_workout"]);
  });

  it("un entrenamiento sin series no cuenta", async () => {
    await admin.from("workouts").insert({
      id: crypto.randomUUID(),
      student_id: anaId,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_seconds: 10,
    });
    expect(await syncAchievements({ db: anaDb, studentId: anaId })).toEqual([]);
  });

  it("superar la mejor marca otorga 'first_record' (el primer registro de un ejercicio no cuenta)", async () => {
    const first = await workout(60, 5);
    expect(await syncAchievements({ db: anaDb, studentId: anaId, workoutId: first })).toEqual([
      "first_workout",
    ]);

    const better = await workout(70, 1);
    expect(await syncAchievements({ db: anaDb, studentId: anaId, workoutId: better })).toEqual([
      "first_record",
    ]);
  });

  it("llegar a 10 entrenamientos otorga 'workouts_10' y nada más", async () => {
    for (let i = 0; i < 9; i++) await workout(60, 20 - i);
    await syncAchievements({ db: anaDb, studentId: anaId });
    const tenth = await workout(60, 1);
    expect(await syncAchievements({ db: anaDb, studentId: anaId, workoutId: tenth })).toEqual([
      "workouts_10",
    ]);
  });

  it("los logros son permanentes: borrar entrenamientos no los quita", async () => {
    const id = await workout(60, 1);
    await syncAchievements({ db: anaDb, studentId: anaId, workoutId: id });
    await admin.from("workouts").delete().eq("student_id", anaId);
    expect((await listAchievements(anaDb, anaId)).map((a) => a.kind)).toEqual(["first_workout"]);
    expect(await syncAchievements({ db: anaDb, studentId: anaId })).toEqual([]);
  });

  it("el coach ve los logros de su alumno y otro alumno no", async () => {
    const id = await workout(60, 1);
    await syncAchievements({ db: anaDb, studentId: anaId, workoutId: id });
    expect((await listAchievements(coachDb, anaId)).map((a) => a.kind)).toEqual(["first_workout"]);
    expect(await listAchievements(beaDb, anaId)).toEqual([]);
  });

  it("un alumno no puede otorgarle logros a otro", async () => {
    const { error } = await beaDb
      .from("achievements")
      .insert({ student_id: anaId, kind: "workouts_50" });
    expect(error).not.toBeNull();
    expect(await listAchievements(coachDb, anaId)).toEqual([]);
  });
});
