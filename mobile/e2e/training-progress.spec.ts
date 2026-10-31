import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupTrainingProgress } from "./support/training-progress-fixture";
for (const theme of ["light", "dark"] as const) {
  test(`historial, calendario y filtros conservan contexto al volver · ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    const { control } = await setupTrainingProgress(page);
    await page.getByRole("tab", { name: "Historial", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Buscar en historial", exact: true })
      .fill("sentadilla");
    await expect(page.getByText("2 resultados", { exact: true })).toBeVisible();
    const calls = control.calls;
    await page.getByRole("button", { name: "Calendario", exact: true }).click();
    await expect(page.getByText("Octubre 2026", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /20 de octubre de 2026/ }).click();
    await expect(page.getByText("1 resultado", { exact: true })).toBeVisible();
    expect(control.calls).toBe(calls);
    await page.getByRole("button", { name: /^Ver entrenamiento del 20\/10/ }).click();
    await expect(page.getByText("ENTRENAMIENTO CONFIRMADO", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Volver al historial", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Buscar en historial", exact: true }),
    ).toHaveValue("sentadilla");
    await expect(page.getByRole("button", { name: /20 de octubre de 2026/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`calendar-${theme}-360.png`),
      fullPage: true,
    });
  });
  test(`progreso tipado, periodos y resumen con fuentes · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setupTrainingProgress(page);
    await page.getByRole("tab", { name: "Progreso", exact: true }).click();
    await page
      .getByRole("button", { name: "Ver progreso de Plancha · Tiempo", exact: true })
      .click();
    await expect(page.getByLabel("Valor del periodo")).toHaveText("75 s");
    await expect(page.getByRole("button", { name: "1RM estimado", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "4 semanas", exact: true }).click();
    await page.getByRole("button", { name: "Tiempo total", exact: true }).click();
    await expect(page.getByLabel("Valor del periodo")).toHaveText("135 s");
    await page.getByRole("button", { name: "Volver a mis ejercicios", exact: true }).click();
    await page.getByRole("button", { name: "Resumen", exact: true }).click();
    await expect(page.getByLabel("Entrenamientos del periodo")).toHaveText("5");
    await expect(page.getByLabel("Regularidad del periodo")).toHaveText("2 de 5 semanas");
    await expect(page.getByText("Sin clasificar", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ver entrenamientos de Piernas", exact: true }).click();
    await expect(page.getByText("1 resultado", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Año", exact: true }).click();
    await expect(page.getByLabel("Entrenamientos del periodo")).toHaveText("6");
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`summary-${theme}-360.png`),
      fullPage: true,
    });
  });
}
test("error de actualización conserva datos e informa, nunca muestra cero exitoso", async ({
  page,
}) => {
  const { control } = await setupTrainingProgress(page);
  await page.getByRole("tab", { name: "Progreso", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver progreso de Plancha · Tiempo", exact: true }),
  ).toBeVisible();
  control.failed = true;
  await page.getByRole("button", { name: "Actualizar progreso", exact: true }).click();
  await expect(page.getByText("Datos sin actualizar", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ver progreso de Plancha · Tiempo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Tus marcas aparecerán/)).toHaveCount(0);
});
test("asistencia conserva repeticiones y datos antiguos separados", async ({ page }) => {
  await setupTrainingProgress(page);
  await page.getByRole("tab", { name: "Progreso", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Ver progreso de Dominadas · Peso corporal asistido",
      exact: true,
    })
    .click();
  await expect(page.getByText("20 kg de asistencia × 8 reps", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Volumen", exact: true })).toHaveCount(0);
});

test("consultar historial durante un registro conserva series y descanso", async ({ page }) => {
  const { control } = await setupTrainingProgress(page);
  await page.getByRole("button", { name: "Ver demo A", exact: true }).click();
  await page.getByRole("button", { name: "Probar entrenamiento demo", exact: true }).click();
  await page.getByRole("textbox", { name: "Peso serie 1", exact: true }).fill("27,5");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const key = `is:native-training:v1:${control.source.userId}`;
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k) ?? "null")?.active?.draft?.rest?.endsAt ?? 0,
        key,
      ),
    )
    .toBeGreaterThan(0);
  const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("textbox", { name: "Buscar en historial", exact: true }).fill("plancha");
  await page.getByRole("button", { name: "Calendario", exact: true }).click();
  await page.getByRole("tab", { name: "Inicio", exact: true }).click();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue(
    "27,5",
  );
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).active, key);
  expect(after.draft.workoutId).toBe(before.draft.workoutId);
  expect(after.draft.exercises).toEqual(before.draft.exercises);
  expect(after.draft.rest).toEqual(before.draft.rest);
});
test("calendario cambia mes, distingue día vacío/origen y observa solo hasta hoy", async ({
  page,
}) => {
  await setupTrainingProgress(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: "Calendario", exact: true }).click();
  await page.getByRole("button", { name: /^1 de octubre de 2026/ }).click();
  await expect(page.getByText("0 resultados", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver todo el mes", exact: true }).click();
  await page.getByRole("button", { name: "Origen", exact: true }).click();
  await page.getByRole("button", { name: "Libre", exact: true }).click();
  await expect(page.getByText("3 resultados · origen filtrado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Periodo anterior", exact: true }).click();
  await expect(page.getByText("Septiembre 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("0 resultados · origen filtrado", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Progreso", exact: true }).click();
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  await page.getByRole("button", { name: "Periodo siguiente", exact: true }).click();
  await expect(page.getByText("Aún no empieza este periodo.", { exact: true })).toBeVisible();
});

test("nueve contratos muestran solo dimensiones reales y conservan búsqueda al volver", async ({
  page,
}) => {
  const { control } = await setupTrainingProgress(page),
    base = control.source.workouts[0];
  const cases = [
    { recordType: null, weightKg: 30, reps: 8, durationSeconds: null, distanceMeters: null },
    {
      recordType: "weight_reps",
      weightKg: 30,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
    },
    {
      recordType: "bodyweight_reps",
      weightKg: null,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
    },
    {
      recordType: "weighted_bodyweight",
      weightKg: 10,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
    },
    {
      recordType: "assisted_bodyweight",
      weightKg: 20,
      reps: 8,
      durationSeconds: null,
      distanceMeters: null,
    },
    {
      recordType: "duration",
      weightKg: null,
      reps: null,
      durationSeconds: 60,
      distanceMeters: null,
    },
    {
      recordType: "weight_duration",
      weightKg: 20,
      reps: null,
      durationSeconds: 60,
      distanceMeters: null,
    },
    {
      recordType: "distance_duration",
      weightKg: null,
      reps: null,
      durationSeconds: 300,
      distanceMeters: 1000,
    },
    {
      recordType: "weight_distance",
      weightKg: 20,
      reps: null,
      durationSeconds: null,
      distanceMeters: 30.5,
    },
  ] as const;
  cases.forEach((metrics, i) =>
    control.source.workouts.push({
      ...base,
      id: `a2180000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      date: "2026-10-27",
      startedAt: `2026-10-27T16:${String(i).padStart(2, "0")}:00Z`,
      sets: [
        {
          ...base.sets[0],
          id: `b2180000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          exerciseId: `c2180000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          name: `Métrica ${i}`,
          metrics,
        },
      ],
    }),
  );
  await page.getByRole("tab", { name: "Progreso", exact: true }).click();
  await page.getByLabel("Buscar ejercicio en progreso").fill("metrica");
  const kinds = [
      "Registro anterior",
      "Peso y repeticiones",
      "Peso corporal",
      "Peso corporal con carga",
      "Peso corporal asistido",
      "Tiempo",
      "Peso y tiempo",
      "Distancia y tiempo",
      "Peso y distancia",
    ],
    values = ["38 kg", "38 kg", "8 reps", "10 kg", "20 kg", "60 s", "60 s", "1.000 m", "20 kg"];
  for (let i = 0; i < cases.length; i++) {
    await page
      .getByRole("button", { name: `Ver progreso de Métrica ${i} · ${kinds[i]}`, exact: true })
      .click();
    await expect(page.getByLabel("Valor del periodo")).toHaveText(values[i]);
    await expect(page.getByRole("button", { name: "1RM estimado", exact: true })).toHaveCount(
      i < 2 ? 1 : 0,
    );
    if (i >= 5)
      await expect(page.getByRole("button", { name: "Repeticiones", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Volver a mis ejercicios", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Buscar ejercicio en progreso", exact: true }),
    ).toHaveValue("metrica");
  }
});
test("lectura inicial fallida no se degrada a progreso anterior ni muestra un cero exitoso", async ({
  page,
}) => {
  const { control } = await setupTrainingProgress(page);
  control.failed = true;
  await page.getByRole("tab", { name: "Progreso", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No pudimos cargar el progreso completo.");
  await expect(page.getByText(/Tus marcas aparecerán/)).toHaveCount(0);
  await expect(page.getByLabel("Entrenamientos del periodo")).toHaveCount(0);
});

test("actualizar al cambiar el mes del servidor conserva el periodo consultado", async ({
  page,
}) => {
  const { control } = await setupTrainingProgress(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: "Calendario", exact: true }).click();
  await page.getByRole("button", { name: /^20 de octubre de 2026/ }).click();
  control.source.today = "2026-11-01";
  const historyResponse = page.waitForResponse(
    (r) => r.url().endsWith("/training-progress") && r.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Actualizar historial", exact: true }).click();
  expect((await (await historyResponse).json()).today).toBe("2026-11-01");
  await expect(
    page.getByRole("button", { name: "Actualizar historial", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Octubre 2026", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^20 de octubre de 2026/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  control.source.today = "2026-10-28";
  await page.getByRole("tab", { name: "Progreso", exact: true }).click();
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  control.source.today = "2026-11-01";
  const progressResponse = page.waitForResponse(
    (r) => r.url().endsWith("/training-progress") && r.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Actualizar progreso", exact: true }).click();
  expect((await (await progressResponse).json()).today).toBe("2026-11-01");
  await expect(
    page.getByRole("button", { name: "Actualizar progreso", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Octubre 2026", exact: true })).toBeVisible();
  await expect(page.getByLabel("Entrenamientos del periodo")).toHaveText("5");
});
