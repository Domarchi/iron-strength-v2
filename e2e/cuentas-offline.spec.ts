import { expect, test } from "@playwright/test";
import { admin, COACH, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";
import { createDraft } from "../src/lib/workout/runner-state";
import { legacyDraftKey, draftKey } from "../src/lib/workout/draft";

test("recupera y migra el borrador anterior; la cuota conserva el origen hasta confirmar v2 (T162)", async ({
  page,
}) => {
  await resetAll();
  const userId = await seedCoach();
  const program = await seedProgram({ coachId: userId, studentId: userId });
  const row = (
    await admin()
      .from("session_exercises")
      .select("id")
      .eq("program_session_id", program.sessionId)
      .eq("position", 0)
      .single()
  ).data!;
  const value = createDraft({
    userId,
    workoutId: crypto.randomUUID(),
    plannedSession: { id: program.sessionId, programId: program.programId, label: "A" },
    now: new Date(),
    exercises: [
      {
        sessionExerciseId: row.id,
        exerciseId: program.exercises.get("Sentadilla")!,
        name: "Sentadilla",
        isBodyweight: false,
        lastWeightKg: null,
        prescribed: { sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: 60 },
      },
    ],
  });
  value.exercises[0].sets[0].weight = "62,5";
  value.exercises[0].sets[0].reps = "9";
  value.note = "Recuperar exactamente";
  value.perceivedEffort = 8;
  value.rest = { endsAt: Date.now() + 180000, totalSeconds: 180 };
  await login(page, COACH.email, COACH.password);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("is:offline:active-user")))
    .toBe(userId);
  const oldKey = legacyDraftKey(userId, program.sessionId),
    newKey = draftKey(userId, program.sessionId);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: oldKey,
    value,
  });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:draft:v2:") && !sessionStorage.getItem("allow-migration"))
        throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto(`/workout/${program.sessionId}`);
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("62,5");
  await expect(page.getByText(/No se pudo guardar en este dispositivo/)).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), oldKey)).toEqual(
    value,
  );
  await page.evaluate(() => sessionStorage.setItem("allow-migration", "yes"));
  await page.reload();
  await expect(page.getByText("Guardado en este dispositivo", { exact: true })).toBeVisible();
  const migrated = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), newKey);
  expect(migrated).toEqual({ version: 2, draft: value });
  expect(await page.evaluate((key) => localStorage.getItem(key), oldKey)).toBeNull();
});

test("cerrar sesión exige resolver pendientes, sincroniza y limpia solo esa cuenta; otras pestañas se ocultan (T162)", async ({
  page,
  context,
}) => {
  await resetAll();
  const userId = await seedCoach();
  const program = await seedProgram({ coachId: userId, studentId: userId });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Descarga de la semana" }).getByRole("status"),
  ).toContainText("Disponible sin conexión");
  await page.goto(`/workout/${program.sessionId}`);
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("60");
  await page
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  await context.route("**/api/workouts/sync", (route) => route.abort());
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
  await expect(
    page.getByText("Entrenamiento pendiente de sincronizar", { exact: true }),
  ).toBeVisible();
  const other = crypto.randomUUID();
  await page.evaluate(async (other) => {
    localStorage.setItem(`is:draft:v99:${other}:session`, "Unknown future data");
    for (const [name, storeName] of [
      ["iron-strength-workout-queue", "queue"],
      ["iron-strength-offline", "weeks"],
    ])
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(storeName, "readwrite"),
            store = tx.objectStore(storeName);
          const read = store.getAll();
          read.onsuccess = () => {
            store.put({ ...read.result[0], userId: other });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      });
  }, other);
  await page.goto("/account");
  const observer = await context.newPage();
  await observer.goto("/week");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).last().click();
  const dialog = page.getByRole("dialog", { name: "Antes de cerrar sesión", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Volver sin cerrar sesión", exact: true }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).last().click();
  await dialog.getByRole("button", { name: "Sincronizar y salir", exact: true }).click();
  await expect(dialog).toContainText("Aún quedan registros pendientes");
  await context.unroute("**/api/workouts/sync");
  await dialog.getByRole("button", { name: "Sincronizar y salir", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(
    observer.getByRole("heading", { name: "La cuenta cambió en este dispositivo" }),
  ).toBeVisible();
  await expect(observer.getByRole("heading", { name: "Mi semana", exact: true })).toHaveCount(0);
  expect((await admin().from("workouts").select("id").eq("student_id", userId)).data).toHaveLength(
    1,
  );
  const local = await page.evaluate(
    async ({ userId, other }) => {
      const owners: string[][] = [];
      for (const [name, storeName] of [
        ["iron-strength-workout-queue", "queue"],
        ["iron-strength-offline", "weeks"],
      ])
        owners.push(
          await new Promise<string[]>((resolve) => {
            const req = indexedDB.open(name, 1);
            req.onsuccess = () => {
              const db = req.result,
                tx = db.transaction(storeName);
              const read = tx.objectStore(storeName).getAll();
              read.onsuccess = () => resolve(read.result.map((x: { userId: string }) => x.userId));
              tx.oncomplete = () => db.close();
            };
          }),
        );
      return {
        own: Object.keys(localStorage).filter((k) => k.includes(userId)),
        other: localStorage.getItem(`is:draft:v99:${other}:session`),
        owners,
      };
    },
    { userId, other },
  );
  expect(local.own).toEqual([]);
  expect(local.other).toBe("Unknown future data");
  expect(local.owners).toEqual([[other], [other]]);
});
