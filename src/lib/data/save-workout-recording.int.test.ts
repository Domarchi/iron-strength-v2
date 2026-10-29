import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createProfileUser,
  resetUsers,
  signedInClient,
  type AdminClient,
} from "../../test/int/helpers";
import { recordingFixture } from "../../test/fixtures/workout-recording";
import { recordingPayloadSchema, type RecordingPayload } from "../mobile/recording-contracts";
import { saveWorkoutRecording } from "./save-workout-recording";
import { getWorkoutDetail } from "./workouts";
const admin = adminClient();
describe("registro y estructura reales", () => {
  let students: AdminClient[], coach: AdminClient, people: string[], exercises: string[];
  beforeAll(async () => {
    await resetUsers(admin);
    const c = await createProfileUser(admin, {
      role: "coach",
      name: "Coach",
      email: "coach@recording.test.local",
    });
    coach = await signedInClient(c.email, c.password);
    students = [];
    people = [];
    for (let i = 0; i < 3; i++) {
      const p = await createProfileUser(admin, {
        role: "student",
        name: "Alumno",
        email: `student${i}@recording.test.local`,
        coachId: c.id,
      });
      people.push(p.id);
      students.push(await signedInClient(p.email, p.password));
    }
    const result = await admin
      .from("exercises")
      .insert([
        { name: "Press", muscle_group: "Pecho", coach_id: null },
        { name: "Remo", muscle_group: "Espalda", coach_id: null },
      ])
      .select("id");
    if (result.error) throw result.error;
    exercises = result.data.map((row) => row.id);
  });
  afterAll(async () => {
    await resetUsers(admin);
    if (exercises?.length) await admin.from("exercises").delete().in("id", exercises);
  });
  function payload(): RecordingPayload {
    const value = recordingFixture(),
      id = randomUUID();
    value.id = id;
    value.workout.id = id;
    value.workout.startedAt = new Date(Date.now() - 1800000).toISOString();
    value.workout.finishedAt = new Date().toISOString();
    value.structure.exercises.forEach((row, i) => {
      row.exerciseId = exercises[i];
    });
    value.workout.sets.forEach((row, i) => {
      row.exerciseId = exercises[i];
    });
    return recordingPayloadSchema.parse(value);
  }
  it("dos solicitudes concurrentes confirman un resultado completo, legible al propietario y coach", async () => {
    const value = payload();
    const results = await Promise.all([
      saveWorkoutRecording(students[0], value),
      saveWorkoutRecording(students[0], value),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual(["created", "duplicate"]);
    for (const reader of [students[0], coach])
      expect(await getWorkoutDetail(reader, value.id)).toMatchObject({
        structure: value.structure,
        sourceKind: "free",
        title: "Superior",
        exercises: [
          { position: 0, name: "Press" },
          { position: 1, name: "Remo" },
        ],
      });
    for (const reader of students.slice(1))
      expect(await getWorkoutDetail(reader, value.id)).toBeNull();
    expect(
      (
        await coach
          .from("workout_recording_receipts")
          .select("workout_id")
          .eq("workout_id", value.id)
      ).data,
    ).toEqual([]);
    expect(
      (await students[1].from("workout_recording_receipts").select("workout_id")).data,
    ).toEqual([]);
  });
  it("mismo ID con otro contenido no confirma y un eliminado no resucita", async () => {
    const value = payload();
    await saveWorkoutRecording(students[0], value);
    const changed = structuredClone(value);
    changed.structure.exercises[0].note = "Otra";
    await expect(saveWorkoutRecording(students[0], changed)).rejects.toMatchObject({
      code: "23505",
    });
    const removed = await students[0].from("workouts").delete().eq("id", value.id);
    expect(removed.error).toBeNull();
    expect(await saveWorkoutRecording(students[0], value)).toEqual({
      workoutId: value.id,
      status: "removed",
    });
    expect(await getWorkoutDetail(students[0], value.id)).toBeNull();
  });
  it("cada alumno y el coach entrenan con su identidad; borrar una cuenta conserva las demás", async () => {
    const ids: string[] = [];
    for (const client of [students[1], students[2], coach]) {
      const value = payload();
      await saveWorkoutRecording(client, value);
      ids.push(value.id);
    }
    const removed = await students[0].rpc("delete_my_account");
    expect(removed.error).toBeNull();
    expect(
      (
        await admin
          .from("workout_recording_receipts")
          .select("workout_id")
          .eq("owner_id", people[0])
      ).data,
    ).toEqual([]);
    for (const [i, client] of [students[1], students[2], coach].entries())
      expect(await getWorkoutDetail(client, ids[i])).not.toBeNull();
  });
});
