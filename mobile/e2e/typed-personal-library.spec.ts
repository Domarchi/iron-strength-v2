import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setupTypedPersonalLibrary as setup } from "./support/typed-library-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
const key = `is:native-library:v1:${downloadId(1)}`;
async function create(page: Page) {
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre de la rutina", exact: true })
    .fill("Tiempo y distancia");
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  for (const i of [5, 7])
    await page.getByRole("checkbox", { name: `Seleccionar Movimiento ${i}`, exact: true }).check();
  await page.getByRole("button", { name: "Agregar 2 ejercicios", exact: true }).click();
  await expect(page.getByLabel("Tiempo de Movimiento 5", { exact: true })).toBeVisible();
}
for (const theme of ["light", "dark"] as const)
  test(`objetivos modernos ${theme}: editar, recuperar, agrupar y vista previa sin iniciar`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          "is:native-appearance:v1",
          JSON.stringify({ version: 1, preference: theme }),
        ),
      theme,
    );
    await page.setViewportSize({ width: 360, height: 800 });
    const { state } = await setup(page);
    await create(page);
    await expect(
      page.getByLabel("Repeticiones mínimas de Movimiento 5", { exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Tiempo de Movimiento 5", { exact: true }).fill("60");
    await page.getByLabel("Tiempo de Movimiento 7", { exact: true }).fill("300");
    await page.getByLabel("Distancia de Movimiento 7", { exact: true }).fill("1000,5");
    await page.getByRole("button", { name: "Acciones de Movimiento 5", exact: true }).click();
    await page
      .getByRole("button", { name: "Editar detalles de Movimiento 5", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Prescribir por serie en Movimiento 5", exact: true })
      .click();
    await page
      .getByLabel("Tiempo objetivo de la serie 2 de Movimiento 5", { exact: true })
      .fill("90");
    await expect(
      page.getByText("Guardado en este dispositivo", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    const raw = await page.evaluate((key) => localStorage.getItem(key), key);
    await page.reload();
    await enterWeekUser(page);
    await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
    await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
    await page
      .getByRole("button", { name: "Retomar borrador Tiempo y distancia", exact: true })
      .click();
    await expect(page.getByLabel("Tiempo de Movimiento 7", { exact: true })).toHaveValue("300");
    expect(state.calls).toHaveLength(0);
    expect(JSON.parse(raw!).version).toBe(2);
    for (const i of [5, 7])
      await page
        .getByRole("checkbox", { name: `Seleccionar Movimiento ${i}`, exact: true })
        .check();
    await page.getByRole("button", { name: "Agrupar ejercicios", exact: true }).click();
    await page.getByLabel("Descanso de superserie 1", { exact: true }).fill("0");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("typed-editor.png"), fullPage: true });
    await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
    await page.getByRole("button", { name: "Ver rutina Tiempo y distancia", exact: true }).click();
    await expect(
      page.getByText("Superserie · 0 s entre rondas", { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText(/1000|1.000/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith("is:native-training:"))
          .map((k) => JSON.parse(localStorage.getItem(k)!))
          .some((d) => d.active),
      ),
    ).toBe(false);
    expect(state.value.routines[0].items[0].prescribed.target.targetDurationSeconds).toBeNull();
    expect(state.value.routines[0].items[0].prescribed.series![1].targetDurationSeconds).toBe(90);
    expect(state.value.routines[0].items[1].prescribed.target).toMatchObject({
      repsMin: null,
      repsMax: null,
      targetDistanceMeters: 1000.5,
    });
  });

test("respuesta perdida2 conserva segundos/metros y reintenta el mismo documento después de recargar", async ({
  page,
}) => {
  const { state } = await setup(page);
  await create(page);
  await page.getByLabel("Tiempo de Movimiento 5", { exact: true }).fill("60");
  await page.getByLabel("Tiempo de Movimiento 7", { exact: true }).fill("300");
  await page.getByLabel("Distancia de Movimiento 7", { exact: true }).fill("1000,5");
  state.lose = true;
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByText("No pudimos confirmar el guardado.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const frozen = structuredClone(state.calls[0]);
  expect(frozen.version).toBe(2);
  expect(state.value.routines).toHaveLength(1);
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Reintentar guardado de rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Tiempo y distancia", exact: true }),
  ).toBeVisible();
  expect(state.calls).toEqual([frozen, frozen]);
  expect(state.value.routines).toHaveLength(1);
  expect(state.value.routines[0].items[1].prescribed.target.targetDistanceMeters).toBe(1000.5);
});
test("cuota al agregar tipos modernos conserva el lote e identidades antes de enviar", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Protegida");
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  for (const i of [5, 7])
    await page.getByRole("checkbox", { name: `Seleccionar Movimiento ${i}`, exact: true }).check();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith("is:native-library:") && !localStorage.getItem("allow-library-write"))
        throw Error("quota");
      return original.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "Agregar 2 ejercicios", exact: true }).click();
  await expect(
    page
      .getByText(
        "No pudimos guardar los cambios en este dispositivo. Revisa el espacio disponible y reintenta.",
        { exact: true },
      )
      .filter({ visible: true }),
  ).toBeVisible();
  expect(state.calls).toHaveLength(0);
  await page.evaluate(() => localStorage.setItem("allow-library-write", "1"));
  await page.getByRole("button", { name: "Reintentar guardado local", exact: true }).click();
  await expect(page.getByLabel("Tiempo de Movimiento 5", { exact: true })).toBeVisible();
  const protectedDoc = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key);
  expect(protectedDoc.drafts[0].items).toHaveLength(2);
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Protegida", exact: true }),
  ).toBeVisible();
  expect(state.value.routines[0].items.map((i) => i.id)).toEqual(
    protectedDoc.drafts[0].items.map((i: { id: string }) => i.id),
  );
  expect(state.value.routines[0].items.map((i) => i.recordType)).toEqual([
    "duration",
    "distance_duration",
  ]);
});
test("selección mixta solo aplica objetivos comunes y conserva la distancia individual", async ({
  page,
}) => {
  const { state } = await setup(page);
  await create(page);
  await page.getByLabel("Distancia de Movimiento 7", { exact: true }).fill("1000");
  await page.getByRole("checkbox", { name: "Seleccionar Movimiento 7", exact: true }).check();
  await page.getByRole("button", { name: "Editar selección", exact: true }).click();
  await page.getByRole("checkbox", { name: "Cambiar distancia (m)", exact: true }).check();
  await page.getByLabel("Distancia (m) de la selección", { exact: true }).fill("2000");
  await page.getByRole("checkbox", { name: "Seleccionar Movimiento 5", exact: true }).check();
  await expect(
    page.getByRole("checkbox", { name: "Cambiar distancia (m)", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Cambiar tiempo (s)", exact: true }).check();
  await page.getByLabel("Tiempo (s) de la selección", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Revisar cambios de selección", exact: true }).click();
  await page.getByRole("button", { name: "Aplicar a la selección", exact: true }).click();
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver rutina Tiempo y distancia", exact: true }),
  ).toBeVisible();
  expect(
    state.value.routines[0].items.map((i) => i.prescribed.target.targetDurationSeconds),
  ).toEqual([120, 120]);
  expect(state.value.routines[0].items[1].prescribed.target.targetDistanceMeters).toBe(1000);
});
