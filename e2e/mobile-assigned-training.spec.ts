import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { addDays, mondayOf, santiagoDate } from "../src/domain/dates";
import { defaultPrescriptionInput, parsePrescriptionInput } from "../src/domain/prescription-input";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import { MobileClient, type Transport } from "../mobile/src/lib/client";
import { TrainingController, isTypedTraining } from "../mobile/src/lib/training";
import { sendQueuedRecording, type QueuedWorkoutPayload } from "../mobile/src/lib/queued-recording";
import { editTypedSet } from "../mobile/src/lib/typed-training";
import { typedWorkoutSchema } from "../src/lib/mobile/typed-recording-contracts";
import { assignedContextSchema } from "../src/lib/workout/training-context";
const password = "Assigned-local-E2E-only-2026!";
let exerciseIds: string[], coachId: string;
const actors: {
  id: string;
  email: string;
  password: string;
  sessionId: string;
  futureId: string;
}[] = [];
test.beforeAll(async () => {
  await resetAll();
  coachId = await seedCoach();
  actors.length = 0;
  const people = [{ id: coachId, email: COACH.email, password: COACH.password }];
  for (let i = 0; i < 3; i++) {
    const email = `assigned-${i}@iron-strength.e2e.test`;
    people.push({
      id: await createUser(admin(), { role: "student", name: "Alumno", email, password, coachId }),
      email,
      password,
    });
  }
  const inserted = await admin()
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        coach_id: coachId,
        name: `Asignado HTTP ${i}`,
        muscle_group: "Core" as const,
        record_type: m.recordType,
      })),
    )
    .select("id,name");
  expect(inserted.error).toBeNull();
  exerciseIds = trainingMetricCases.map(
    (_, i) => inserted.data!.find((e) => e.name === `Asignado HTTP ${i}`)!.id,
  );
  const start = mondayOf(santiagoDate(new Date()));
  for (const p of people) {
    const programId = randomUUID(),
      sessionId = randomUUID(),
      futureId = randomUUID();
    expect(
      (
        await admin()
          .from("programs")
          .insert({
            id: programId,
            coach_id: coachId,
            student_id: p.id,
            name: "Asignación HTTP",
            weeks_count: 2,
            start_date: start,
            ends_on: addDays(start, 13),
          })
      ).error,
    ).toBeNull();
    expect(
      (
        await admin()
          .from("program_sessions")
          .insert([
            { id: sessionId, program_id: programId, label: "A", title: "Mixta", week_number: 1 },
            { id: futureId, program_id: programId, label: "A", week_number: 2 },
          ])
      ).error,
    ).toBeNull();
    expect(
      (
        await admin()
          .from("session_exercises")
          .insert(
            trainingMetricCases.map((m, i) => {
              const goal = parsePrescriptionInput(defaultPrescriptionInput(m.recordType));
              return {
                program_session_id: sessionId,
                exercise_id: exerciseIds[i],
                position: i,
                sets: goal.sets,
                reps_min: null,
                reps_max: null,
                typed_prescription: goal,
                note: `Indicación ${i}`,
              };
            }),
          )
      ).error,
    ).toBeNull();
    actors.push({ ...p, sessionId, futureId });
  }
});
test.afterAll(async () => {
  await resetAll();
});
async function headers(request: APIRequestContext, index = 1) {
  const actor = actors[index],
    r = await request.post("/api/mobile/v1/auth/login", {
      data: { email: actor.email, password: actor.password },
    });
  expect(r.status()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
}
test("consulta real exige JWT y dueño, rechaza parámetros y semana futura sin crear registros", async ({
  request,
}) => {
  const a = actors[1],
    path = "/api/mobile/v1/training-sessions/" + a.sessionId;
  expect((await request.get(path)).status()).toBe(401);
  const auth = await headers(request);
  for (const q of ["?userId=" + actors[2].id, "?allowRecovery=true"])
    expect((await request.get(path + q, { headers: auth })).status()).toBe(400);
  expect(
    (
      await request.get("/api/mobile/v1/training-sessions/" + a.futureId, { headers: auth })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.get("/api/mobile/v1/training-sessions/" + actors[2].sessionId, {
        headers: auth,
      })
    ).status(),
  ).toBe(404);
  const coachHeaders = await headers(request, 0);
  expect((await request.get(path, { headers: coachHeaders })).status()).toBe(404);
  const r = await request.get(path, { headers: auth });
  expect(r.status()).toBe(200);
  expect(r.headers()["cache-control"]).toContain("no-store");
  expect(r.headers()["vary"]).toContain("Authorization");
  expect(r.headers()["set-cookie"]).toBeUndefined();
  expect(
    assignedContextSchema.parse(await r.json()).exercises.map((e) => e.prescribed.recordType),
  ).toEqual(trainingMetricCases.map((m) => m.recordType));
  expect((await admin().from("workouts").select("id").eq("student_id", a.id)).data).toEqual([]);
});
test("cliente y controlador reales: cuatro dueños, nueve dimensiones, respuesta perdida y resultado único", async ({
  request,
}) => {
  for (const actor of actors) {
    let credential: string | null = null,
      lose = true;
    const sent: string[] = [];
    const fetcher: Transport = async (url, init) => {
      const response = await request.fetch(url, {
        method: init.method,
        headers: init.headers as Record<string, string>,
        data: init.body as string | undefined,
      });
      if (url.endsWith("/typed-recordings") && init.method === "POST") {
        sent.push(String(init.body));
        if (lose && response.ok()) {
          lose = false;
          throw new TypeError("simulated lost response");
        }
      }
      return new Response(await response.text(), {
        status: response.status(),
        headers: response.headers(),
      });
    };
    const client = new MobileClient(
      "http://127.0.0.1:3100",
      {
        get: async () => credential,
        set: async (v) => {
          credential = v;
        },
        remove: async () => {
          credential = null;
        },
      },
      fetcher,
      Date.now,
      true,
    );
    await client.login(actor.email, actor.password);
    const context = await client.assignedRoutine(actor.sessionId);
    expect(context.userId).toBe(actor.id);
    const data = new Map<string, string>();
    const storage = {
      get: async (k: string) => data.get(k) ?? null,
      set: async (k: string, v: string) => {
        data.set(k, v);
      },
      remove: async (k: string) => {
        data.delete(k);
      },
      compareAndSet: async (k: string, b: string | null, v: string) => {
        if ((data.get(k) ?? null) !== b) throw Error("conflict");
        data.set(k, v);
      },
    };
    const controller = new TrainingController(actor.id, storage, (p: QueuedWorkoutPayload) =>
      sendQueuedRecording(client, p, actor.id),
    );
    await controller.restore();
    await controller.startTyped(context);
    for (const [i, m] of trainingMetricCases.entries()) {
      controller.editTyped((d) => {
        let next = d;
        for (const [field, value] of [
          ["weight", m.weightKg],
          ["reps", m.reps],
          ["duration", m.durationSeconds],
          ["distance", m.distanceMeters],
        ] as const)
          if (value !== null) next = editTypedSet(next, i, 0, field, String(value));
        return next;
      });
      await controller.flush();
      await controller.complete(i, 0);
    }
    const active = controller.getSnapshot().active;
    if (!active || !isTypedTraining(active)) throw Error("active");
    expect(active.routine).toEqual(context);
    await expect(controller.finish(8, "Completo")).rejects.toThrow();
    expect(controller.getSnapshot().active?.draft.status).toBe("pending_save");
    const frozen = controller.getSnapshot().active?.payload;
    await client.reconnect();
    await controller.retry();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(sent[1]);
    expect(controller.getSnapshot().active).toBeNull();
    if (!frozen || frozen.version !== 3) throw Error("payload");
    const result = typedWorkoutSchema.parse(await client.typedWorkout(frozen.id));
    expect(result.workout.sourceKind).toBe("assigned");
    expect(result.workout.exercises.flatMap((e) => e.sets.map((s) => s.metrics))).toEqual(
      trainingMetricCases,
    );
    expect(result.workout.note).toBe("Completo");
    const rows = await admin()
      .from("workouts")
      .select("id")
      .eq("id", frozen.id)
      .eq("student_id", actor.id);
    expect(rows.data).toHaveLength(1);
  }
});
