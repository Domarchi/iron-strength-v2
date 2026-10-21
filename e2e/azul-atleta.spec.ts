import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { admin, COACH, resetAll, seedCoach, seedProgram } from "./support/db";
import { login } from "./support/ui";

test("Azul atleta: composición móvil, recursos y recuperación del registro", async ({ page }) => {
  await resetAll();
  const coachId = await seedCoach();
  await seedProgram({ coachId, studentId: coachId });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["hero-v1.png", "squat-v1.png"]) {
    const response = await page.request.get(`/design/azul-atleta/${path}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await login(page, COACH.email, COACH.password);
  await page.goto("/week");
  await expect(page.getByRole("heading", { name: "Mi semana", exact: true })).toBeVisible();
  const hero = page.getByRole("region", { name: "Próxima sesión" });
  await expect(hero).toBeVisible();
  expect(await hero.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(320);
  expect(
    await page.locator(".week-hero-image").evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("inicio-movil.png"), fullPage: true });
  await hero.getByRole("button", { name: "Empezar", exact: true }).click();
  await page.getByLabel("Peso de la serie 1 de Sentadilla (kg)").fill("62.5");
  await page.getByLabel("Repeticiones de la serie 1 de Sentadilla", { exact: true }).fill("9");
  await page
    .getByRole("button", { name: "Marcar como hecha la serie 1 de Sentadilla", exact: true })
    .click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Peso de la serie 1 de Sentadilla (kg)")).toHaveValue("62.5");
  await expect(
    page.getByRole("button", { name: "Desmarcar la serie 1 de Sentadilla", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("timer")).toBeVisible();
  expect(
    await page.locator(".workout-surface").evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(7, 22, 39)");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("registro-movil.png"), fullPage: true });
  await page.getByRole("button", { name: "Terminar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Sí, finalizar", exact: true }).click();
  await expect(page.getByText("¡Entrenamiento guardado!", { exact: true })).toBeVisible();
  await page.goto("/week");
  await expect(page.getByRole("region", { name: "Próxima sesión", exact: true })).toHaveCount(0);
  const completedWeek = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    completedWeek.violations.filter(
      (issue) => issue.impact === "serious" || issue.impact === "critical",
    ),
  ).toEqual([]);
});

test("Azul atleta: escritorio con navegación y biblioteca junto al editor", async ({ page }) => {
  await resetAll();
  const coachId = await seedCoach();
  const template = await seedProgram({ coachId, studentId: coachId });
  const result = await admin()
    .from("programs")
    .update({ student_id: null, start_date: null, ends_on: null })
    .eq("id", template.programId);
  expect(result.error).toBeNull();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, COACH.email, COACH.password);
  await page.goto(`/coach/programs/${template.programId}`);
  const library = page.getByRole("complementary", { name: "Biblioteca de ejercicios" });
  await expect(library).toBeVisible();
  const field = page.getByLabel("Series de Sentadilla", { exact: true });
  const libBox = await library.boundingBox();
  const fieldBox = await field.boundingBox();
  expect(libBox!.x).toBeGreaterThan(fieldBox!.x + fieldBox!.width);
  const navBox = await page
    .getByRole("navigation", { name: "Principal", exact: true })
    .boundingBox();
  expect(navBox!.width).toBeLessThan(250);
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Buscar ejercicios", exact: true })
    .fill("Peso muerto rumano");
  await expect(page.getByLabel("Catálogo de ejercicios")).toContainText("Peso muerto rumano");
  const selectedExercise = library.getByRole("checkbox", {
    name: "Peso muerto rumano Piernas · Barra",
    exact: true,
  });
  await selectedExercise.check();
  await page.getByRole("button", { name: /Semana 2/ }).click();
  await page.getByRole("button", { name: /Semana 1/ }).click();
  await expect(selectedExercise).toBeChecked();
  await selectedExercise.uncheck();
  await field.fill("4");
  await page.getByRole("button", { name: /Semana 2/ }).click();
  await page.getByRole("button", { name: /Semana 1/ }).click();
  await expect(field).toHaveValue("4");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Cambios guardados." })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("coach-web.png"), fullPage: true });
});
