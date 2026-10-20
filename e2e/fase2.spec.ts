// T129 · Fase 2 (spec 003): logros, resumen semanal, no leídos, exportar CSV y borrar cuenta.
// Es una historia en orden: lo que hace cada prueba lo usa la siguiente.
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  COACH,
  admin,
  createUser,
  resetAll,
  seedCoach,
  seedProgram,
  seedWorkout,
} from "./support/db";
import { login } from "./support/ui";

test.describe.configure({ mode: "serial" });

const EVA = {
  email: "eva-f2@iron-strength.e2e.test",
  name: "Eva",
  password: "Contraseña-E2E-2026!",
};
const OLGA = {
  email: "olga-f2@iron-strength.e2e.test",
  name: "Olga",
  password: "Contraseña-E2E-2026!",
};
let coachId: string;
let evaId: string;
let sessionId: string;

test.beforeAll(async () => {
  await resetAll();
  coachId = await seedCoach();
  evaId = await createUser(admin(), { role: "student", ...EVA, coachId });
  await createUser(admin(), { role: "student", ...OLGA, coachId });
  sessionId = (await seedProgram({ coachId, studentId: evaId })).sessionId;
});

test("terminar el primer entrenamiento desbloquea un logro, una sola vez (RF-31, RF-65, RF-66)", async ({
  page,
}) => {
  await login(page, EVA.email, EVA.password);
  await page.goto(`/workout/${sessionId}`);
  // Sin historial ni peso prescrito, la app pide el peso: no marca una serie sin él (RF-55).
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await expect(page.getByText("Revisa el peso y las repeticiones")).toBeVisible();
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("50");
  await page.getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla" }).click();
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  await page.getByRole("button", { name: "Sí, finalizar" }).click();

  await expect(page.getByText("¡Entrenamiento guardado!")).toBeVisible();
  const banner = page.getByRole("region", { name: "Logros nuevos" });
  await expect(banner).toContainText("Primer entrenamiento");

  // Recargar no lo anuncia de nuevo.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Logros nuevos" })).toHaveCount(0);

  // La lista de Progreso lo muestra obtenido y los demás pendientes.
  await page.goto("/progress");
  const list = page.getByRole("region", { name: /Logros/ });
  await expect(list).toContainText("1 de 6");
  await expect(list.getByText("Primer entrenamiento (obtenido)")).toBeVisible();
  await expect(list.getByText("10 entrenamientos (pendiente)")).toBeVisible();
  await expect(list.getByText("1 de 10")).toBeVisible();
});

test("el coach ve los logros de su alumno (RF-66)", async ({ page }) => {
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/students/${evaId}`);
  await expect(page.getByText("Primer entrenamiento (obtenido)")).toBeVisible();
});

test("el resumen semanal muestra la semana en curso (RF-32)", async ({ page }) => {
  await login(page, EVA.email, EVA.password);
  await page.goto("/week");
  await page.getByRole("link", { name: /Resumen semanal/ }).click();

  await expect(page.getByRole("heading", { name: "Resumen semanal", level: 1 })).toBeVisible();
  const current = page.getByRole("region", { name: "Esta semana" });
  await expect(current).toContainText("parcial");
  await expect(current.getByText("Entrenamientos", { exact: true })).toBeVisible();
  await expect(
    current.getByText("Entrenamientos", { exact: true }).locator("xpath=following-sibling::dd[1]"),
  ).toHaveText("1");
  await expect(page.getByRole("region", { name: "Semana anterior" })).toContainText(
    "No registraste entrenamientos esa semana.",
  );
});

test("un comentario nuevo queda sin leer hasta abrir el entrenamiento (RF-37)", async ({
  page,
  browser,
}) => {
  // El coach comenta.
  const coach = await browser.newPage();
  await login(coach, COACH.email, COACH.password);
  await coach.goto(`/coach/students/${evaId}`);
  await coach.locator('a[href^="/history/"]').first().click();
  await coach.getByLabel("Escribe un comentario").fill("Gran primera sesión, Eva.");
  await coach.getByRole("button", { name: "Publicar comentario" }).click();
  await expect(coach.getByText("Gran primera sesión, Eva.")).toBeVisible();
  await coach.close();

  // La alumna lo ve sin leer en la navegación y en la lista.
  await login(page, EVA.email, EVA.password);
  await expect(page.getByRole("link", { name: /Historial.*1 comentario sin leer/ })).toBeVisible();
  await page.getByRole("link", { name: /Historial/ }).click();
  await expect(page.locator('a[href^="/history/"]').first()).toContainText("1 comentario sin leer");

  // Al abrir el entrenamiento queda leído y los contadores desaparecen.
  await page.locator('a[href^="/history/"]').first().click();
  await expect(page.getByText("Gran primera sesión, Eva.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Historial.*sin leer/ })).toHaveCount(0);
  await page.goto("/history");
  await expect(page.getByText("sin leer")).toHaveCount(0);
});

test("exportar el historial a CSV: propio, del coach y sin acceso ajeno (RF-47, RF-67)", async ({
  page,
  browser,
}) => {
  // Evita que el nombre de un ejercicio se interprete como fórmula.
  const exercise = (
    await admin()
      .from("exercises")
      .select("id")
      .eq("name", "Sentadilla")
      .is("coach_id", null)
      .single()
  ).data!;
  await seedWorkout({
    studentId: evaId,
    exerciseId: exercise.id,
    exerciseName: "=SUMA(1;1)",
    daysAgo: 1,
  });

  await login(page, EVA.email, EVA.password);
  const own = await page.request.get("/export/history");
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toContain("text/csv");
  expect(own.headers()["content-disposition"]).toMatch(
    /attachment; filename="entrenamientos-eva-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  const csv = await own.text();
  expect(csv.startsWith("﻿Fecha;Sesión;Ejercicio;Serie;Tipo;Kg;Reps")).toBe(true);
  expect(csv).toContain(`"'=SUMA(1;1)"`); // neutralizado con apóstrofo y citado por el ';'
  expect(csv).toContain(";Trabajo;");
  expect(csv).not.toMatch(/;=SUMA/);

  // El coach descarga el de su alumna.
  const coach = await browser.newPage();
  await login(coach, COACH.email, COACH.password);
  const viaCoach = await coach.request.get(`/export/history?alumno=${evaId}`);
  expect(viaCoach.status()).toBe(200);
  expect(await viaCoach.text()).toContain("Fecha;Sesión;Ejercicio");
  await coach.close();

  // Otra alumna no puede, y un id mal formado tampoco.
  const olga = await browser.newPage();
  await login(olga, OLGA.email, OLGA.password);
  expect((await olga.request.get(`/export/history?alumno=${evaId}`)).status()).toBe(404);
  expect((await olga.request.get("/export/history?alumno=no-es-un-id")).status()).toBe(404);
  await olga.close();

  // Sin sesión se pide iniciar sesión.
  const anon = await browser.newContext();
  const res = await anon.request.get("/export/history", { maxRedirects: 0 });
  expect([301, 302, 303, 307, 308]).toContain(res.status());
  await anon.close();
});

test("Mi cuenta: el coach no ve el borrado y la alumna borra su cuenta (RF-48, RF-64)", async ({
  page,
  browser,
}) => {
  const coach = await browser.newPage();
  await login(coach, COACH.email, COACH.password);
  await coach.getByRole("button", { name: "Mi cuenta" }).click();
  await expect(coach.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  await expect(coach.getByText("Borrar mi cuenta")).toHaveCount(0);
  await coach.close();

  await login(page, EVA.email, EVA.password);
  await page.getByRole("button", { name: "Mi cuenta" }).click();
  await page.getByRole("button", { name: "Quiero borrar mi cuenta" }).click();

  const confirm = page.getByRole("button", { name: "Borrar mi cuenta para siempre" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Para confirmar, escribe BORRAR/).fill("borra");
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Para confirmar, escribe BORRAR/).fill("borrar");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page).toHaveURL(/\/login\?motivo=cuenta-borrada/);
  await expect(page.getByText("Tu cuenta y tus datos fueron borrados.")).toBeVisible();

  // Ya no puede entrar y no queda nada suyo.
  await page.getByLabel("Correo").fill(EVA.email);
  await page.getByLabel("Contraseña").fill(EVA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  expect((await admin().auth.admin.getUserById(evaId)).data.user).toBeNull();
  const { count } = await admin()
    .from("workouts")
    .select("*", { count: "exact", head: true })
    .eq("student_id", evaId);
  expect(count).toBe(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`accesibilidad de las pantallas nuevas en modo ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, OLGA.email, OLGA.password);

    for (const [path, ready] of [
      ["/week/summary", "Resumen semanal"],
      ["/progress", "Progreso"],
      ["/account", "Mi cuenta"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: ready, level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious.map(
          (v) =>
            `${path}: ${v.id} → ${v.nodes
              .slice(0, 3)
              .map((n) => n.target.join(" "))
              .join(" | ")}`,
        ),
      ).toEqual([]);
    }

    // El formulario de borrado abierto también cumple.
    await page.getByRole("button", { name: "Quiero borrar mi cuenta" }).click();
    const form = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      form.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  });
}
