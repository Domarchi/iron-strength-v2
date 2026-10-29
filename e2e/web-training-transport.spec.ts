import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { recordingPayloadSchema } from "../src/lib/mobile/recording-contracts";
import { recordingFixture } from "../src/test/fixtures/workout-recording";
import {
  queuedWorkoutPayloadSchema,
  type QueuedWorkoutPayload,
} from "../mobile/src/lib/queued-recording";
import { sendWebTraining } from "../src/lib/workout/web-sync-client";
import { bundleSchema } from "../src/lib/offline/training-bundle";
import { readWebTrainingDownload } from "../src/lib/offline/web-download-client";
const syncPath = "/api/workouts/training-sync",
  downloadPath = "/api/training/download";
const origin = "http://127.0.0.1:3100",
  password = "Web-transport-local-only-2026!";
type Person = { id: string; email: string; password: string; programId: string; sessionId: string };
const people: Person[] = [];
let exercises: string[];
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  for (let i = 0; i < 4; i++) {
    const email = i === 0 ? COACH.email : `transport-${i}@iron-strength.e2e.test`;
    const id =
      i === 0
        ? coachId
        : await createUser(admin(), { role: "student", name: "Alumno", email, password, coachId });
    const program = await seedProgram({ coachId, studentId: id });
    people.push({ id, email, password: i === 0 ? COACH.password : password, ...program });
  }
  exercises = [...(await seedExerciseIds())];
});
async function seedExerciseIds() {
  const r = await admin()
    .from("session_exercises")
    .select("exercise_id")
    .eq("program_session_id", people[0].sessionId)
    .order("position");
  expect(r.error).toBeNull();
  return r.data!.map((r) => r.exercise_id);
}
test.afterAll(async () => {
  await resetAll();
});
function transport(request: APIRequestContext, loseFirst = false): typeof fetch {
  return async (url, init) => {
    const r = await request.fetch(String(url), {
      method: init?.method,
      headers: { ...(init?.headers as Record<string, string>), Origin: origin },
      data: init?.body as string,
      maxRedirects: 0,
    });
    if (loseFirst) {
      loseFirst = false;
      expect(r.status()).toBe(200);
      throw Error("lost reply after commit");
    }
    return new Response(await r.text(), { status: r.status(), headers: r.headers() });
  };
}
async function payloads(person: Person): Promise<QueuedWorkoutPayload[]> {
  const rows = await admin()
    .from("session_exercises")
    .select("*")
    .eq("program_session_id", person.sessionId)
    .order("position");
  expect(rows.error).toBeNull();
  const now = new Date().toISOString(),
    assigned = recordingPayloadSchema.parse(recordingFixture("assigned"));
  if (assigned.source !== "assigned") throw Error("fixture");
  assigned.id = randomUUID();
  assigned.workout = {
    ...assigned.workout,
    id: assigned.id,
    programId: person.programId,
    programSessionId: person.sessionId,
    startedAt: now,
    finishedAt: now,
    durationSeconds: 0,
  };
  assigned.structure.exercises.forEach((row, i) => {
    const r = rows.data![i];
    row.id = r.id;
    row.exerciseId = r.exercise_id;
    row.prescribedExerciseId = r.exercise_id;
    row.prescribed = {
      sets: r.sets,
      repsMin: r.reps_min!,
      repsMax: r.reps_max!,
      targetWeightKg: r.target_weight_kg,
      series: null,
    };
    row.note = r.note!;
    row.restSeconds = r.rest_seconds!;
    row.supersetId = r.superset_id!;
    row.supersetRestSeconds = r.superset_rest_seconds!;
    assigned.workout.sets[i] = {
      ...assigned.workout.sets[i],
      exerciseId: r.exercise_id,
      sessionExerciseId: r.id,
      prescribedExerciseId: r.exercise_id,
    };
  });
  const typed = typedRecordingFixture();
  typed.id = randomUUID();
  typed.workout.id = typed.id;
  typed.workout.startedAt = now;
  typed.workout.finishedAt = now;
  typed.workout.durationSeconds = 0;
  typed.structure.exercises.forEach((row, i) => {
    row.exerciseId = exercises[i];
    typed.workout.sets[i].exerciseId = exercises[i];
  });
  const free = recordingFixture("free");
  if (free.source === "assigned") throw Error("fixture");
  free.workout.id = randomUUID();
  free.workout.startedAt = now;
  free.workout.finishedAt = now;
  free.workout.durationSeconds = 0;
  free.workout.sets.forEach((row, i) => {
    row.exerciseId = exercises[i];
  });
  const legacy = { ...structuredClone(assigned.workout), id: randomUUID() };
  return [typed, assigned, { ...free.workout, version: 1 }, legacy].map((p) =>
    queuedWorkoutPayloadSchema.parse(p),
  );
}
for (let index = 0; index < 4; index++)
  test(`cookie real: dueño ${index}, cuatro formatos, reintento, conflicto y descarga propia`, async ({
    page,
    request,
  }) => {
    const person = people[index];
    await login(page, person.email, person.password);
    const values = await payloads(person);
    for (const p of values) {
      if (index === 3 && p.version === undefined) p.id = p.id.toUpperCase();
      const frozen = JSON.stringify(p),
        send = transport(page.request, true);
      await expect(sendWebTraining(person.id, p, send)).rejects.toMatchObject({
        code: "unavailable",
      });
      const receipt = await sendWebTraining(person.id, p, send);
      expect(receipt).toMatchObject({ workoutId: p.id, status: "duplicate" });
      expect(JSON.stringify(p)).toBe(frozen);
      const r = await admin().from("workouts").select("id,student_id").eq("id", p.id);
      expect(r.error).toBeNull();
      expect(r.data).toEqual([{ id: p.id.toLowerCase(), student_id: person.id }]);
    }
    const p = values[0];
    if (p.version !== 3) throw Error("fixture");
    const changed = structuredClone(p);
    changed.workout.sets[0].effort = 9;
    await expect(
      sendWebTraining(person.id, changed, transport(page.request)),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    const headers = { "X-Iron-Strength-Account": person.id };
    const download = await page.request.get(downloadPath, { headers });
    expect(download.status()).toBe(200);
    expect(download.headers()["cache-control"]).toContain("no-store");
    expect(download.headers().vary).toContain("Cookie");
    expect(download.headers()["access-control-allow-origin"]).toBeUndefined();
    const bundle = bundleSchema.parse(await download.json());
    const viaClient = await readWebTrainingDownload(person.id, async (url, init) => {
      const r = await page.request.get(String(url), {
        headers: init?.headers as Record<string, string>,
        maxRedirects: 0,
      });
      return new Response(await r.text(), { status: r.status(), headers: r.headers() });
    });
    expect(viaClient.userId).toBe(person.id);
    expect(viaClient.week?.program.id).toBe(bundle.week?.program.id);
    expect(viaClient.library).toEqual(bundle.library);
    expect(viaClient.history).toEqual(bundle.history);
    expect(bundle.userId).toBe(person.id);
    expect(bundle.week!.program.id).toBe(person.programId);
    const downloadedIds = new Set(
      Object.values(bundle.history).flatMap((h) => h.history.items.map((w) => w.id)),
    );
    for (const value of values) expect(downloadedIds.has(value.id.toLowerCase())).toBe(true);
    expect((await page.request.get(downloadPath)).status()).toBe(400);
    expect(
      (await page.request.get(downloadPath + "?userId=" + person.id, { headers })).status(),
    ).toBe(400);
    expect(
      (
        await page.request.get(downloadPath, {
          headers: { ...headers, Origin: "https://foreign.test" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.get(downloadPath, {
          headers: { "X-Iron-Strength-Account": people[(index + 1) % 4].id },
        })
      ).status(),
    ).toBe(403);
    const unauth = await request.get(downloadPath, { headers, maxRedirects: 0 });
    expect(unauth.status()).toBe(401);
    expect(unauth.headers().location).toBeUndefined();
    expect((await unauth.json()).error.code).toBe("unauthorized");
  });
test("rechazos HTTP seguros, sesión expirada y cuenta cambiada nunca escriben", async ({
  page,
  request,
}) => {
  const person = people[1];
  await login(page, person.email, person.password);
  const [payload] = await payloads(person),
    body = { version: 1, userId: person.id, payload };
  for (const [value, status] of [
    [{ ...body, userId: people[2].id }, 403],
    [{ ...body, version: 99 }, 400],
    [{ ...body, payload: { ...payload, version: 99 } }, 400],
    [{ ...body, padding: "x".repeat(270000) }, 413],
  ] as const) {
    const r = await page.request.post(syncPath, {
      headers: { Origin: origin },
      data: value,
      maxRedirects: 0,
    });
    expect(r.status()).toBe(status);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers().vary).toContain("Cookie");
    expect((await r.json()).version).toBe(1);
  }
  for (const headers of [{ Origin: "https://foreign.test" }, {}] as Record<string, string>[]) {
    expect((await page.request.post(syncPath, { headers, data: body })).status()).toBe(403);
  }
  expect(
    (
      await page.request.post(syncPath + "?x=1", { headers: { Origin: origin }, data: body })
    ).status(),
  ).toBe(400);
  const unauth = await request.post(syncPath, {
    headers: { Origin: origin },
    data: body,
    maxRedirects: 0,
  });
  expect(unauth.status()).toBe(401);
  expect(unauth.headers().location).toBeUndefined();
  expect((await unauth.json()).error.code).toBe("unauthorized");
  expect(
    (await admin().from("profiles").update({ is_active: false }).eq("id", person.id)).error,
  ).toBeNull();
  try {
    expect(
      (await page.request.post(syncPath, { headers: { Origin: origin }, data: body })).status(),
    ).toBe(401);
    expect(
      (
        await page.request.get(downloadPath, { headers: { "X-Iron-Strength-Account": person.id } })
      ).status(),
    ).toBe(401);
  } finally {
    expect(
      (await admin().from("profiles").update({ is_active: true }).eq("id", person.id)).error,
    ).toBeNull();
  }
  expect((await admin().from("workouts").select("id").eq("id", payload.id)).data).toEqual([]);
});
test("eliminación confirmada bloquea reenvío de los cuatro formatos sin resurrección", async ({
  page,
}) => {
  const person = people[2];
  await login(page, person.email, person.password);
  const values = await payloads(person);
  const auth = await page.request.post("/api/mobile/v1/auth/login", {
    data: { email: person.email, password: person.password },
  });
  expect(auth.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await auth.json()).accessToken}` };
  for (const p of values) {
    await sendWebTraining(person.id, p, transport(page.request));
    const snapshotResponse = await page.request.get(`/api/mobile/v1/workout-removals/${p.id}`, {
      headers,
    });
    expect(snapshotResponse.status()).toBe(200);
    const snapshot = await snapshotResponse.json();
    const removal = await page.request.post("/api/mobile/v1/workout-removals", {
      headers,
      data: {
        version: 1,
        requestId: randomUUID(),
        workoutId: p.id,
        expectedRevision: snapshot.workout.revision,
      },
    });
    expect(removal.status()).toBe(200);
    const r = await page.request.post(syncPath, {
      headers: { Origin: origin },
      data: { version: 1, userId: person.id, payload: p },
    });
    expect(r.status()).toBe(p.version === undefined ? 409 : 422);
    expect((await r.json()).error.code).toBe(p.version === undefined ? "id_taken" : "removed");
    expect((await admin().from("workouts").select("id").eq("id", p.id)).data).toEqual([]);
  }
});
