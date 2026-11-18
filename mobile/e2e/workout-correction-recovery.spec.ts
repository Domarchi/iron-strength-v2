import { openResultOptions } from "./support/result-options";
import { expect, test, type Page } from "@playwright/test";
import { setupCorrection } from "./support/correction-fixture";
import { enterWeekUser } from "./support/week-fixture";
import { downloadId } from "../../src/test/fixtures/week-download";
const key = `is:workout-correction:v1:${downloadId(1)}`;
async function open(page: Page) {
  const fixture = await setupCorrection(page);
  await page.getByRole("tab", { name: "Historial", exact: true }).click();
  await page.getByRole("button", { name: /Ver entrenamiento del .*Fuerza revisada/ }).click();
  await openResultOptions(page);
  await page.getByRole("button", { name: "Corregir entrenamiento", exact: true }).click();
  await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("60");
  return fixture;
}
test("recuperar un conflicto conserva su causa y pide comparar antes de guardar", async ({
  page,
}) => {
  const c = await open(page);
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("65");
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  c.conflict = true;
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Comparar con versión actual", exact: true }),
  ).toBeVisible();
  await page.reload();
  await enterWeekUser(page);
  await page.getByRole("tab", { name: "Cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Retomar corrección", exact: true }).click();
  await expect(page.getByLabel("Motivo de corrección pendiente", { exact: true })).toContainText(
    "El entrenamiento cambió",
  );
  await expect(
    page.getByRole("button", { name: "Comparar con versión actual", exact: true }),
  ).toBeVisible();
  expect(c.calls).toHaveLength(1);
});
test("relectura fallida conserva la propuesta y permite confirmar otra relectura", async ({
  page,
}) => {
  const c = await open(page);
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("64");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  const saved = await page.evaluate((k) => localStorage.getItem(k)!, key);
  await page.evaluate((k) => localStorage.setItem(k, '{"version":99}'), key);
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("65");
  await page.getByRole("button", { name: "Releer corrección local", exact: true }).click();
  await page
    .getByRole("button", { name: "Volver a comprobar en este dispositivo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Releer corrección local", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Propuesta de serie 1 de Nombre histórico", { exact: true }),
  ).toContainText("65 kg");
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{"version":99}');
  await page.evaluate(({ key, saved }) => localStorage.setItem(key, saved), { key, saved });
  await page.getByRole("button", { name: "Releer corrección local", exact: true }).click();
  await page
    .getByRole("button", { name: "Volver a comprobar en este dispositivo", exact: true })
    .click();
  await expect(page.getByLabel("Peso en kg de serie 1", { exact: true })).toHaveValue("64");
  expect(c.calls).toEqual([]);
});

test("confirmación remota con cuota reintenta solo limpieza local y conserva el intento", async ({
  page,
}) => {
  const c = await open(page);
  await page.getByLabel("Peso en kg de serie 1", { exact: true }).fill("66");
  await expect(page.getByLabel("Estado de corrección", { exact: true })).toHaveText(
    "Guardado en este dispositivo",
  );
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, value) {
      if (
        k === key &&
        JSON.parse(value).draft === null &&
        !localStorage.getItem("allow-correction-cleanup")
      )
        throw Error("quota");
      return original.call(this, k, value);
    };
  }, key);
  await page.getByRole("button", { name: "Revisar corrección", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar corrección", exact: true }).click();
  await expect(
    page.getByText("Servidor confirmado; falta verificar la limpieza local.", { exact: true }),
  ).toBeVisible();
  expect(c.calls).toHaveLength(1);
  const protectedAttempt = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!).pending.request,
    key,
  );
  expect(protectedAttempt.requestId).toBe(c.calls[0].requestId);
  await expect(
    page.getByRole("button", { name: "Reintentar el mismo envío", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => localStorage.setItem("allow-correction-cleanup", "1"));
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByText("Corrección confirmada", { exact: true })).toBeVisible();
  expect(c.calls).toHaveLength(1);
  expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).pending, key)).toBeNull();
});
