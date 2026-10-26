import { expect, test } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach } from "./support/db";
import { mobileSessionSchema } from "../src/lib/mobile/contracts";
import {
  personalLibrarySchema,
  personalMutationResultSchema,
  type PersonalMutation,
} from "../src/lib/mobile/personal-contracts";

const email = "personal-library@iron-strength.e2e.test",
  password = "Library-local-only-2026!";
test.beforeAll(async () => {
  await resetAll();
  const coachId = await seedCoach();
  await createUser(admin(), {
    role: "student",
    name: "Alumno biblioteca",
    email,
    password,
    coachId,
  });
});
test("biblioteca HTTP exige JWT, cuenta activa, cuerpo y parámetros cerrados", async ({
  request,
}) => {
  for (const path of ["library", "library/export"]) {
    const r = await request.get("/api/mobile/v1/" + path, { maxRedirects: 0 });
    expect(r.status()).toBe(401);
    expect(r.headers()["cache-control"]).toContain("no-store");
    expect(r.headers()["set-cookie"]).toBeUndefined();
  }
  const noSession = await request.post("/api/mobile/v1/library/mutations", { data: {} });
  expect(noSession.status()).toBe(401);
  const auth = mobileSessionSchema.parse(
    await (await request.post("/api/mobile/v1/auth/login", { data: { email, password } })).json(),
  );
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  expect(
    (await request.get("/api/mobile/v1/library?userId=" + auth.profile.id, { headers })).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/mobile/v1/library/mutations", {
        headers,
        data: { ownerId: auth.profile.id },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/mobile/v1/library/mutations", {
        headers,
        data: { note: "x".repeat(66000) },
      })
    ).status(),
  ).toBe(413);
});
test("crear, copiar, conflicto, exportar y borrar se confirman sin alterar otra cuenta", async ({
  request,
}) => {
  const auth = mobileSessionSchema.parse(
    await (await request.post("/api/mobile/v1/auth/login", { data: { email, password } })).json(),
  );
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const read = async () => {
    const response = await request.get("/api/mobile/v1/library", { headers });
    expect(response.status()).toBe(200);
    return personalLibrarySchema.parse(await response.json());
  };
  const send = async (input: PersonalMutation, status = 200) => {
    const response = await request.post("/api/mobile/v1/library/mutations", {
      headers,
      data: input,
    });
    expect(response.status()).toBe(status);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(response.headers()["cache-control"]).toContain("no-store");
    return response;
  };
  const folderId = crypto.randomUUID(),
    routineId = crypto.randomUUID();
  await send({
    version: 1,
    requestId: crypto.randomUUID(),
    targetId: folderId,
    expectedRevision: 0,
    operation: "folder_create",
    data: { name: "Fuerza" },
  });
  const catalog = await (await request.get("/api/mobile/v1/exercises", { headers })).json();
  const input: PersonalMutation = {
    version: 1,
    requestId: crypto.randomUUID(),
    targetId: routineId,
    expectedRevision: 0,
    operation: "routine_create",
    data: {
      name: "Tren superior",
      folderId,
      items: [
        {
          id: crypto.randomUUID(),
          exerciseId: catalog.exercises[0].id,
          sets: 2,
          repsMin: 8,
          repsMax: 12,
          targetWeightKg: 30,
          note: "Objetivo privado",
          restSeconds: 90,
          supersetId: null,
          supersetRestSeconds: null,
          series: null,
        },
      ],
    },
  };
  const created = personalMutationResultSchema.parse(await (await send(input)).json());
  expect(created).toMatchObject({ status: "created", duplicate: false });
  expect(personalMutationResultSchema.parse(await (await send(input)).json())).toMatchObject({
    ...created,
    duplicate: true,
  });
  let snapshot = await read();
  const routine = snapshot.routines.find((r) => r.id === routineId)!;
  expect(routine.items[0].name).toBe(catalog.exercises[0].name);
  const stale: PersonalMutation = {
    version: 1,
    requestId: crypto.randomUUID(),
    targetId: routineId,
    expectedRevision: routine.revision,
    operation: "routine_save",
    data: { name: "Guardado nuevo", items: input.data.items },
  };
  await send(stale);
  await send({ ...stale, requestId: crypto.randomUUID() }, 409);
  const copyId = crypto.randomUUID();
  snapshot = await read();
  await send({
    version: 1,
    requestId: crypto.randomUUID(),
    targetId: copyId,
    expectedRevision: 0,
    operation: "routine_copy",
    data: {
      sourceId: routineId,
      sourceRevision: snapshot.routines.find((r) => r.id === routineId)!.revision,
      name: "Copia",
      folderId: null,
    },
  });
  snapshot = await read();
  expect(snapshot.routines.find((r) => r.id === copyId)!.items[0].id).not.toBe(routine.items[0].id);
  const exported = await request.get("/api/mobile/v1/library/export", { headers });
  expect(exported.status()).toBe(200);
  expect(personalLibrarySchema.parse(await exported.json())).toEqual(snapshot);
  expect(await exported.text()).not.toContain("payload_hash");
  const coach = mobileSessionSchema.parse(
    await (
      await request.post("/api/mobile/v1/auth/login", {
        data: { email: COACH.email, password: COACH.password },
      })
    ).json(),
  );
  const coachLibrary = await request.get("/api/mobile/v1/library", {
    headers: { Authorization: `Bearer ${coach.accessToken}` },
  });
  expect(personalLibrarySchema.parse(await coachLibrary.json()).routines).toHaveLength(0);
  await send({
    version: 1,
    requestId: crypto.randomUUID(),
    targetId: folderId,
    expectedRevision: snapshot.folders[0].revision,
    operation: "folder_delete",
    data: {},
  });
  snapshot = await read();
  expect(snapshot.routines.find((r) => r.id === routineId)!.folderId).toBeNull();
  const copied = snapshot.routines.find((r) => r.id === copyId)!;
  await send({
    version: 1,
    requestId: crypto.randomUUID(),
    targetId: copyId,
    expectedRevision: copied.revision,
    operation: "routine_delete",
    data: {},
  });
  expect((await read()).routines.some((r) => r.id === copyId)).toBe(false);
});
