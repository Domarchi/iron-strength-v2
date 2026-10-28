import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login as loginWeb } from "./support/ui";
import { MobileClient, type Transport } from "../mobile/src/lib/client";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import {
  workoutCorrectionSchema,
  type WorkoutCorrectionSnapshot,
} from "../src/lib/mobile/workout-correction-contracts";
import { addDays, santiagoDate } from "../src/domain/dates";
import type { Database } from "../src/types/database";
const endpoint = "/api/mobile/v1/workout-corrections",
  password = "Corrections-local-only-2026!";
let people: { id: string; email: string }[], ids: string[];
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  people = [{ id: coachId, email: COACH.email }];
  for (let i = 0; i < 3; i++) {
    const email = `correction-${i}@iron-strength.e2e.test`;
    people.push({
      email,
      id: await createUser(admin(), { role: "student", name: "Alumno", email, password, coachId }),
    });
  }
  const created = await admin()
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        name: `HTTP corrección ${i}`,
        muscle_group: "Core" as const,
        record_type: m.recordType,
      })),
    )
    .select("id,name");
  if (created.error) throw created.error;
  ids = trainingMetricCases.map(
    (_, i) => created.data.find((r) => r.name === `HTTP corrección ${i}`)!.id,
  );
});
test.afterAll(async () => {
  await resetAll();
  if (ids?.length) {
    const r = await admin().from("exercises").delete().in("id", ids);
    if (r.error) throw r.error;
  }
});
async function login(request: APIRequestContext, person = people[1]) {
  const r = await request.post("/api/mobile/v1/auth/login", {
    data: {
      email: person.email,
      password: person.email === COACH.email ? COACH.password : password,
    },
  });
  expect(r.status()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
}
async function client(baseURL: string, person = people[1], transport: Transport = fetch) {
  let raw: string | null = null;
  const c = new MobileClient(
    baseURL,
    {
      get: async () => raw,
      set: async (v) => {
        raw = v;
      },
      remove: async () => {
        raw = null;
      },
    },
    transport,
    Date.now,
    true,
  );
  await c.login(person.email, person.email === COACH.email ? COACH.password : password);
  return c;
}
function payload() {
  const p = typedRecordingFixture("free");
  if (p.source !== "free") throw Error("fixture");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date(Date.now() - 600000).toISOString();
  p.workout.finishedAt = new Date().toISOString();
  p.workout.durationSeconds = 600;
  p.structure.exercises = [...trainingMetricCases, trainingMetricCases[0]].map((m, i) => ({
    id: randomUUID(),
    exerciseId: ids[i === 9 ? 0 : i],
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
  p.workout.exerciseNotes = p.structure.exercises.map((r) => ({
    sessionExerciseId: r.id,
    note: "Nota original",
  }));
  p.workout.sets = trainingMetricCases.map((metrics, position) => ({
    exerciseId: ids[position],
    position,
    setNumber: 1,
    metrics,
    setType: "working",
    effort: 8,
  }));
  return p;
}
function correction(base: WorkoutCorrectionSnapshot) {
  return workoutCorrectionSchema.parse({
    version: 1,
    requestId: randomUUID(),
    workoutId: base.workout.id,
    expectedRevision: base.workout.revision,
    perceivedEffort: 9,
    note: "Corrección confirmada",
    exerciseNotes:
      base.workout.exerciseNotes?.map((r) => ({ ...r, note: "Nota corregida" })) ?? null,
    sets: base.workout.sets.map((s, i) => ({
      id: s.id,
      metrics: {
        ...s.metrics,
        weightKg: s.metrics.weightKg === null ? null : s.metrics.weightKg + 2.5,
        reps: s.metrics.reps === null ? null : s.metrics.reps + 1,
        durationSeconds: s.metrics.durationSeconds === null ? null : s.metrics.durationSeconds + 15,
        distanceMeters: s.metrics.distanceMeters === null ? null : s.metrics.distanceMeters + 10,
      },
      setType: s.setType === null ? null : i === 1 ? "warmup" : i === 2 ? "failure" : "drop",
      effort: s.setType === null ? null : 8.5,
      isWarmup: s.setType !== null && i === 1,
    })),
  });
}
async function legacy(daysAgo = 1, owner = people[1].id) {
  const id = randomUUID(),
    startedAt = `${addDays(santiagoDate(new Date()), -daysAgo)}T15:00:00Z`;
  const w = await admin()
    .from("workouts")
    .insert({
      id,
      student_id: owner,
      started_at: startedAt,
      finished_at: new Date(Date.parse(startedAt) + 3600000).toISOString(),
      duration_seconds: 3600,
    });
  if (w.error) throw w.error;
  const s = await admin()
    .from("workout_sets")
    .insert(
      [1, 2].map((set_number) => ({
        workout_id: id,
        student_id: owner,
        exercise_id: ids[0],
        exercise_name: "Nombre histórico HTTP",
        position: 0,
        set_number,
        weight_kg: 30,
        reps: 8,
      })),
    );
  if (s.error) throw s.error;
  return id;
}
test("rutas reales exigen JWT, validan cuerpo y parámetros, sin cookies ni caché privada compartida", async ({
  request,
  page,
}) => {
  const id = await legacy();
  expect((await request.get(endpoint + "/" + id)).status()).toBe(401);
  expect((await request.post(endpoint, { data: {} })).status()).toBe(401);
  await loginWeb(page, COACH.email, COACH.password);
  expect((await page.request.get(endpoint + "/" + id)).status()).toBe(401);
  const headers = await login(request);
  const response = await request.get(endpoint + "/" + id.toUpperCase(), { headers });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const base = await response.json(),
    input = correction(base);
  expect((await request.get(endpoint + "/" + randomUUID(), { headers })).status()).toBe(404);
  expect(
    (await request.get(endpoint + "/" + id + "?userId=" + people[0].id, { headers })).status(),
  ).toBe(400);
  for (const patch of [
    { studentId: people[0].id },
    { version: 2 },
    { sets: [] },
    { note: "x".repeat(501) },
  ])
    expect((await request.post(endpoint, { headers, data: { ...input, ...patch } })).status()).toBe(
      400,
    );
  expect(
    (
      await request.post(endpoint, { headers, data: { ...input, note: "x".repeat(262145) } })
    ).status(),
  ).toBe(413);
  expect(await (await request.get(endpoint + "/" + id, { headers })).json()).toEqual(base);
  expect((await request.get(endpoint, { headers })).status()).toBe(405);
});
test("cliente real → HTTP → SQL corrige nueve contratos, recupera respuesta perdida y no deshace al repetir cierre", async ({
  baseURL,
}) => {
  if (!baseURL) throw Error("baseURL");
  let lose = false;
  const bodies: string[] = [];
  const transport: Transport = async (url, init) => {
    const response = await fetch(url, init);
    if (String(url).endsWith(endpoint) && init?.method === "POST") {
      bodies.push(String(init.body));
      if (lose && response.status === 200) {
        lose = false;
        await response.arrayBuffer();
        throw Error("synthetic response lost after commit");
      }
    }
    return response;
  };
  const c = await client(baseURL, people[1], transport),
    p = payload();
  await c.saveTypedRecording(p, people[1].id);
  const base = await c.workoutCorrection(p.id),
    input = correction(base),
    revision = c.getDataRevision();
  lose = true;
  await expect(c.correctWorkout(input, people[1].id)).rejects.toMatchObject({ code: "network" });
  expect(c.getDataRevision()).toBe(revision);
  await c.reconnect();
  const confirmed = await c.correctWorkout(input, people[1].id);
  expect(confirmed.status).toBe("duplicate");
  expect(bodies).toEqual([JSON.stringify(input), JSON.stringify(input)]);
  const after = await c.workoutCorrection(p.id);
  expect(after.workout.revision).toBe(confirmed.revision);
  expect(after.workout.structure).toEqual(base.workout.structure);
  expect(after.workout).toMatchObject({
    startedAt: base.workout.startedAt,
    durationSeconds: 600,
    note: input.note,
    perceivedEffort: 9,
    exerciseNotes: input.exerciseNotes,
  });
  expect(
    after.workout.sets.map((s) => ({
      id: s.id,
      metrics: s.metrics,
      setType: s.setType,
      effort: s.effort,
      isWarmup: s.isWarmup,
    })),
  ).toEqual(input.sets);
  expect((await c.saveTypedRecording(p, people[1].id)).status).toBe("duplicate");
  expect(await c.workoutCorrection(p.id)).toEqual(after);
  const receipts = await admin()
    .from("workout_correction_receipts")
    .select("request_id")
    .eq("request_id", input.requestId);
  expect(receipts.error).toBeNull();
  expect(receipts.data).toEqual([{ request_id: input.requestId }]);
});
test("dos clientes desde la misma revisión confirman una propuesta completa y la otra conserva conflicto", async ({
  baseURL,
}) => {
  if (!baseURL) throw Error("baseURL");
  const id = await legacy(),
    firstClient = await client(baseURL),
    secondClient = await client(baseURL);
  const base = await firstClient.workoutCorrection(id),
    first = correction(base),
    second = { ...correction(base), note: "Segunda propuesta" };
  second.sets = second.sets.map((s) => ({ ...s, metrics: { ...s.metrics, weightKg: 40 } }));
  const result = await Promise.allSettled([
    firstClient.correctWorkout(first, people[1].id),
    secondClient.correctWorkout(second, people[1].id),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = result.find((r) => r.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ status: 409, code: "conflict" });
  const winner = result[0].status === "fulfilled" ? first : second,
    saved = await firstClient.workoutCorrection(id);
  expect(saved.workout.note).toBe(winner.note);
  expect(saved.workout.sets.map((s) => s.metrics)).toEqual(winner.sets.map((s) => s.metrics));
  expect(saved.workout.sets.every((s) => s.exerciseName === "Nombre histórico HTTP")).toBe(true);
});
test("tres alumnos y coach consultan/corrigen solo propios, también cuando el coach entrena", async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw Error("baseURL");
  const own = await client(baseURL),
    id = await legacy(),
    input = correction(await own.workoutCorrection(id));
  for (const person of [people[0], people[2], people[3]]) {
    const headers = await login(request, person);
    expect((await request.get(endpoint + "/" + id, { headers })).status()).toBe(404);
    expect((await request.post(endpoint, { headers, data: input })).status()).toBe(404);
  }
  const coach = await client(baseURL, people[0]),
    p = payload();
  await coach.saveTypedRecording(p, people[0].id);
  const base = await coach.workoutCorrection(p.id);
  expect(base.userId).toBe(people[0].id);
  expect((await coach.correctWorkout(correction(base), people[0].id)).status).toBe("updated");
  await expect(own.workoutCorrection(p.id)).rejects.toMatchObject({
    status: 404,
    code: "not_found",
  });
});
test("ventana Santiago7/8, replay fuera de ventana y resultado eliminado mantienen sus estados", async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw Error("baseURL");
  const c = await client(baseURL);
  const edge = await legacy(7),
    late = await legacy(8),
    edgeInput = correction(await c.workoutCorrection(edge)),
    lateBase = await c.workoutCorrection(late);
  expect((await c.correctWorkout(edgeInput, people[1].id)).status).toBe("updated");
  await expect(c.correctWorkout(correction(lateBase), people[1].id)).rejects.toMatchObject({
    status: 409,
    code: "edit_locked",
  });
  expect(await c.workoutCorrection(late)).toEqual(lateBase);
  const changed = await admin()
    .from("workouts")
    .update({ started_at: `${addDays(santiagoDate(new Date()), -8)}T15:00:00Z` })
    .eq("id", edge);
  expect(changed.error).toBeNull();
  expect((await c.correctWorkout(edgeInput, people[1].id)).status).toBe("duplicate");
  const removedId = await legacy(),
    removalInput = correction(await c.workoutCorrection(removedId));
  await c.correctWorkout(removalInput, people[1].id);
  const headers = await login(request),
    db = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } },
    );
  const removed = await db.from("workouts").delete().eq("id", removedId).select("id");
  expect(removed.error).toBeNull();
  expect(removed.data).toEqual([{ id: removedId }]);
  expect((await c.correctWorkout(removalInput, people[1].id)).status).toBe("removed");
  await expect(c.workoutCorrection(removedId)).rejects.toMatchObject({ status: 404 });
});
