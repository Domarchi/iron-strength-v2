import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { login as loginWeb } from "./support/ui";
import { MobileClient } from "../mobile/src/lib/client";
import { PersonalExerciseDraftController } from "../mobile/src/lib/personal-exercise-drafts";
import { AtomicStoreError } from "../mobile/src/lib/atomic-contract";
import {
  personalExerciseLibrarySchema,
  personalExerciseResultSchema,
  type PersonalExerciseMutation,
} from "../src/lib/mobile/personal-exercise-contracts";
const path = "/api/mobile/v1/personal-exercises";
const emails = [
  "own-ex-a@iron-strength.e2e.test",
  "own-ex-b@iron-strength.e2e.test",
  "own-ex-c@iron-strength.e2e.test",
];
const password = "Own-exercise-local-only-2026!";
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  for (const email of emails)
    await createUser(admin(), { role: "student", name: "Alumno", email, password, coachId });
});
test.afterAll(() => resetAll());
async function login(request: APIRequestContext, email = emails[0]) {
  const result = await request.post("/api/mobile/v1/auth/login", {
    data: { email, password: email === COACH.email ? COACH.password : password },
  });
  expect(result.status()).toBe(200);
  return { Authorization: `Bearer ${(await result.json()).accessToken}` };
}
const create = (name: string): Extract<PersonalExerciseMutation, { operation: "create" }> => ({
  version: 1,
  requestId: randomUUID(),
  targetId: randomUUID(),
  expectedRevision: 0,
  operation: "create",
  data: {
    name,
    muscleGroup: "Core",
    equipment: null,
    isBodyweight: true,
    progressionIncrementKg: 1,
    recordType: "duration",
  },
});
test("gestión HTTP exige Bearer, no acepta cookies/cuentas ni parámetros y exporta snapshot cerrado", async ({
  request,
  page,
}) => {
  expect((await request.get(path)).status()).toBe(401);
  await loginWeb(page, COACH.email, COACH.password);
  expect((await page.request.get(path)).status()).toBe(401);
  const headers = await login(request);
  const response = await request.get(path, { headers });
  expect(response.status()).toBe(200);
  const data = personalExerciseLibrarySchema.parse(await response.json());
  expect(data.exercises).toEqual([]);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["set-cookie"]).toBeUndefined();
  const exported = await request.get(path + "/export", { headers });
  expect(await exported.json()).toEqual(data);
  expect((await request.get(path + "?userId=" + randomUUID(), { headers })).status()).toBe(400);
  expect(
    (
      await request.post(path + "/mutations", {
        headers,
        data: { ...create("Rechazado"), ownerId: randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect((await request.post(path + "/mutations", { headers, data: "{" })).status()).toBe(400);
  const huge = create("a".repeat(17000));
  expect((await request.post(path + "/mutations", { headers, data: huge })).status()).toBe(413);
});
test("coach y tres alumnos crean el mismo nombre y cada catálogo/gestión conserva su propiedad", async ({
  request,
}) => {
  const actors = await Promise.all([COACH.email, ...emails].map((email) => login(request, email)));
  const ids: string[] = [];
  for (const headers of actors) {
    const input = create("Nombre privado compartido solo en texto");
    ids.push(input.targetId);
    const response = await request.post(path + "/mutations", { headers, data: input });
    expect(response.status()).toBe(200);
    expect(personalExerciseResultSchema.parse(await response.json())).toMatchObject({
      revision: 1,
      targetId: input.targetId,
    });
  }
  for (const [index, headers] of actors.entries()) {
    const response = await request.get(path, { headers });
    const own = personalExerciseLibrarySchema.parse(await response.json());
    expect(own.exercises.filter((e) => ids.includes(e.id)).map((e) => e.id)).toEqual([ids[index]]);
    const catalog = await request.get("/api/mobile/v1/training-catalog", { headers });
    expect(catalog.status()).toBe(200);
    const rows = (await catalog.json()).exercises as { id: string }[];
    expect(rows.filter((e) => ids.includes(e.id)).map((e) => e.id)).toEqual([ids[index]]);
  }
  for (const headers of actors.slice(1)) {
    const foreign = await request.post(path + "/mutations", {
      headers,
      data: {
        version: 1,
        requestId: randomUUID(),
        targetId: ids[0],
        expectedRevision: 1,
        operation: "archive",
        data: {},
      },
    });
    expect(foreign.status()).toBe(404);
  }
});
test("dos revisiones concurrentes no pisan contenido y archivar/restaurar conserva identidad", async ({
  request,
}) => {
  const headers = await login(request);
  const input = create("Dos ventanas HTTP");
  expect((await request.post(path + "/mutations", { headers, data: input })).status()).toBe(200);
  const operation = (name: string): PersonalExerciseMutation => ({
    ...input,
    requestId: randomUUID(),
    operation: "update",
    expectedRevision: 1,
    data: { ...input.data, name },
  });
  const results = await Promise.all(
    ["Ventana uno", "Ventana dos"].map((name) =>
      request.post(path + "/mutations", { headers, data: operation(name) }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  const archive = {
    version: 1,
    requestId: randomUUID(),
    targetId: input.targetId,
    expectedRevision: 2,
    operation: "archive",
    data: {},
  };
  const archived = await request.post(path + "/mutations", { headers, data: archive });
  expect(archived.status()).toBe(200);
  expect((await archived.json()).revision).toBe(3);
  const catalog = await request.get("/api/mobile/v1/training-catalog", { headers });
  expect(
    ((await catalog.json()).exercises as { id: string }[]).some((e) => e.id === input.targetId),
  ).toBe(false);
  const managed = personalExerciseLibrarySchema.parse(
    await (await request.get(path, { headers })).json(),
  );
  expect(managed.exercises.find((e) => e.id === input.targetId)?.archivedAt).not.toBeNull();
  expect(
    (
      await request.post(path + "/mutations", {
        headers,
        data: { ...archive, requestId: randomUUID(), expectedRevision: 3, operation: "restore" },
      })
    ).status(),
  ).toBe(200);
});
test("cliente móvil real → HTTP → SQL recupera respuesta perdida y reintenta exactamente una creación", async ({
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
      set: async (v) => {
        credential = v;
      },
      remove: async () => {
        credential = null;
      },
    },
    async (url, options) => {
      if (url.endsWith("/personal-exercises/mutations"))
        sent.push(JSON.parse(String(options.body)));
      const result = await fetch(url, options);
      if (url.endsWith("/personal-exercises/mutations") && result.ok && lose) {
        lose = false;
        throw Error("lost after commit");
      }
      return result;
    },
    Date.now,
    true,
  );
  await client.login(emails[0], password);
  const identity = client.getSnapshot();
  if (identity.status !== "authenticated") throw Error("Sin identidad");
  const input = create("Respuesta perdida HTTP");
  const owner = identity.session.profile.id;
  await expect(client.mutatePersonalExercise(input, owner)).rejects.toMatchObject({
    code: "network",
  });
  await client.reconnect();
  expect(await client.mutatePersonalExercise(input, owner)).toMatchObject({
    duplicate: true,
    targetId: input.targetId,
  });
  expect(sent).toEqual([input, input]);
  const snapshot = await client.personalExercises();
  expect(snapshot.exercises.filter((e) => e.id === input.targetId)).toHaveLength(1);
  expect(await client.exportPersonalExercises()).toEqual(snapshot);
  const stored = await admin()
    .from("exercises")
    .select("id,personal_owner_id,record_type")
    .eq("id", input.targetId)
    .single();
  expect(stored.error).toBeNull();
  expect(stored.data).toEqual({
    id: input.targetId,
    personal_owner_id: owner,
    record_type: "duration",
  });
});
test("borrador real recupera alta incierta y revisión del editor contra HTTP/SQL sin sustituir el intento", async ({
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
      if (url.endsWith("/personal-exercises/mutations") && response.ok && lose) {
        lose = false;
        throw Error("lost after commit");
      }
      return response;
    },
    Date.now,
    true,
  );
  await client.login(emails[0], password);
  const session = client.getSnapshot();
  if (session.status !== "authenticated") throw Error("Sin identidad");
  const owner = session.session.profile.id,
    values = new Map<string, string>();
  const storage = {
    get: async (k: string) => values.get(k) ?? null,
    set: async (k: string, v: string) => {
      values.set(k, v);
    },
    remove: async (k: string) => {
      values.delete(k);
    },
    compareAndSet: async (k: string, b: string | null, v: string) => {
      if ((values.get(k) ?? null) !== b) throw new AtomicStoreError("conflict");
      values.set(k, v);
    },
  };
  const controller = () =>
    new PersonalExerciseDraftController(
      owner,
      storage,
      (input) => client.mutatePersonalExercise(input, owner),
      randomUUID,
    );
  const first = controller();
  await first.restore();
  await first.open();
  await first.edit({ name: "Editor real privado", recordType: "duration" });
  await expect(first.save()).rejects.toMatchObject({ code: "network" });
  const request = first.getSnapshot().pending!.request;
  await client.reconnect();
  const again = controller();
  await again.restore();
  expect(again.getSnapshot().pending?.request).toEqual(request);
  expect(await again.retryPending()).toMatchObject({ duplicate: true, targetId: request.targetId });
  let row = (await client.personalExercises()).exercises.find((e) => e.id === request.targetId)!;
  await again.open(row);
  await again.edit({ name: "Mi edición real" });
  await client.mutatePersonalExercise(
    {
      version: 1,
      requestId: randomUUID(),
      targetId: row.id,
      expectedRevision: row.revision,
      operation: "update",
      data: {
        name: "Otra ventana real",
        muscleGroup: row.muscleGroup,
        equipment: row.equipment,
        isBodyweight: row.isBodyweight,
        progressionIncrementKg: row.progressionIncrementKg,
        recordType: row.recordType,
      },
    },
    owner,
  );
  await expect(again.save()).rejects.toMatchObject({ code: "conflict" });
  expect(again.getSnapshot().draft?.values.name).toBe("Mi edición real");
  await again.resolveConflict(await client.personalExercises());
  expect(again.getSnapshot().draft?.baseRevision).toBe(2);
  await again.save();
  row = (await client.personalExercises()).exercises.find((e) => e.id === request.targetId)!;
  expect(row).toMatchObject({ name: "Mi edición real", revision: 3, recordType: "duration" });
  await again.archive(row, false);
  expect((await client.trainingCatalog()).exercises.some((e) => e.id === row.id)).toBe(false);
  expect(
    (await client.exportPersonalExercises()).exercises.find((e) => e.id === row.id)?.archivedAt,
  ).not.toBeNull();
});
