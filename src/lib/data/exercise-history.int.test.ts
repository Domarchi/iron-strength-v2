import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { listExerciseHistory } from "./exercise-history";
const admin = adminClient();
let db: AdminClient, coachDb: AdminClient;
let studentId: string, otherId: string, exerciseId: string;
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach",
    email: "history-coach@test.local",
  });
  const student = await createProfileUser(admin, {
    role: "student",
    name: "Alumno",
    email: "history-student@test.local",
    coachId: coach.id,
  });
  const other = await createProfileUser(admin, {
    role: "student",
    name: "Otro",
    email: "history-other@test.local",
    coachId: coach.id,
  });
  studentId = student.id;
  otherId = other.id;
  db = await signedInClient(student.email, student.password);
  coachDb = await signedInClient(coach.email, coach.password);
  const catalog = (await admin.from("exercises").select("id").is("coach_id", null).limit(2)).data!;
  exerciseId = catalog[0].id;
  for (const owner of [studentId, otherId]) {
    const workouts = Array.from({ length: 12 }, () => ({
      id: crypto.randomUUID(),
      student_id: owner,
      started_at: "2026-10-01T15:00:00Z",
      finished_at: "2026-10-01T15:01:00Z",
      duration_seconds: 60,
    }));
    expect((await admin.from("workouts").insert(workouts)).error).toBeNull();
    expect(
      (
        await admin.from("workout_sets").insert(
          workouts.flatMap((w) =>
            [0, 1, 2].map((position) => ({
              workout_id: w.id,
              student_id: owner,
              exercise_id: position === 2 ? catalog[1].id : exerciseId,
              exercise_name: "Ejercicio",
              position,
              set_number: 1,
              weight_kg: 50,
              reps: 10,
              is_warmup: position === 0,
            })),
          ),
        )
      ).error,
    ).toBeNull();
  }
});
afterAll(() => resetUsers(admin));
it("pagina por entrenamientos y no pierde empates de fecha ni repeticiones del ejercicio", async () => {
  const first = await listExerciseHistory(db, studentId, exerciseId);
  expect(first.items).toHaveLength(10);
  expect(first.nextCursor).not.toBeNull();
  const second = await listExerciseHistory(db, studentId, exerciseId, { cursor: first.nextCursor });
  expect(second.items).toHaveLength(2);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((w) => w.id)).size).toBe(12);
  for (const item of first.items) {
    expect(item.date).toBe("2026-10-01");
    expect(item.sets.map((s) => s.position)).toEqual([0, 1]);
    expect(item.sets[0].isWarmup).toBe(true);
  }
});
it("aplica RLS al alumno y permite al coach leer a su alumno", async () => {
  expect((await listExerciseHistory(db, otherId, exerciseId)).items).toEqual([]);
  expect((await listExerciseHistory(coachDb, studentId, exerciseId)).items).toHaveLength(10);
  expect((await listExerciseHistory(db, studentId, crypto.randomUUID())).items).toEqual([]);
});
it("rechaza cursores e identidades malformadas antes de consultar", async () => {
  await expect(
    listExerciseHistory(db, studentId, exerciseId, {
      cursor: { startedAt: "x),id.gt.0", id: exerciseId },
    }),
  ).rejects.toThrow("inválido");
  await expect(listExerciseHistory(db, studentId, "roto")).rejects.toThrow("inválido");
});
