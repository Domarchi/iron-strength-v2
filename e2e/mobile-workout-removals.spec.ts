import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login as loginWeb } from "./support/ui";
import { MobileClient, type Transport } from "../mobile/src/lib/client";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import {
  workoutRemovalSchema,
  type WorkoutRemovalSnapshot,
} from "../src/lib/mobile/workout-removal-contracts";
import { addDays, santiagoDate } from "../src/domain/dates";
const endpoint = "/api/mobile/v1/workout-removals",
  password = "Removals-local-only-2026!";
let people: { id: string; email: string }[], ids: string[];
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  people = [{ id: coachId, email: COACH.email }];
  for (let i = 0; i < 3; i++) {
    const email = `removal-${i}@iron-strength.e2e.test`;
    people.push({
      email,
      id: await createUser(admin(), { role: "student", name: "Alumno", email, password, coachId }),
    });
  }
  const created = await admin()
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        name: `HTTP eliminación ${i}`,
        muscle_group: "Core" as const,
        record_type: m.recordType,
      })),
    )
    .select("id,name");
  if (created.error) throw created.error;
  ids = trainingMetricCases.map(
    (_, i) => created.data.find((r) => r.name === `HTTP eliminación ${i}`)!.id,
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
function removal(base: WorkoutRemovalSnapshot) {
  return workoutRemovalSchema.parse({
    version: 1,
    requestId: randomUUID(),
    workoutId: base.workout.id,
    expectedRevision: base.workout.revision,
  });
}
test("rutas reales: solo JWT, parámetros cerrados y revisión; cookies web no autorizan", async ({
  request,
  page,
}) => {
  const id = await legacy();
  expect((await request.get(endpoint + "/" + id)).status()).toBe(401);
  await loginWeb(page, COACH.email, COACH.password);
  expect((await page.request.get(endpoint + "/" + id)).status()).toBe(401);
  const headers = await login(request),
    read = await request.get(endpoint + "/" + id, { headers });
  expect(read.status()).toBe(200);
  expect(read.headers()["cache-control"]).toContain("no-store");
  expect(read.headers()["set-cookie"]).toBeUndefined();
  const base: WorkoutRemovalSnapshot = await read.json(),
    input = removal(base);
  expect(base.workout).toMatchObject({ id, setCount: 2, commentCount: 0 });
  expect(
    (await request.get(endpoint + "/" + id + "?ownerId=" + people[1].id, { headers })).status(),
  ).toBe(400);
  for (const extra of [{ ownerId: people[1].id }, { confirmed: true }, { expectedRevision: -1 }])
    expect((await request.post(endpoint, { headers, data: { ...input, ...extra } })).status()).toBe(
      400,
    );
  expect(
    (
      await request.post(endpoint, { headers, data: { ...input, padding: "x".repeat(16385) } })
    ).status(),
  ).toBe(413);
  expect((await request.get(endpoint, { headers })).status()).toBe(405);
  expect(await (await request.get(endpoint + "/" + id, { headers })).json()).toEqual(base);
});
test("cliente real elimina nueve contratos y reconcilia una respuesta perdida con el mismo cuerpo", async ({
  baseURL,
  request,
}) => {
  if (!baseURL) throw Error("baseURL");
  let lose = false;
  const bodies: string[] = [];
  const transport: Transport = async (url, init) => {
    const r = await fetch(url, init);
    if (String(url).endsWith(endpoint) && init?.method === "POST") {
      bodies.push(String(init.body));
      if (lose && r.status === 200) {
        lose = false;
        await r.arrayBuffer();
        throw Error("synthetic response lost after commit");
      }
    }
    return r;
  };
  const c = await client(baseURL, people[1], transport),
    p = payload();
  await c.saveTypedRecording(p, people[1].id);
  const inserted = await admin()
    .from("comments")
    .insert([
      { workout_id: p.id, author_id: people[0].id, body: "Coach" },
      { workout_id: p.id, author_id: people[1].id, body: "Alumno" },
    ]);
  if (inserted.error) throw inserted.error;
  const base = await c.workoutRemoval(p.id, people[1].id),
    input = removal(base),
    revision = c.getDataRevision();
  expect(base.workout).toMatchObject({ setCount: 9, commentCount: 2 });
  lose = true;
  await expect(c.removeWorkout(input, people[1].id)).rejects.toMatchObject({ code: "network" });
  expect(c.getDataRevision()).toBe(revision);
  expect((await admin().from("workouts").select("id").eq("id", p.id)).data).toEqual([]);
  await c.reconnect();
  const ack = await c.removeWorkout(input, people[1].id);
  expect(ack.status).toBe("duplicate");
  expect(ack.revision).toBeGreaterThan(input.expectedRevision);
  expect(bodies).toEqual([JSON.stringify(input), JSON.stringify(input)]);
  expect(c.getDataRevision()).toBe(revision + 1);
  for (const table of ["workout_sets", "comments"] as const)
    expect((await admin().from(table).select("id").eq("workout_id", p.id)).data).toEqual([]);
  expect(
    (
      await admin()
        .from("workout_correction_receipts")
        .select("request_id")
        .eq("request_id", input.requestId)
    ).data,
  ).toHaveLength(1);
  const headers = await login(request);
  expect((await request.get(endpoint + "/" + p.id, { headers })).status()).toBe(404);
  const replay = await request.post("/api/mobile/v1/typed-recordings", {
    headers,
    data: { version: 3, payload: p },
  });
  expect(replay.status()).toBe(422);
  expect((await replay.json()).error.code).toBe("removed");
  expect((await admin().from("workouts").select("id").eq("id", p.id)).data).toEqual([]);
});
test("tres alumnos y coach propio: ningún token ajeno consulta o elimina; inactive401", async ({
  request,
}) => {
  const id = await legacy(),
    headers = await login(request),
    base = await (await request.get(endpoint + "/" + id, { headers })).json(),
    input = removal(base);
  for (const person of [people[0], people[2], people[3]]) {
    const h = await login(request, person);
    expect((await request.get(endpoint + "/" + id, { headers: h })).status()).toBe(404);
    expect((await request.post(endpoint, { headers: h, data: input })).status()).toBe(404);
  }
  const update = await admin().from("profiles").update({ is_active: false }).eq("id", people[1].id);
  if (update.error) throw update.error;
  try {
    expect((await request.get(endpoint + "/" + id, { headers })).status()).toBe(401);
    expect((await request.post(endpoint, { headers, data: input })).status()).toBe(401);
  } finally {
    await admin().from("profiles").update({ is_active: true }).eq("id", people[1].id);
  }
  const own = await legacy(1, people[0].id),
    h = await login(request, people[0]),
    snapshot = await (await request.get(endpoint + "/" + own, { headers: h })).json();
  expect((await request.post(endpoint, { headers: h, data: removal(snapshot) })).status()).toBe(
    200,
  );
  expect((await admin().from("workouts").select("id").eq("id", id)).data).toHaveLength(1);
});
test("una edición concurrente exige nueva revisión y otro intento antes de borrar", async ({
  baseURL,
}) => {
  if (!baseURL) throw Error("baseURL");
  const c = await client(baseURL),
    p = payload();
  await c.saveTypedRecording(p, people[1].id);
  const before = await c.workoutRemoval(p.id),
    input = removal(before),
    edit = await c.workoutCorrection(p.id);
  await c.correctWorkout(
    {
      version: 1,
      requestId: randomUUID(),
      workoutId: p.id,
      expectedRevision: edit.workout.revision,
      perceivedEffort: 8,
      note: "Cambio de otra ventana",
      exerciseNotes: edit.workout.exerciseNotes,
      sets: edit.workout.sets.map((s) => ({
        id: s.id,
        metrics: s.metrics,
        setType: s.setType,
        effort: s.effort,
        isWarmup: s.isWarmup,
      })),
    },
    people[1].id,
  );
  await expect(c.removeWorkout(input, people[1].id)).rejects.toMatchObject({
    code: "conflict",
    status: 409,
  });
  const latest = await c.workoutRemoval(p.id);
  expect(latest.workout.revision).toBeGreaterThan(before.workout.revision);
  const next = removal(latest);
  expect(next.requestId).not.toBe(input.requestId);
  expect((await c.removeWorkout(next, people[1].id)).status).toBe("deleted");
});
test("ventana7/8 y revisión bloquean borrados antiguos sin dejar recibos", async ({ request }) => {
  const headers = await login(request);
  for (const age of [7, 8]) {
    const id = await legacy(age),
      snapshot = await (await request.get(endpoint + "/" + id, { headers })).json(),
      input = removal(snapshot);
    const result = await request.post(endpoint, { headers, data: input });
    if (age === 7) {
      expect(result.status()).toBe(200);
      expect((await result.json()).status).toBe("deleted");
    } else {
      expect(result.status()).toBe(409);
      expect((await result.json()).error.code).toBe("edit_locked");
      expect(
        (
          await admin()
            .from("workout_correction_receipts")
            .select("request_id")
            .eq("request_id", input.requestId)
        ).data,
      ).toEqual([]);
    }
  }
});
