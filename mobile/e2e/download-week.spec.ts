import {
  setupDownloadedWeek as setup,
  enterWeekUser as enter,
  recoverLegacyWeek,
} from "./support/week-fixture";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { downloadId, weekDownloadFixture } from "../../src/test/fixtures/week-download";
import { downloadCard, readDownloadCache, writeDownloadCache } from "./support/download-cache";
const userId = downloadId(1),
  oldKey = `is:native-week:v1:${userId}`;
const download = "Descargar entrenamientos",
  update = "Actualizar entrenamientos descargados",
  details = "Detalles de entrenamientos descargados",
  check = "Comprobar entrenamientos descargados";
test("descarga completa, recarga y eliminación conservan el entrenamiento iniciado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const control = await setup(page);
  await page.getByRole("button", { name: download, exact: true }).click();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
  const stored = JSON.parse((await readDownloadCache(page, userId))!);
  expect(stored.bundle.week.sessions[0].context.exercises[0].prescribed.series).toHaveLength(2);
  expect(stored.bundle.week.sessions[0].context.exercises[0].alternatives).toHaveLength(1);
  expect(Object.keys(stored.bundle.history)).toHaveLength(3);
  expect(stored.bundle.catalog.exercises).toHaveLength(3);
  expect(stored.bundle.library.version).toBe(2);
  expect(await page.evaluate((k) => localStorage.getItem(k), oldKey)).toBeNull();
  await page.reload();
  await enter(page);
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
  expect(control.completeRequests).toBe(1);
  expect(control.requests).toBe(0);
  await page.getByRole("button", { name: "Ver rutina A", exact: true }).click();
  await page.getByRole("button", { name: /Empezar/ }).click();
  await expect(page.getByRole("button", { name: "Volver a Inicio", exact: true })).toBeVisible();
  const active = await page.evaluate(
    (id) => localStorage.getItem(`is:native-training:v1:${id}`),
    userId,
  );
  await page.getByRole("button", { name: "Volver a Inicio", exact: true }).click();
  control.pack = weekDownloadFixture(userId, "2026-10-24T14:00:00Z");
  control.pack.sessions[0].context.exercises[0].prescribed.series![0].targetWeightKg = 65;
  await page.getByRole("button", { name: update, exact: true }).click();
  await expect
    .poll(async () => JSON.parse((await readDownloadCache(page, userId))!).bundle.downloadedAt)
    .toBe(control.pack.downloadedAt);
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-training:v1:${id}`), userId),
  ).toBe(active);
  await page.getByRole("button", { name: details, exact: true }).click();
  await page
    .getByRole("button", { name: "Eliminar entrenamientos descargados", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Confirmar eliminación de entrenamientos descargados",
      exact: true,
    })
    .click();
  await expect(
    downloadCard(page).getByRole("button", { name: download, exact: true }),
  ).toBeEnabled();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toHaveCount(0);
  const removed = JSON.parse((await readDownloadCache(page, userId))!);
  expect(removed.bundle).toBeNull();
  expect(removed.previousBundle).toBeNull();
  expect(
    await page.evaluate((id) => localStorage.getItem(`is:native-training:v1:${id}`), userId),
  ).toBe(active);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("red fallida conserva descarga y formato futuro no se sobrescribe", async ({ page }) => {
  const control = await setup(page);
  await page.getByRole("button", { name: download, exact: true }).click();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
  const original = await readDownloadCache(page, userId);
  control.lost = true;
  await page.getByRole("button", { name: update, exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No pudimos completar la descarga" }),
  ).toBeVisible();
  expect(await readDownloadCache(page, userId)).toBe(original);
  await writeDownloadCache(page, userId, '{"version":99}');
  control.lost = false;
  await page.reload();
  await enter(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "La descarga requiere una versión compatible" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: download, exact: true })).toBeDisabled();
  expect(await readDownloadCache(page, userId)).toBe('{"version":99}');
});
test("dos ventanas compiten usando el mismo bloqueo y preservan la descarga más reciente", async ({
  page,
  context,
}) => {
  await setup(page);
  const other = await context.newPage();
  await setup(other, "2026-10-24T14:00:00Z");
  await other.getByRole("button", { name: download, exact: true }).click();
  await expect(other.getByText(/Disponible sin conexión/)).toBeVisible();
  await page.getByRole("button", { name: download, exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "La copia cambió desde otra ventana" }),
  ).toBeVisible();
  expect(JSON.parse((await readDownloadCache(page, userId))!).bundle.downloadedAt).toBe(
    "2026-10-24T14:00:00Z",
  );
  await page.getByRole("button", { name: check, exact: true }).click();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
  await other.close();
});
test("almacenamiento lleno no confirma la descarga y conserva sus bytes anteriores", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: download, exact: true }).click();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
  const original = await readDownloadCache(page, userId);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.transaction.db.name === "iron-strength-training-download")
        throw new DOMException("Full", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.getByRole("button", { name: update, exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No hay espacio suficiente" }),
  ).toBeVisible();
  await expect(
    downloadCard(page)
      .getByText(/Disponible sin conexión/)
      .filter({ visible: true }),
  ).toHaveCount(0);
  expect(await readDownloadCache(page, userId)).toBe(original);
  await page.getByRole("button", { name: check, exact: true }).click();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
});
test("salida y borrado esperan a la descarga; salir conserva la copia por cuenta", async ({
  page,
}) => {
  const control = await setup(page);
  let release!: () => void;
  control.waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole("button", { name: download, exact: true }).click();
  try {
    await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Quiero borrar mi cuenta", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole("button", { name: "Salir", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
  expect(JSON.parse((await readDownloadCache(page, userId))!).bundle.userId).toBe(userId);
  await expect(page.getByText("Fuerza", { exact: true })).toHaveCount(0);
});
test("sin bloqueo disponible explica el límite y no escribe sin protección", async ({ page }) => {
  await setup(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true }),
  );
  await page.getByRole("button", { name: download, exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Este navegador no permite proteger la descarga" }),
  ).toBeVisible();
  expect(await readDownloadCache(page, userId)).toBeNull();
});
for (const theme of ["light", "dark"] as const)
  test(`descarga visible y accesible a 360 px en ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await setup(page);
    await page.getByRole("button", { name: download, exact: true }).click();
    await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
    const card = downloadCard(page);
    await expect(card.getByRole("button", { name: update, exact: true })).toBeVisible();
    await card.screenshot({ path: test.info().outputPath(`download-${theme}-360.png`) });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
test("copia anterior se recupera intacta; la descarga completa no la reetiqueta y su eliminación es separada", async ({
  page,
}) => {
  const control = await setup(page);
  const original = await recoverLegacyWeek(page, control.pack);
  await expect(downloadCard(page).getByText(/Copia anterior ·/)).toBeVisible();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toHaveCount(0);
  await page.getByRole("button", { name: download, exact: true }).click();
  await expect(downloadCard(page).getByText(/Disponible sin conexión/)).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), oldKey)).toBe(original);
  const complete = await readDownloadCache(page, userId);
  await page.getByRole("button", { name: details, exact: true }).click();
  await page.getByRole("button", { name: "Eliminar copia anterior", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirmar eliminación de copia anterior", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).pack, oldKey))
    .toBeNull();
  expect(await readDownloadCache(page, userId)).toBe(complete);
  expect(control.requests).toBe(0);
});
