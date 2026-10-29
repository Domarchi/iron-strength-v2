import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setupDownloadedWeek } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";

const origin = "https://iron-strength-seven.vercel.app/api/mobile/v1";
const target = {
  id: downloadId(800),
  name: "Curl de bíceps",
  muscleGroup: "Brazos",
  equipment: "Mancuernas",
  isBodyweight: false,
  progressionIncrementKg: 2,
};
const catalog = [
  ...Array.from({ length: 220 }, (_, i) => ({
    ...target,
    id: downloadId(1000 + i),
    name: `Ejercicio ${String(i).padStart(3, "0")}`,
    muscleGroup: "Piernas",
    equipment: "Máquina",
  })),
  target,
  { ...target, id: downloadId(801), name: "Curl de bíceps en polea", equipment: "Polea" },
  {
    ...target,
    id: downloadId(802),
    name: "Dominadas",
    muscleGroup: "Espalda",
    equipment: null,
    isBodyweight: true,
  },
];
async function library(
  page: Page,
  options: {
    error?: boolean;
    empty?: boolean;
    lost?: boolean;
    detailEmpty?: boolean;
    active?: boolean;
  } = {},
) {
  const control = await setupDownloadedWeek(page);
  const state = {
    error: false,
    empty: false,
    lost: false,
    detailEmpty: false,
    requests: [] as string[],
    pageError: false,
    ...options,
  };
  if (options.active) {
    await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
    await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
    await page.getByLabel("REPS serie 1", { exact: true }).fill("8");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await page.getByLabel("REPS serie 1", { exact: true }).fill("8");
    await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
    await expect(
      page.getByLabel("Tiempo de descanso restante").filter({ visible: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  }
  await page.route(origin + "/week", (route) =>
    route.fulfill({ json: { version: 1, kind: "no_program" } }),
  );
  await page.route(origin + "/exercises**", async (route) => {
    const url = new URL(route.request().url());
    state.requests.push(url.pathname + url.search);
    if (state.lost) return route.abort("failed");
    if (state.error)
      return route.fulfill({
        status: 503,
        json: {
          version: 1,
          error: { code: "unavailable", message: "No pudimos consultar la biblioteca." },
        },
      });
    if (url.pathname.endsWith("/exercises"))
      return route.fulfill({ json: { version: 1, exercises: state.empty ? [] : catalog } });
    const second = url.searchParams.has("cursor");
    if (second && state.pageError)
      return route.fulfill({
        status: 503,
        json: {
          version: 1,
          error: { code: "unavailable", message: "No pudimos cargar la siguiente página." },
        },
      });
    const items = Array.from({ length: second ? 1 : 10 }, (_, i) => {
      const n = second ? 13 : 23 - i,
        date = `2026-10-${n}`;
      return {
        id: downloadId(second ? 110 : 90 + i),
        startedAt: date + "T15:00:00Z",
        date,
        sessionLabel: "A",
        sets: [
          {
            id: downloadId(second ? 610 : 500 + i),
            position: i === 1 ? 15 : 0,
            setNumber: i === 1 ? 21 : 1,
            weightKg: second ? 12 : 14,
            reps: 10,
            isWarmup: i === 0,
          },
        ],
      };
    });
    return route.fulfill({
      json: {
        version: 1,
        exercise: target,
        history: {
          items: state.detailEmpty ? [] : items,
          nextCursor: state.detailEmpty || second ? null : "2026-10-14T15:00:00Z|" + downloadId(99),
        },
      },
    });
  });
  await page.getByRole("tab", { name: "Entrenar" }).click();
  await page.getByRole("tab", { name: "Inicio", exact: true }).click();
  await expect(page.getByText("Tu próximo comienzo", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Biblioteca de ejercicios", exact: true }).click();
  return { control, state };
}

test("sin programa: catálogo completo, búsqueda normalizada, filtros y regreso", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await library(page);
  await expect(page.getByText("223 ejercicios", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Buscar ejercicios" }).fill("BICEPS");
  await expect(page.getByText("2 ejercicios", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filtrar por músculo", exact: true }).click();
  await page.getByRole("button", { name: "Músculo Brazos", exact: true }).click();
  await page.getByRole("button", { name: "Filtrar por equipo", exact: true }).click();
  await page.getByRole("button", { name: "Equipo Mancuernas", exact: true }).click();
  await expect(page.getByText("1 ejercicio", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver ejercicio Curl de bíceps", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Curl de bíceps", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver a la biblioteca", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Buscar ejercicios" })).toHaveValue("BICEPS");
  await expect(page.getByText("1 ejercicio", { exact: true })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`historial propio paginado, enlaces y accesibilidad · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const { state } = await library(page);
    await page.getByRole("textbox", { name: "Buscar ejercicios" }).fill("biceps");
    const row = page.getByRole("button", { name: "Ver ejercicio Curl de bíceps", exact: true });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await page.getByTestId("exercise-library-list").evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(page.getByRole("heading", { name: "Biblioteca", exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`exercise-library-${theme}.png`) });
    await row.click();
    await expect(page.getByRole("button", { name: /Ver entrenamiento del/ })).toHaveCount(10);
    await expect(page.getByText("Calentamiento", { exact: true })).toBeVisible();
    await expect(page.getByText("Serie 21", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ver progreso de este ejercicio", exact: true }),
    ).toBeVisible();
    state.pageError = true;
    await page.getByRole("button", { name: "Más entrenamientos", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("No pudimos cargar la siguiente página.");
    await expect(page.getByRole("button", { name: /Ver entrenamiento del/ })).toHaveCount(10);
    state.pageError = false;
    await page.getByRole("button", { name: "Reintentar más entrenamientos", exact: true }).click();
    await expect(page.getByRole("button", { name: /Ver entrenamiento del/ })).toHaveCount(11);
    await expect(page.getByRole("button", { name: "Más entrenamientos", exact: true })).toHaveCount(
      0,
    );
    expect(state.requests.filter((path) => path.includes("cursor=")).length).toBe(2);
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByTestId("app-page")
      .filter({ visible: true })
      .evaluate((element) => {
        element.scrollTop = 0;
      });
    await expect(
      page.getByRole("heading", { name: "Curl de bíceps", exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`exercise-detail-${theme}.png`) });
    await page.getByRole("button", { name: "Ver entrenamiento del 13/10", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/result/" + downloadId(110)));
  });
}

test("ficha sin historial no inventa progreso y filtros sin coincidencias", async ({ page }) => {
  await library(page, { detailEmpty: true });
  const search = page.getByRole("textbox", { name: "Buscar ejercicios" });
  await search.fill("no existe");
  await expect(
    page.getByText("No hay ejercicios con estos filtros.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await search.fill("biceps");
  await page.getByRole("button", { name: "Ver ejercicio Curl de bíceps", exact: true }).click();
  await expect(
    page.getByText("Aún no has registrado este ejercicio.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ver progreso de este ejercicio", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ver entrenamiento del/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Más entrenamientos", exact: true })).toHaveCount(
    0,
  );
});

test("error inicial y falta de conexión conservan reintento honesto", async ({ page }) => {
  const { state } = await library(page, { error: true });
  await expect(page.getByRole("alert")).toHaveText("No pudimos consultar la biblioteca.");
  await expect(page.getByText("No hay ejercicios disponibles.", { exact: true })).toHaveCount(0);
  state.error = false;
  state.lost = true;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Estos datos no están descargados. Conecta y descarga tus entrenamientos.",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("exercise-library-list")
      .getByText("Usando datos de este dispositivo", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toHaveCount(0);
  state.lost = false;
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect(page.getByText("223 ejercicios", { exact: true })).toBeVisible();
});

test("catálogo vacío muestra ausencia real", async ({ page }) => {
  await library(page, { empty: true });
  await expect(page.getByText("0 ejercicios", { exact: true })).toBeVisible();
  await expect(page.getByText("No hay ejercicios disponibles.", { exact: true })).toBeVisible();
});

test("consultar la biblioteca conserva entrenamiento, series y descanso", async ({ page }) => {
  await library(page, { active: true });
  const key = `is:native-training:v1:${downloadId(1)}`;
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).active, key);
  await page.getByRole("textbox", { name: "Buscar ejercicios" }).fill("biceps");
  await page.getByRole("button", { name: "Ver ejercicio Curl de bíceps", exact: true }).click();
  await page.getByRole("button", { name: "Volver a la biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Volver a Entrenar", exact: true }).click();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeChecked();
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).active, key);
  expect(after.draft.workoutId).toBe(before.draft.workoutId);
  expect(after.draft.exercises).toEqual(before.draft.exercises);
  expect(after.draft.rest).toEqual(before.draft.rest);
});

test("progreso enlaza el ejercicio consultado", async ({ page }) => {
  await library(page);
  await page.getByRole("textbox", { name: "Buscar ejercicios" }).fill("biceps");
  await page.getByRole("button", { name: "Ver ejercicio Curl de bíceps", exact: true }).click();
  await page.getByRole("button", { name: "Ver progreso de este ejercicio", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/progress/" + target.id));
});
