import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login as loginWeb } from "./support/ui";
import {
  typedCatalogSchema,
  typedExerciseDetailSchema,
} from "../src/lib/mobile/typed-exercise-contracts";
import { typedRecordingFixture } from "../src/test/fixtures/typed-recording";
import { trainingMetricCases } from "../src/test/fixtures/training-metrics";
import { MobileClient } from "../mobile/src/lib/client";
import { TrainingController } from "../mobile/src/lib/training";
import { freeRoutineContext } from "../mobile/src/lib/personal-training";
import { sendQueuedRecording } from "../mobile/src/lib/queued-recording";
import { NativeWorkoutQueue } from "../mobile/src/lib/sync-queue";
import { handoffPending } from "../mobile/src/lib/queue-transfer";
import { prepareTypedWorkoutRepeat } from "../src/domain/typed-workout-repeat";
const path = "/api/mobile/v1/training-catalog",
  email = "typed-catalog@iron-strength.e2e.test",
  other = "typed-catalog-other@iron-strength.e2e.test",
  password = "Typed-catalog-local-only-2026!";
let ids: string[], archived: string;
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  for (const address of [email, other, "typed-catalog-third@iron-strength.e2e.test"])
    await createUser(admin(), {
      role: "student",
      name: "Alumno",
      email: address,
      password,
      coachId,
    });
  const rows = await admin()
    .from("exercises")
    .insert(
      trainingMetricCases.map((m, i) => ({
        name: `Ficha tipada HTTP ${i}`,
        muscle_group: "Core" as const,
        record_type: m.recordType,
      })),
    )
    .select("id,name");
  if (rows.error) throw rows.error;
  ids = trainingMetricCases.map(
    (_, i) => rows.data.find((e) => e.name === `Ficha tipada HTTP ${i}`)!.id,
  );
  const row = await admin()
    .from("exercises")
    .insert({
      name: "Archivado ficha HTTP",
      muscle_group: "Core",
      record_type: "duration",
      archived_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (row.error) throw row.error;
  archived = row.data.id;
});
test.afterAll(async () => {
  await resetAll();
  if (ids?.length) {
    const removed = await admin()
      .from("exercises")
      .delete()
      .in("id", [...ids, archived]);
    if (removed.error) throw removed.error;
  }
});
async function login(request: APIRequestContext, address = email) {
  const r = await request.post("/api/mobile/v1/auth/login", {
    data: { email: address, password: address === COACH.email ? COACH.password : password },
  });
  expect(r.status()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
}
function payload(index: number) {
  const p = typedRecordingFixture();
  if (p.source !== "free") throw Error("fixture");
  p.id = randomUUID();
  p.workout.id = p.id;
  p.workout.startedAt = new Date().toISOString();
  p.workout.finishedAt = p.workout.startedAt;
  p.workout.durationSeconds = 0;
  const m = trainingMetricCases[index];
  p.structure.exercises.forEach((r, i) => {
    r.id = randomUUID();
    r.exerciseId = ids[i ? 0 : index];
    if (!i)
      r.prescribed = {
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
      };
  });
  p.workout.exerciseNotes = p.structure.exercises.map((r, i) => ({
    sessionExerciseId: r.id,
    note: i ? "Sin ejecución" : "Propia",
  }));
  p.workout.sets = [
    { ...p.workout.sets[0], exerciseId: ids[index], metrics: m, setType: "drop", effort: 8.5 },
  ];
  return p;
}
test("catálogo2 exige JWT/cuenta activa y preserva tipos sin exponerlos bajo contrato1", async ({
  request,
  page,
}) => {
  const headers = await login(request);
  await loginWeb(page, COACH.email, COACH.password);
  expect((await request.get(path)).status()).toBe(401);
  expect((await page.request.get(path)).status()).toBe(401);
  const response = await request.get(path, { headers });
  expect(response.status()).toBe(200);
  const list = typedCatalogSchema.parse(await response.json());
  for (const [i, m] of trainingMetricCases.entries())
    expect(list.exercises.find((e) => e.id === ids[i])?.recordType).toBe(m.recordType);
  expect(list.exercises.some((e) => e.id === archived)).toBe(false);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const old = await request.get("/api/mobile/v1/exercises", { headers });
  expect(old.status()).toBe(200);
  const legacy = await old.json();
  expect(legacy.version).toBe(1);
  expect(legacy.exercises.some((e: { id: string }) => e.id === ids[0])).toBe(true);
  expect(legacy.exercises.some((e: { id: string }) => ids.slice(1).includes(e.id))).toBe(false);
  for (const id of ids.slice(1))
    expect((await request.get("/api/mobile/v1/exercises/" + id, { headers })).status()).toBe(404);
});
test("ficha2 pagina entrenamientos propios completos y conserva cada dimensión/nota/clase", async ({
  request,
}) => {
  const headers = await login(request),
    foreign = await login(request, other),
    coachHeaders = await login(request, COACH.email);
  for (const [index, m] of trainingMetricCases.entries()) {
    const p = payload(index);
    expect(
      (
        await request.post("/api/mobile/v1/typed-recordings", {
          headers,
          data: { version: 3, payload: p },
        })
      ).status(),
    ).toBe(200);
    const response = await request.get(path + "/" + ids[index].toUpperCase(), { headers });
    expect(response.status()).toBe(200);
    const detail = typedExerciseDetailSchema.parse(await response.json());
    expect(detail.exercise.recordType).toBe(m.recordType);
    const own = detail.history.items.find((w) => w.id === p.id)!;
    expect(own.sets[0]).toMatchObject({ metrics: m, setType: "drop", effort: 8.5 });
    expect(own.exerciseNotes[0]).toEqual({ position: 0, note: "Propia" });
    for (const actor of [foreign, coachHeaders]) {
      const otherDetail = typedExerciseDetailSchema.parse(
        await (await request.get(path + "/" + ids[index], { headers: actor })).json(),
      );
      expect(otherDetail.history.items.some((w) => w.id === p.id)).toBe(false);
    }
  }
  expect((await request.get(path + "/" + archived, { headers })).status()).toBe(404);
});
test("catálogo real → selección nativa → registro3 → cola recuperada → SQL e historial sin duplicados", async ({
  baseURL,
}) => {
  if (!baseURL) throw Error("Sin servidor aislado");
  let credential: string | null = null,
    lose = true;
  const client = new MobileClient(
    baseURL,
    {
      get: async () => credential,
      set: async (value) => {
        credential = value;
      },
      remove: async () => {
        credential = null;
      },
    },
    async (url, options) => {
      const response = await fetch(url, options);
      if (url.endsWith("/typed-recordings") && response.ok && lose) {
        lose = false;
        throw Error("lost after commit");
      }
      return response;
    },
    Date.now,
    true,
  );
  await client.login(email, password);
  const session = client.getSnapshot();
  if (session.status !== "authenticated") throw Error("Sin identidad");
  const userId = session.session.profile.id,
    catalog = await client.trainingCatalog();
  const entries = ids.map((id, i) => {
    const entry = catalog.exercises.find((e) => e.id === id);
    if (!entry || entry.recordType !== trainingMetricCases[i].recordType)
      throw Error("Catálogo incompleto");
    return entry;
  });
  const data = new Map<string, string>(),
    storage = {
      get: async (k: string) => data.get(k) ?? null,
      set: async (k: string, v: string) => {
        data.set(k, v);
      },
      remove: async (k: string) => {
        data.delete(k);
      },
      compareAndSet: async (k: string, before: string | null, next: string) => {
        if ((data.get(k) ?? null) !== before) throw Error("conflict");
        data.set(k, next);
      },
    },
    send = (p: Parameters<typeof sendQueuedRecording>[1]) => sendQueuedRecording(client, p, userId);
  const create = () => new TrainingController(userId, storage, send, () => new Date(), randomUUID);
  const controller = create();
  await controller.restore();
  await controller.startPersonal(freeRoutineContext());
  const original = controller.getSnapshot().active!;
  await controller.organizeCatalog({ kind: "add", entries });
  expect(controller.getSnapshot().active?.draft.workoutId).toBe(original.draft.workoutId);
  controller.editTyped((d) => ({
    ...d,
    exercises: d.exercises.map((e, i) => {
      const m = trainingMetricCases[i];
      return {
        ...e,
        athleteNote: `Nota ${i}`,
        sets: e.sets.map((s, j) =>
          j
            ? s
            : {
                ...s,
                weight: m.weightKg === null ? "" : String(m.weightKg),
                reps: m.reps === null ? "" : String(m.reps),
                duration: m.durationSeconds === null ? "" : String(m.durationSeconds),
                distance: m.distanceMeters === null ? "" : String(m.distanceMeters),
                setType: i === 0 ? "failure" : "drop",
                effort: "8,5",
              },
        ),
      };
    }),
  }));
  await controller.flush();
  for (let i = 0; i < entries.length; i++) await controller.complete(i, 0);
  await expect(controller.finish(8, "Circuito desde catálogo")).rejects.toMatchObject({
    code: "network",
  });
  const document = controller.getSnapshot().active?.payload;
  if (!document || document.version !== 3) throw Error("Sin documento3");
  expect(document.workout.sets.map((s) => s.metrics)).toEqual(
    trainingMetricCases.map((m) => ({ ...m })),
  );
  const restored = create();
  await restored.restore();
  expect(restored.getSnapshot().active?.payload).toEqual(document);
  const queue = new NativeWorkoutQueue(userId, storage, send);
  await queue.restore();
  await handoffPending(restored, queue);
  expect(restored.getSnapshot().active).toBeNull();
  await client.reconnect();
  expect(await queue.sync({ manual: true })).toEqual({ confirmed: 1, failed: 0 });
  const result = await client.typedWorkout(document.id);
  expect(result.workout.exercises.map((e) => e.name)).toEqual(entries.map((e) => e.name));
  for (const [i, entry] of entries.entries()) {
    expect(result.workout.exercises[i].sets[0]).toMatchObject({
      metrics: trainingMetricCases[i],
      effort: 8.5,
      setType: i === 0 ? "failure" : "drop",
    });
    const detail = await client.trainingExerciseDetail(entry.id);
    if (detail.version !== 2) throw Error("Sin ficha2");
    const recorded = detail.history.items.find((w) => w.id === document.id);
    expect(recorded?.exerciseNotes).toContainEqual({ position: i, note: `Nota ${i}` });
    expect(recorded?.sets[0].metrics).toEqual(trainingMetricCases[i]);
  }
  const workouts = await admin().from("workouts").select("id").eq("id", document.id);
  expect(workouts.error).toBeNull();
  expect(workouts.data).toHaveLength(1);
  const sets = await admin().from("workout_sets").select("id").eq("workout_id", document.id);
  expect(sets.error).toBeNull();
  expect(sets.data).toHaveLength(9);
  const prepared = prepareTypedWorkoutRepeat(result.workout, entries);
  if (!prepared.ok) throw Error(prepared.message);
  const repeated = create();
  await repeated.restore();
  await repeated.startRepeated(prepared.plan);
  const copy = repeated.getSnapshot().active!;
  expect(copy.draft.workoutId).not.toBe(document.id);
  expect(copy.draft.exercises.every((e) => e.sets.every((s) => !s.done))).toBe(true);
  for (let i = 0; i < 9; i++) await repeated.complete(i, 0);
  expect(await repeated.finish(null, null)).toEqual({ mode: "real", id: copy.draft.workoutId });
  const copied = await client.typedWorkout(copy.draft.workoutId);
  expect(copied.workout.sourceKind).toBe("free");
  expect(copied.workout.exercises.flatMap((e) => e.sets.map((s) => s.metrics))).toEqual(
    trainingMetricCases.map((m) => ({ ...m })),
  );
  expect(
    copied.workout.exercises.every(
      (e) => e.athleteNote === null && e.sets.every((s) => s.effort === null),
    ),
  ).toBe(true);
  expect(copied.workout.note).toBeNull();
  expect(copied.workout.perceivedEffort).toBeNull();
  expect((await client.typedWorkout(document.id)).workout).toEqual(result.workout);
});
test("queries/UUID/cursors inválidos no pasan a datos y token de un usuario desactivado deja de autorizar", async ({
  request,
}) => {
  const headers = await login(request);
  for (const url of [
    path + "?studentId=" + randomUUID(),
    path + "/" + ids[0] + "?studentId=" + randomUUID(),
    path + "/" + ids[0] + "?cursor=bad",
    path + "/" + ids[0] + "?cursor=a&cursor=b",
  ])
    expect((await request.get(url, { headers })).status()).toBe(400);
  expect((await request.get(path + "/" + randomUUID(), { headers })).status()).toBe(404);
  const users = await admin().auth.admin.listUsers();
  expect(users.error).toBeNull();
  const person = users.data.users.find((u) => u.email === email);
  if (!person) throw Error("fixture");
  const changed = await admin().from("profiles").update({ is_active: false }).eq("id", person.id);
  expect(changed.error).toBeNull();
  expect((await request.get(path, { headers })).status()).toBe(401);
  expect((await request.get(path + "/" + ids[0], { headers })).status()).toBe(401);
});
