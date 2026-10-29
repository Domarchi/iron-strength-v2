import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";
import { MobileClient, type Transport } from "../mobile/src/lib/client";
import { bundleSchema } from "../src/lib/offline/training-bundle";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { typedRecordingPayloadSchema } from "../src/lib/mobile/typed-recording-contracts";
import { mondayOf, santiagoDate, addDays } from "../src/domain/dates";
const path = "/api/mobile/v1/training-download",
  password = "Download-local-only-2026!";
const people: { id: string; email: string; password: string }[] = [],
  exerciseIds: string[] = [];
let coachId: string;
function client(request: APIRequestContext) {
  const transport: Transport = async (url, init) => {
    const r = await request.fetch(url, {
      method: init?.method,
      headers: init?.headers as Record<string, string>,
      data: init?.body as string | undefined,
    });
    return new Response(await r.text(), { status: r.status(), headers: r.headers() });
  };
  let raw: string | null = null;
  return new MobileClient(
    "http://127.0.0.1:3100",
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
}
const goals = trainingMetricCases.map((m) => ({
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
}));
test.beforeAll(async () => {
  await resetAll();
  coachId = await seedCoach();
  people.push({ id: coachId, email: COACH.email, password: COACH.password });
  for (let i = 0; i < 3; i++) {
    const email = `download-${i}@iron-strength.e2e.test`,
      id = await createUser(admin(), { role: "student", name: "Alumno", email, password, coachId });
    people.push({ id, email, password });
  }
  for (const [i, m] of trainingMetricCases.entries()) {
    const id = randomUUID();
    expect(
      (
        await admin()
          .from("exercises")
          .insert({
            id,
            coach_id: coachId,
            name: `Descarga tipo ${i}`,
            muscle_group: "Core",
            record_type: m.recordType,
          })
      ).error,
    ).toBeNull();
    exerciseIds.push(id);
  }
});
test.afterAll(async () => {
  await resetAll();
});
test("cuatro cuentas descargan documento completo por JWT; consulta sin cookies, parámetros o escrituras nuevas", async ({
  request,
  page,
}) => {
  expect((await request.get(path)).status()).toBe(401);
  await login(page, COACH.email, COACH.password);
  expect((await page.request.get(path)).status()).toBe(401);
  for (const [index, person] of people.entries()) {
    const c = client(request);
    await c.login(person.email, person.password);
    const before = await c.trainingDownload();
    expect(before.week).toBeNull();
    expect(before.library.routines).toEqual([]);
    const group = randomUUID();
    await c.mutateTrainingLibrary(
      {
        version: 2,
        requestId: randomUUID(),
        targetId: randomUUID(),
        expectedRevision: 0,
        operation: "routine_create",
        data: {
          name: `Base privada ${index}`,
          folderId: null,
          items: goals.map((prescribed, i) => ({
            id: randomUUID(),
            exerciseId: exerciseIds[i],
            prescribed,
            note: `Control ${i}`,
            restSeconds: 30,
            supersetId: i < 2 ? group : null,
            supersetRestSeconds: i < 2 ? 45 : null,
          })),
        },
      },
      person.id,
    );
    const p = typedRecordingFixture();
    if (p.source !== "free") throw Error("fixture");
    p.id = randomUUID();
    p.workout.id = p.id;
    p.workout.startedAt = new Date().toISOString();
    p.workout.finishedAt = p.workout.startedAt;
    p.workout.durationSeconds = 0;
    p.structure.exercises = goals.map((prescribed, i) => ({
      id: randomUUID(),
      exerciseId: exerciseIds[i],
      prescribedExerciseId: null,
      prescribed,
      note: "Objetivo",
      restSeconds: 30,
      supersetId: null,
      supersetRestSeconds: null,
    }));
    p.workout.exerciseNotes = p.structure.exercises.map((row) => ({
      sessionExerciseId: row.id,
      note: `Nota privada ${index}`,
    }));
    p.workout.sets = trainingMetricCases.map((metrics, i) => ({
      exerciseId: exerciseIds[i],
      position: i,
      setNumber: 1,
      metrics,
      setType: i === 0 ? "warmup" : "working",
      effort: i === 0 ? null : 8.5,
    }));
    await c.saveTypedRecording(typedRecordingPayloadSchema.parse(p), person.id);
    const programId = randomUUID(),
      sessionId = randomUUID(),
      start = mondayOf(santiagoDate(new Date()));
    expect(
      (
        await admin()
          .from("programs")
          .insert({
            id: programId,
            coach_id: coachId,
            student_id: person.id,
            name: "Asignada",
            weeks_count: 1,
            start_date: start,
            ends_on: addDays(start, 6),
          })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin().from("program_sessions").insert({
          id: sessionId,
          program_id: programId,
          week_number: 1,
          label: "A",
          title: "Mixta",
          weekday: 1,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin()
          .from("session_exercises")
          .insert(
            goals.map((typed_prescription, i) => ({
              program_session_id: sessionId,
              exercise_id: exerciseIds[i],
              position: i,
              sets: 2,
              reps_min: null,
              reps_max: null,
              typed_prescription,
              note: `Control ${i}`,
              rest_seconds: 30,
            })),
          )
      ).error,
    ).toBeNull();
    const b = await c.trainingDownload();
    expect(bundleSchema.safeParse(b).success).toBe(true);
    expect(b.library.routines).toHaveLength(1);
    expect(b.library.routines[0].name).toBe(`Base privada ${index}`);
    expect(b.library.routines[0].items.map((r) => r.prescribed)).toEqual(goals);
    expect(b.week!.sessions[0].context.exercises.map((r) => r.prescribed)).toEqual(goals);
    expect(b.week!.sessions[0].context.exercises[0].lastMetrics).toBeNull();
    expect(b.week!.sessions[0].context.exercises[5].lastMetrics).toEqual(trainingMetricCases[5]);
    for (const [i, id] of exerciseIds.entries()) {
      expect(b.history[id].history.items).toHaveLength(1);
      expect(b.history[id].history.items[0].id).toBe(p.id);
      expect(b.history[id].history.items[0].sets[0].metrics).toEqual(trainingMetricCases[i]);
      expect(b.history[id].history.items[0].exerciseNotes[0].note).toBe(`Nota privada ${index}`);
    }
    const auth = await request.post("/api/mobile/v1/auth/login", {
      data: { email: person.email, password: person.password },
    });
    expect(auth.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await auth.json()).accessToken}` },
      r = await request.get(path, { headers });
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers()["set-cookie"]).toBeUndefined();
    expect(
      (await request.get(path + "?studentId=" + people[(index + 1) % 4].id, { headers })).status(),
    ).toBe(400);
    expect((await request.post(path, { headers, data: {} })).status()).toBe(405);
    expect((await admin().from("workouts").select("id").eq("student_id", person.id)).data).toEqual([
      { id: p.id },
    ]);
  }
  const p = people[3],
    auth = await request.post("/api/mobile/v1/auth/login", {
      data: { email: p.email, password: p.password },
    }),
    headers = { Authorization: `Bearer ${(await auth.json()).accessToken}` };
  expect(
    (await admin().from("profiles").update({ is_active: false }).eq("id", p.id)).error,
  ).toBeNull();
  expect((await request.get(path, { headers })).status()).toBe(401);
});
test("capacidad excedida devuelve409sin paquete parcial y conserva los datos del servidor", async ({
  request,
}) => {
  const ids = Array.from({ length: 1001 }, () => randomUUID());
  const inserted = await admin()
    .from("exercises")
    .insert(
      ids.map((id, i) => ({
        id,
        coach_id: coachId,
        name: `Capacidad descarga ${i}`,
        muscle_group: "Core" as const,
      })),
    );
  expect(inserted.error).toBeNull();
  try {
    const auth = await request.post("/api/mobile/v1/auth/login", {
      data: { email: COACH.email, password: COACH.password },
    });
    expect(auth.status()).toBe(200);
    const r = await request.get(path, {
      headers: { Authorization: `Bearer ${(await auth.json()).accessToken}` },
    });
    expect(r.status()).toBe(409);
    expect(r.headers()["cache-control"]).toContain("no-store");
    const body = await r.json();
    expect(body).toMatchObject({ version: 1, error: { code: "capacity" } });
    expect(body).not.toHaveProperty("catalog");
    expect(JSON.stringify(body)).not.toContain("0A000");
    let remaining = 0;
    for (let start = 0; start < ids.length; start += 200) {
      const count = await admin()
        .from("exercises")
        .select("id", { count: "exact", head: true })
        .in("id", ids.slice(start, start + 200));
      expect(count.error).toBeNull();
      expect(count.count).toBe(ids.slice(start, start + 200).length);
      remaining += count.count!;
    }
    expect(remaining).toBe(1001);
  } finally {
    for (let start = 0; start < ids.length; start += 200)
      expect(
        (
          await admin()
            .from("exercises")
            .delete()
            .in("id", ids.slice(start, start + 200))
        ).error,
      ).toBeNull();
  }
});
