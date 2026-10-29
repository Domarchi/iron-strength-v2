import { buildTrainingRecording } from "../mobile/src/lib/recording";
import {
  createPersonalTrainingDraft,
  personalRoutineContext,
} from "../mobile/src/lib/personal-training";
import { personalLibrarySchema } from "../src/lib/mobile/personal-contracts";
import { mobileCatalogSchema } from "../src/lib/mobile/exercise-contracts";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login as loginWeb } from "./support/ui";
import {
  mobileRoutineSchema,
  mobileSessionSchema,
  mobileWorkoutSchema,
} from "../src/lib/mobile/contracts";
import { recordingFixture } from "../src/test/fixtures/workout-recording";
import { recordingPayloadSchema, recordingSaveSchema } from "../src/lib/mobile/recording-contracts";
const emails = [0, 1, 2].map((i) => `recording-${i}@iron-strength.e2e.test`),
  password = "Recording-local-only-2026!";
let sessionId: string;
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  const people: string[] = [];
  for (const email of emails)
    people.push(
      await createUser(admin(), { role: "student", name: "Alumno", email, password, coachId }),
    );
  sessionId = (await seedProgram({ coachId, studentId: people[0] })).sessionId;
});
async function login(request: APIRequestContext, email = emails[0]) {
  const response = await request.post("/api/mobile/v1/auth/login", {
    data: { email, password: email === COACH.email ? COACH.password : password },
  });
  expect(response.status()).toBe(200);
  const auth = mobileSessionSchema.parse(await response.json());
  return { Authorization: `Bearer ${auth.accessToken}` };
}
const path = "/api/mobile/v1/recordings";
test("cierre estructurado HTTP exige JWT, confirma documento entero y no admite degradarlo", async ({
  page,
  request,
}) => {
  const headers = await login(request),
    value = recordingFixture();
  const catalog = await (await request.get("/api/mobile/v1/exercises", { headers })).json();
  value.id = randomUUID();
  value.workout.id = value.id;
  value.workout.startedAt = new Date().toISOString();
  value.workout.finishedAt = value.workout.startedAt;
  value.workout.durationSeconds = 0;
  for (let i = 0; i < 2; i++) {
    value.workout.sets[i].exerciseId = catalog.exercises[i].id;
    value.structure.exercises[i].exerciseId = catalog.exercises[i].id;
  }
  const payload = recordingPayloadSchema.parse(value),
    data = { version: 2, payload };
  expect((await request.post(path, { data })).status()).toBe(401);
  await loginWeb(page, COACH.email, COACH.password);
  expect((await page.request.post(path, { data })).status()).toBe(401);
  for (const oldPath of ["/api/mobile/v1/workouts", "/api/mobile/v1/personal-workouts"])
    expect((await request.post(oldPath, { headers, data })).status()).toBe(400);
  expect((await request.post(path + "?studentId=other", { headers, data })).status()).toBe(400);
  const receipts: string[] = [];
  for (const response of await Promise.all([
    request.post(path, { headers, data }),
    request.post(path, { headers, data }),
  ])) {
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    const receipt = recordingSaveSchema.parse(await response.json());
    expect(receipt.workoutId).toBe(payload.id);
    receipts.push(receipt.status);
  }
  expect(receipts.sort()).toEqual(["created", "duplicate"]);
  const read = await request.get(`/api/mobile/v1/workouts/${payload.id}`, { headers });
  expect(read.status()).toBe(200);
  expect(mobileWorkoutSchema.parse(await read.json()).workout.structure).toEqual(payload.structure);
  const changed = structuredClone(payload);
  changed.structure.exercises[0].note = "Distinta";
  expect(
    (await request.post(path, { headers, data: { version: 2, payload: changed } })).status(),
  ).toBe(409);
  for (const email of [emails[1], emails[2], COACH.email])
    expect(
      (
        await request.get(`/api/mobile/v1/workouts/${payload.id}`, {
          headers: await login(request, email),
        })
      ).status(),
    ).toBe(404);
});
test("asignada HTTP verifica prescripción completa en SQL antes de confirmar", async ({
  request,
}) => {
  const headers = await login(request);
  const context = mobileRoutineSchema.parse(
    await (await request.get(`/api/mobile/v1/sessions/${sessionId}`, { headers })).json(),
  );
  const id = randomUUID(),
    now = new Date().toISOString();
  const payload = recordingPayloadSchema.parse({
    version: 2,
    id,
    source: "assigned",
    workout: {
      id,
      programId: context.session.programId,
      programSessionId: sessionId,
      sessionLabel: context.session.label,
      startedAt: now,
      finishedAt: now,
      durationSeconds: 0,
      sets: context.exercises.map((e, position) => ({
        sessionExerciseId: e.sessionExerciseId,
        prescribedExerciseId: e.exerciseId,
        exerciseId: e.exerciseId,
        exerciseName: "Nombre no confiable",
        position,
        setNumber: 1,
        weightKg: 30,
        reps: 8,
        isWarmup: false,
      })),
    },
    structure: {
      version: 1,
      exercises: context.exercises.map((e) => ({
        id: e.sessionExerciseId,
        exerciseId: e.exerciseId,
        prescribedExerciseId: e.exerciseId,
        prescribed: { ...e.prescribed, series: e.prescribed.series ?? null },
        note: e.note,
        restSeconds: e.restSeconds ?? null,
        supersetId: e.supersetId ?? null,
        supersetRestSeconds: e.supersetRestSeconds ?? null,
      })),
    },
  });
  const changed = structuredClone(payload);
  changed.structure.exercises[0].prescribed.targetWeightKg = 123;
  expect(
    (await request.post(path, { headers, data: { version: 2, payload: changed } })).status(),
  ).toBe(409);
  expect((await request.get(`/api/mobile/v1/workouts/${payload.id}`, { headers })).status()).toBe(
    404,
  );
  const response = await request.post(path, { headers, data: { version: 2, payload } });
  expect(response.status()).toBe(200);
  expect(recordingSaveSchema.parse(await response.json()).workoutId).toBe(payload.id);
  const result = mobileWorkoutSchema.parse(
    await (await request.get(`/api/mobile/v1/workouts/${payload.id}`, { headers })).json(),
  ).workout;
  expect(result.structure).toEqual(payload.structure);
  expect(result.exercises[0].name).toBe(context.exercises[0].name);
});

test("el constructor nativo guarda una sesión adaptada y conserva la base personal", async ({
  request,
}) => {
  const headers = await login(request);
  const catalog = mobileCatalogSchema.parse(
    await (await request.get("/api/mobile/v1/exercises", { headers })).json(),
  );
  const routineId = randomUUID(),
    groupId = randomUUID();
  const mutation = await request.post("/api/mobile/v1/library/mutations", {
    headers,
    data: {
      version: 1,
      requestId: randomUUID(),
      operation: "routine_create",
      targetId: routineId,
      expectedRevision: 0,
      data: {
        name: "Superior estructurado",
        folderId: null,
        items: catalog.exercises.slice(0, 2).map((e) => ({
          id: randomUUID(),
          exerciseId: e.id,
          sets: 2,
          repsMin: 8,
          repsMax: 12,
          targetWeightKg: 30,
          note: "Controlado",
          restSeconds: 90,
          supersetId: groupId,
          supersetRestSeconds: 60,
          series: null,
        })),
      },
    },
  });
  expect(mutation.status()).toBe(200);
  const library = personalLibrarySchema.parse(
    await (await request.get("/api/mobile/v1/library", { headers })).json(),
  );
  const routine = library.routines.find((r) => r.id === routineId)!;
  expect(routine).toBeDefined();
  const context = personalRoutineContext(routine);
  context.exercises.reverse();
  const now = new Date(),
    id = randomUUID();
  const profile = mobileSessionSchema.parse(
    await (
      await request.post("/api/mobile/v1/auth/login", { data: { email: emails[0], password } })
    ).json(),
  ).profile;
  const draft = createPersonalTrainingDraft({ context, now, userId: profile.id, workoutId: id });
  draft.exercises[0].sets[0] = { ...draft.exercises[0].sets[0], reps: "10", done: true };
  draft.exercises[0].supersetRestSeconds = 120;
  draft.exercises[1].supersetRestSeconds = 120;
  const built = buildTrainingRecording(context, draft, now);
  expect(built.ok).toBe(true);
  if (!built.ok) throw Error("No se construyó el registro de prueba");
  const response = await request.post(path, {
    headers,
    data: { version: 2, payload: built.payload },
  });
  expect(response.status()).toBe(200);
  expect(recordingSaveSchema.parse(await response.json()).workoutId).toBe(id);
  const result = mobileWorkoutSchema.parse(
    await (await request.get(`/api/mobile/v1/workouts/${id}`, { headers })).json(),
  ).workout;
  expect(result.structure).toEqual(built.payload.structure);
  expect(result.exercises[0].exerciseId).toBe(routine.items[1].exerciseId);
  expect(result.structure!.exercises).toHaveLength(2);
  expect(result.exercises).toHaveLength(1);
  const after = personalLibrarySchema.parse(
    await (await request.get("/api/mobile/v1/library", { headers })).json(),
  );
  expect(after.routines.find((r) => r.id === routineId)).toEqual(routine);
});
