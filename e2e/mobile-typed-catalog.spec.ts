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
  if (ids?.length)
    await admin()
      .from("exercises")
      .delete()
      .in("id", [...ids, archived]);
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
