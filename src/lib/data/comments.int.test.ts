import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addComment, deleteComment, listComments } from "./comments";

const admin = adminClient();

describe("comentarios por entrenamiento (RF-36, DC-14)", () => {
  let coachId: string;
  let anaId: string;
  let beaId: string;
  let coachDb: AdminClient;
  let anaDb: AdminClient;
  let beaDb: AdminClient;
  let workoutId: string;
  let exerciseId: string;

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
    beaDb = await signedInClient(bea.email, bea.password);
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
    await admin.from("workouts").delete().in("student_id", [anaId, beaId]);
    workoutId = crypto.randomUUID();
    await admin.from("workouts").insert({
      id: workoutId,
      student_id: anaId,
      started_at: "2026-10-01T15:00:00Z",
      finished_at: "2026-10-01T16:00:00Z",
      duration_seconds: 3600,
    });
    await admin.from("workout_sets").insert({
      workout_id: workoutId,
      student_id: anaId,
      exercise_id: exerciseId,
      exercise_name: "Sentadilla",
      position: 0,
      set_number: 1,
      weight_kg: 60,
      reps: 10,
      is_warmup: false,
    });
  });

  it("el alumno y el coach comentan, y cada uno ve la conversación en orden", async () => {
    expect(
      await addComment({ db: anaDb, workoutId, body: "Me costó la última serie" }),
    ).toMatchObject({ ok: true });
    expect(
      await addComment({ db: coachDb, workoutId, body: "Bien, la próxima baja más lento" }),
    ).toMatchObject({ ok: true });

    const asStudent = await listComments({
      db: anaDb,
      workoutId,
      viewerId: anaId,
      studentId: anaId,
    });
    expect(asStudent.map((c) => [c.authorKind, c.mine, c.body])).toEqual([
      ["student", true, "Me costó la última serie"],
      ["coach", false, "Bien, la próxima baja más lento"],
    ]);

    const asCoach = await listComments({
      db: coachDb,
      workoutId,
      viewerId: coachId,
      studentId: anaId,
    });
    expect(asCoach.map((c) => [c.authorKind, c.mine])).toEqual([
      ["student", false],
      ["coach", true],
    ]);
  });

  it("valida el largo: 1 a 500 caracteres", async () => {
    expect(await addComment({ db: anaDb, workoutId, body: "a".repeat(500) })).toMatchObject({
      ok: true,
    });
    expect(await addComment({ db: anaDb, workoutId, body: "a".repeat(501) })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await addComment({ db: anaDb, workoutId, body: "   " })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("otro alumno no puede ver ni comentar un entrenamiento ajeno", async () => {
    await addComment({ db: anaDb, workoutId, body: "privado" });
    expect(await addComment({ db: beaDb, workoutId, body: "intruso" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await listComments({ db: beaDb, workoutId, viewerId: beaId, studentId: anaId })).toEqual(
      [],
    );
  });

  it("un entrenamiento inexistente da not_found", async () => {
    expect(await addComment({ db: anaDb, workoutId: crypto.randomUUID(), body: "hola" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("cada uno borra solo lo suyo; los comentarios no se editan", async () => {
    const mine = await addComment({ db: anaDb, workoutId, body: "mío" });
    const coachs = await addComment({ db: coachDb, workoutId, body: "del coach" });
    if (!mine.ok || !coachs.ok) throw new Error("debían crearse");

    expect(await deleteComment({ db: anaDb, id: coachs.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteComment({ db: coachDb, id: mine.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteComment({ db: anaDb, id: mine.id })).toEqual({ ok: true });
    expect(await deleteComment({ db: coachDb, id: coachs.id })).toEqual({ ok: true });
    expect(await listComments({ db: anaDb, workoutId, viewerId: anaId, studentId: anaId })).toEqual(
      [],
    );
  });

  it("un alumno desactivado con la sesión abierta no puede comentar ni ver", async () => {
    const own = crypto.randomUUID();
    await admin.from("workouts").insert({
      id: own,
      student_id: beaId,
      started_at: "2026-10-01T15:00:00Z",
      finished_at: "2026-10-01T16:00:00Z",
      duration_seconds: 3600,
    });
    await admin.from("workout_sets").insert({
      workout_id: own,
      student_id: beaId,
      exercise_id: exerciseId,
      exercise_name: "Sentadilla",
      position: 0,
      set_number: 1,
      weight_kg: 60,
      reps: 10,
      is_warmup: false,
    });
    expect(await addComment({ db: beaDb, workoutId: own, body: "antes" })).toMatchObject({
      ok: true,
    });

    await admin.from("profiles").update({ is_active: false }).eq("id", beaId);
    try {
      expect(await addComment({ db: beaDb, workoutId: own, body: "después" })).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(
        await listComments({ db: beaDb, workoutId: own, viewerId: beaId, studentId: beaId }),
      ).toEqual([]);
    } finally {
      await admin.from("profiles").update({ is_active: true }).eq("id", beaId);
    }
  });
});
