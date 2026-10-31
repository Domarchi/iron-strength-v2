import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setupTypedPersonalLibrary } from "./support/typed-library-fixture";
import { setupDownloadedWeek } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
const trainingKey = `is:native-training:v1:${downloadId(1)}`;
for (const theme of ["light", "dark"] as const) {
  test(`crear cuatro ejercicios en nueve acciones y consultar sin iniciar · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const { state } = await setupTypedPersonalLibrary(page);
    let actions = 0;
    const step = async (run: () => Promise<unknown>) => {
      actions++;
      await run();
    };
    await step(() => page.getByRole("button", { name: "Nueva rutina", exact: true }).click());
    await step(() =>
      page.getByRole("textbox", { name: "Nombre de la rutina", exact: true }).fill("Superior"),
    );
    await step(() => page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click());
    for (const i of [0, 1, 2, 3])
      await step(() =>
        page.getByRole("checkbox", { name: `Seleccionar Movimiento ${i}`, exact: true }).check(),
      );
    await step(() =>
      page.getByRole("button", { name: "Agregar 4 ejercicios", exact: true }).click(),
    );
    await expect(
      page.getByRole("textbox", { name: "Descanso de Movimiento 0", exact: true }),
    ).toBeVisible();
    await step(() => page.getByRole("button", { name: "Guardar rutina", exact: true }).click());
    expect(actions).toBeLessThanOrEqual(9);
    await expect(
      page.getByRole("button", { name: "Ver rutina Superior", exact: true }),
    ).toBeVisible();
    expect(state.value.routines[0].items).toHaveLength(4);
    expect(state.calls).toHaveLength(1);
    await page.getByRole("button", { name: "Ver rutina Superior", exact: true }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), trainingKey)).toBeNull();
    await expect(
      page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
    ).toBeEnabled();
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`routine-${theme}-360.png`) });
  });
  test(`ficha y detalle de edición conservan selección y búsqueda · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const { fixture } = await setupTypedPersonalLibrary(page);
    await page.route(
      "https://iron-strength-seven.vercel.app/api/mobile/v1/training-catalog/" +
        fixture.catalog.exercises[0].id,
      (route) =>
        route.fulfill({
          json: {
            version: 2,
            exercise: fixture.catalog.exercises[0],
            history: { items: [], nextCursor: null },
          },
        }),
    );
    await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
    await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
    const checkbox = page.getByRole("checkbox", { name: "Seleccionar Movimiento 0", exact: true });
    await checkbox.check();
    await page
      .getByRole("textbox", { name: "Buscar ejercicios", exact: true })
      .fill("Movimiento 0");
    await page.getByRole("button", { name: "Ver ficha de Movimiento 0", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Movimiento 0", exact: true });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: "Últimas sesiones", exact: true }),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Cerrar panel", exact: true }).click();
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("textbox", { name: "Buscar ejercicios", exact: true })).toHaveValue(
      "Movimiento 0",
    );
    await expect(
      page.getByRole("button", { name: "Ver ficha de Movimiento 0", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }).click();
    await page.getByRole("textbox", { name: "Descanso de Movimiento 0", exact: true }).fill("75");
    await page
      .getByRole("button", { name: "Editar detalles de Movimiento 0", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nota de Movimiento 0", exact: true })
      .fill("Controlar la bajada");
    await page.getByRole("button", { name: "Ocultar detalles", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Descanso de Movimiento 0", exact: true }),
    ).toHaveValue("75");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
  });
}
test("rutina asignada compacta conserva objetivos por serie e indicaciones en detalle", async ({
  page,
}) => {
  const { pack } = await setupDownloadedWeek(page);
  pack.sessions[0].context.exercises[0].note = "Indicación del coach";
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await expect(page.getByText("Indicación del coach", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver alternativas de Sentadilla", exact: true }).click();
  await expect(page.getByText("Indicación del coach", { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), trainingKey)).toBeNull();
});

test("navegar a más historial conserva selección y búsqueda al volver al catálogo", async ({
  page,
}) => {
  const { fixture } = await setupTypedPersonalLibrary(page);
  const exercise = fixture.catalog.exercises[0];
  await page.route(
    "https://iron-strength-seven.vercel.app/api/mobile/v1/training-catalog/" + exercise.id,
    (route) =>
      route.fulfill({
        json: {
          version: 2,
          exercise,
          history: {
            nextCursor: "2026-10-23T15:00:00Z|" + downloadId(90),
            items: [
              {
                id: downloadId(90),
                startedAt: "2026-10-23T15:00:00Z",
                date: "2026-10-23",
                sourceKind: "free",
                title: "Anterior",
                sessionLabel: null,
                exerciseNotes: [],
                sets: [
                  {
                    id: downloadId(91),
                    position: 0,
                    setNumber: 1,
                    metrics: {
                      recordType: null,
                      weightKg: 50,
                      reps: 8,
                      durationSeconds: null,
                      distanceMeters: null,
                    },
                    setType: "working",
                    effort: null,
                  },
                ],
              },
            ],
          },
        },
      }),
  );
  await page.getByRole("button", { name: "Nueva rutina", exact: true }).click();
  await page.getByRole("button", { name: "Agregar ejercicios", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar ejercicios", exact: true }).fill(exercise.name);
  await page.getByRole("checkbox", { name: `Seleccionar ${exercise.name}`, exact: true }).check();
  await page.getByRole("button", { name: `Ver ficha de ${exercise.name}`, exact: true }).click();
  await page.getByRole("button", { name: "Ver más historial", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "Buscar ejercicios", exact: true })).toHaveValue(
    exercise.name,
  );
  await expect(
    page.getByRole("checkbox", { name: `Seleccionar ${exercise.name}`, exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Agregar 1 ejercicio", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
