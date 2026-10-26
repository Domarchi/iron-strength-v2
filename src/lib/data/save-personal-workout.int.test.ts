import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "@/test/int/helpers";
import { savePersonalWorkout } from "./save-personal-workout";
import { mutatePersonalLibrary, readPersonalLibrary } from "./personal-library";
import type { PersonalWorkoutPayload } from "../mobile/personal-workout-contracts";
const admin = adminClient();
describe("guardado personal real y separación", () => {
  let students: AdminClient[], coach: AdminClient, exerciseId: string;
  let people: string[];
  beforeAll(async () => {
    await resetUsers(admin);
    const c = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@personal-workout.test.local",
    });
    coach = await signedInClient(c.email, c.password);
    students = [];
    people = [];
    for (let i = 0; i < 3; i++) {
      const s = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `student${i}@personal-workout.test.local`,
        coachId: c.id,
      });
      people.push(s.id);
      students.push(await signedInClient(s.email, s.password));
    }
    // A shared catalog fixture matches seeded exercises; it must outlive coach/user cleanup.
    const exercise = await admin
      .from("exercises")
      .insert({ name: "Press propio", muscle_group: "Pecho", coach_id: null })
      .select("id")
      .single();
    if (exercise.error) throw exercise.error;
    exerciseId = exercise.data.id;
  });
  afterAll(async () => {
    await resetUsers(admin);
    if (exerciseId) await admin.from("exercises").delete().eq("id", exerciseId);
  });
  const payload = (): PersonalWorkoutPayload => ({
    version: 1,
    id: randomUUID(),
    origin: { kind: "free" },
    title: "Entrenamiento propio",
    startedAt: new Date(Date.now() - 1800000).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: 1800,
    sets: [{ exerciseId, position: 0, setNumber: 1, weightKg: 30, reps: 8, isWarmup: false }],
  });
  it("dos reintentos simultáneos guardan una sola vez; otra cuenta y cambio de contenido no confirman", async () => {
    const input = payload();
    const results = await Promise.all([
      savePersonalWorkout(students[0], input),
      savePersonalWorkout(students[0], input),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["created", "duplicate"]);
    expect(results.every((r) => r.workoutId === input.id)).toBe(true);
    expect(
      (await students[0].from("workout_sets").select("id").eq("workout_id", input.id)).data,
    ).toHaveLength(1);
    expect((await students[1].from("workouts").select("id").eq("id", input.id)).data).toHaveLength(
      0,
    );
    expect((await students[2].from("workouts").select("id").eq("id", input.id)).data).toHaveLength(
      0,
    );
    expect((await coach.from("workouts").select("id").eq("id", input.id)).data).toHaveLength(1);
    expect((await coach.from("personal_workout_receipts").select("workout_id")).data).toHaveLength(
      0,
    );
    await expect(
      savePersonalWorkout(students[0], { ...input, title: "Otro" }),
    ).rejects.toMatchObject({ code: "23505" });
    await students[0].from("workouts").delete().eq("id", input.id);
    expect(await savePersonalWorkout(students[0], input)).toMatchObject({ status: "removed" });
  });
  it("rutina propia guarda revisión iniciada aunque la base cambie, sin programa ni cumplimiento ficticio", async () => {
    const routineId = randomUUID();
    await mutatePersonalLibrary(students[0], {
      version: 1,
      operation: "routine_create",
      requestId: randomUUID(),
      targetId: routineId,
      expectedRevision: 0,
      data: { name: "Base", folderId: null, items: [] },
    });
    const before = (await readPersonalLibrary(students[0])).routines.find(
      (r) => r.id === routineId,
    )!;
    await mutatePersonalLibrary(students[0], {
      version: 1,
      operation: "routine_save",
      requestId: randomUUID(),
      targetId: routineId,
      expectedRevision: before.revision,
      data: { name: "Base cambiada", items: [] },
    });
    const input = {
      ...payload(),
      origin: { kind: "personal" as const, routineId, revision: before.revision },
    };
    expect(await savePersonalWorkout(students[0], input)).toMatchObject({ status: "created" });
    const saved = await students[0]
      .from("workouts")
      .select("source_kind,program_id,program_session_id,session_label,personal_routine_revision")
      .eq("id", input.id)
      .single();
    expect(saved.data).toMatchObject({
      source_kind: "personal",
      program_id: null,
      program_session_id: null,
      session_label: null,
      personal_routine_revision: before.revision,
    });
    await expect(
      savePersonalWorkout(students[1], { ...input, id: randomUUID() }),
    ).rejects.toMatchObject({ code: "P0002" });
    await students[0].from("personal_routines").delete().eq("id", routineId);
    expect(await savePersonalWorkout(students[0], input)).toMatchObject({ status: "duplicate" });
  });
  it("los tres alumnos y el coach entrenan con identidad propia; GoTrue limpia recibos solo del borrado", async () => {
    const inputs: PersonalWorkoutPayload[] = [];
    for (const db of [...students, coach]) {
      const input = payload();
      inputs.push(input);
      expect(await savePersonalWorkout(db, input)).toMatchObject({ status: "created" });
    }
    expect(
      (await students[1].from("personal_workout_receipts").select("workout_id")).data?.every(
        (r) => r.workout_id === inputs[1].id,
      ),
    ).toBe(true);
    const deleted = await admin.auth.admin.deleteUser(people[1]);
    expect(deleted.error).toBeNull();
    expect(
      (await admin.from("personal_workout_receipts").select("workout_id").eq("owner_id", people[1]))
        .data,
    ).toHaveLength(0);
    expect(
      (await students[2].from("workouts").select("id").eq("id", inputs[2].id)).data,
    ).toHaveLength(1);
  });
});
