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

async function mouseReorder(page: Page, first: string, second: string, outside = false) {
  const source = page.getByRole("button", { name: `Reordenar ${first}`, exact: true });
  const target = page.getByRole("button", { name: `Reordenar ${second}`, exact: true });
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const y = to.y + to.height / 2 + (to.y > from.y ? 90 : -90);
  await page.mouse.move(outside ? 2 : to.x + to.width / 2, y, { steps: 12 });
  await page.mouse.up();
}

test("arrastrar guarda el orden; un fallo conserva el destino y se puede reintentar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const programId = await routine(page);
  await mouseReorder(page, "Sentadilla", "Press de banca");
  await expect(page.getByText("Orden guardado.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /1.*Press de banca/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /1.*Press de banca/ })).toBeVisible();
  let aborted = false;
  await page.route(page.url(), async (route) => {
    if (
      !aborted &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      aborted = true;
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await mouseReorder(page, "Press de banca", "Sentadilla");
  const retry = page.getByRole("button", { name: "Reintentar guardar orden", exact: true });
  await expect(retry).toBeVisible();
  expect(aborted).toBe(true);
  await expect(page.getByRole("heading", { name: /1.*Sentadilla/ })).toBeVisible();
  await retry.click();
  await expect(page.getByText("Orden guardado.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /1.*Sentadilla/ })).toBeVisible();
  const { data } = await admin()
    .from("program_sessions")
    .select("session_exercises(position,sets,reps_min,reps_max,exercises(name))")
    .eq("program_id", programId)
    .eq("week_number", 1)
    .single();
  const rows = data!.session_exercises.sort((a, b) => a.position - b.position);
  expect(rows[0].exercises.name).toBe("Sentadilla");
  expect(rows.every((row) => row.sets === 3 && row.reps_min === 8 && row.reps_max === 12)).toBe(
    true,
  );
});

test("arrastre touch real con scroll automático y persistencia en móvil", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await routine(page);
  const handle = page.getByRole("button", { name: "Reordenar Sentadilla", exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let step = 1; step <= 12; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + ((775 - y) * step) / 12, id: 1 }],
    });
  }
  await expect(page.getByTestId("exercise-drop-target")).toHaveCount(1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByText("Orden guardado.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /1.*Press de banca/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await cdp.detach();
});

test("soltar fuera y Escape cancelan; las prescripciones pendientes bloquean el asa", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await routine(page);
  await mouseReorder(page, "Sentadilla", "Press de banca", true);
  await expect(page.getByRole("heading", { name: /1.*Sentadilla/ })).toBeVisible();
  const handle = page.getByRole("button", { name: "Reordenar Sentadilla", exact: true });
  await handle.focus();
  await handle.press("Space");
  await handle.press("ArrowDown");
  await handle.press("Escape");
  await expect(page.getByRole("heading", { name: /1.*Sentadilla/ })).toBeVisible();
  await visibleField(page, "Series de Sentadilla").fill("4");
  await expect(handle).toBeDisabled();
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await expect(handle).toBeEnabled();
  await handle.focus();
  await handle.press("Space");
  await handle.press("ArrowDown");
  await handle.press("Enter");
  await expect(page.getByText("Orden guardado.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /1.*Press de banca/ })).toBeVisible();
  await expect(handle).toBeFocused();
});
