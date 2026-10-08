import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addComment } from "./comments";
import { getUnreadSummary, listUnread, markCommentsRead } from "./unread";

const admin = adminClient();

describe("comentarios no leídos (RF-37; DC-30)", () => {
  let anaId: string;
  let coachDb: AdminClient;
  let anaDb: AdminClient;
  let beaDb: AdminClient;
  let workoutId: string;

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
    coachDb = await signedInClient(coach.email, coach.password);
    anaDb = await signedInClient(ana.email, ana.password);
    beaDb = await signedInClient(bea.email, bea.password);
  });
  afterAll(() => resetUsers(admin));

  beforeEach(async () => {
    await admin.from("workouts").delete().eq("student_id", anaId);
    workoutId = crypto.randomUUID();
    await admin.from("workouts").insert({
      id: workoutId,
      student_id: anaId,
      started_at: "2026-10-01T15:00:00Z",
      finished_at: "2026-10-01T16:00:00Z",
      duration_seconds: 3600,
    });
  });

  it("el comentario del coach queda sin leer para el alumno, no para el coach", async () => {
    await addComment({ db: coachDb, workoutId, body: "Muy bien" });
    const forAna = await getUnreadSummary(anaDb);
    expect(forAna.totalComments).toBe(1);
    expect(forAna.byWorkout.get(workoutId)).toBe(1);
    expect(forAna.byStudent.get(anaId)).toEqual({ comments: 1, workouts: 1 });
    expect((await getUnreadSummary(coachDb)).totalComments).toBe(0);
  });

  it("el comentario del alumno queda sin leer para el coach", async () => {
    await addComment({ db: anaDb, workoutId, body: "Costó pero salió" });
    const forCoach = await getUnreadSummary(coachDb);
    expect(forCoach.byStudent.get(anaId)).toEqual({ comments: 1, workouts: 1 });
    expect((await getUnreadSummary(anaDb)).totalComments).toBe(0);
  });

  it("abrir el entrenamiento lo deja leído y uno nuevo vuelve a contar", async () => {
    await addComment({ db: coachDb, workoutId, body: "Uno" });
    await addComment({ db: coachDb, workoutId, body: "Dos" });
    expect((await getUnreadSummary(anaDb)).totalComments).toBe(2);

    expect(await markCommentsRead(anaDb, workoutId)).toEqual({ ok: true });
    expect(await listUnread(anaDb)).toEqual([]);

    await addComment({ db: coachDb, workoutId, body: "Tres" });
    expect((await getUnreadSummary(anaDb)).totalComments).toBe(1);
  });

  it("leer no afecta lo que ve la otra parte", async () => {
    await addComment({ db: anaDb, workoutId, body: "Hola coach" });
    await markCommentsRead(anaDb, workoutId);
    expect((await getUnreadSummary(coachDb)).totalComments).toBe(1);
  });

  it("otro alumno no ve ni puede marcar el entrenamiento ajeno", async () => {
    await addComment({ db: coachDb, workoutId, body: "Para Ana" });
    expect(await listUnread(beaDb)).toEqual([]);
    expect(await markCommentsRead(beaDb, workoutId)).toEqual({ ok: false });
    expect((await getUnreadSummary(anaDb)).totalComments).toBe(1);
  });

  it("el coach también puede marcar leído lo de su alumno", async () => {
    await addComment({ db: anaDb, workoutId, body: "Hola" });
    expect(await markCommentsRead(coachDb, workoutId)).toEqual({ ok: true });
    expect((await getUnreadSummary(coachDb)).totalComments).toBe(0);
  });
});
