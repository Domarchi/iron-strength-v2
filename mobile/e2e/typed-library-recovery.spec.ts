import { expect, test, type Page } from "@playwright/test";
import { setupTypedPersonalLibrary } from "./support/typed-library-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
const libraryKey = `is:native-library:v1:${downloadId(1)}`,
  trainingKey = `is:native-training:v1:${downloadId(1)}`,
  api = "https://iron-strength-seven.vercel.app/api/mobile/v1";
async function draft(page: Page) {
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Continuidad");
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  for (const i of [5, 7])
    await page.getByRole("checkbox", { name: `Seleccionar Movimiento ${i}`, exact: true }).check();
  await page.getByRole("button", { name: "Agregar 2 ejercicios", exact: true }).click();
  await page.getByLabel("Tiempo de Movimiento 5", { exact: true }).fill("60");
}
test("dos ventanas conservan su edición y no sobrescriben objetivos modernos", async ({
  page,
  context,
}) => {
  await setupTypedPersonalLibrary(page);
  await draft(page);
  const other = await context.newPage();
  await setupTypedPersonalLibrary(other);
  await other.getByRole("button", { name: "Retomar borrador Continuidad", exact: true }).click();
  await other.getByLabel("Tiempo de Movimiento 5", { exact: true }).fill("90");
  await expect(
    other.getByText("Guardado en este dispositivo", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByLabel("Tiempo de Movimiento 5", { exact: true }).fill("120");
  await expect(
    page
      .getByText(
        "Los cambios locales se modificaron en otra ventana. Conservamos tu edición en memoria; no sobrescribimos la otra versión.",
        { exact: true },
      )
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Tiempo de Movimiento 5", { exact: true })).toHaveValue("120");
  await expect(other.getByLabel("Tiempo de Movimiento 5", { exact: true })).toHaveValue("90");
  const doc = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), libraryKey);
  expect(doc.drafts[0].items[0].targetDurationSeconds).toBe("90");
  await other.close();
});
test("abandonar la consulta de inicio no crea un entrenamiento tardío", async ({ page }) => {
  const { state } = await setupTypedPersonalLibrary(page);
  await draft(page);
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await page.getByRole("button", { name: "Ver rutina Continuidad", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Continuidad", exact: true })).toBeVisible();
  let release!: () => void,
    requested = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(api + "/training-library", async (route) => {
    requested = true;
    await held;
    await route.fulfill({ json: state.value });
  });
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "Volver a mis rutinas", exact: true }).click();
  release();
  await expect(page.getByRole("heading", { name: "Mis rutinas", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k) ?? "null")?.active ?? null,
        trainingKey,
      ),
    )
    .toBeNull();
  await page.getByRole("button", { name: "Volver a Entrenar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retomar entrenamiento", exact: true }),
  ).toHaveCount(0);
});
test("una superserie personal moderna conserva métricas, ronda y descanso al recargar", async ({
  page,
}) => {
  await setupTypedPersonalLibrary(page);
  await page.clock.setFixedTime(new Date("2026-10-27T15:00:00Z"));
  await draft(page);
  await page.getByLabel("Tiempo de Movimiento 7", { exact: true }).fill("300");
  await page.getByLabel("Distancia de Movimiento 7", { exact: true }).fill("1000");
  for (const i of [5, 7])
    await page.getByRole("checkbox", { name: `Seleccionar Movimiento ${i}`, exact: true }).check();
  await page.getByRole("button", { name: "Agrupar ejercicios", exact: true }).click();
  await page.getByLabel("Descanso de superserie 1", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Guardar rutina", exact: true }).click();
  await page.getByRole("button", { name: "Ver rutina Continuidad", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await expect(page.getByLabel("SEGUNDOS serie 1", { exact: true }).first()).toBeVisible();
  await page.getByLabel("SEGUNDOS serie 1", { exact: true }).first().fill("60");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).first().click();
  await expect(page.getByText("Ronda 1 · sigue Movimiento 7", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Omitir descanso", exact: true })).toHaveCount(0);
  await page.getByLabel("SEGUNDOS serie 1", { exact: true }).first().fill("300");
  await page.getByLabel("METROS serie 1", { exact: true }).fill("1000");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Omitir descanso", exact: true })).toBeVisible();
  const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), trainingKey);
  expect(before.version).toBe(4);
  expect(before.active.draft.origin.kind).toBe("personal");
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page.getByRole("button", { name: "Omitir descanso", exact: true })).toBeVisible();
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), trainingKey);
  expect(after.active.draft.workoutId).toBe(before.active.draft.workoutId);
  expect(after.active.draft.rest).toEqual(before.active.draft.rest);
  expect(
    after.active.draft.exercises.map((e: { sets: { done: boolean }[] }) => e.sets[0].done),
  ).toEqual([true, true]);
  expect(after.active.draft.exercises[1].sets[0]).toMatchObject({
    duration: "300",
    distance: "1000",
    reps: "",
  });
});
