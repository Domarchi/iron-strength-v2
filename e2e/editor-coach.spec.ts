// T139 · Rutinas reales, protección de ediciones y fallos de red del editor T138.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { COACH, admin, resetAll, seedCoach } from "./support/db";
import { login } from "./support/ui";

test.beforeEach(async () => {
  await resetAll();
  await seedCoach();
});
async function routine(page: Page) {
  await login(page, COACH.email, COACH.password);
  await page.goto("/coach/programs");
  await page.getByLabel("Nombre", { exact: true }).fill("Rutina editor E2E");
  await page.getByLabel("Semanas", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Crear plantilla", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rutina editor E2E", exact: true })).toBeVisible();
  const programId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "Agregar sesión", exact: true }).click();
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  for (const [search, label] of [
    ["Sentadilla", "Sentadilla Piernas · Barra"],
    ["Press de banca", "Press de banca Pecho · Barra"],
  ]) {
    await page.getByLabel("Buscar ejercicios", { exact: true }).fill(search);
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  }
  await page.getByRole("button", { name: "Agregar seleccionados (2)", exact: true }).click();
  await expect(page.getByLabel("Series de Sentadilla", { exact: true })).toBeVisible();
  return programId;
}
const visibleField = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });

test("copiar y reordenar una semana conserva prescripciones, es accesible y cabe en móvil", async ({
  page,
}) => {
  const programId = await routine(page);
  await visibleField(page, "Peso (kg) de Sentadilla").fill("62,5");
  await visibleField(page, "Series de Sentadilla").fill("4");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Semana 2/ }).click();
  await page
    .getByText("Copiar desde otra semana", { exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Copiar aquí", exact: true }).click();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("4");
  await expect(visibleField(page, "Peso (kg) de Sentadilla")).toHaveValue("62.5");
  await page.getByRole("button", { name: "Bajar Sentadilla", exact: true }).click();
  await expect(page.getByRole("heading", { name: /1.*Press de banca/ })).toBeVisible();
  const { data, error } = await admin()
    .from("program_sessions")
    .select("session_exercises(position,sets,target_weight_kg,exercises(name))")
    .eq("program_id", programId)
    .eq("week_number", 2)
    .single();
  expect(error).toBeNull();
  const rows = data!.session_exercises.sort((a, b) => a.position - b.position);
  expect(rows[0].exercises.name).toBe("Press de banca");
  expect(rows[1]).toMatchObject({ sets: 4, target_weight_kg: 62.5 });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  }
});

test("un fallo al guardar conserva las ediciones y salir requiere confirmación", async ({
  page,
}) => {
  await routine(page);
  await visibleField(page, "Series de Sentadilla").fill("5");
  const url = page.url();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Programas", exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("5");
  await page.getByRole("button", { name: /Semana 2/ }).click();
  await page.getByRole("button", { name: /Semana 1/ }).click();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("5");
  let aborted = false;
  await page.route(url, async (route) => {
    if (
      !aborted &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      aborted = true;
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Se conservan aquí" })).toBeVisible();
  expect(aborted).toBe(true);
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("5");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("5");
});
