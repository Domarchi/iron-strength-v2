// T219 · Acceptance through the real isolated backend; never production.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { addDays, mondayOf, santiagoDate } from "@/domain/dates";
import { getStreakSummary } from "@/lib/data/streak";
import { listWorkouts } from "@/lib/data/workouts";
import { getWeekView } from "@/lib/data/week";
const admin = adminClient();
let coachId: string, owner: string, db: AdminClient, exerciseId: string;
beforeAll(async () => {
  await resetUsers(admin);
  const coach = await createProfileUser(admin, {
    role: "coach",
    name: "Coach Capacidad",
    email: "coach@history-capacity.test.local",
  });
  coachId = coach.id;
  const person = await createProfileUser(admin, {
    role: "student",
    name: "Alumno Capacidad",
    email: "student@history-capacity.test.local",
    coachId,
  });
  owner = person.id;
  db = await signedInClient(person.email, person.password);
  const exercise = await admin
    .from("exercises")
    .select("id")
    .eq("name", "Sentadilla")
    .is("coach_id", null)
    .single();
  expect(exercise.error).toBeNull();
  exerciseId = exercise.data!.id;
});
beforeEach(async () => {
  expect((await admin.from("workouts").delete().eq("student_id", owner)).error).toBeNull();
  expect((await admin.from("programs").delete().eq("student_id", owner)).error).toBeNull();
});
afterAll(async () => {
  await resetUsers(admin);
});
it("conserva1001semanas completas frente al límite REST de1000sin convertirlas en una racha parcial", async () => {
  const today = santiagoDate(new Date()),
    monday = mondayOf(today);
  const data = Array.from({ length: 1001 }, (_, i) => ({
    programId: randomUUID(),
    sessionId: randomUUID(),
    workoutId: randomUUID(),
    start: addDays(monday, -7 * (1000 - i)),
  }));
  for (let from = 0; from < data.length; from += 200) {
    const rows = data.slice(from, from + 200);
    expect(
      (
        await admin.from("programs").insert(
          rows.map((r, i) => ({
            id: r.programId,
            coach_id: coachId,
            student_id: owner,
            name: `Semana ${from + i}`,
            weeks_count: 1,
            start_date: r.start,
            ends_on: addDays(r.start, 6),
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.from("program_sessions").insert(
          rows.map((r) => ({
            id: r.sessionId,
            program_id: r.programId,
            week_number: 1,
            label: "A",
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.from("session_exercises").insert(
          rows.map((r) => ({
            program_session_id: r.sessionId,
            exercise_id: exerciseId,
            position: 0,
            sets: 1,
            reps_min: 8,
            reps_max: 12,
            target_weight_kg: 30,
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.from("workouts").insert(
          rows.map((r) => {
            const at = r.start === monday ? new Date().toISOString() : `${r.start}T15:00:00Z`;
            return {
              id: r.workoutId,
              student_id: owner,
              program_id: r.programId,
              program_session_id: r.sessionId,
              session_label: "A",
              started_at: at,
              finished_at: at,
              duration_seconds: 0,
            };
          }),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await admin.from("workout_sets").insert(
          rows.map((r) => ({
            workout_id: r.workoutId,
            student_id: owner,
            exercise_id: exerciseId,
            exercise_name: "Sentadilla",
            position: 0,
            set_number: 1,
            weight_kg: 30,
            reps: 8,
            is_warmup: false,
          })),
        )
      ).error,
    ).toBeNull();
  }
  const result = await getStreakSummary(db, owner, today);
  expect(result).toMatchObject({ current: 1001, longest: 1001 });
  expect(result.calendar.at(-1)).toMatchObject({
    weekStart: monday,
    current: true,
    done: 1,
    planned: 1,
  });
  // Select the actual omitted programme rather than assuming an unspecified REST order.
  const capped = await db
    .from("programs")
    .select("id, name, weeks_count, start_date, ends_on")
    .eq("student_id", owner);
  expect(capped.error).toBeNull();
  expect(capped.data).toHaveLength(1000);
  const seen = new Set(capped.data!.map((p) => p.id));
  const omitted = data.find((p) => !seen.has(p.programId))!;
  expect(omitted).toBeDefined();
  const omittedView = await getWeekView(db, owner, omitted.start);
  expect(omittedView).toMatchObject({
    kind: "active",
    program: { id: omitted.programId },
  });
  expect(await getWeekView(db, owner, today)).toMatchObject({
    kind: "active",
    program: { id: data.at(-1)!.programId },
  });
  expect(await getWeekView(db, owner, addDays(monday, 14))).toMatchObject({
    kind: "finished",
    program: { id: data.at(-1)!.programId },
  });
  expect(await getWeekView(db, owner, addDays(data[0].start, -7))).toMatchObject({
    kind: "scheduled",
    program: { id: data[0].programId },
  });
});
it("dos resultados con el mismo instante se recorren en páginas de uno sin perder ni repetir IDs", async () => {
  const ids = [randomUUID(), randomUUID()],
    at = new Date().toISOString();
  expect(
    (
      await admin.from("workouts").insert(
        ids.map((id, i) => ({
          id,
          student_id: owner,
          started_at: at,
          finished_at: at,
          duration_seconds: 0,
          note: `Nota ${i}`,
        })),
      )
    ).error,
  ).toBeNull();
  const first = await listWorkouts(db, owner, { limit: 1 });
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).toBeTruthy();
  const second = await listWorkouts(db, owner, {
    limit: 1,
    cursor: first.nextCursor!,
  });
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((w) => w.id))).toEqual(new Set(ids));
});

it("cursor opaco sobrevive a borrar su frontera; ISO anterior ambiguo/ausente exige reiniciar y otro dueño se rechaza", async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()],
    at = new Date().toISOString(),
    old = new Date(Date.now() - 86400000).toISOString();
  expect(
    (
      await admin.from("workouts").insert(
        ids.map((id, i) => ({
          id,
          student_id: owner,
          started_at: i === 2 ? old : at,
          finished_at: i === 2 ? old : at,
          duration_seconds: 0,
        })),
      )
    ).error,
  ).toBeNull();
  await expect(listWorkouts(db, owner, { cursor: at })).rejects.toMatchObject({ code: "stale" });
  await expect(listWorkouts(db, owner, { cursor: "2020-01-01T00:00:00Z" })).rejects.toMatchObject({
    code: "stale",
  });
  const legacy = await listWorkouts(db, owner, { cursor: old });
  expect(legacy.items).toEqual([]);
  const first = await listWorkouts(db, owner, { limit: 1 });
  const token = first.nextCursor!;
  await expect(
    listWorkouts(db, owner, { cursor: token.replace(owner, coachId) }),
  ).rejects.toMatchObject({ code: "invalid" });
  expect((await admin.from("workouts").delete().eq("id", first.items[0].id)).error).toBeNull();
  const second = await listWorkouts(db, owner, { limit: 2, cursor: token });
  expect(second.items).toHaveLength(2);
  expect(new Set([...first.items, ...second.items].map((w) => w.id))).toEqual(new Set(ids));
  for (const cursor of [[], "v3|unknown", "id.gt.0"])
    await expect(listWorkouts(db, owner, { cursor })).rejects.toMatchObject({ code: "invalid" });
  for (const limit of [0, 1000, 1.5])
    await expect(listWorkouts(db, owner, { limit })).rejects.toMatchObject({ code: "invalid" });
});
