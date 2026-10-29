import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login as loginWeb } from "./support/ui";
import { MobileClient } from "../mobile/src/lib/client";
import { trainingProgressSchema } from "../src/lib/mobile/training-progress-contracts";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import { trainingPeriodSummary, trainingCalendar } from "../src/domain/training-progress";
const path = "/api/mobile/v1/training-progress",
  email = "progress-a@iron-strength.e2e.test",
  password = "Progress-local-only-2026!";
let people: { id: string; email: string }[], ids: string[];
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  people = [{ id: coachId, email: COACH.email }];
  for (let i = 0; i < 3; i++) {
    const e = i === 0 ? email : `progress-${i}@iron-strength.e2e.test`;
    const user = await createUser(admin(), {
      role: "student",
      name: "Alumno",
      email: e,
      password,
      coachId,
    });
    people.push({ id: user, email: e });
  }
  const created = await admin()
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        name: `HTTP progreso ${i}`,
        record_type: m.recordType,
        muscle_group: "Core" as const,
      })),
    )
    .select("id,name");
  if (created.error) throw created.error;
  ids = trainingMetricCases.map(
    (_, i) => created.data.find((e) => e.name === `HTTP progreso ${i}`)!.id,
  );
});
test.afterAll(async () => {
  await resetAll();
  if (ids?.length) {
    const removed = await admin().from("exercises").delete().in("id", ids);
    if (removed.error) throw removed.error;
  }
});
async function login(request: APIRequestContext, e = email) {
  const r = await request.post("/api/mobile/v1/auth/login", {
    data: { email: e, password: e === COACH.email ? COACH.password : password },
  });
  expect(r.status()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
}
test("HTTP exige Bearer, parámetros cerrados y ninguna cookie como identidad", async ({
  request,
  page,
}) => {
  expect((await request.get(path)).status()).toBe(401);
  await loginWeb(page, COACH.email, COACH.password);
  expect((await page.request.get(path)).status()).toBe(401);
  const headers = await login(request);
  expect((await request.get(path + "?userId=" + randomUUID(), { headers })).status()).toBe(400);
  const response = await request.get(path, { headers });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  expect(trainingProgressSchema.parse(await response.json()).activity).toEqual([]);
});
test("cliente real → HTTP → SQL: todos los tipos y resúmenes con evidencia sin mezclar cuentas", async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw Error("baseURL");
  let raw: string | null = null;
  const client = new MobileClient(
    baseURL,
    {
      get: async () => raw,
      set: async (value) => {
        raw = value;
      },
      remove: async () => {
        raw = null;
      },
    },
    fetch,
    Date.now,
    true,
  );
  await client.login(email, password);
  const p = typedRecordingFixture();
  if (p.source !== "free") throw Error("fixture");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date().toISOString();
  p.workout.finishedAt = p.workout.startedAt;
  p.workout.durationSeconds = 0;
  p.structure.exercises = trainingMetricCases.map((m, i) => ({
    id: randomUUID(),
    exerciseId: ids[i],
    prescribedExerciseId: null,
    note: null,
    restSeconds: 90,
    supersetId: null,
    supersetRestSeconds: null,
    prescribed: {
      recordType: m.recordType,
      sets: 2,
      target: {
        repsMin: m.reps === null ? null : 8,
        repsMax: m.reps === null ? null : 12,
        targetWeightKg: m.weightKg,
        targetDurationSeconds: m.durationSeconds,
        targetDistanceMeters: m.distanceMeters,
      },
      series: null,
    },
  }));
  p.workout.exerciseNotes = p.structure.exercises.map((e) => ({
    sessionExerciseId: e.id,
    note: null,
  }));
  p.workout.sets = trainingMetricCases.map((metrics, i) => ({
    exerciseId: ids[i],
    position: i,
    setNumber: 1,
    metrics,
    setType: "working",
    effort: null,
  }));
  await client.saveTypedRecording(p, people[1].id);
  const result = await client.trainingProgress();
  expect(result.exercises).toHaveLength(9);
  expect(result.activity.map((w) => w.id)).toContain(p.id);
  expect(
    result.exercises.find((e) => e.recordType === "assisted_bodyweight")?.points[0].totals
      .externalVolumeKg,
  ).toBe(0);
  expect(result.exercises.find((e) => e.recordType === "duration")?.marks[0]).toMatchObject({
    metric: "durationSeconds",
    value: 60,
    workoutId: p.id,
  });
  const summary = trainingPeriodSummary(
    result.activity,
    result.today,
    result.today.slice(0, 7) + "-01",
    result.today,
  );
  expect(summary.workoutIds).toContain(p.id);
  expect(summary.activeDays).toBe(1);
  expect(
    trainingCalendar(result.today.slice(0, 7), result.activity).days.find(
      (d) => d.date === result.today,
    )?.workoutIds,
  ).toContain(p.id);
  for (const person of [people[0], people[2], people[3]]) {
    const headers = await login(request, person.email);
    const r = await request.get(path, { headers });
    expect(r.status()).toBe(200);
    const own = trainingProgressSchema.parse(await r.json());
    expect(own.userId).toBe(person.id);
    expect(own.activity).toEqual([]);
    expect(own.exercises).toEqual([]);
  }
});
