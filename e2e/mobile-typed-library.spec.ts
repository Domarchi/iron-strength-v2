import { TypedLibraryDraftController } from "../mobile/src/lib/typed-library-drafts";
import { TrainingController } from "../mobile/src/lib/training";
import { personalRoutineTrainingContext } from "../mobile/src/lib/typed-personal-training";
import {
  addTypedPersonalExercise,
  detailTypedPersonalItem,
} from "../src/domain/typed-personal-routines";
import { forkPersonalItems } from "../src/domain/personal-routines";
import { prepareTypedWorkoutRoutine } from "../src/domain/typed-workout-routine";
import { sendQueuedRecording } from "../mobile/src/lib/queued-recording";
import { MobileClient } from "../mobile/src/lib/client";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import {
  typedPersonalLibrarySchema,
  typedPersonalMutationResultSchema,
  type TypedPersonalMutation,
} from "../src/lib/mobile/typed-personal-contracts";
const path = "/api/mobile/v1/training-library",
  email = "typed-library@iron-strength.e2e.test",
  other = "typed-library-other@iron-strength.e2e.test",
  password = "Typed-library-local-only-2026!";
let exercise: string;
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  for (const address of [email, other])
    await createUser(admin(), {
      role: "student",
      name: "Alumno",
      email: address,
      password,
      coachId,
    });
  const r = await admin()
    .from("exercises")
    .insert({ name: "Tiempo biblioteca HTTP", muscle_group: "Core", record_type: "duration" })
    .select("id")
    .single();
  if (r.error) throw r.error;
  exercise = r.data.id;
});
test.afterAll(async () => {
  await resetAll();
  if (exercise) {
    const r = await admin().from("exercises").delete().eq("id", exercise);
    if (r.error) throw r.error;
  }
});
async function login(request: APIRequestContext, address = email) {
  const r = await request.post("/api/mobile/v1/auth/login", {
    data: { email: address, password: address === COACH.email ? COACH.password : password },
  });
  expect(r.status()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
}
const create = (): Extract<TypedPersonalMutation, { operation: "routine_create" }> => ({
  version: 2,
  requestId: randomUUID(),
  targetId: randomUUID(),
  expectedRevision: 0,
  operation: "routine_create",
  data: {
    name: "Tiempo",
    folderId: null,
    items: [
      {
        id: randomUUID(),
        exerciseId: exercise,
        prescribed: {
          recordType: "duration",
          sets: 2,
          target: {
            repsMin: null,
            repsMax: null,
            targetWeightKg: null,
            targetDurationSeconds: 60,
            targetDistanceMeters: null,
          },
          series: null,
        },
        note: "Indicación",
        restSeconds: 90,
        supersetId: null,
        supersetRestSeconds: null,
      },
    ],
  },
});
test("biblioteca2 HTTP exige JWT, identidad y contratos cerrados", async ({ request }) => {
  for (const suffix of ["", "/export"]) {
    const r = await request.get(path + suffix, { maxRedirects: 0 });
    expect(r.status()).toBe(401);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers()["set-cookie"]).toBeUndefined();
  }
  expect((await request.post(path + "/mutations", { data: create() })).status()).toBe(401);
  const headers = await login(request);
  expect((await request.get(path + "?userId=otra", { headers })).status()).toBe(400);
  expect(
    (
      await request.post(path + "/mutations", { headers, data: { ...create(), version: 1 } })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(path + "/mutations", {
        headers,
        data: { ...create(), ownerId: randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(path + "/mutations", { headers, data: { note: "x".repeat(66000) } })
    ).status(),
  ).toBe(413);
});
test("biblioteca2 HTTP reintenta, copia y exporta objetivos completos bajo RLS", async ({
  request,
}) => {
  const headers = await login(request);
  const send = async (input: TypedPersonalMutation, status = 200) => {
    const r = await request.post(path + "/mutations", { headers, data: input });
    expect(r.status()).toBe(status);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers()["set-cookie"]).toBeUndefined();
    return r;
  };
  const read = async () => {
    const r = await request.get(path, { headers });
    expect(r.status()).toBe(200);
    return typedPersonalLibrarySchema.parse(await r.json());
  };
  const input = create();
  const received = typedPersonalMutationResultSchema.parse(await (await send(input)).json());
  expect(received.version).toBe(2);
  expect(received.duplicate).toBe(false);
  // La confirmación perdida se recupera con el mismo cuerpo e identidad.
  const retry = typedPersonalMutationResultSchema.parse(await (await send(input)).json());
  expect(retry).toEqual({ ...received, duplicate: true });
  const base = (await read()).routines.find((r) => r.id === input.targetId)!;
  expect(base.items[0].prescribed).toEqual(input.data.items[0].prescribed);
  expect(base.items[0].recordType).toBe("duration");
  const copy: TypedPersonalMutation = {
    version: 2,
    requestId: randomUUID(),
    targetId: randomUUID(),
    expectedRevision: 0,
    operation: "routine_copy",
    data: { sourceId: base.id, sourceRevision: base.revision, name: "Copia", folderId: null },
  };
  await send(copy);
  const copied = (await read()).routines.find((r) => r.id === copy.targetId)!;
  expect(copied.items[0].id).not.toBe(base.items[0].id);
  expect(copied.items[0].prescribed).toEqual(base.items[0].prescribed);
  await send(
    {
      ...input,
      requestId: randomUUID(),
      expectedRevision: base.revision - 1,
      operation: "routine_save",
      data: { name: "Conflicto", items: [] },
    },
    409,
  );
  expect((await read()).routines.find((r) => r.id === base.id)).toEqual(base);
  const exported = await request.get(path + "/export", { headers });
  expect(exported.status()).toBe(200);
  expect(typedPersonalLibrarySchema.parse(await exported.json())).toEqual(await read());
  for (const address of [other, COACH.email]) {
    const r = await request.get(path, { headers: await login(request, address) });
    expect(r.status()).toBe(200);
    expect(
      typedPersonalLibrarySchema.parse(await r.json()).routines.some((x) => x.id === base.id),
    ).toBe(false);
  }
  // Un cliente anterior recibe un error explícito, no una biblioteca incompleta.
  expect((await request.get("/api/mobile/v1/library", { headers })).status()).toBe(503);
  await send({
    version: 2,
    requestId: randomUUID(),
    targetId: base.id,
    expectedRevision: base.revision,
    operation: "routine_delete",
    data: {},
  });
  expect(typedPersonalMutationResultSchema.parse(await (await send(input)).json())).toMatchObject({
    status: "removed",
    duplicate: true,
    revision: null,
  });
});

test("cliente nativo real recupera respuesta perdida y mantiene objetivos de la misma cuenta", async ({
  baseURL,
}) => {
  if (!baseURL) throw Error("Sin servidor aislado");
  let credential: string | null = null,
    lose = true;
  const sent: unknown[] = [];
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
      if (url.endsWith("/training-library/mutations")) sent.push(JSON.parse(String(options.body)));
      const response = await fetch(url, options);
      if (url.endsWith("/training-library/mutations") && response.ok && lose) {
        lose = false;
        throw Error("lost after commit");
      }
      return response;
    },
    Date.now,
    true,
  );
  await client.login(email, password);
  const identity = client.getSnapshot();
  if (identity.status !== "authenticated") throw Error("Sin identidad");
  const owner = identity.session.profile.id;
  const input = create();
  await expect(client.mutateTrainingLibrary(input, owner)).rejects.toMatchObject({
    code: "network",
  });
  expect(client.getSnapshot()).toMatchObject({ status: "authenticated", mode: "offline" });
  await client.reconnect();
  expect(await client.mutateTrainingLibrary(input, owner)).toMatchObject({
    version: 2,
    duplicate: true,
    targetId: input.targetId,
  });
  expect(sent).toEqual([input, input]);
  const library = await client.trainingLibrary(),
    base = library.routines.find((r) => r.id === input.targetId)!;
  expect(library.routines.filter((r) => r.id === input.targetId)).toHaveLength(1);
  expect(base.items[0].prescribed).toEqual(input.data.items[0].prescribed);
  expect(await client.exportTrainingLibrary()).toEqual(library);
  const stored = await admin()
    .from("personal_routine_items")
    .select("reps_min,reps_max,typed_prescription")
    .eq("routine_id", base.id);
  expect(stored.error).toBeNull();
  expect(stored.data).toEqual([
    { reps_min: null, reps_max: null, typed_prescription: base.items[0].prescribed },
  ]);
  await expect(
    client.mutateTrainingLibrary({ ...input, requestId: randomUUID() }, randomUUID()),
  ).rejects.toMatchObject({ code: "identity" });
  expect(sent).toHaveLength(2);
});

test("editor tipado real → guardar/recuperar base → entrenar → actualizar y copiar resultado3 sin alterarlo", async ({
  baseURL,
}) => {
  if (!baseURL) throw Error("Sin servidor aislado");
  let credential: string | null = null,
    lose = true;
  const client = new MobileClient(
    baseURL,
    {
      get: async () => credential,
      set: async (v) => {
        credential = v;
      },
      remove: async () => {
        credential = null;
      },
    },
    async (url, options) => {
      const response = await fetch(url, options);
      if (url.endsWith("/training-library/mutations") && response.ok && lose) {
        lose = false;
        throw Error("lost after commit");
      }
      return response;
    },
    Date.now,
    true,
  );
  await client.login(email, password);
  const identity = client.getSnapshot();
  if (identity.status !== "authenticated") throw Error("fixture");
  const owner = identity.session.profile.id,
    catalog = await client.trainingCatalog(),
    entry = catalog.exercises.find((e) => e.id === exercise)!;
  const values = new Map<string, string>(),
    storage = {
      get: async (k: string) => values.get(k) ?? null,
      set: async (k: string, v: string) => {
        values.set(k, v);
      },
      remove: async (k: string) => {
        values.delete(k);
      },
      compareAndSet: async (k: string, b: string | null, v: string) => {
        if ((values.get(k) ?? null) !== b) throw Error("conflict");
        values.set(k, v);
      },
    };
  const sendBase = (
      request: Parameters<ConstructorParameters<typeof TypedLibraryDraftController>[2]>[0],
    ) =>
      request.version === 2
        ? client.mutateTrainingLibrary(request, owner)
        : client.mutatePersonalLibrary(request, owner),
    createLibrary = () => new TypedLibraryDraftController(owner, storage, sendBase, randomUUID);
  const library = createLibrary();
  await library.restore();
  const id = await library.createDraft();
  const item = addTypedPersonalExercise(entry, randomUUID());
  item.sets = "2";
  item.targetDurationSeconds = "60";
  item.note = "Indicación del editor";
  const detailed = detailTypedPersonalItem(item);
  detailed.series![1].targetDurationSeconds = "90";
  await library.edit(id, (d) => ({ ...d, name: "Circuito completo", items: [detailed] }));
  await expect(library.saveDraft(id)).rejects.toMatchObject({ code: "network" });
  const frozen = library.getSnapshot().pending!.request;
  expect(frozen.version).toBe(2);
  await client.reconnect();
  const restored = createLibrary();
  await restored.restore();
  expect(restored.getSnapshot().pending!.request).toEqual(frozen);
  expect(await restored.retryPending()).toMatchObject({ version: 2, duplicate: true });
  const base = (await client.trainingLibrary()).routines.find((r) => r.id === id)!;
  expect(base.items[0].prescribed.series?.map((t) => t.targetDurationSeconds)).toEqual([60, 90]);
  const training = new TrainingController(
    owner,
    storage,
    (p) => sendQueuedRecording(client, p, owner),
    () => new Date(),
    randomUUID,
  );
  await training.restore();
  const context = personalRoutineTrainingContext(base);
  if (context.version !== 3) throw Error("Sin contexto3");
  await training.startTyped(context);
  const workoutId = training.getSnapshot().active!.draft.workoutId;
  training.editTyped((d) => ({
    ...d,
    exercises: d.exercises.map((e) => ({
      ...e,
      athleteNote: "Nota propia que no va a la base",
      sets: e.sets.map((s, i) => (i ? s : { ...s, duration: "60", effort: "8,5" })),
    })),
  }));
  await training.flush();
  await training.complete(0, 0);
  await training.finish(8, "Nota global privada");
  const result = await client.typedWorkout(workoutId),
    before = JSON.stringify(result);
  expect(result.workout).toMatchObject({
    sourceKind: "personal",
    personalRoutineId: id,
    personalRoutineRevision: base.revision,
  });
  expect(result.workout.exercises[0].sets[0]).toMatchObject({
    effort: 8.5,
    metrics: { recordType: "duration", durationSeconds: 60, reps: null },
  });
  const prepared = prepareTypedWorkoutRoutine(result.workout, catalog.exercises);
  if (!prepared.ok) throw Error(prepared.message);
  expect(JSON.stringify(prepared)).not.toContain("Nota propia");
  expect(JSON.stringify(prepared)).not.toContain("Nota global");
  expect(prepared.items[0].note).toBe("Indicación del editor");
  await restored.stageDraft({
    id: base.id,
    baseRevision: base.revision,
    folderId: base.folderId,
    name: base.name,
    changed: true,
    items: prepared.items,
  });
  await restored.saveDraft(base.id);
  const updated = (await client.trainingLibrary()).routines.find((r) => r.id === id)!;
  expect(updated.revision).toBeGreaterThan(base.revision);
  expect(updated.items[0].prescribed).toEqual(base.items[0].prescribed);
  const copyId = randomUUID();
  await restored.stageDraft({
    id: copyId,
    baseRevision: null,
    folderId: null,
    name: "Copia independiente",
    changed: true,
    items: forkPersonalItems(prepared.items, randomUUID),
  });
  await restored.saveDraft(copyId);
  const copied = (await client.trainingLibrary()).routines.find((r) => r.id === copyId)!;
  expect(copied.items[0].id).not.toBe(updated.items[0].id);
  expect(copied.items[0].prescribed).toEqual(updated.items[0].prescribed);
  expect(JSON.stringify(await client.typedWorkout(workoutId))).toBe(before);
});
