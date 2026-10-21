import { test } from "./support/network";
import { expect, type Page } from "@playwright/test";
import { admin, COACH, createUser, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";
import type { QueueEntry } from "../src/lib/offline/queue-contract";
async function queue(page: Page): Promise<QueueEntry[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("iron-strength-workout-queue");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("queue")) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction("queue", "readonly");
          const read = tx.objectStore("queue").getAll();
          read.onsuccess = () => resolve(read.result);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
async function finish(page: Page) {
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByLabel("Esfuerzo percibido (opcional)", { exact: true }).selectOption("7");
  await page
    .getByLabel("Nota del entrenamiento (opcional)", { exact: true })
    .fill("Entrené sin conexión.");
  await page.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
}
test("termina offline, cierra y sincroniza una vez aunque pierda la respuesta; conserva sustitución y valoración (T161)", async ({
  page,
  context,
  network,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const program = await seedProgram({ coachId, studentId: coachId });
  const row = (
    await admin()
      .from("session_exercises")
      .select("id")
      .eq("program_session_id", program.sessionId)
      .eq("position", 0)
      .single()
  ).data!;
  const alternativeId = (
    await admin()
      .from("exercises")
      .select("id")
      .eq("name", "Prensa de piernas")
      .is("coach_id", null)
      .single()
  ).data!.id;
  expect(
    (
      await admin().from("session_exercise_alternatives").insert({
        session_exercise_id: row.id,
        exercise_id: alternativeId,
        position: 0,
        sets: 2,
        reps_min: 6,
        reps_max: 10,
        target_weight_kg: 22.5,
      })
    ).error,
  ).toBeNull();
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Descarga de la semana" }).getByRole("status"),
  ).toContainText("Disponible sin conexión");
  await page.close();
  network.offline = true;
  const offline = await context.newPage();
  await offline.goto("/offline");
  await offline.getByRole("button", { name: "Iniciar sesión A", exact: true }).click();
  const original = offline.getByRole("region", { name: "Sentadilla", exact: true });
  await original.getByText("Alternativas del coach", { exact: true }).click();
  await original.getByLabel("Ejercicio a realizar").selectOption(alternativeId);
  await original.getByRole("button", { name: "Usar alternativa" }).click();
  await offline
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Prensa de piernas", exact: true })
    .click();
  await finish(offline);
  await expect(
    offline.getByText("Entrenamiento pendiente de sincronizar", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const frozen = (await queue(offline))[0];
  expect(
    await offline.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open("iron-strength-offline", 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            resolve(db.version);
            db.close();
          };
        }),
    ),
  ).toBe(1);
  expect(frozen.payload.sets[0].exerciseId).toBe(alternativeId);
  expect(frozen.payload.perceivedEffort).toBe(7);
  await offline.close();
  const pending = await context.newPage();
  await pending.goto("/offline");
  const panel = pending.getByRole("region", {
    name: "Sincronización de entrenamientos",
    exact: true,
  });
  await panel.getByText("Ver registro pendiente", { exact: true }).click();
  await expect(panel).toContainText("Prensa de piernas");
  await expect(panel).toContainText("Entrené sin conexión.");
  await pending.close();
  network.lostResponses.add("/api/workouts/sync");
  network.stopAfterLoss.add("/api/workouts/sync");
  network.offline = false;
  const restored = await context.newPage();
  await restored.goto("/offline");
  const restoredPanel = restored.getByRole("region", {
    name: "Sincronización de entrenamientos",
    exact: true,
  });
  await expect
    .poll(() => network.blocked.has("/api/workouts/sync"), { timeout: 30_000 })
    .toBe(true);
  await expect(
    restoredPanel.getByRole("button", { name: "Sincronizar ahora", exact: true }),
  ).toBeEnabled({ timeout: 30_000 });
  await expect(restoredPanel).toContainText("No hay conexión con el servidor", {
    timeout: 30_000,
  });
  expect((await queue(restored))[0].payload).toEqual(frozen.payload);
  expect(network.blocked.delete("/api/workouts/sync")).toBe(true);
  await restored.reload();
  await expect(
    restored
      .getByRole("region", { name: "Sincronización de entrenamientos", exact: true })
      .getByRole("status"),
  ).toContainText("Entrenamiento sincronizado.", { timeout: 30_000 });
  expect(await queue(restored)).toHaveLength(0);
  const saved = (
    await admin()
      .from("workouts")
      .select(
        "id,started_at,finished_at,duration_seconds,perceived_effort,note,workout_sets(exercise_id,prescribed_exercise_name)",
      )
      .eq("student_id", coachId)
  ).data!;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    id: frozen.workoutId,
    duration_seconds: frozen.payload.durationSeconds,
    perceived_effort: 7,
    note: "Entrené sin conexión.",
    workout_sets: [{ exercise_id: alternativeId, prescribed_exercise_name: "Sentadilla" }],
  });
  expect(Date.parse(saved[0].started_at)).toBe(Date.parse(frozen.payload.startedAt));
  expect(Date.parse(saved[0].finished_at)).toBe(Date.parse(frozen.payload.finishedAt));
  await restored.getByRole("link", { name: "Ver entrenamiento", exact: true }).click();
  await expect(restored.getByText("En lugar de Sentadilla")).toBeVisible();
});
test("sesión expirada y rechazo conservan la cola; otra cuenta no puede enviarla (T161)", async ({
  page,
  context,
  network,
  baseURL,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const program = await seedProgram({ coachId, studentId: coachId });
  await login(page, COACH.email, COACH.password);
  await page.goto(`/workout/${program.sessionId}`);
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
  await page
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  network.blocked.add("/api/workouts/sync");
  await finish(page);
  await expect(
    page.getByText("Entrenamiento pendiente de sincronizar", { exact: true }),
  ).toBeVisible();
  const frozen = (await queue(page))[0];
  network.blocked.delete("/api/workouts/sync");
  await context.clearCookies();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByText(/Tu sesión expiró/)).toBeVisible();
  expect((await queue(page))[0].payload).toEqual(frozen.payload);
  const anonymous = await context.request.post("/api/workouts/sync", {
    headers: { Origin: baseURL! },
    data: { version: 1, userId: coachId, payload: frozen.payload },
  });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers().location).toBeUndefined();
  const other = {
    email: "cola-otra@iron-strength.e2e.test",
    password: "Cola-Prueba-2026!",
    name: "Otra cuenta",
  };
  const otherId = await createUser(admin(), { ...other, role: "student", coachId });
  await seedProgram({ coachId, studentId: otherId });
  await login(page, other.email, other.password);
  await page.goto("/week");
  await expect(
    page.getByRole("region", { name: "Sincronización de entrenamientos", exact: true }),
  ).toHaveCount(0);
  const crossed = await context.request.post("/api/workouts/sync", {
    headers: { Origin: baseURL! },
    data: { version: 1, userId: coachId, payload: frozen.payload },
  });
  expect(crossed.status()).toBe(403);
  expect(await crossed.json()).toMatchObject({ reason: "account_changed" });
  const origin = await context.request.post("/api/workouts/sync", {
    headers: { Origin: "https://otra.invalid" },
    data: { version: 1, userId: otherId, payload: frozen.payload },
  });
  expect(origin.status()).toBe(403);
  expect((await queue(page))[0].payload).toEqual(frozen.payload);
  expect((await admin().from("programs").delete().eq("id", program.programId)).error).toBeNull();
  await context.clearCookies();
  await login(page, COACH.email, COACH.password);
  const panel = page.getByRole("region", { name: "Sincronización de entrenamientos", exact: true });
  await expect(panel).toContainText("La rutina ya no está disponible");
  const retried = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/workouts/sync") && response.request().method() === "POST",
  );
  await panel.getByRole("button", { name: "Sincronizar ahora" }).click();
  expect((await retried).status()).toBe(422);
  await expect(panel).toContainText("La rutina ya no está disponible");
  expect((await queue(page))[0].payload).toEqual(frozen.payload);
  expect((await admin().from("workouts").select("id").eq("student_id", coachId)).data).toHaveLength(
    0,
  );
});
test("sin espacio en la cola puede guardar con conexión sin afirmar una copia local (T161)", async ({
  page,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const program = await seedProgram({ coachId, studentId: coachId });
  await login(page, COACH.email, COACH.password);
  await page.goto(`/workout/${program.sessionId}`);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "queue") throw new DOMException("Full", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
  await page
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  await finish(page);
  await expect(page.getByText("¡Entrenamiento guardado!", { exact: true })).toBeVisible();
  expect(await queue(page)).toHaveLength(0);
  expect((await admin().from("workouts").select("id").eq("student_id", coachId)).data).toHaveLength(
    1,
  );
});
