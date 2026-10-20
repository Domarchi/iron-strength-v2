// T139 · Rutinas reales, protección de ediciones y fallos de red del editor T138.
import { mondayOf, santiagoDate } from "../src/domain/dates";
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
  await expect(
    page.getByText("Orden guardado.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
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
    // Espera los colores definitivos del control visible antes de medir contraste.
    const activeWeek = page.getByRole("button", { name: /Semana 2/ });
    await expect(activeWeek).toHaveCSS(
      "color",
      scheme === "dark" ? "rgb(7, 26, 48)" : "rgb(255, 255, 255)",
    );
    await expect(activeWeek).toHaveCSS(
      "background-color",
      scheme === "dark" ? "rgb(104, 176, 255)" : "rgb(23, 106, 198)",
    );
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
  await page
    .getByRole("list", { name: "Ejercicios de la sesión", exact: true })
    .scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  const targetRow = (await page.getByRole("listitem").filter({ has: target }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  const y = targetRow.y + targetRow.height / 2 + (to.y > from.y ? 20 : -20);
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
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "El gesto táctil continuo usa CDP; WebKit prueba arrastre por puntero/teclado y el gesto real se verifica en iPhone.",
  );
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

test("duplicar un ejercicio recupera una respuesta perdida sin repetir la copia", async ({
  page,
}) => {
  const programId = await routine(page);
  await visibleField(page, "Series de Sentadilla").fill("4");
  await visibleField(page, "Peso (kg) de Sentadilla").fill("62,5");
  await expect(
    page.getByRole("button", { name: "Duplicar Sentadilla", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Duplicar sesión A", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  let lost = false;
  await page.route(page.url(), async (route) => {
    if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      lost = true;
      // La base ya confirmó la copia; solo se pierde la respuesta hacia el navegador.
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Duplicar Sentadilla", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reintentar copia", exact: true })).toBeVisible();
  const readRows = async () => {
    const { data, error } = await admin()
      .from("program_sessions")
      .select("session_exercises(*)")
      .eq("program_id", programId)
      .single();
    expect(error).toBeNull();
    return data!.session_exercises.sort((a, b) => a.position - b.position);
  };
  const beforeRetry = await readRows();
  expect(beforeRetry).toHaveLength(3);
  expect(beforeRetry[2]).toMatchObject({ sets: 4, target_weight_kg: 62.5 });
  await page.getByRole("button", { name: "Reintentar copia", exact: true }).click();
  await expect(page.getByText("Ejercicio duplicado.", { exact: true })).toBeVisible();
  expect((await readRows()).map((row) => row.id)).toEqual(beforeRetry.map((row) => row.id));
  await page.reload();
  const copy = page.locator(`[data-sortable-id="${beforeRetry[2].id}"]`);
  await copy.getByLabel("Series de Sentadilla", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  const rows = await readRows();
  expect(rows[0].sets).toBe(4);
  expect(rows[2].sets).toBe(2);
});

test("duplicar sesión conserva orden y prescripciones y permite editar solo la copia", async ({
  page,
}) => {
  const programId = await routine(page);
  await visibleField(page, "Series de Sentadilla").fill("4");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Duplicar sesión A", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sesión B", exact: true })).toBeVisible();
  await page.reload();
  const { data, error } = await admin()
    .from("program_sessions")
    .select("id,label,session_exercises(*)")
    .eq("program_id", programId)
    .eq("week_number", 1)
    .order("label");
  expect(error).toBeNull();
  expect(data).toHaveLength(2);
  const rows = data!.map((session) =>
    session.session_exercises.sort((a, b) => a.position - b.position),
  );
  expect(rows[1].map((row) => ({ ...row, id: "", program_session_id: "" }))).toEqual(
    rows[0].map((row) => ({ ...row, id: "", program_session_id: "" })),
  );
  expect(rows[1].every((copy) => !rows[0].some((source) => source.id === copy.id))).toBe(true);
  await page
    .locator(`[data-sortable-id="${rows[1][0].id}"]`)
    .getByLabel("Series de Sentadilla", { exact: true })
    .fill("2");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).last().click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator(`[data-sortable-id="${rows[0][0].id}"]`)
      .getByLabel("Series de Sentadilla", { exact: true }),
  ).toHaveValue("4");
  await expect(
    page
      .locator(`[data-sortable-id="${rows[1][0].id}"]`)
      .getByLabel("Series de Sentadilla", { exact: true }),
  ).toHaveValue("2");
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
});

test("dos pestañas conservan sus cambios y rechazan una revisión antigua", async ({ page }) => {
  await routine(page);
  const other = await page.context().newPage();
  await other.goto(page.url());
  await visibleField(other, "Series de Sentadilla").fill("6");
  await visibleField(page, "Series de Sentadilla").fill("4");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await other.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: "otra pestaña" })).toBeVisible();
  await expect(visibleField(other, "Series de Sentadilla")).toHaveValue("6");
  await page.reload();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("4");
  other.once("dialog", (dialog) => dialog.accept());
  await other.getByRole("button", { name: "Descartar cambios", exact: true }).click();
  await expect(visibleField(other, "Series de Sentadilla")).toHaveValue("4");
  await other.close();
});

test("perder la respuesta de un lote guardado permite confirmar sin duplicar la escritura", async ({
  page,
}) => {
  const programId = await routine(page);
  await visibleField(page, "Series de Sentadilla").fill("5");
  await visibleField(page, "Series de Press de banca").fill("4");
  let intercepted = false;
  await page.route(page.url(), async (route) => {
    if (
      !intercepted &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      intercepted = true;
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Se conservan aquí" })).toBeVisible();
  const before = await admin()
    .from("program_sessions")
    .select("revision")
    .eq("program_id", programId)
    .single();
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  const after = await admin()
    .from("program_sessions")
    .select("revision")
    .eq("program_id", programId)
    .single();
  expect(after.error).toBeNull();
  expect(after.data!.revision).toBe(before.data!.revision);
  await page.reload();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("5");
  await expect(visibleField(page, "Series de Press de banca")).toHaveValue("4");
});

test("recarga recupera el borrador del coach y permite resolver un conflicto conservando valores", async ({
  page,
}) => {
  await routine(page);
  await visibleField(page, "Series de Sentadilla").fill("7");
  await page.getByText("Nota del ejercicio (opcional)", { exact: true }).first().click();
  await visibleField(page, "Nota de Sentadilla").fill("Pausa de dos segundos");
  await expect(page.getByText("Guardado en este dispositivo", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("7");
  await expect(visibleField(page, "Nota de Sentadilla")).toHaveValue("Pausa de dos segundos");
  const programId = new URL(page.url()).pathname.split("/").at(-1)!;
  const sessions = await admin().from("program_sessions").select("id").eq("program_id", programId);
  await admin()
    .from("session_exercises")
    .update({ sets: 4 })
    .eq("program_session_id", sessions.data![0].id);
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "otra pestaña" })).toBeVisible();
  await page.getByRole("button", { name: "Revisar versión actual", exact: true }).click();
  await expect(page.getByText(/Tu borrador: 7/)).toBeVisible();
  await expect(page.getByText(/Actual: 4/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Aplicar mis cambios a esta versión", exact: true })
    .click();
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("7");
  await expect(visibleField(page, "Nota de Sentadilla")).toHaveValue("Pausa de dos segundos");
});

test("una operación guardada sin respuesta se recupera tras recargar con el mismo identificador", async ({
  page,
}) => {
  const programId = await routine(page);
  await visibleField(page, "Series de Sentadilla").fill("6");
  let intercepted = false;
  await page.route(page.url(), async (route) => {
    if (
      !intercepted &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      intercepted = true;
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Se conservan aquí" })).toBeVisible();
  const before = await admin()
    .from("program_sessions")
    .select("revision")
    .eq("program_id", programId)
    .single();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  const after = await admin()
    .from("program_sessions")
    .select("revision")
    .eq("program_id", programId)
    .single();
  expect(after.data!.revision).toBe(before.data!.revision);
});

test("cerrar la pestaña conserva el borrador y confirmar el guardado limpia su origen recuperado", async ({
  page,
}) => {
  await routine(page);
  await visibleField(page, "Series de Sentadilla").fill("8");
  await expect(page.getByText("Guardado en este dispositivo", { exact: true })).toBeVisible();
  const url = page.url();
  const context = page.context();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await expect(visibleField(reopened, "Series de Sentadilla")).toHaveValue("8");
  await reopened.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(reopened.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  expect(
    await reopened.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("is:coach-draft:")),
    ),
  ).toEqual([]);
  await reopened.close();
});

test("el coach agrupa, prescribe descanso y mueve una superserie como bloque", async ({ page }) => {
  const programId = await routine(page);
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  await page.getByLabel("Buscar ejercicios", { exact: true }).fill("Peso muerto");
  await page.getByRole("checkbox", { name: "Peso muerto Espalda · Barra", exact: true }).check();
  await page.getByRole("button", { name: "Agregar seleccionados (1)", exact: true }).click();
  await expect(visibleField(page, "Series de Peso muerto")).toBeVisible();
  await page.getByRole("checkbox", { name: "Seleccionar Sentadilla", exact: true }).check();
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.getByRole("button", { name: "Agrupar seleccionados (2)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Superserie 1", exact: true })).toBeVisible();
  await page.getByLabel("Descanso de Superserie 1", { exact: true }).selectOption("120");
  await expect(page.getByText("Configuración guardada.", { exact: true })).toBeVisible();
  const handle = page.getByRole("button", { name: "Reordenar Superserie 1", exact: true });
  await handle.focus();
  await handle.press("Space");
  await handle.press("ArrowDown");
  await handle.press("Space");
  await expect(page.getByText("Orden guardado.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /1\.\s*Peso muerto/ })).toBeVisible();
  await expect(page.getByLabel("Descanso de Superserie 1", { exact: true })).toHaveValue("120");
  const data = await admin()
    .from("program_sessions")
    .select("session_exercises(position,superset_id,superset_rest_seconds,sets)")
    .eq("program_id", programId)
    .single();
  const rows = data.data!.session_exercises.sort((a, b) => a.position - b.position);
  expect(rows[0].superset_id).toBeNull();
  expect(rows[1].superset_id).toBe(rows[2].superset_id);
  expect(rows[1].superset_rest_seconds).toBe(120);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);

  await page.getByRole("button", { name: "Sacar Sentadilla de superserie", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Superserie 1", exact: true })).toHaveCount(0);
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("3");
});

test("alternativas recupera campos y confirma una respuesta perdida sin recrear filas (T151)", async ({
  page,
}) => {
  const programId = await routine(page);
  await page.getByText("Alternativas de Sentadilla (0/3)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Agregar alternativa de Sentadilla", exact: true })
    .click();
  await page
    .getByLabel("Alternativa 1 de Sentadilla", { exact: true })
    .selectOption({ label: "Prensa de piernas" });
  await page.getByLabel("Series de alternativa 1 de Sentadilla", { exact: true }).fill("");
  await page.getByLabel("Peso (kg) de alternativa 1 de Sentadilla", { exact: true }).fill("22,5");
  await page.reload();
  await expect(
    page.getByLabel("Series de alternativa 1 de Sentadilla", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Peso (kg) de alternativa 1 de Sentadilla", { exact: true }),
  ).toHaveValue("22,5");
  await page.getByLabel("Series de alternativa 1 de Sentadilla", { exact: true }).fill("2");
  await expect(page.getByLabel("Series de Sentadilla", { exact: true })).toBeDisabled();
  let intercepted = false;
  await page.route(page.url(), async (route) => {
    if (
      !intercepted &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      intercepted = true;
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Guardar alternativas de Sentadilla", exact: true })
    .click();
  await expect(page.getByRole("alert").filter({ hasText: "confirmar" })).toBeVisible();
  const before = await admin()
    .from("program_sessions")
    .select("revision,session_exercises(session_exercise_alternatives(*))")
    .eq("program_id", programId)
    .single();
  expect(before.error).toBeNull();
  await page.reload();
  await page
    .getByRole("button", { name: "Guardar alternativas de Sentadilla", exact: true })
    .click();
  await expect(page.getByText("Alternativas guardadas.", { exact: true })).toBeVisible();
  const after = await admin()
    .from("program_sessions")
    .select("revision,session_exercises(session_exercise_alternatives(*))")
    .eq("program_id", programId)
    .single();
  expect(after.data).toEqual(before.data);
  const alternatives = after.data!.session_exercises.flatMap(
    (e) => e.session_exercise_alternatives,
  );
  expect(alternatives).toHaveLength(1);
  expect(alternatives[0]).toMatchObject({ sets: 2, target_weight_kg: 22.5 });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
});

test("alternativas exige revisar el conflicto y conserva la prescripción remota (T151)", async ({
  page,
  context,
}) => {
  await routine(page);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(visibleField(other, "Series de Sentadilla")).toBeVisible();
  await page.getByText("Alternativas de Sentadilla (0/3)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Agregar alternativa de Sentadilla", exact: true })
    .click();
  await page
    .getByLabel("Alternativa 1 de Sentadilla", { exact: true })
    .selectOption({ label: "Zancadas" });
  await visibleField(other, "Series de Sentadilla").fill("4");
  await other.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(other.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Guardar alternativas de Sentadilla", exact: true })
    .click();
  await page.getByRole("button", { name: "Revisar versión actual", exact: true }).click();
  await expect(page.getByText("Actual: Sin alternativas", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Aplicar mis cambios a esta versión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar alternativas de Sentadilla", exact: true })
    .click();
  await expect(page.getByText("Alternativas guardadas.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("4");
  await page.getByText("Alternativas de Sentadilla (1/3)", { exact: true }).click();
  await expect(
    page.getByLabel("Alternativa 1 de Sentadilla", { exact: true }).locator("option:checked"),
  ).toHaveText("Zancadas");
  await other.close();
  await page.getByText("Asignar a un alumno", { exact: true }).click();
  await page.getByLabel("Inicio", { exact: true }).fill(mondayOf(santiagoDate(new Date())));
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByText(`Programa de ${COACH.name}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Alternativa: Zancadas", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar alternativas de Sentadilla", exact: true }),
  ).toHaveCount(0);
});

test("título recuperable, biblioteca y copia completa confirman respuesta perdida (T153)", async ({
  page,
}) => {
  const sourceId = await routine(page);
  await page.getByLabel("Nombre de sesión A", { exact: true }).fill("Tren superior");
  await visibleField(page, "Series de Sentadilla").fill("4");
  await page.reload();
  await expect(page.getByLabel("Nombre de sesión A", { exact: true })).toHaveValue("Tren superior");
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("4");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.getByText("Duplicar programa", { exact: true }).click();
  await page.getByLabel("Nombre de la copia", { exact: true }).fill("Fuerza duplicada");
  const archived = (
    await admin()
      .from("exercises")
      .select("id")
      .eq("name", "Sentadilla")
      .is("coach_id", null)
      .single()
  ).data!;
  await admin()
    .from("exercises")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", archived.id);
  try {
    await page.getByRole("button", { name: "Crear copia", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "archivados" })).toBeVisible();
    await expect(page.getByLabel("Nombre de la copia", { exact: true })).toBeEnabled();
  } finally {
    await admin().from("exercises").update({ archived_at: null }).eq("id", archived.id);
  }

  let intercepted = false;
  await page.route(page.url(), async (route) => {
    if (
      !intercepted &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      intercepted = true;
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Crear copia", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /confirm|Reintenta/ })).toBeVisible();
  const copies = (await admin().from("programs").select("id").eq("name", "Fuerza duplicada")).data!;
  expect(copies).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: "Confirmar copia", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/coach/programs/${copies[0].id}$`));
  await expect(page.getByLabel("Nombre de sesión A", { exact: true })).toHaveValue("Tren superior");
  await visibleField(page, "Series de Sentadilla").fill("6");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  const original = (
    await admin()
      .from("program_sessions")
      .select("session_exercises(sets,position)")
      .eq("program_id", sourceId)
      .single()
  ).data!;
  expect(original.session_exercises.find((e) => e.position === 0)?.sets).toBe(4);
  await page.goto("/coach/programs");
  await page.getByLabel("Buscar plantillas", { exact: true }).fill("SUPERIOR");
  await expect(page.getByRole("status")).toHaveText("2 de 2 plantillas");
  await page.getByLabel("Buscar plantillas", { exact: true }).fill("duplicada");
  await expect(page.getByRole("status")).toHaveText("1 de 2 plantillas");
  await page.getByText("Vista previa de Fuerza duplicada", { exact: true }).click();
  await expect(page.getByText("2 ejercicios · 9 series", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("títulos entre pestañas requieren comparación antes de sobrescribir (T153)", async ({
  page,
  context,
}) => {
  const programId = await routine(page);
  const other = await context.newPage();
  await other.goto(page.url());
  await page.getByLabel("Nombre de sesión A", { exact: true }).fill("Pecho");
  await other.getByLabel("Nombre de sesión A", { exact: true }).fill("Espalda");
  await other.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(other.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await page.getByRole("button", { name: "Revisar versión actual", exact: true }).click();
  await expect(page.getByText("Tu borrador: Pecho", { exact: true })).toBeVisible();
  await expect(page.getByText("Actual: Espalda", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Aplicar mis cambios a esta versión", exact: true })
    .click();
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  expect(
    (await admin().from("program_sessions").select("title").eq("program_id", programId).single())
      .data?.title,
  ).toBe("Pecho");
  await other.close();
});

test("lote recupera preparación, conserva campos y permite editar después (T154)", async ({
  page,
}) => {
  const programId = await routine(page);
  await visibleField(page, "Peso (kg) de Sentadilla").fill("62.5");
  await page
    .getByLabel("Nota de Sentadilla", { exact: true })
    .locator("xpath=..")
    .locator("summary")
    .click();
  await visibleField(page, "Nota de Sentadilla").fill("Conservar técnica");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Seleccionar Sentadilla", exact: true }).check();
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.getByRole("checkbox", { name: "Cambiar series", exact: true }).check();
  await page.getByLabel("Series para la selección", { exact: true }).fill("");
  await page.reload();
  await expect(page.getByLabel("Series para la selección", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Aplicar al borrador", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Series para la selección", { exact: true }).fill("5");
  await page.getByRole("checkbox", { name: "Cambiar repeticiones", exact: true }).check();
  await page.getByLabel("Repeticiones mínimas para la selección", { exact: true }).fill("6");
  await page.getByLabel("Repeticiones máximas para la selección", { exact: true }).fill("8");
  await page.getByRole("checkbox", { name: "Cambiar descanso", exact: true }).check();
  await page.getByLabel("Descanso para la selección (segundos)", { exact: true }).fill("120");
  await expect(
    page
      .getByRole("region", { name: "Vista previa del lote" })
      .getByText("Series: 3 → 5", { exact: true }),
  ).toHaveCount(2);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
  await page.getByRole("button", { name: "Aplicar al borrador", exact: true }).click();
  await page.reload();
  await expect(visibleField(page, "Series de Sentadilla")).toHaveValue("5");
  await expect(visibleField(page, "Peso (kg) de Sentadilla")).toHaveValue("62.5");
  await expect(visibleField(page, "Nota de Sentadilla")).toHaveValue("Conservar técnica");
  await page
    .getByLabel("Nota de Press de banca", { exact: true })
    .locator("xpath=..")
    .locator("summary")
    .click();
  await visibleField(page, "Nota de Press de banca").fill("Pausa abajo");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  const { data, error } = await admin()
    .from("program_sessions")
    .select("session_exercises(sets,reps_min,reps_max,rest_seconds,note,target_weight_kg,position)")
    .eq("program_id", programId)
    .single();
  expect(error).toBeNull();
  const rows = data!.session_exercises.sort((a, b) => a.position - b.position);
  expect(rows).toHaveLength(2);
  for (const row of rows)
    expect(row).toMatchObject({ sets: 5, reps_min: 6, reps_max: 8, rest_seconds: 120 });
  expect(rows[0]).toMatchObject({ note: "Conservar técnica", target_weight_kg: 62.5 });
  expect(rows[1]).toMatchObject({ note: "Pausa abajo", target_weight_kg: null });
});

test("descanso de lote exige la superserie completa y confirma una respuesta perdida (T154)", async ({
  page,
}) => {
  const programId = await routine(page);
  await page.getByRole("checkbox", { name: "Seleccionar Sentadilla", exact: true }).check();
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.getByRole("button", { name: "Agrupar seleccionados (2)", exact: true }).click();
  await expect(page.getByText("Configuración guardada.", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Seleccionar Sentadilla", exact: true }).check();
  await page.getByRole("checkbox", { name: "Cambiar descanso", exact: true }).check();
  await expect(page.getByRole("alert").filter({ hasText: "todos los integrantes" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.getByLabel("Descanso para la selección (segundos)", { exact: true }).fill("180");
  await page.getByRole("button", { name: "Aplicar al borrador", exact: true }).click();
  let intercepted = false;
  await page.route(page.url(), async (route) => {
    if (
      !intercepted &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      intercepted = true;
      await route.fetch();
      await route.abort("internetdisconnected");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "confirmar" })).toBeVisible();
  const read = () =>
    admin()
      .from("program_sessions")
      .select("revision,session_exercises(rest_seconds,superset_rest_seconds)")
      .eq("program_id", programId)
      .single();
  const before = await read();
  expect(before.error).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  expect((await read()).data).toEqual(before.data);
  for (const row of before.data!.session_exercises)
    expect(row).toMatchObject({ rest_seconds: null, superset_rest_seconds: 180 });
});

test("día sugerido recupera borrador y el coach puede mover su entrenamiento sin cambiar la rutina (T155)", async ({
  page,
}) => {
  const templateId = await routine(page);
  await page.getByLabel("Día orientativo de sesión A", { exact: true }).selectOption("6");
  await page.reload();
  await expect(page.getByLabel("Día orientativo de sesión A", { exact: true })).toHaveValue("6");
  await page.getByRole("button", { name: "Guardar sesión", exact: true }).click();
  await expect(page.getByText("Cambios guardados.", { exact: true })).toBeVisible();
  await page.getByText("Asignar a un alumno", { exact: true }).click();
  await page.getByLabel("Inicio", { exact: true }).fill(mondayOf(santiagoDate(new Date())));
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByText(`Programa de ${COACH.name}`, { exact: true })).toBeVisible();
  const assignedId = page.url().split("/").at(-1)!;
  await page.goto("/week");
  await expect(page.getByText("Llevas 0 de 1 sesiones", { exact: true })).toBeVisible();
  await page.getByText("Cambiar día de sesión A", { exact: true }).click();
  await page.getByLabel("Día de sesión A", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Guardar día", exact: true }).click();
  await expect(page.getByText("Día guardado.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Pendiente: Lunes/)).toBeVisible();
  await expect(page.getByText("Llevas 0 de 1 sesiones", { exact: true })).toBeVisible();
  const { data, error } = await admin()
    .from("program_sessions")
    .select("weekday,session_day_overrides(weekday)")
    .eq("program_id", assignedId)
    .single();
  expect(error).toBeNull();
  expect(data).toMatchObject({ weekday: 6, session_day_overrides: { weekday: 0 } });
  expect(
    (await admin().from("program_sessions").select("weekday").eq("program_id", templateId).single())
      .data?.weekday,
  ).toBe(6);
  await page.getByText("Cambiar día de sesión A", { exact: true }).click();
  await page.getByLabel("Día de sesión A", { exact: true }).selectOption("coach");
  await page.getByRole("button", { name: "Guardar día", exact: true }).click();
  await expect(page.getByText("Día guardado.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Empezar", exact: true }).click();
  await expect(page).toHaveURL(/\/workout\//);
});
