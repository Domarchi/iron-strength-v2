import { test, expect } from "@playwright/test";
import { setupDownloadedWeek, setWeekConnectivity } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";

test("pausa asignada permite consultar el índice y bloquea sustituciones sin alterar la rutina", async ({
  page,
}) => {
  const control = await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  const key = `is:native-training:v1:${downloadId(1)}`;
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).not.toBeNull();
  const original = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  await page.getByRole("button", { name: "Pausar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Indicaciones y alternativas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cambiar a Prensa", exact: true })).toBeDisabled();
  const next = control.pack.sessions[0].context.exercises[1].name;
  await page.getByRole("button", { name: `Ir a ${next}`, exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  await expect(
    page.getByText("ENTRENAMIENTO EN PAUSA", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retomar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Reanudar entrenamiento", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Completar serie 1", exact: true }),
  ).toBeEnabled();
  const recovered = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(recovered.active.routine).toEqual(original.active.routine);
  expect(recovered.active.draft.exercises).toEqual(original.active.draft.exercises);
  expect(recovered.active.activeIndex).toBe(1);
  expect(control.saveRequests).toHaveLength(0);
});

test("pausa sin conexión: descanso vence, cierre conserva duración neta y sincroniza una sola vez", async ({
  page,
}) => {
  const control = await setupDownloadedWeek(page);
  await page.getByRole("button", { name: "Descargar semana", exact: true }).click();
  await expect(page.getByText(/Descarga guardada:/)).toBeVisible();
  control.offline = true;
  await setWeekConnectivity(page, false);
  await expect(
    page.getByText("Usando datos de este dispositivo", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Consultar rutina descargada A", exact: true }).click();
  await page.getByRole("button", { name: "Empezar entrenamiento", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completar serie 1", exact: true }).click();
  const key = `is:native-training:v1:${downloadId(1)}`,
    queueKey = `is:native-sync:v1:${downloadId(1)}`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!)?.active?.draft.rest?.endsAt ?? 0,
        key,
      ),
    )
    .toBeGreaterThan(0);
  const startedAt = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).active.draft.startedAt as string,
    key,
  );
  const start = Date.parse(startedAt);
  await page.clock.setFixedTime(new Date(start + 10000));
  await page.getByRole("button", { name: "Pausar entrenamiento", exact: true }).click();
  await page.clock.setFixedTime(new Date(start + 100000));
  await expect(page.getByLabel("Duración del entrenamiento", { exact: true })).toHaveText("0:10");
  await expect(page.getByRole("button", { name: "Omitir descanso", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Finalizar entrenamiento", exact: true }).click();
  await page.getByRole("button", { name: "Guardar en este dispositivo", exact: true }).click();
  await expect(
    page.getByText("Tu registro está protegido", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? '{"entries":[]}').entries.length,
        queueKey,
      ),
    )
    .toBe(1);
  const payload = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).entries[0].payload,
    queueKey,
  );
  expect(payload).toMatchObject({ version: 2, source: "assigned" });
  expect(payload.workout).toMatchObject({
    startedAt,
    durationSeconds: 10,
    finishedAt: new Date(start + 100000).toISOString(),
  });
  expect(control.saveRequests).toHaveLength(0);
  await expect(page.getByText("En pausa", { exact: true }).filter({ visible: true })).toHaveCount(
    0,
  );
  control.offline = false;
  control.saveLost = true;
  await setWeekConnectivity(page, true);
  await expect(page.getByText("Sesión registrada", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(control.saved.size).toBe(1);
  expect(control.saveRequests).toHaveLength(2);
  expect(control.saveRequests[0]).toEqual(payload);
  expect(control.saveRequests[1]).toEqual(payload);
});
