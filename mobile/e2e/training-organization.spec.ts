import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupPersonalTraining as setup } from "./support/personal-training-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { libraryExercises } from "./support/library-fixture";
import { personalRoutineFixture } from "../src/test/fixtures/personal-routine";
import { downloadId } from "../../src/test/fixtures/week-download";
async function personalWorkout(page: Page) {
  const fixture = await setup(page),
    base = personalRoutineFixture();
  base.items = base.items.map((item, i) => {
    const { id: exerciseId, ...metadata } = libraryExercises[i];
    return { ...item, ...metadata, exerciseId };
  });
  fixture.state.value.routines = [base];
  await page.getByRole("button", { name: "Mis rutinas", exact: true }).click();
  await page.getByRole("button", { name: "Ver rutina Superior", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  return { ...fixture, base };
}
const activeKey = `is:native-training:v1:${downloadId(1)}`;
test("organizar libre mueve la superserie completa y recupera foco, valores y descanso", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Entrenamiento libre", exact: true }).click();
  await page.getByRole("button", { name: "Empezar libre", exact: true }).click();
  await page
    .getByRole("button", { name: "Agregar ejercicios", exact: true })
    .filter({ visible: true })
    .click();
  for (const name of ["Press de banca", "Remo con mancuerna", "Sentadilla"])
    await page.getByRole("checkbox", { name: `Seleccionar ${name}`, exact: true }).check();
  await page.getByRole("button", { name: "Agregar 3 ejercicios", exact: true }).click();
  await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("30");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const organizer = page.getByRole("button", { name: "Organizar ejercicios", exact: true });
  await expect(organizer).toBeVisible({ timeout: 5000 });
  await organizer.click();
  await page
    .getByRole("checkbox", { name: "Seleccionar ejercicio 1: Press de banca", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Seleccionar ejercicio 2: Remo con mancuerna", exact: true })
    .check();
  await page.getByRole("button", { name: "Crear superserie", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Superserie 1", exact: true })).toBeVisible();
  const before = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).active,
    activeKey,
  );
  await page.getByRole("button", { name: "Opciones de Superserie 1", exact: true }).click();
  await page.getByRole("button", { name: "Bajar Superserie 1", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).active.draft.exercises.map(
            (e: { name: string }) => e.name,
          ),
        activeKey,
      ),
    )
    .toEqual(["Sentadilla", "Press de banca", "Remo con mancuerna"]);
  const after = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).active,
    activeKey,
  );
  expect(after.activeIndex).toBe(1);
  expect(after.draft.rest).toEqual(before.draft.rest);
  expect(
    after.routine.exercises.map((e: { sessionExerciseId: string }) => e.sessionExerciseId),
  ).toEqual(after.draft.exercises.map((e: { sessionExerciseId: string }) => e.sessionExerciseId));
  await page.getByRole("button", { name: "Volver al entrenamiento", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue("30");
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ir a Press de banca", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).active.draft.rest,
      activeKey,
    ),
  ).toEqual(before.draft.rest);
});

test("organizar personal agrega y reemplaza con revisión sin modificar su base", async ({
  page,
}) => {
  const { state, base } = await personalWorkout(page);
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const organizer = page.getByRole("button", { name: "Organizar ejercicios", exact: true });
  await expect(organizer).toBeVisible({ timeout: 5000 });
  await organizer.click();
  await expect(page.getByRole("heading", { name: "Superior", exact: true })).toBeHidden();
  await page
    .getByRole("button", { name: "Agregar ejercicios", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("checkbox", { name: "Seleccionar Sentadilla", exact: true }).check();
  await page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }).click();
  await page
    .getByRole("button", { name: "Opciones de Press de banca, ejercicio 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Reemplazar ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Elegir Sentadilla", exact: true }).click();
  await page.getByRole("button", { name: "Reemplazar ejercicio", exact: true }).click();
  await expect(page.getByText(/Se perderá 1 serie registrada/)).toBeVisible();
  await page.getByRole("button", { name: "Cancelar cambio", exact: true }).click();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).active.draft.exercises[0].name,
      activeKey,
    ),
  ).toBe("Press de banca");
  await page.getByRole("button", { name: "Reemplazar ejercicio", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar reemplazo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organizar", exact: true })).toBeVisible();
  const active = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).active,
    activeKey,
  );
  expect(active.draft.exercises[0]).toMatchObject({
    name: "Sentadilla",
    sessionExerciseId: base.items[0].id,
    supersetId: base.items[0].supersetId,
  });
  expect(
    active.draft.exercises[0].sets.every(
      (s: { done: boolean; weight: string }) => !s.done && s.weight === "",
    ),
  ).toBe(true);
  expect(state.value.routines[0]).toEqual(base);
  await page.getByRole("button", { name: "Volver al entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Ir a Sentadilla, ejercicio 1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue("");
});

test("organizar personal confirma pérdida de series y permite reconstruir una sesión vacía", async ({
  page,
}) => {
  const { state, base } = await personalWorkout(page);
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const organizer = page.getByRole("button", { name: "Organizar ejercicios", exact: true });
  await expect(organizer).toBeVisible({ timeout: 5000 });
  await organizer.click();
  await page
    .getByRole("button", { name: "Opciones de Press de banca, ejercicio 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Quitar ejercicio", exact: true }).click();
  await expect(page.getByText(/Se perderá 1 serie registrada/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar eliminación", exact: true }).click();
  await page
    .getByRole("button", { name: "Opciones de Remo con mancuerna, ejercicio 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Quitar ejercicio", exact: true }).click();
  await expect(page.getByText("Agrega ejercicios para continuar.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver al entrenamiento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organizar", exact: true })).toBeHidden();
  await page
    .getByRole("button", { name: "Agregar ejercicios", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("checkbox", { name: "Seleccionar Press de banca", exact: true }).check();
  await page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }).click();
  const active = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).active,
    activeKey,
  );
  expect(active.draft.origin).toEqual({
    kind: "personal",
    routineId: base.id,
    revision: base.revision,
  });
  expect(active.draft.exercises).toHaveLength(1);
  expect(state.value.routines[0]).toEqual(base);
});

for (const theme of ["light", "dark"] as const)
  test(`organización y reemplazo accesibles a 360 px · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.addInitScript((theme) => {
      localStorage.setItem(
        "is:native-appearance:v1",
        JSON.stringify({ version: 1, preference: theme }),
      );
    }, theme);
    await personalWorkout(page);
    await page.getByRole("button", { name: "Organizar ejercicios", exact: true }).click();
    await page
      .getByRole("button", { name: "Opciones de Press de banca, ejercicio 1", exact: true })
      .click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await page.getByRole("button", { name: "Reemplazar ejercicio", exact: true }).click();
    await page.getByRole("button", { name: "Elegir Sentadilla", exact: true }).click();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
  });

test("quitar con cuota conserva la propuesta y permite reintentar fuera de la confirmación", async ({
  page,
}) => {
  await personalWorkout(page);
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("button", { name: "Organizar ejercicios", exact: true }).click();
  await page
    .getByRole("button", { name: "Opciones de Press de banca, ejercicio 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Quitar ejercicio", exact: true }).click();
  const before = await page.evaluate((key) => localStorage.getItem(key), activeKey);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("is:native-training:") && !localStorage.getItem("allow-organize-write"))
        throw Error("quota");
      return set.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Confirmar eliminación", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organizar", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar", exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), activeKey)).toBe(before);
  await expect(
    page.getByRole("button", { name: "Opciones de Remo con mancuerna, ejercicio 1", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => localStorage.setItem("allow-organize-write", "1"));
  await page
    .getByRole("button", { name: "Reintentar", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Opciones de Remo con mancuerna, ejercicio 1", exact: true }),
  ).toBeEnabled();
  const after = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).active,
    activeKey,
  );
  expect(after.draft.exercises.map((e: { name: string }) => e.name)).toEqual([
    "Remo con mancuerna",
  ]);
  expect(after.routine.exercises).toHaveLength(1);
});
