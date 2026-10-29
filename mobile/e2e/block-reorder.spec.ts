import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setupPersonalTraining } from "./support/personal-training-fixture";
import { setupPersonalLibrary, libraryExercises } from "./support/library-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
import { personalRoutineFixture } from "../src/test/fixtures/personal-routine";
const key = `is:native-training:v1:${downloadId(1)}`;
const names = ["Press de banca", "Remo con mancuerna", "Sentadilla"];
async function free(page: Page) {
  await setupPersonalTraining(page);
  await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
  await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  for (const name of names)
    await page.getByRole("checkbox", { name: `Seleccionar ${name}`, exact: true }).check();
  await page.getByRole("button", { name: "Agregar 3 ejercicios", exact: true }).click();
  await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("40");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Organizar ejercicios", exact: true }).click();
}
const read = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).active, key);
async function drag(page: Page, from: string, to: string | { x: number; y: number }) {
  const handle = page.getByRole("button", { name: `Mover ${from}`, exact: true });
  await expect(handle).toBeEnabled();
  await handle.scrollIntoViewIfNeeded();
  const start = (await handle.boundingBox())!;
  const end =
    typeof to === "string"
      ? (await page.getByRole("button", { name: `Mover ${to}`, exact: true }).boundingBox())!
      : null;
  const point = end
    ? { x: end.x + end.width / 2, y: end.y + end.height / 2 }
    : (to as { x: number; y: number });
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await expect(
    page.getByRole("button", { name: "Cancelar movimiento", exact: true }),
  ).toBeVisible();
  await page.mouse.move(point.x, point.y, { steps: 12 });
  await page.mouse.up();
}
test("reordenar por teclado cancela sin escribir y mueve la superserie completa", async ({
  page,
}) => {
  await free(page);
  for (const [i, name] of names.slice(0, 2).entries())
    await page
      .getByRole("checkbox", { name: `Seleccionar ejercicio ${i + 1}: ${name}`, exact: true })
      .check();
  await page.getByRole("button", { name: "Crear superserie", exact: true }).click();
  const before = await read(page);
  const reorder = page.getByRole("button", { name: "Reordenar ejercicios", exact: true });
  await expect(reorder).toBeVisible({ timeout: 5000 });
  await reorder.click();
  const handle = page.getByRole("button", { name: "Mover Superserie 1", exact: true });
  await handle.focus();
  await handle.press("Space");
  await handle.press("ArrowDown");
  await expect(page.getByText("Destino: posición 2", { exact: true })).toBeVisible();
  await handle.press("Escape");
  expect(await read(page)).toEqual(before);
  await handle.press("Space");
  await handle.press("ArrowDown");
  await handle.press("Enter");
  await expect
    .poll(async () => (await read(page)).draft.exercises.map((e: { name: string }) => e.name))
    .toEqual([names[2], names[0], names[1]]);
  const after = await read(page);
  expect(after.draft.exercises[1].sets).toEqual(before.draft.exercises[0].sets);
  expect(after.draft.rest).toEqual(before.draft.rest);
  expect(after.activeIndex).toBe(1);
  await drag(page, "Superserie 1", names[2]);
  await expect.poll(() => read(page)).toEqual(before);
});
test("el gesto de asa reordena y soltar fuera cancela a 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await free(page);
  await page.getByRole("button", { name: "Reordenar ejercicios", exact: true }).click();
  const before = await read(page);
  const last = (await page
    .getByRole("button", { name: `Mover ${names[2]}`, exact: true })
    .boundingBox())!;
  await drag(page, names[0], { x: 2, y: last.y + last.height / 2 });
  expect(await read(page)).toEqual(before);
  await drag(page, names[0], names[2]);
  await expect
    .poll(async () => (await read(page)).draft.exercises.map((e: { name: string }) => e.name))
    .toEqual([names[1], names[2], names[0]]);
  expect((await read(page)).draft.exercises[2].sets).toEqual(before.draft.exercises[0].sets);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: test.info().outputPath("order-360.png"), fullPage: true });
});
test("editor personal comparte el gesto y protege el orden antes de guardar la base", async ({
  page,
}) => {
  const { state } = await setupPersonalLibrary(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre de la rutina", exact: true })
    .fill("Ordenar base");
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  for (const e of libraryExercises)
    await page.getByRole("checkbox", { name: `Seleccionar ${e.name}`, exact: true }).check();
  await page.getByRole("button", { name: "Agregar 3 ejercicios", exact: true }).click();
  await page.getByRole("button", { name: "Reordenar ejercicios", exact: true }).click();
  await drag(page, names[0], names[2]);
  expect(state.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Volver de reordenar", exact: true }).click();
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Ordenar base", exact: true }),
  ).toBeVisible();
  expect(state.value.routines[0].items.map((e) => e.name)).toEqual([names[1], names[2], names[0]]);
});

test("arrastrar alcanza el último bloque de una lista larga con desplazamiento automático", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const { state } = await setupPersonalTraining(page),
    base = personalRoutineFixture();
  base.items = Array.from({ length: 15 }, (_, index) => {
    const { id: exerciseId, ...metadata } = libraryExercises[index % 3];
    return {
      ...base.items[0],
      ...metadata,
      position: index,
      id: downloadId(7200 + index),
      exerciseId,
      supersetId: null,
      supersetRestSeconds: null,
    };
  });
  state.value.routines = [base];
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Ver rutina Superior", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Organizar ejercicios", exact: true }).click();
  await page.getByRole("button", { name: "Reordenar ejercicios", exact: true }).click();
  const list = page.getByTestId("block-reorder-list"),
    box = (await list.boundingBox())!;
  const handle = page
      .getByTestId(`order-block-${base.items[0].id}`)
      .getByRole("button", { name: /^Mover / }),
    start = (await handle.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await expect(
    page.getByRole("button", { name: "Cancelar movimiento", exact: true }),
  ).toBeVisible();
  await page.mouse.move(start.x + start.width / 2, box.y + box.height - 15, { steps: 12 });
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop >= el.scrollHeight - el.clientHeight - 1), {
      timeout: 10000,
    })
    .toBe(true);
  const last = (await page
    .getByTestId(`order-block-${base.items.at(-1)!.id}`)
    .getByRole("button", { name: /^Mover / })
    .boundingBox())!;
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      (await read(page)).draft.exercises.map(
        (e: { sessionExerciseId: string }) => e.sessionExerciseId,
      ),
    )
    .toEqual([...base.items.slice(1).map((e) => e.id), base.items[0].id]);
  expect(state.value.routines[0]).toEqual(base);
});

test("el editor ordena integrantes de una superserie sin separar su bloque", async ({ page }) => {
  const { state } = await setupPersonalLibrary(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Grupo");
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  for (const e of libraryExercises)
    await page.getByRole("checkbox", { name: `Seleccionar ${e.name}`, exact: true }).check();
  await page.getByRole("button", { name: "Agregar 3 ejercicios", exact: true }).click();
  for (const name of names.slice(0, 2))
    await page.getByRole("checkbox", { name: `Seleccionar ${name}`, exact: true }).check();
  await page.getByRole("button", { name: "Agrupar ejercicios", exact: true }).click();
  await page.getByRole("button", { name: "Acciones de Press de banca", exact: true }).click();
  const after = page.getByRole("button", { name: "Después en superserie", exact: true });
  await expect(after).toBeVisible({ timeout: 5000 });
  await after.click();
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver rutina Grupo", exact: true })).toBeVisible();
  const items = state.value.routines[0].items;
  expect(items.map((e) => e.name)).toEqual([names[1], names[0], names[2]]);
  expect(items[0].supersetId).not.toBeNull();
  expect(items[1].supersetId).toBe(items[0].supersetId);
  expect(items[2].supersetId).toBeNull();
});

test("cuota después de mover conserva el orden en memoria y reintenta sin repetirlo", async ({
  page,
}) => {
  await free(page);
  await page.getByRole("button", { name: "Reordenar ejercicios", exact: true }).click();
  const raw = await page.evaluate((key) => localStorage.getItem(key), key);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-training:") && !localStorage.getItem("allow-order-write"))
        throw Error("quota");
      return set.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Bajar bloque Press de banca", exact: true }).click();
  const retry = page
    .getByRole("button", { name: "Reintentar", exact: true })
    .filter({ visible: true });
  await expect(retry).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(raw);
  await expect(
    page.getByRole("button", { name: "Mover Press de banca", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => localStorage.setItem("allow-order-write", "1"));
  await retry.click();
  await expect(
    page.getByRole("button", { name: "Mover Press de banca", exact: true }),
  ).toBeEnabled();
  expect((await read(page)).draft.exercises.map((e: { name: string }) => e.name)).toEqual([
    names[1],
    names[0],
    names[2],
  ]);
});

for (const theme of ["light", "dark"] as const)
  test(`reordenar conserva contraste y tamaño táctil con movimiento reducido · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "is:native-appearance:v1",
          JSON.stringify({ version: 1, preference: theme }),
        ),
      theme,
    );
    await free(page);
    await page.getByRole("button", { name: "Reordenar ejercicios", exact: true }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    for (const handle of await page.getByRole("button", { name: /^Mover / }).all()) {
      const box = (await handle.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await page.screenshot({
      path: test.info().outputPath(`order-${theme}-360.png`),
      fullPage: true,
    });
  });

test("captura del puntero mueve el grupo completo y cancelar conserva las series", async ({
  page,
  browserName,
}) => {
  await free(page);
  for (const [i, name] of names.slice(0, 2).entries())
    await page
      .getByRole("checkbox", { name: `Seleccionar ejercicio ${i + 1}: ${name}`, exact: true })
      .check();
  await page.getByRole("button", { name: "Crear superserie", exact: true }).click();
  await page.getByRole("button", { name: "Reordenar ejercicios", exact: true }).click();
  const before = await read(page),
    handle = page.getByRole("button", { name: "Mover Superserie 1", exact: true });
  const from = (await handle.boundingBox())!,
    to = (await page.getByRole("button", { name: "Mover Sentadilla", exact: true }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await expect(
    page.getByRole("button", { name: "Cancelar movimiento", exact: true }),
  ).toBeVisible();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await read(page)).toEqual(before);
  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const point = (fraction: number) => ({
      x: from.x + from.width / 2,
      y: from.y + from.height / 2 + (to.y - from.y) * fraction,
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(0)] });
    for (let i = 1; i <= 12; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [point(i / 12)],
      });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else await drag(page, "Superserie 1", "Sentadilla");
  await expect
    .poll(async () => (await read(page)).draft.exercises.map((e: { name: string }) => e.name))
    .toEqual([names[2], names[0], names[1]]);
  expect((await read(page)).draft.exercises[1].sets).toEqual(before.draft.exercises[0].sets);
});
