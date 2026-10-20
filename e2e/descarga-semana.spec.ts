import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  admin,
  COACH,
  createUser,
  resetAll,
  seedCoach,
  seedProgram,
  seedWorkout,
} from "./support/db";
import { login } from "./support/ui";
import type { WeekPackage } from "../src/lib/offline/package";
async function readPackages(page: Page): Promise<WeekPackage[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("iron-strength-offline");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("weeks", "readonly");
          const read = tx.objectStore("weeks").getAll();
          read.onsuccess = () => resolve(read.result);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
test("descarga completa, recupera fecha, conserva anterior sin espacio y separa cuentas (T159)", async ({
  page,
  context,
}) => {
  await resetAll();
  const coachId = await seedCoach();
  const program = await seedProgram({ coachId, studentId: coachId });
  const rows = (
    await admin()
      .from("session_exercises")
      .select("id")
      .eq("program_session_id", program.sessionId)
      .order("position")
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
        session_exercise_id: rows[0].id,
        exercise_id: alternativeId,
        position: 0,
        sets: 2,
        reps_min: 6,
        reps_max: 10,
        target_weight_kg: 22.5,
      })
    ).error,
  ).toBeNull();
  await seedWorkout({
    studentId: coachId,
    exerciseId: alternativeId,
    exerciseName: "Prensa de piernas",
    daysAgo: 1,
  });
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  const download = page.getByRole("region", { name: "Descarga de la semana", exact: true });
  await download.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión:");
  const original = (await readPackages(page))[0];
  expect(original.userId).toBe(coachId);
  expect(original.sessions).toHaveLength(1);
  expect(
    original.sessions[0].context.exercises[0].alternatives?.[0].prescribed.targetWeightKg,
  ).toBe(22.5);
  expect(original.history[alternativeId].items).toHaveLength(1);
  expect(JSON.stringify(original)).not.toMatch(/access_token|refresh_token|password|signedUrl/);
  await page.reload();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión:");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await download.getByRole("button", { name: "Actualizar descarga", exact: true }).click();
  await expect(download.getByRole("alert")).toContainText("No hay espacio suficiente");
  expect((await readPackages(page))[0]).toEqual(original);
  await page.reload();
  await download.getByRole("button", { name: "Actualizar descarga", exact: true }).click();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión:");
  const updated = (await readPackages(page))[0];
  expect(updated.downloadedAt).not.toBe(original.downloadedAt);
  await page.setViewportSize({ width: 360, height: 800 });
  const audit = await new AxeBuilder({ page })
    .include('[aria-label="Descarga de la semana"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  const student = {
    email: "offline@iron-strength.e2e.test",
    password: "Offline-Prueba-2026!",
    name: "Alumno descarga",
  };
  const studentId = await createUser(admin(), { ...student, coachId, role: "student" });
  await seedProgram({ coachId, studentId });
  await context.clearCookies();
  await login(page, student.email, student.password);
  await page.goto("/week");
  await expect(download.getByRole("status")).toContainText("Todavía no has descargado");
  await download.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(download.getByRole("status")).toContainText("Disponible sin conexión:");
  const all = await readPackages(page);
  expect(all).toHaveLength(2);
  expect(all.find((p) => p.userId === coachId)).toEqual(updated);
  expect(
    Object.values(all.find((p) => p.userId === studentId)!.history).every(
      (h) => h.items.length === 0,
    ),
  ).toBe(true);
});
