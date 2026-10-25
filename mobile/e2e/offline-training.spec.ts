import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupDownloadedWeek } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
const userId = downloadId(1),
  trainingKey = `is:native-training:v1:${userId}`;
test("descarga → pérdida de red → alternativa y ronda → cierre local → respuesta perdida → envío único", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const control = await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  control.offline = true;
  await page.getByRole("button", { name: "Actualizar semana", exact: true }).click();
  await expect(
    page.getByText("Usando datos de este dispositivo", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }).click();
  await expect(page.getByText(/Rutina descargada/)).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), trainingKey)).toBeNull();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Indicaciones y alternativas", exact: true }).click();
  await page.getByRole("button", { name: "Cambiar a Prensa", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue("60");
  await page.getByLabel("Repeticiones serie 1", { exact: true }).fill("10");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue("40");
  await page.getByLabel("Repeticiones serie 1", { exact: true }).fill("10");
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Omitir descanso", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!).active.draft.rest?.endsAt ?? null,
        trainingKey,
      ),
    )
    .not.toBeNull();
  const end = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).active.draft.rest.endsAt,
    trainingKey,
  );
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).active.draft.rest.endsAt,
      trainingKey,
    ),
  ).toBe(end);
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByLabel("Esfuerzo percibido", { exact: true }).fill("7");
  await page.getByLabel("Nota del entrenamiento", { exact: true }).fill("Entrenamiento sin red");
  await page.getByRole("button", { name: "Guardar en este dispositivo", exact: true }).click();
  await expect(
    page.getByText("Tu registro está protegido", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(control.saveRequests).toHaveLength(0);
  const local = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).active.payload,
    trainingKey,
  );
  expect(local.sets[0]).toMatchObject({
    exerciseId: downloadId(6),
    prescribedExerciseId: downloadId(5),
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("offline-pending-dark-360.png"),
    fullPage: true,
  });
  control.offline = false;
  control.saveLost = true;
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await page.getByRole("button", { name: "Reintentar envío", exact: true }).click();
  await expect(
    page.getByText("Usando datos de este dispositivo", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await page.getByRole("button", { name: "Reintentar envío", exact: true }).click();
  await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible();
  expect(control.saved.size).toBe(1);
  expect(control.saveRequests).toHaveLength(2);
  expect(control.saveRequests[0]).toEqual(control.saveRequests[1]);
  expect(control.saveRequests[0].id).toBe(local.id);
});
test("copia vencida se consulta sin iniciar; un borrador previo sigue recuperable", async ({
  page,
}) => {
  const control = await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  const before = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).active.draft.workoutId,
    trainingKey,
  );
  await page.clock.setFixedTime(new Date("2026-10-26T15:00:00Z"));
  control.offline = true;
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Conectar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Empezar entrenamiento", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retomar entrenamiento pendiente", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Peso serie 1", exact: true })).toHaveValue("55");
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).active.draft.workoutId,
      trainingKey,
    ),
  ).toBe(before);
});
test("sin descarga no inventa una semana ni permite comenzar una rutina del servidor", async ({
  page,
}) => {
  const control = await setupDownloadedWeek(page);
  control.offline = true;
  await page.getByRole("button", { name: "Actualizar semana", exact: true }).click();
  await expect(
    page.getByText("No hay una semana descargada para esta cuenta.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Avance semanal", exact: true })).toHaveCount(
    0,
  );
});
